import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react';
import type { UnitToken, LogEntry, TokenType, TokenColor, TokenBadge, StatusTag, Pos } from '../types';
import type { DispatchRosterItem, ArrivalMode } from '../types/settings';
import { rosterItemToToken, initCountersFromRoster, computeCountersFromTokens } from '../utils/dispatchArrival';
import {
  saveTokenSession, loadTokenSession,
} from '../utils/runtimeSession';
import { generateId } from '../utils/settingsStorage';

const MEDICAL_TARGET_ZONE = 'standby-imminent';
const ARRIVAL_TARGET_ZONE = 'standby-standby1';

// ─────────────────────────────────────────────
// 타이밍 설정
// ─────────────────────────────────────────────

interface TimingConfig {
  rescueTimeSec: number;
  moveTimeSec:   number;
}

const DEFAULT_TIMING_CONFIG: TimingConfig = {
  rescueTimeSec: 30,
  moveTimeSec:   30,
};

// ─────────────────────────────────────────────
// unitType 기본값 유도
// ─────────────────────────────────────────────

function defaultUnitType(color: TokenColor): string {
  switch (color) {
    case 'red':     return 'suppression';
    case 'yellow':  return 'rescue';
    case 'green':   return 'ems';
    case 'vehicle': return 'vehicle';
    case 'agency':  return 'agency';
    default:        return 'general';
  }
}

// ─────────────────────────────────────────────
// Context 타입
// ─────────────────────────────────────────────

export type TokenPos = Pos;

export interface MoveTokenOptions {
  /** true: 이동 카운트다운 없이 이동 (arrival 자동도착 전용) */
  suppressMoveCountdown?: boolean;
}

interface TokenContextValue {
  tokens:             UnitToken[];
  logs:               LogEntry[];
  positions:          Record<string, TokenPos>;
  medicalCountdowns:  Record<string, number>;
  moveCountdowns:     Record<string, number>;
  arrivalCountdowns:  Record<string, number>;
  createToken: (
    baseKey:     string,
    type:        TokenType,
    color:       TokenColor,
    formatLabel: (n: number) => string,
    unitType?:   string,
  ) => void;
  moveToken:   (tokenId: string, toZoneKey: string | null, pos?: TokenPos, opts?: MoveTokenOptions) => void;
  rescueUnit:  (tokenId: string, victimLabel: string) => void;
  addBadge:          (tokenId: string, badge: Omit<TokenBadge, 'id'>) => void;
  removeBadge:       (tokenId: string, badgeId: string) => void;
  clearBadges:       (tokenId: string) => void;
  setStatusTag:      (tokenId: string, tag: StatusTag | null) => void;
  setCustomNote:     (tokenId: string, note: string) => void;
  changeTokenColor:  (tokenId: string, color: TokenColor) => void;
  addLog:            (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
}

const TokenContext = createContext<TokenContextValue | null>(null);

export function useTokens(): TokenContextValue {
  const ctx = useContext(TokenContext);
  if (!ctx) throw new Error('useTokens must be used within TokenProvider');
  return ctx;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────
// 로스터 초기화 헬퍼
// ─────────────────────────────────────────────

/**
 * 로스터 → 초기 토큰 배열.
 * 훈련 시작 전에는 모든 출동대를 pool(미도착) 상태로 둔다.
 * arrivalSec 값에 관계없이 zoneKey = null.
 */
function buildInitialTokens(roster: DispatchRosterItem[]): UnitToken[] {
  return roster.map(item => rosterItemToToken(item, null));
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function TokenProvider({
  children,
  timingConfig,
  initialRoster,
  started = false,
  arrivalMode = 'time',
  getElapsed,
}: {
  children:       React.ReactNode;
  timingConfig?:  Partial<TimingConfig>;
  initialRoster?: DispatchRosterItem[];
  /**
   * 훈련 시작 여부 (TrainingContext.status === 'running').
   * false: 출동대 전원 pool 대기, 도착 타이머 미작동.
   * true:  도착 타이머 작동, arrivalSec 경과 시 대기1단계 자동 이동.
   */
  started?: boolean;
  /** 도착설정 방식. 'order' 모드에서는 타이머 자동 이동 비활성화. */
  arrivalMode?: ArrivalMode;
  /** 훈련 경과 초를 반환하는 콜백 — 로그 타임스탬프에 사용 */
  getElapsed?: () => number;
}) {
  // ── 경과시간 ref — 항상 최신 값 유지 ─────────────────────────────────
  const getElapsedRef = useRef<(() => number) | undefined>(undefined);
  getElapsedRef.current = getElapsed;

  function nowTimestamp(): string {
    const sec = getElapsedRef.current?.();
    if (sec !== undefined) {
      return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }
    return nowHHMM();
  }

  // ── 세션 데이터 1회 로드 (최초 렌더에서만) ──────────────────────────
  const sessionDataRef = useRef<
    | { loaded: false }
    | { loaded: true; data: ReturnType<typeof loadTokenSession> }
  >({ loaded: false });

  function getSession() {
    if (!sessionDataRef.current.loaded) {
      sessionDataRef.current = { loaded: true, data: loadTokenSession() };
    }
    return (sessionDataRef.current as { loaded: true; data: ReturnType<typeof loadTokenSession> }).data;
  }

  // ── Refs ────────────────────────────────────────────────────────────
  const initialRosterRef = useRef<DispatchRosterItem[]>(initialRoster ?? []);

  // counters: 세션 복원 > roster 기반 초기화 순
  const counters = useRef<Record<string, number>>({});

  // 도착 타이머가 이미 등록되었는지 추적 (중복 등록 방지)
  const timersStartedRef = useRef(false);

  // ── 상태 초기화 ──────────────────────────────────────────────────────

  const [tokens, setTokens] = useState<UnitToken[]>(() => {
    const s = getSession();
    if (s && s.tokens.length > 0) {
      // 세션 복원: counters = 세션값과 토큰 레이블 계산값 중 큰 쪽
      const fromSession = s.counters;
      const fromLabels  = computeCountersFromTokens(s.tokens);
      const merged: Record<string, number> = { ...fromSession };
      for (const [k, v] of Object.entries(fromLabels)) {
        merged[k] = Math.max(merged[k] ?? 0, v);
      }
      counters.current = merged;
      return s.tokens;
    }
    // 신규 초기화: counters는 roster에서, 토큰은 전원 pool
    counters.current = initialRoster?.length ? initCountersFromRoster(initialRoster) : {};
    return initialRoster?.length ? buildInitialTokens(initialRoster) : [];
  });

  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const s = getSession();
    return (s && s.tokens.length > 0) ? s.logs : [];
  });

  const [positions, setPositions] = useState<Record<string, TokenPos>>(() => {
    const s = getSession();
    return (s && s.tokens.length > 0) ? s.positions : {};
  });

  const [medicalCountdowns, setMedicalCountdowns] = useState<Record<string, number>>({});

  const moveTargetAtRef = useRef<Record<string, number>>({});

  const [moveCountdowns, setMoveCountdowns] = useState<Record<string, number>>(() => {
    const s = getSession();
    if (s && s.tokens.length > 0 && s.moveTargetAt) {
      const now = Date.now();
      const result: Record<string, number> = {};
      for (const [id, targetAt] of Object.entries(s.moveTargetAt)) {
        const remaining = Math.ceil((targetAt - now) / 1000);
        if (remaining > 0) {
          result[id] = remaining;
          moveTargetAtRef.current[id] = targetAt;
        }
      }
      return result;
    }
    return {};
  });

  /**
   * 도착 카운트다운:
   *  - started=false (훈련 미시작): 항상 빈 객체 (타이머 미작동)
   *  - started=true + 세션 복원: 세션의 arrivalTargetAt → 남은 초
   *  - started=true + 신규: start 시점 useEffect에서 설정
   */
  const [arrivalCountdowns, setArrivalCountdowns] = useState<Record<string, number>>(() => {
    if (!started) return {};
    const s = getSession();
    if (s && s.tokens.length > 0) {
      const now = Date.now();
      const result: Record<string, number> = {};
      for (const [id, targetAt] of Object.entries(s.arrivalTargetAt)) {
        const remaining = Math.ceil((targetAt - now) / 1000);
        if (remaining > 0) result[id] = remaining;
      }
      return result;
    }
    return {};
  });

  // arrivalTargetAt ref — 절대 시각 보관 (저장 시 사용)
  const arrivalTargetAtRef = useRef<Record<string, number>>({});

  const tokensRef     = useRef<UnitToken[]>([]);
  const medicalTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const moveTimers    = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const arrivalTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const timingRef = useRef<TimingConfig>({ ...DEFAULT_TIMING_CONFIG });
  timingRef.current = {
    rescueTimeSec: timingConfig?.rescueTimeSec ?? DEFAULT_TIMING_CONFIG.rescueTimeSec,
    moveTimeSec:   timingConfig?.moveTimeSec   ?? DEFAULT_TIMING_CONFIG.moveTimeSec,
  };

  useEffect(() => { tokensRef.current = tokens; }, [tokens]);

  // ── 타이머 전체 정리 (언마운트 시) ─────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(medicalTimers.current).forEach(clearTimeout);
      Object.values(moveTimers.current).forEach(clearTimeout);
      Object.values(arrivalTimers.current).forEach(clearTimeout);
    };
  }, []);

  // ── arrival 타이머 등록 — 훈련 시작(started=true) 시에만 실행 ───────
  useEffect(() => {
    // started=false, 이미 타이머 등록, 또는 착대모드 → 건너뜀
    if (!started || timersStartedRef.current || arrivalMode === 'order') return;
    timersStartedRef.current = true;

    const s = getSession();
    const hasSession = s !== null && s.tokens.length > 0;

    /** 공통: tokenId に delay(ms) 후 대기1단계로 자동 이동 */
    function scheduleArrival(tokenId: string, delayMs: number, targetAt: number) {
      arrivalTargetAtRef.current[tokenId] = targetAt;

      const timerId = setTimeout(() => {
        delete arrivalTimers.current[tokenId];
        delete arrivalTargetAtRef.current[tokenId];

        setArrivalCountdowns(prev => {
          const next = { ...prev };
          delete next[tokenId];
          return next;
        });

        const current = tokensRef.current.find(t => t.id === tokenId);
        if (!current || current.zoneKey !== null) return;

        setTokens(prev => prev.map(t =>
          t.id === tokenId ? { ...t, zoneKey: ARRIVAL_TARGET_ZONE } : t,
        ));
        setLogs(prev => [{
          id:         `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp:  nowTimestamp(),
          logType:    'move' as const,
          tokenId:    current.id,
          tokenName:  current.label,
          tokenColor: current.color,
          fromZoneId: 'pool',
          toZoneId:   ARRIVAL_TARGET_ZONE,
          note:       '현장 도착 → 대기1단계 자동 이동',
        }, ...prev]);
      }, delayMs);

      arrivalTimers.current[tokenId] = timerId;
    }

    if (hasSession && s) {
      // ── 경로 A: 세션 복원 — arrivalTargetAt 기반으로 타이머 재등록 ──
      const now = Date.now();
      for (const [tokenId, targetAt] of Object.entries(s.arrivalTargetAt)) {
        const delayMs = targetAt - now;
        if (delayMs <= 0) {
          // 이미 도착했어야 함 → 즉시 처리
          setTokens(prev => prev.map(t =>
            t.id === tokenId && t.zoneKey === null ? { ...t, zoneKey: ARRIVAL_TARGET_ZONE } : t,
          ));
          setArrivalCountdowns(prev => {
            const next = { ...prev };
            delete next[tokenId];
            return next;
          });
        } else {
          scheduleArrival(tokenId, delayMs, targetAt);
        }
      }

      // 이동 카운트다운 타이머 재등록 (moveTargetAt 기반)
      if (s.moveTargetAt) {
        for (const [tokenId, targetAt] of Object.entries(s.moveTargetAt)) {
          const delayMs = targetAt - now;
          if (delayMs > 0) {
            moveTimers.current[tokenId] = setTimeout(() => {
              delete moveTimers.current[tokenId];
              delete moveTargetAtRef.current[tokenId];
              setMoveCountdowns(prev => {
                const next = { ...prev };
                delete next[tokenId];
                return next;
              });
            }, delayMs);
          }
        }
      }
    } else {
      // ── 경로 B: 신규 훈련 시작 — roster 기반 ──────────────────────

      const now = Date.now();

      // arrivalSec <= 0 인 출동대 → 즉시 대기1단계 배치
      const immediateIds: string[] = [];
      for (const item of initialRosterRef.current) {
        if (item.arrivalSec <= 0) immediateIds.push(`roster-${item.id}`);
      }
      if (immediateIds.length > 0) {
        setTokens(prev => prev.map(t =>
          immediateIds.includes(t.id) && t.zoneKey === null
            ? { ...t, zoneKey: ARRIVAL_TARGET_ZONE }
            : t,
        ));
        setLogs(prev => {
          const entries: LogEntry[] = immediateIds.map(tokenId => {
            const token = tokensRef.current.find(t => t.id === tokenId);
            return {
              id:         `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              timestamp:  nowTimestamp(),
              logType:    'move' as const,
              tokenId:    tokenId,
              tokenName:  token?.label ?? tokenId,
              tokenColor: token?.color ?? 'red',
              fromZoneId: 'pool',
              toZoneId:   ARRIVAL_TARGET_ZONE,
              note:       '훈련 시작 시 현장 대기 → 대기1단계 자동 배치',
            };
          });
          return [...entries, ...prev];
        });
      }

      // arrivalSec > 0 인 출동대 → 카운트다운 후 자동 이동
      const initialCountdowns: Record<string, number> = {};
      for (const item of initialRosterRef.current) {
        if (item.arrivalSec <= 0) continue;
        const targetAt = now + item.arrivalSec * 1000;
        scheduleArrival(`roster-${item.id}`, item.arrivalSec * 1000, targetAt);
        initialCountdowns[`roster-${item.id}`] = item.arrivalSec;
      }
      if (Object.keys(initialCountdowns).length > 0) {
        setArrivalCountdowns(initialCountdowns);
      }
    }
  }, [started, arrivalMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 1초 카운트다운 감소 ─────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setMedicalCountdowns(prev => {
        if (Object.keys(prev).length === 0) return prev;
        const next: Record<string, number> = {};
        for (const k of Object.keys(prev)) {
          if (prev[k] > 1) next[k] = prev[k] - 1;
        }
        return next;
      });
      setMoveCountdowns(prev => {
        if (Object.keys(prev).length === 0) return prev;
        const next: Record<string, number> = {};
        for (const k of Object.keys(prev)) {
          if (prev[k] > 1) next[k] = prev[k] - 1;
        }
        return next;
      });
      setArrivalCountdowns(prev => {
        if (Object.keys(prev).length === 0) return prev;
        const next: Record<string, number> = {};
        for (const k of Object.keys(prev)) {
          if (prev[k] > 1) next[k] = prev[k] - 1;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── sessionStorage 저장 (500ms debounce) ────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      const now = Date.now();
      const arrivalTargetAt: Record<string, number> = {};
      for (const [id, secs] of Object.entries(arrivalCountdowns)) {
        arrivalTargetAt[id] = arrivalTargetAtRef.current[id] ?? (now + secs * 1000);
      }
      const moveTargetAt: Record<string, number> = { ...moveTargetAtRef.current };

      saveTokenSession({
        tokens,
        logs,
        positions,
        arrivalTargetAt,
        moveTargetAt,
        counters: counters.current,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [tokens, logs, positions, arrivalCountdowns, moveCountdowns]);

  // ── 토큰 생성 ───────────────────────────────
  const createToken = useCallback((
    baseKey:     string,
    type:        TokenType,
    color:       TokenColor,
    formatLabel: (n: number) => string,
    unitType?:   string,
  ) => {
    const count = (counters.current[baseKey] ?? 0) + 1;
    counters.current[baseKey] = count;
    setTokens(prev => [
      ...prev,
      {
        id:       `${baseKey}-${Date.now()}`,
        label:    formatLabel(count),
        type,
        color,
        unitType: unitType ?? defaultUnitType(color),
        zoneKey:  null,
        badges:   [],
        source:   'manual',
      },
    ]);
  }, []);

  // ── 토큰 이동 ───────────────────────────────
  const moveToken = useCallback((
    tokenId:   string,
    toZoneKey: string | null,
    pos?:      TokenPos,
    opts?:     MoveTokenOptions,
  ) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    if (!token) return;

    const zoneChanged = token.zoneKey !== toZoneKey;

    if (zoneChanged && token.zoneKey === null && toZoneKey !== null) {
      setArrivalCountdowns(prev => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
      delete arrivalTargetAtRef.current[tokenId];
    }

    if (zoneChanged && token.zoneKey === 'medical-post') {
      if (medicalTimers.current[tokenId]) {
        clearTimeout(medicalTimers.current[tokenId]);
        delete medicalTimers.current[tokenId];
      }
      setMedicalCountdowns(prev => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
    }

    if (zoneChanged) {
      const movedAt = Date.now();
      setTokens(prev =>
        prev.map(t => t.id === tokenId ? { ...t, zoneKey: toZoneKey, lastMovedAt: movedAt } : t)
      );
      if (toZoneKey !== null) {
        const entry: LogEntry = {
          id:         `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp:  nowTimestamp(),
          logType:    'move',
          tokenId:    token.id,
          tokenName:  token.label,
          tokenColor: token.color,
          fromZoneId: token.zoneKey ?? 'pool',
          toZoneId:   toZoneKey,
        };
        setLogs(prev => [entry, ...prev]);

        if (!opts?.suppressMoveCountdown) {
          const moveSec  = timingRef.current.moveTimeSec;
          const targetAt = Date.now() + moveSec * 1000;
          moveTargetAtRef.current[tokenId] = targetAt;
          setMoveCountdowns(prev => ({ ...prev, [tokenId]: moveSec }));
          if (moveTimers.current[tokenId]) clearTimeout(moveTimers.current[tokenId]);
          moveTimers.current[tokenId] = setTimeout(() => {
            delete moveTimers.current[tokenId];
            delete moveTargetAtRef.current[tokenId];
            setMoveCountdowns(prev => {
              const next = { ...prev };
              delete next[tokenId];
              return next;
            });
          }, moveSec * 1000);
        }
      } else {
        if (moveTimers.current[tokenId]) {
          clearTimeout(moveTimers.current[tokenId]);
          delete moveTimers.current[tokenId];
        }
        delete moveTargetAtRef.current[tokenId];
        setMoveCountdowns(prev => {
          const next = { ...prev };
          delete next[tokenId];
          return next;
        });
      }
    }

    setPositions(prev => {
      if (toZoneKey === null || pos === undefined) {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      }
      return { ...prev, [tokenId]: pos };
    });
  }, []);

  // ── 구조 처리 ────────────────────────────────
  const rescueUnit = useCallback((tokenId: string, victimLabel: string) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    if (!token) return;

    setTokens(prev => prev.map(t => {
      if (t.id !== tokenId) return t;
      return {
        ...t,
        zoneKey: 'medical-post',
        badges:  [...t.badges, { id: generateId(), line1: '구조중' }],
      };
    }));

    setPositions(prev => {
      const next = { ...prev };
      delete next[tokenId];
      return next;
    });

    const entry: LogEntry = {
      id:         `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp:  nowTimestamp(),
      logType:    'rescue',
      tokenId:    token.id,
      tokenName:  token.label,
      tokenColor: token.color,
      fromZoneId: token.zoneKey ?? 'pool',
      toZoneId:   'medical-post',
      note:       `${victimLabel} 구조대상자 → 구조, 임시의료소 이동`,
    };
    setLogs(prev => [entry, ...prev]);

    const rescueSec = timingRef.current.rescueTimeSec;
    setMedicalCountdowns(prev => ({ ...prev, [tokenId]: rescueSec }));

    if (medicalTimers.current[tokenId]) clearTimeout(medicalTimers.current[tokenId]);
    medicalTimers.current[tokenId] = setTimeout(() => {
      delete medicalTimers.current[tokenId];
      setMedicalCountdowns(prev => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
      setTokens(prev => prev.map(t => {
        if (t.id !== tokenId || t.zoneKey !== 'medical-post') return t;
        return {
          ...t,
          zoneKey: MEDICAL_TARGET_ZONE,
          badges:  t.badges.filter(b => b.line1 !== '구조중'),
        };
      }));
      setLogs(prev => {
        const t = tokensRef.current.find(tk => tk.id === tokenId);
        if (!t) return prev;
        return [{
          id:         `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp:  nowTimestamp(),
          logType:    'move' as const,
          tokenId:    t.id,
          tokenName:  t.label,
          tokenColor: t.color,
          fromZoneId: 'medical-post',
          toZoneId:   MEDICAL_TARGET_ZONE,
          note:       '임시의료소 처치 완료 → 직전대기 자동 이동',
        }, ...prev];
      });
    }, rescueSec * 1000);
  }, []);

  // ── 배지 ────────────────────────────────────
  const addBadge = useCallback((tokenId: string, badge: Omit<TokenBadge, 'id'>) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId
        ? { ...t, badges: [...t.badges, { ...badge, id: generateId() }] }
        : t
    ));
  }, []);

  const removeBadge = useCallback((tokenId: string, badgeId: string) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId
        ? { ...t, badges: t.badges.filter(b => b.id !== badgeId) }
        : t
    ));
  }, []);

  const clearBadges = useCallback((tokenId: string) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, badges: [] } : t
    ));
  }, []);

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    setLogs(prev => [{
      ...entry,
      id:        `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowTimestamp(),
    }, ...prev]);
  }, []);

  const setStatusTag = useCallback((tokenId: string, tag: StatusTag | null) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    if (!token) return;
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, statusTag: tag ?? undefined } : t
    ));
    const note = tag ? tag.label : `${token.statusTag?.label ?? '상태'} 해제`;
    setLogs(prev => [{
      id:        `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowTimestamp(),
      logType:   'status-tag' as const,
      tokenId,
      tokenName:  token.label,
      tokenColor: token.color,
      fromZoneId: '',
      toZoneId:   '',
      note,
    }, ...prev]);
  }, []);

  const setCustomNote = useCallback((tokenId: string, note: string) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, customNote: note || undefined } : t
    ));
  }, []);

  const changeTokenColor = useCallback((tokenId: string, color: TokenColor) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, color } : t
    ));
  }, []);

  return (
    <TokenContext.Provider value={{
      tokens, logs, positions, medicalCountdowns, moveCountdowns, arrivalCountdowns,
      createToken, moveToken, rescueUnit,
      addBadge, removeBadge, clearBadges, setStatusTag, setCustomNote, changeTokenColor, addLog,
    }}>
      {children}
    </TokenContext.Provider>
  );
}
