import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react';
import type { UnitToken, LogEntry, TokenType, TokenColor, TokenBadge } from '../types';
import type { DispatchRosterItem } from '../types/settings';
import { rosterItemToToken, initCountersFromRoster, computeCountersFromTokens } from '../utils/dispatchArrival';
import {
  saveTokenSession, loadTokenSession,
} from '../utils/runtimeSession';
import { secsToMmss } from '../utils/dispatchRoster';

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

export interface TokenPos { x: number; y: number; }

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
  addBadge:    (tokenId: string, badge: Omit<TokenBadge, 'id'>) => void;
  removeBadge: (tokenId: string, badgeId: string) => void;
  clearBadges: (tokenId: string) => void;
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

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────
// 로스터 초기화 헬퍼
// ─────────────────────────────────────────────

function buildInitialTokens(roster: DispatchRosterItem[]): UnitToken[] {
  return roster.map(item => {
    const zoneKey = item.arrivalSec <= 0 ? ARRIVAL_TARGET_ZONE : null;
    return rosterItemToToken(item, zoneKey);
  });
}

function buildInitialArrivalCountdowns(roster: DispatchRosterItem[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of roster) {
    if (item.arrivalSec > 0) {
      result[`roster-${item.id}`] = item.arrivalSec;
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function TokenProvider({
  children,
  timingConfig,
  initialRoster,
}: {
  children:       React.ReactNode;
  timingConfig?:  Partial<TimingConfig>;
  initialRoster?: DispatchRosterItem[];
}) {
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
  // 초기화는 아래 useState 후 동기적으로 처리하기 위해 빈 객체로 시작
  // (useState 초기화 함수에서 세팅)

  // ── 상태 초기화 ──────────────────────────────────────────────────────

  const [tokens, setTokens] = useState<UnitToken[]>(() => {
    const s = getSession();
    if (s && s.tokens.length > 0) {
      // counters: 세션 값과 실제 토큰 레이블에서 계산한 값 중 큰 쪽 사용
      // (세션 저장 누락이나 수동 토큰 레이블 불일치를 보정)
      const fromSession = s.counters;
      const fromLabels  = computeCountersFromTokens(s.tokens);
      const merged: Record<string, number> = { ...fromSession };
      for (const [k, v] of Object.entries(fromLabels)) {
        merged[k] = Math.max(merged[k] ?? 0, v);
      }
      counters.current = merged;
      return s.tokens;
    }
    // counters는 roster에서 초기화
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
  const [moveCountdowns,    setMoveCountdowns]    = useState<Record<string, number>>(() => {
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

  const [arrivalCountdowns, setArrivalCountdowns] = useState<Record<string, number>>(() => {
    const s = getSession();
    if (s && s.tokens.length > 0) {
      // arrivalTargetAt → 남은 초 변환
      const now = Date.now();
      const result: Record<string, number> = {};
      for (const [id, targetAt] of Object.entries(s.arrivalTargetAt)) {
        const remaining = Math.ceil((targetAt - now) / 1000);
        if (remaining > 0) result[id] = remaining;
      }
      return result;
    }
    return initialRoster?.length ? buildInitialArrivalCountdowns(initialRoster) : {};
  });

  // arrivalTargetAt ref — 절대 시각 보관 (저장 시 사용)
  const arrivalTargetAtRef = useRef<Record<string, number>>({});
  // moveTargetAt ref — 이동 카운트다운 완료 절대 시각 보관
  const moveTargetAtRef = useRef<Record<string, number>>({});

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

  // ── arrival 타이머 등록 ─────────────────────────────────────────────
  useEffect(() => {
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
          timestamp:  nowHHMM(),
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
      // 경로 A: 세션 복원 — arrivalTargetAt 기반으로 타이머 재등록
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
      // 경로 B: 신규 초기화 — roster 기반
      const now = Date.now();
      for (const item of initialRosterRef.current) {
        if (item.arrivalSec <= 0) continue;
        const targetAt = now + item.arrivalSec * 1000;
        scheduleArrival(`roster-${item.id}`, item.arrivalSec * 1000, targetAt);
      }
    }

    return () => {
      Object.values(medicalTimers.current).forEach(clearTimeout);
      Object.values(moveTimers.current).forEach(clearTimeout);
      Object.values(arrivalTimers.current).forEach(clearTimeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      // arrivalTargetAt: ref 값 우선, 없으면 현재 카운트다운에서 추정
      const now = Date.now();
      const arrivalTargetAt: Record<string, number> = {};
      for (const [id, secs] of Object.entries(arrivalCountdowns)) {
        arrivalTargetAt[id] = arrivalTargetAtRef.current[id] ?? (now + secs * 1000);
      }

      // moveTargetAt: ref 에서 직접 읽음 (항상 절대 시각)
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
      setTokens(prev =>
        prev.map(t => t.id === tokenId ? { ...t, zoneKey: toZoneKey } : t)
      );
      if (toZoneKey !== null) {
        const entry: LogEntry = {
          id:         `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp:  nowHHMM(),
          logType:    'move',
          tokenId:    token.id,
          tokenName:  token.label,
          tokenColor: token.color,
          fromZoneId: token.zoneKey ?? 'pool',
          toZoneId:   toZoneKey,
        };
        setLogs(prev => [entry, ...prev]);

        // suppressMoveCountdown: arrival 자동도착은 이동중 표시 없음
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
        badges:  [...t.badges, { id: uid(), line1: '구조중' }],
      };
    }));

    setPositions(prev => {
      const next = { ...prev };
      delete next[tokenId];
      return next;
    });

    const entry: LogEntry = {
      id:         `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp:  nowHHMM(),
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
          timestamp:  nowHHMM(),
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
        ? { ...t, badges: [...t.badges, { ...badge, id: uid() }] }
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

  return (
    <TokenContext.Provider value={{
      tokens, logs, positions, medicalCountdowns, moveCountdowns, arrivalCountdowns,
      createToken, moveToken, rescueUnit,
      addBadge, removeBadge, clearBadges,
    }}>
      {children}
    </TokenContext.Provider>
  );
}

// secsToMmss re-export (TokenCard 에서 사용)
export { secsToMmss };
