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
 * sessionStorage 키: tactical-board.runtime.logs
 */

import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react';
import type { LogEntry } from '../types';
import {
  saveLogSession, loadLogSession, migrateLogsFromTokenSession,
} from '../utils/runtimeSession';

/**
 * 로그 보관 상한.
 * 넘기면 오래된 것부터 버린다 — sessionStorage 용량을 넘겨 저장이 통째로 실패하는 것보다
 * 초반 로그 일부를 잃는 편이 낫다. 로그 1건이 JSON 약 200~300B라 2000건이 약 0.5MB다.
 * 실제 훈련 1회는 수백 건 규모이므로 평상시에는 걸리지 않는다.
 */
const MAX_LOGS = 2000;

/** 새로 만드는 로그에서 호출자가 채우지 않는 필드 */
type NewLogEntry = Omit<LogEntry, 'id' | 'timestamp' | 'elapsedSec' | 'wallClockMs'>;

interface LogContextValue {
  logs:      LogEntry[];
  /** 로그 1건 추가. 시각 필드는 여기서 채운다 */
  addLog:    (entry: NewLogEntry) => void;
  /** 로그 전체 삭제 (훈련 세팅) */
  clearLogs: () => void;
}

const LogContext = createContext<LogContextValue | null>(null);

export function useLog(): LogContextValue {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error('useLog must be used within LogProvider');
  return ctx;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

  const addLog = useCallback((entry: NewLogEntry) => {
    const sec = getElapsedRef.current?.();
    setLogs(prev => {
      const next: LogEntry[] = [{
        ...entry,
        id:          `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        // 훈련 중이면 경과시간, 시작 전이면 벽시계 — 어느 쪽인지는 elapsedSec으로 구분한다
        timestamp:   sec != null
          ? `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
          : nowHHMM(),
        elapsedSec:  sec ?? null,
        wallClockMs: Date.now(),
      }, ...prev];
      return next.length > MAX_LOGS ? next.slice(0, MAX_LOGS) : next;
    });
  }, []);

  const clearLogs = useCallback(() => { setLogs([]); }, []);

  return (
    <LogContext.Provider value={{ logs, addLog, clearLogs }}>
      {children}
    </LogContext.Provider>
  );
}
