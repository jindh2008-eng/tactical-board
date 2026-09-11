/**
 * LogContext — 이벤트 로그 단일 창구
 *
 * 왜 `TokenContext`에서 분리했는가 (docs/EVENT_LOG_PLAN.md L-1 / E-1)
 *  - 로그의 절반 이상이 토큰과 무관한 사건(체크리스트·이벤트·방화문·연기·송수·소화전)인데
 *    기록하려면 `useTokens()`를 거쳐야 했다.
 *  - `EventProvider`가 `TokenProvider` 바깥이라 `EventContext`에서 직접 기록하지 못하고
 *    `EventLayer` 컴포넌트를 우회 경로로 썼다.
 *  - 훈련 시작·종료(`TrainingContext`)는 아예 기록할 방법이 없었다.
 *
 * 배치 — `PlayPage`의 runKey Provider 중 **가장 바깥**이다.
 * 안쪽 어떤 Provider가 추가돼도 위치를 따질 필요가 없게 하기 위해서다.
 * `TokenContext`는 이 Context의 `addLog`를 그대로 재노출한다(기존 호출부 무수정).
 *
 * 도착 묶음과 철회 (docs/EVENT_LOG_PHRASING_PLAN.md §2.2 · §3)
 *  - 동시에 도착한 대는 한 줄로 적는다 — 「대기1단계 도착: 진압1대, 구급1대, 물탱크1」
 *  - 출동대현황·추가출동대로 되돌리면 방금 한 도착에서 그 대를 뺀다.
 *    **로그가 사후 수정되는 유일한 경로다** — 나머지는 전부 추가만 한다.
 *
 * sessionStorage 키: tactical-board.runtime.logs
 */

import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react';
import type { LogEntry, ArrivalUnitRef } from '../types';
import {
  saveLogSession, loadLogSession, migrateLogsFromTokenSession,
} from '../utils/runtimeSession';
import { arrivalParts, partsText, mentionsToken } from '../utils/logPhrase';

/**
 * 로그 보관 상한.
 * 넘기면 오래된 것부터 버린다 — sessionStorage 용량을 넘겨 저장이 통째로 실패하는 것보다
 * 초반 로그 일부를 잃는 편이 낫다. 로그 1건이 JSON 약 200~300B라 2000건이 약 0.5MB다.
 * 실제 훈련 1회는 수백 건 규모이므로 평상시에는 걸리지 않는다.
 */
const MAX_LOGS = 2000;

/** 새로 만드는 로그에서 호출자가 채우지 않는 필드 */
type NewLogEntry = Omit<LogEntry, 'id' | 'timestamp' | 'elapsedSec' | 'wallClockMs'>;

/** 도착·복귀 1건 — 같은 태스크에 들어온 것끼리 구역별로 한 줄이 된다 */
interface ArrivalLogInput {
  mode:       'arrive' | 'return';
  zoneKey:    string;
  unit:       ArrivalUnitRef;
  logSource?: LogEntry['logSource'];
}

interface LogContextValue {
  logs:      LogEntry[];
  /** 로그 1건 추가. 시각 필드는 여기서 채운다 */
  addLog:    (entry: NewLogEntry) => void;
  /** 도착·복귀 — 같은 동기 실행 안에서 들어온 것을 구역별로 한 줄로 묶는다 */
  addArrivalLog: (input: ArrivalLogInput) => void;
  /** 출동대현황·추가출동대로 되돌렸을 때 — 직전 도착 기록에서 이 대를 뺀다 */
  retractArrival: (tokenId: string) => void;
  /** 로그 전체 삭제 (훈련 세팅) */
  clearLogs: () => void;
}

const LogContext = createContext<LogContextValue | null>(null);

export function useLog(): LogContextValue {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error('useLog must be used within LogProvider');
  return ctx;
}

/** 기록 시각 — 훈련 경과 초(시작 전이면 undefined)와 벽시계 */
interface Stamp {
  sec:  number | undefined;
  wall: number;
}

/** 아직 줄이 되지 않은 도착 묶음 */
interface PendingArrival {
  mode:       'arrive' | 'return';
  zoneKey:    string;
  units:      ArrivalUnitRef[];
  logSource?: LogEntry['logSource'];
  /** 첫 대가 들어온 시각 — flush 시각이 아니라 이걸로 찍는다 */
  stamp:      Stamp;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function buildEntry(entry: NewLogEntry, { sec, wall }: Stamp): LogEntry {
  const d = new Date(wall);
  return {
    ...entry,
    id:          `log-${wall}-${Math.random().toString(36).slice(2, 6)}`,
    // 훈련 중이면 경과시간, 시작 전이면 벽시계 — 어느 쪽인지는 elapsedSec으로 구분한다
    timestamp:   sec != null
      ? `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`
      : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    elapsedSec:  sec ?? null,
    wallClockMs: wall,
  };
}

/** 새 줄을 앞에 붙인다(로그는 최신순). `entries` 는 오래된 것부터 */
function prependEntries(prev: LogEntry[], entries: LogEntry[]): LogEntry[] {
  const next = [...[...entries].reverse(), ...prev];
  return next.length > MAX_LOGS ? next.slice(0, MAX_LOGS) : next;
}

export function LogProvider({
  children,
  getElapsed,
}: {
  children: React.ReactNode;
  /**
   * 훈련 경과 초를 반환하는 콜백. 훈련 시작 전이면 `undefined`를 반환해야 한다 —
   * 0을 반환하면 시작 전 기록이 전부 `00:00`으로 찍혀 순서를 알 수 없다.
   */
  getElapsed?: () => number | undefined;
}) {
  const getElapsedRef = useRef<(() => number | undefined) | undefined>(undefined);
  getElapsedRef.current = getElapsed;

  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const saved = loadLogSession();
    if (saved) return saved;
    // 새 키가 없으면 구버전(출동대 세션 안에 있던) 로그를 1회 이관한다
    return migrateLogsFromTokenSession() ?? [];
  });

  // ── 세션 저장 (500ms 디바운스 — 다른 런타임 상태와 같은 방식) ────────
  useEffect(() => {
    const timer = setTimeout(() => { saveLogSession({ logs }); }, 500);
    return () => clearTimeout(timer);
  }, [logs]);

  const stampNow = useCallback((): Stamp => ({
    sec:  getElapsedRef.current?.(),
    wall: Date.now(),
  }), []);

  const addLog = useCallback((entry: NewLogEntry) => {
    const built = buildEntry(entry, stampNow());
    setLogs(prev => prependEntries(prev, [built]));
  }, [stampNow]);

  /*
   * 도착 묶음 — 「같은 태스크 = 한 묶음」.
   *
   * 착대 더블클릭 · 훈련 시작 즉시 배치 · 동승 펌프 하차 · 같은 시각 타이머는 전부
   * 한 동기 실행 안에서 moveToken 을 여러 번 부른다. 그 사이 들어온 것을 모았다가
   * 마이크로태스크에서 구역별로 한 줄씩 낸다 — 지연이 없고 경계가 결정적이다.
   * 시간창(예: 10초)으로 묶으면 로그가 그만큼 늦게 찍히거나 경계에서 갈라진다.
   */
  const pendingRef = useRef(new Map<string, PendingArrival>());
  /*
   * 언마운트 때 묶음을 비우지 않는다. StrictMode 는 개발 중 마운트 직후
   * 가짜 언마운트·재마운트를 돌리는데, 그 사이에 아직 flush 전인 도착이
   * 통째로 사라졌다(훈련 진행 중에 다시 마운트돼 즉시 배치가 돈 경우 — 실측).
   * 진짜로 내려간 뒤에 flush 가 돌아도 setState 는 아무 일도 하지 않는다.
   */

  const flushArrivals = useCallback(() => {
    const groups = [...pendingRef.current.values()].filter(g => g.units.length > 0);
    pendingRef.current.clear();
    if (groups.length === 0) return;

    const entries = groups.map(g => {
      const parts = arrivalParts(g.mode, g.zoneKey, g.units);
      return buildEntry({
        logType:    'arrival',
        logSource:  g.logSource,
        tokenId:    '',
        tokenName:  '',
        fromZoneId: '',
        toZoneId:   g.zoneKey,
        note:       partsText(parts),
        parts,
        payload:    { kind: 'arrival', mode: g.mode, zoneKey: g.zoneKey, units: g.units },
      }, g.stamp);
    });
    setLogs(prev => prependEntries(prev, entries));
  }, []);

  const addArrivalLog = useCallback((input: ArrivalLogInput) => {
    const pending = pendingRef.current;
    const isFirst = pending.size === 0;
    const key     = `${input.mode}|${input.zoneKey}`;
    const group   = pending.get(key);
    if (group) {
      if (!group.units.some(u => u.tokenId === input.unit.tokenId)) group.units.push(input.unit);
    } else {
      pending.set(key, {
        mode: input.mode, zoneKey: input.zoneKey, units: [input.unit],
        logSource: input.logSource, stamp: stampNow(),
      });
    }
    if (isFirst) queueMicrotask(flushArrivals);
  }, [stampNow, flushArrivals]);

  const retractArrival = useCallback((tokenId: string) => {
    // ① 아직 줄이 되기 전 — 묶음에서 빼면 끝이다
    for (const [key, group] of pendingRef.current) {
      if (group.mode !== 'arrive') continue;
      const i = group.units.findIndex(u => u.tokenId === tokenId);
      if (i < 0) continue;
      group.units.splice(i, 1);
      if (group.units.length === 0) pendingRef.current.delete(key);
      return;
    }

    /*
     * ② 이미 찍힌 줄 — 최신부터 거슬러 올라가 **그 대의 가장 최근 흔적이 도착일 때만**
     * 거둔다. 도착 뒤에 그 대가 한 일이 하나라도 있으면(이동·송수·역할) 그 도착은
     * 실제로 있었던 일이다 — 지우면 앞뒤가 안 맞는 기록이 된다(§2.2 안전조건).
     */
    setLogs(prev => {
      for (let i = 0; i < prev.length; i++) {
        const e = prev[i];
        const p = e.payload;
        if (p?.kind === 'arrival' && p.mode === 'arrive' && p.units.some(u => u.tokenId === tokenId)) {
          const units = p.units.filter(u => u.tokenId !== tokenId);
          const next  = [...prev];
          if (units.length === 0) {
            next.splice(i, 1);
          } else {
            const parts = arrivalParts(p.mode, p.zoneKey, units);
            next[i] = { ...e, note: partsText(parts), parts, payload: { ...p, units } };
          }
          return next;
        }
        if (mentionsToken(e, tokenId)) return prev;
      }
      return prev;
    });
  }, []);

  const clearLogs = useCallback(() => {
    pendingRef.current.clear();
    setLogs([]);
  }, []);

  return (
    <LogContext.Provider value={{ logs, addLog, addArrivalLog, retractArrival, clearLogs }}>
      {children}
    </LogContext.Provider>
  );
}
