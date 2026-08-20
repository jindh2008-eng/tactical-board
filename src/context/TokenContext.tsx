import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react';
import type { UnitToken, LogEntry, TokenType, TokenColor, TokenBadge, StatusTag, SprayState, Pos } from '../types';
import type { DispatchRosterItem, ArrivalMode } from '../types/settings';
import { rosterItemToToken, initCountersFromRoster, computeCountersFromTokens } from '../utils/dispatchArrival';
import { computeRosterDisplayName } from '../utils/dispatchRoster';
import {
  saveTokenSession, loadTokenSession,
} from '../utils/runtimeSession';
import { UNIT_ADD_ZONE } from '../utils/unitAddZone';
import { isPoolZone, mountedPumpIds } from '../utils/unitPairing';
import { summarizeUnits, summaryText, toUnitRefs } from '../utils/dispatchSummary';
import { floorIdLabel } from '../utils/logLabels';
import { useResourceStatus } from './ResourceStatusContext';
import { useLog } from './LogContext';

const ZONE_RESOURCE = 'standby-resource';
const ZONE_STANDBY1 = 'standby-standby1';

/**
 * 하차 지점 — 펌프가 진압대를 내려놓고 남는 자리.
 * 진압대는 자원대기소(지정 시) → 대기1단계 → 직전대기 → 면·내부 순으로 들어가는데,
 * 펌프가 함께 갈 수 있는 건 여기까지다.
 */
const DISMOUNT_ZONES = new Set<string>([ZONE_RESOURCE, ZONE_STANDBY1]);
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
  /** true: 연동 펌프를 따라 움직이지 않는다 (연쇄 이동 자기 자신) */
  skipPairMove?: boolean;
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
    /** 같은 값을 넘긴 토큰끼리 짝이 된다 (진압대+펌프) — 하나를 지우면 함께 지워진다 */
    pairGroupId?: string,
  ) => void;
  moveToken:   (tokenId: string, toZoneKey: string | null, pos?: TokenPos, opts?: MoveTokenOptions) => void;
  removeToken: (tokenId: string) => void;
  rescueUnit:  (tokenId: string, victimLabel: string) => void;
  addBadge:          (tokenId: string, badge: Omit<TokenBadge, 'id'>) => void;
  removeBadge:       (tokenId: string, badgeId: string) => void;
  clearBadges:       (tokenId: string) => void;
  toggleMissionTag:  (tokenId: string, tag: StatusTag) => void;
  setStatusTag:      (tokenId: string, tag: StatusTag | null) => void;
  /**
   * 토큰 말풍선 메모.
   * `source: 'preset'` — 설정된 상태메시지 목록에서 고른 것. **무전 교신 내용이라 로그로 남긴다.**
   * `source: 'manual'`(기본) — 자유 입력 메모. 표시용 주석이라 남기지 않는다(EVENT_LOG_PLAN §0.4).
   */
  setCustomNote:     (tokenId: string, note: string, source?: 'preset' | 'manual') => void;
  setSprayState:     (tokenId: string, state: SprayState | null, target?: { x: number; y: number; floorId?: string; label?: string; eventId?: string } | null) => void;
  setAerialTarget:      (tokenId: string, target: { floorId: string; x: number; y: number; deployLabel: string } | null) => void;
  moveAerialTarget:     (tokenId: string, x: number, y: number, floorId?: string) => void;
  setAerialSprayTarget: (tokenId: string, target: { floorId: string; x: number; y: number } | null) => void;
  changeTokenColor:  (tokenId: string, color: TokenColor) => void;
  addLog:            (entry: Omit<LogEntry, 'id' | 'timestamp' | 'elapsedSec' | 'wallClockMs'>) => void;
}

const TokenContext = createContext<TokenContextValue | null>(null);

export function useTokens(): TokenContextValue {
  const ctx = useContext(TokenContext);
  if (!ctx) throw new Error('useTokens must be used within TokenProvider');
  return ctx;
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
  return roster.map(item => {
    const displayName = computeRosterDisplayName(item);
    return rosterItemToToken(
      displayName !== item.name ? { ...item, name: displayName } : item,
      null,
    );
  });
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
}) {
  // ── 로그 창구 ────────────────────────────────────────────────────────
  // 로그는 LogContext(더 바깥)가 보관한다. 여기서는 위임만 하고, 기존 호출부가
  // `useTokens().addLog` / `useTokens().logs` 를 그대로 쓸 수 있게 다시 노출한다.
  // docs/EVENT_LOG_PLAN.md E-1
  const { logs, addLog } = useLog();

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
  useEffect(() => { initialRosterRef.current = initialRoster ?? []; }, [initialRoster]);

  // 동승 펌프를 어디에 내려놓을지 정할 때 자원대기소 운영 여부를 본다
  const { resourceAssigned } = useResourceStatus();
  const resourceAssignedRef  = useRef(resourceAssigned);
  useEffect(() => { resourceAssignedRef.current = resourceAssigned; }, [resourceAssigned]);

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
        addLog({
          logSource:  'system' as const,
          logType:    'move' as const,
          tokenId:    current.id,
          tokenName:  current.label,
          tokenColor: current.color,
          fromZoneId: 'pool',
          toZoneId:   ARRIVAL_TARGET_ZONE,
          note:       '현장 도착 → 대기1단계 자동 이동',
        });
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

      // ── 초기 출동 편성 로그 ──────────────────────────────────────
      // 출동대현황의 출동대 = 화재신고 시점에 상황실이 출동시킨 편성이다.
      // 이후 로그는 전부 '변화'만 담으므로, 이 기준 편성이 없으면 어느 시점의
      // 배치도 계산할 수 없다. 세션 복원(경로 A)에서는 남기지 않는다 — 이미 기록돼 있다.
      // docs/EVENT_LOG_PLAN.md N-4
      const initialUnits = tokensRef.current;
      if (initialUnits.length > 0) {
        const summary = summarizeUnits(initialUnits);
        addLog({
          logSource: 'system',
          logType:   'dispatch',
          tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '',
          note:      `초기 출동: ${summaryText(summary)}`,
          payload:   { kind: 'dispatch-initial', units: toUnitRefs(initialUnits), summary },
        });
      }

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
        for (const tokenId of immediateIds) {
          const token = tokensRef.current.find(t => t.id === tokenId);
          addLog({
            logSource:  'system',
            logType:    'move',
            tokenId:    tokenId,
            tokenName:  token?.label ?? tokenId,
            tokenColor: token?.color ?? 'red',
            fromZoneId: 'pool',
            toZoneId:   ARRIVAL_TARGET_ZONE,
            note:       '훈련 시작 시 현장 대기 → 대기1단계 자동 배치',
          });
        }
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
        positions,
        arrivalTargetAt,
        moveTargetAt,
        counters: counters.current,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [tokens, positions, arrivalCountdowns, moveCountdowns]);

  // ── 토큰 생성 ───────────────────────────────
  const createToken = useCallback((
    baseKey:     string,
    type:        TokenType,
    color:       TokenColor,
    formatLabel: (n: number) => string,
    unitType?:   string,
    pairGroupId?: string,
  ) => {
    // 번호는 "지금 쓰이지 않는 가장 작은 번호"를 고른다.
    //
    // 예전에는 단조 증가 카운터라 진압9·10 을 만들고 10 을 지우면 다음이 11 이었다.
    // 로스터 출동대는 buildInitialTokens 로 처음에 전부 만들어지므로(미도착 포함)
    // 현재 라벨만 훑어도 나중에 도착할 출동대와 번호가 겹치지 않는다.
    //
    // 계산을 업데이터 안에서 하는 이유 — 연타해도 직전 생성분이 prev 에 반영돼 있어
    // 같은 번호가 두 번 나오지 않는다(ref 는 렌더 뒤에 갱신돼 한 박자 늦다).
    setTokens(prev => {
      // 유관기관·직접입력처럼 번호를 쓰지 않는 종류는 그대로 둔다
      const numbered = formatLabel(1) !== formatLabel(2);
      let label = formatLabel(1);
      if (numbered) {
        const used = new Set(prev.map(t => t.label));
        let n = 1;
        while (used.has(formatLabel(n))) n++;
        label = formatLabel(n);
      }
      return [
        ...prev,
        {
          // Date.now()는 1ms 해상도라 연타 시 동일 ID가 생성될 수 있음 —
          // 로그 ID와 동일하게 랜덤 접미사를 붙여 충돌 방지
          // (ID를 파싱하는 코드는 없으므로 형식 변경은 기존 데이터와 무관)
          id:       `${baseKey}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label,
          type,
          color,
          unitType: unitType ?? defaultUnitType(color),
          // 직접 추가한 출동대는 좌측 '추가출동대' 박스에서 시작한다
          // (로스터 착대 출동대는 zoneKey: null = 출동대현황).
          zoneKey:  UNIT_ADD_ZONE,
          badges:   [],
          source:   'manual',
          ...(pairGroupId ? { pairGroupId } : {}),
        },
      ];
    });
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

    // 구조 처리 중(임시의료소 카운트다운 진행 중) 지정 시간 전 수동 이동 →
    // 타이머·카운트다운뿐 아니라 '구조중' 배지도 함께 정리한다.
    // (완료 타이머는 zoneKey==='medical-post' 조건에 걸려 나중에 실행돼도
    //  배지를 지우지 못해 영구 잔류하는 문제가 있었음 — P0-RESCUE-01)
    const wasRescuing = zoneChanged && token.zoneKey === 'medical-post' &&
      token.badges.some(b => b.line1 === '구조중');

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
      // 구역 변경 시 방수 자동 해제 (동일 구역 내 위치 이동은 제외)
      setTokens(prev =>
        prev.map(t => {
          if (t.id !== tokenId) return t;
          const update: Partial<typeof t> = { zoneKey: toZoneKey, lastMovedAt: movedAt };
          if (t.sprayState != null) {
            update.sprayState  = null;
            update.sprayTarget = null;
          }
          if (wasRescuing) {
            update.badges = t.badges.filter(b => b.line1 !== '구조중');
          }
          return { ...t, ...update };
        })
      );
      if (toZoneKey !== null) {
        addLog({
          logType:    'move',
          tokenId:    token.id,
          tokenName:  token.label,
          tokenColor: token.color,
          fromZoneId: token.zoneKey ?? 'pool',
          toZoneId:   toZoneKey,
          note:       wasRescuing ? '구조 처리 중단 후 수동 이동' : undefined,
          payload:    {
            kind: 'move', tokenId: token.id, tokenLabel: token.label, unitType: token.unitType,
            fromZoneKey: token.zoneKey ?? 'pool', toZoneKey, auto: false,
          },
        });

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

    // ── 동승 펌프 함께 내보내기 ─────────────────
    // 진압대는 펌프를 타고 출동한다. 대기 박스(출동대현황·추가출동대)에 함께 있는
    // 동안만 한 몸이고, 박스를 떠나는 이 순간이 하차다. 그 뒤로는 서로 관여하지 않는다.
    //
    //   다른 대기 박스로              → 아직 출동 전이니 펌프도 함께 (동승 유지)
    //   자원대기소·대기1단계로        → 같은 자리까지 태워다 주고 하차
    //   그 너머(직전대기·RIT·면·내부) → 펌프는 못 들어가니 하차 지점에 내려놓는다
    //
    // 출발지가 대기 박스일 때만 따진다 — 이미 상황판에 세워 둔 펌프는 진압대를
    // 아무리 옮겨도 제자리다(예전엔 매 이동마다 펌프 자리를 다시 계산해 끌고 다녔다).
    if (!opts?.skipPairMove && token.unitType === 'suppression' && isPoolZone(token.zoneKey)) {
      const pumpIds = mountedPumpIds(token, tokensRef.current, initialRosterRef.current);
      const pumpZone = (isPoolZone(toZoneKey) || DISMOUNT_ZONES.has(toZoneKey!))
        ? toZoneKey
        : (resourceAssignedRef.current ? ZONE_RESOURCE : ZONE_STANDBY1);
      for (const id of pumpIds) {
        moveTokenRef.current(id, pumpZone, undefined, { skipPairMove: true });
      }
    }
  }, [addLog]);

  // moveToken 이 자기 자신을 다시 부를 수 있게 참조를 들고 있는다.
  // deps 가 [] 라 함수가 다시 만들어지지 않으므로 최초 값 그대로면 충분하다.
  const moveTokenRef = useRef(moveToken);

  // ── 구조 처리 ────────────────────────────────
  const rescueUnit = useCallback((tokenId: string, victimLabel: string) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    if (!token) return;

    setTokens(prev => prev.map(t => {
      if (t.id !== tokenId) return t;
      // 이미 구조중이면 중복 배지를 추가하지 않음
      const badges = t.badges.some(b => b.line1 === '구조중')
        ? t.badges
        : [...t.badges, { id: generateId(), line1: '구조중' }];
      return { ...t, zoneKey: 'medical-post', badges };
    }));

    setPositions(prev => {
      const next = { ...prev };
      delete next[tokenId];
      return next;
    });

    addLog({
      logType:    'rescue',
      tokenId:    token.id,
      tokenName:  token.label,
      tokenColor: token.color,
      fromZoneId: token.zoneKey ?? 'pool',
      toZoneId:   'medical-post',
      note:       `${victimLabel} 구조대상자 → 구조, 임시의료소 이동`,
    });

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
      const done = tokensRef.current.find(tk => tk.id === tokenId);
      if (done) {
        addLog({
          logSource:  'system',
          logType:    'move',
          tokenId:    done.id,
          tokenName:  done.label,
          tokenColor: done.color,
          fromZoneId: 'medical-post',
          toZoneId:   MEDICAL_TARGET_ZONE,
          note:       '임시의료소 처치 완료 → 직전대기 자동 이동',
        });
      }
    }, rescueSec * 1000);
  }, [addLog]);

  // ── 배지 ────────────────────────────────────
  const addBadge = useCallback((tokenId: string, badge: Omit<TokenBadge, 'id'>) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    setTokens(prev => prev.map(t =>
      t.id === tokenId
        ? { ...t, badges: [...t.badges, { ...badge, id: generateId() }] }
        : t
    ));
    if (token) {
      addLog({
        logType:    'status-tag' as const,
        tokenId,
        tokenName:  token.label,
        tokenColor: token.color,
        fromZoneId: token.zoneKey ?? '',
        toZoneId:   '',
        note:       `배지 추가: ${badge.line1}${badge.line2 ? ' ' + badge.line2 : ''}`,
      });
    }
  }, [addLog]);

  const removeBadge = useCallback((tokenId: string, badgeId: string) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    const badge = token?.badges.find(b => b.id === badgeId);
    setTokens(prev => prev.map(t =>
      t.id === tokenId
        ? { ...t, badges: t.badges.filter(b => b.id !== badgeId) }
        : t
    ));
    if (token && badge) {
      addLog({
        logType:    'status-tag' as const,
        tokenId,
        tokenName:  token.label,
        tokenColor: token.color,
        fromZoneId: token.zoneKey ?? '',
        toZoneId:   '',
        note:       `배지 제거: ${badge.line1}${badge.line2 ? ' ' + badge.line2 : ''}`,
      });
    }
  }, [addLog]);

  const clearBadges = useCallback((tokenId: string) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, badges: [] } : t
    ));
  }, []);

  const toggleMissionTag = useCallback((tokenId: string, tag: StatusTag) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    if (!token) return;
    const prev_tags = token.missionTags ?? [];
    const exists = prev_tags.some(m => m.label === tag.label);
    const next_tags = exists
      ? prev_tags.filter(m => m.label !== tag.label)
      : [...prev_tags, tag];
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, missionTags: next_tags.length > 0 ? next_tags : undefined } : t
    ));
    const note = exists ? `임무 해제: ${tag.label}` : `임무: ${tag.label}`;
    addLog({
      logType:    'status-tag' as const,
      tokenId,
      tokenName:  token.label,
      tokenColor: token.color,
      fromZoneId: '',
      toZoneId:   '',
      note,
    });
  }, [addLog]);

  const setStatusTag = useCallback((tokenId: string, tag: StatusTag | null) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    if (!token) return;
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, statusTag: tag ?? undefined } : t
    ));
    const note = tag ? tag.label : `${token.statusTag?.label ?? '상태'} 해제`;
    addLog({
      logType:    'status-tag' as const,
      tokenId,
      tokenName:  token.label,
      tokenColor: token.color,
      fromZoneId: '',
      toZoneId:   '',
      note,
    });
  }, [addLog]);

  const setCustomNote = useCallback((tokenId: string, note: string, source: 'preset' | 'manual' = 'manual') => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, customNote: note || undefined } : t
    ));
    if (source !== 'preset') return;
    const token = tokensRef.current.find(t => t.id === tokenId);
    if (!token) return;
    const msg = note.trim() || null;
    addLog({
      logType:    'status-tag',
      tokenId,
      tokenName:  token.label,
      tokenColor: token.color,
      fromZoneId: '', toZoneId: '',
      note:       msg ? `상태메시지: ${msg}` : '상태메시지 해제',
      payload:    { kind: 'unit-status-message', tokenId, tokenLabel: token.label, message: msg },
    });
  }, [addLog]);

  const setSprayState = useCallback((
    tokenId: string,
    state:   SprayState | null,
    target?: { x: number; y: number; floorId?: string; label?: string; eventId?: string } | null,
  ) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    setTokens(prev => prev.map(t => {
      if (t.id !== tokenId) return t;
      if (state === null) return { ...t, sprayState: null, sprayTarget: null };
      return { ...t, sprayState: state, sprayTarget: target !== undefined ? target : t.sprayTarget };
    }));
    if (token) {
      // 어디를 향해 쏘는지가 전술 판단의 핵심이다 — 좌표가 아니라 대상 구역(층 또는 면)을 남긴다
      const nextTarget = target !== undefined ? target : token.sprayTarget;
      const targetFloorId = state === null ? null : (nextTarget?.floorId ?? null);
      const targetEventId = state === null ? null : (nextTarget?.eventId ?? null);
      const place = targetFloorId
        ? (targetFloorId.startsWith('face-')
            ? `${targetFloorId.slice('face-'.length)}면`
            : floorIdLabel(targetFloorId))
        : null;
      // 현장요소 토큰을 겨눴으면 그 이름을 앞세운다 — "무엇을" 껐는지가 분석의 단위다
      const where = targetEventId && nextTarget?.label
        ? `${nextTarget.label}${place ? ` (${place})` : ''}`
        : place;
      const note = state === null
        ? '방수 중단'
        : `방수 ${state}${where ? ` → ${where}` : ''}`;
      addLog({
        logType:    'status-tag' as const,
        tokenId,
        tokenName:  token.label,
        tokenColor: token.color,
        fromZoneId: token.zoneKey ?? '',
        toZoneId:   '',
        note,
        payload:    {
          kind: 'spray', tokenId, tokenLabel: token.label,
          state, fromZoneKey: token.zoneKey ?? null, targetFloorId,
          targetEventId, targetLabel: (state === null ? null : nextTarget?.label ?? null),
        },
      });
    }
  }, [addLog]);

  const setAerialTarget = useCallback((tokenId: string, target: { floorId: string; x: number; y: number; deployLabel: string } | null) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, aerialTarget: target ?? undefined, aerialSprayTarget: null } : t
    ));
    if (token) {
      const note = target === null
        ? '전개 해제'
        : `${target.deployLabel} 전개 (${floorIdLabel(target.floorId)})`;
      addLog({
        logType:    'status-tag' as const,
        tokenId,
        tokenName:  token.label,
        tokenColor: token.color,
        fromZoneId: token.zoneKey ?? '',
        toZoneId:   target?.floorId ?? '',
        note,
        payload:    {
          kind: 'aerial-deploy', tokenId, tokenLabel: token.label,
          floorId: target?.floorId ?? null, deployLabel: target?.deployLabel ?? null,
        },
      });
    }
  }, [addLog]);

  const moveAerialTarget = useCallback((tokenId: string, x: number, y: number, floorId?: string) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId && t.aerialTarget
        ? { ...t, aerialTarget: { ...t.aerialTarget, x, y, ...(floorId ? { floorId } : {}) } }
        : t
    ));
  }, []);

  const setAerialSprayTarget = useCallback((tokenId: string, target: { floorId: string; x: number; y: number } | null) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, aerialSprayTarget: target ?? undefined } : t
    ));
  }, []);

  const changeTokenColor = useCallback((tokenId: string, color: TokenColor) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, color } : t
    ));
  }, []);

  const removeToken = useCallback((tokenId: string) => {
    setTokens(prev => {
      const target = prev.find(t => t.id === tokenId);
      if (!target) return prev;
      // 함께 만들어진 짝(진압대+펌프)은 동승 중일 때만 같이 지운다.
      // 대기 박스를 떠나 따로 움직이기 시작한 뒤에는 각자 지운다 —
      // 상황판에 배치해 둔 펌프가 진압대를 지웠다고 함께 사라지면 안 된다.
      const doomed = new Set([tokenId]);
      if (target.pairGroupId && isPoolZone(target.zoneKey)) {
        for (const t of prev) {
          if (t.pairGroupId === target.pairGroupId && t.zoneKey === target.zoneKey) doomed.add(t.id);
        }
      }
      // 삭제되는 토큰에 걸린 구조 처리 완료 타이머가 남아있으면 정리
      for (const id of doomed) {
        if (medicalTimers.current[id]) {
          clearTimeout(medicalTimers.current[id]);
          delete medicalTimers.current[id];
        }
      }
      return prev.filter(t => !doomed.has(t.id));
    });
  }, []);

  return (
    <TokenContext.Provider value={{
      tokens, logs, positions, medicalCountdowns, moveCountdowns, arrivalCountdowns,
      createToken, moveToken, removeToken, rescueUnit,
      addBadge, removeBadge, clearBadges, toggleMissionTag, setStatusTag, setCustomNote, setSprayState, setAerialTarget, moveAerialTarget, setAerialSprayTarget, changeTokenColor, addLog,
    }}>
      {children}
    </TokenContext.Provider>
  );
}
