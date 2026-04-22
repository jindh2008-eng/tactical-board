/**
 * TrainingContext — 훈련 진행 상태 전역 관리
 *
 * 담당:
 *  - status:       'idle' | 'running' | 'ended'
 *  - elapsed:      훈련 시작 후 경과 초
 *  - runKey:       PlayPage Provider 재마운트 키 (loadSettings 호출 시 증가)
 *  - loadSettings: 세션 초기화 + runKey 증가 + 상태 리셋 (훈련 세팅 버튼)
 *  - start:        훈련 시작 (idle → running, 타이머 시작)
 *  - stop:         훈련 종료 (running → ended, 타이머 정지)
 *
 * sessionStorage 키: tactical-board.runtime.training
 * → 브라우저 새로고침 시 진행 중 훈련을 복원할 수 있도록 유지.
 */

import {
  createContext, useContext, useState, useEffect, useRef, useCallback,
} from 'react';
import {
  clearRuntimeSession,
  saveTrainingSession,
  loadTrainingSession,
} from '../utils/runtimeSession';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type TrainingStatus = 'idle' | 'running' | 'ended';

interface TrainingContextValue {
  status:       TrainingStatus;
  elapsed:      number;   // 경과 초 (훈련 시작 기준)
  runKey:       number;   // PlayPage Provider 재마운트 키
  loadSettings: () => void;
  start:        () => void;
  stop:         () => void;
}

const TrainingContext = createContext<TrainingContextValue | null>(null);

export function useTraining(): TrainingContextValue {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error('useTraining must be used within TrainingProvider');
  return ctx;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function TrainingProvider({ children }: { children: React.ReactNode }) {
  // 세션 데이터를 한 번만 로드
  const sessionRef = useRef<ReturnType<typeof loadTrainingSession> | undefined>(undefined);
  if (sessionRef.current === undefined) {
    sessionRef.current = loadTrainingSession();
  }
  const session = sessionRef.current;

  const [runKey,  setRunKey]  = useState(0);
  const [status,  setStatus]  = useState<TrainingStatus>(session?.status ?? 'idle');

  // 경과 시간: running 상태로 복원 시 경과분 계산
  const [elapsed, setElapsed] = useState<number>(() => {
    if (session?.status === 'running' && session.startedAt != null) {
      return Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
    }
    if (session?.status === 'ended' && session.startedAt != null && session.endedAt != null) {
      return Math.max(0, Math.floor((session.endedAt - session.startedAt) / 1000));
    }
    return 0;
  });

  // 절대 시작 시각 (interval에서 elapsed 계산용)
  const startedAtRef = useRef<number | null>(
    session?.status === 'running' ? (session.startedAt ?? null) : null,
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── running 상태로 복원된 경우 interval 재시작 ──────────────────────
  useEffect(() => {
    if (status === 'running' && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        if (startedAtRef.current != null) {
          setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
        }
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 세션 저장 ────────────────────────────────────────────────────────
  useEffect(() => {
    saveTrainingSession({
      status,
      startedAt: startedAtRef.current,
      endedAt:
        status === 'ended' && startedAtRef.current != null
          ? startedAtRef.current + elapsed * 1000
          : null,
    });
  }, [status, elapsed]);

  // ── 훈련 세팅: 세션 초기화 + runKey 증가 ────────────────────────────
  const loadSettings = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    clearRuntimeSession();
    startedAtRef.current = null;
    setStatus('idle');
    setElapsed(0);
    setRunKey(k => k + 1);
  }, []);

  // ── 시작 ─────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (status !== 'idle') return;
    const now = Date.now();
    startedAtRef.current = now;
    setStatus('running');
    setElapsed(0);
    intervalRef.current = setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
  }, [status]);

  // ── 종료 ─────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus('ended');
  }, []);

  return (
    <TrainingContext.Provider value={{
      status, elapsed, runKey,
      loadSettings, start, stop,
    }}>
      {children}
    </TrainingContext.Provider>
  );
}
