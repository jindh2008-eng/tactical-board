import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { EventStatus, EventSetupItem } from '../types/events';
import type { Pos } from '../types';
import { useSettings } from '../store/settingsStore';
import { saveEventSession, loadEventSession } from '../utils/runtimeSession';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type EventPos = Pos;

interface EventContextValue {
  enabledEvents:     EventSetupItem[];
  positions:         Record<string, EventPos>;
  statuses:          Record<string, EventStatus>;
  firePercentages:   Record<string, number>;   // 화재계 이벤트 연속 % (0~100)
  floorIds:          Record<string, string>;   // eventId → floorId (드롭된 층, 층 외부면 키 없음)
  moveEvent:         (id: string, x: number, y: number) => void;
  setEventStatus:    (id: string, status: EventStatus) => void;
  setFirePercentage: (id: string, pct: number) => void;
  setEventFloorId:   (id: string, floorId: string | null) => void;
}

const EventContext = createContext<EventContextValue | null>(null);

export function useEvents(): EventContextValue {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error('useEvents must be used within EventProvider');
  return ctx;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function EventProvider({ children }: { children: React.ReactNode }) {
  const { eventSetup } = useSettings();
  const enabledEvents  = eventSetup.filter(e => e.enabled);

  // 세션에서 복원 (훈련 세팅 시 clearRuntimeSession → key 변경으로 재마운트)
  const [positions, setPositions] = useState<Record<string, EventPos>>(() => {
    const saved = loadEventSession();
    return saved?.positions ?? {};
  });

  const [statuses, setStatuses] = useState<Record<string, EventStatus>>(() => {
    const saved = loadEventSession();
    return (saved?.statuses ?? {}) as Record<string, EventStatus>;
  });

  const [firePercentages, setFirePercentages] = useState<Record<string, number>>(() => {
    const saved = loadEventSession();
    return saved?.firePercentages ?? {};
  });

  const [floorIds, setFloorIds] = useState<Record<string, string>>(() => {
    const saved = loadEventSession();
    return saved?.floorIds ?? {};
  });

  // 새로 활성화된 이벤트에 기본 상태 부여 (위치는 EventOverlay가 초기화)
  useEffect(() => {
    setStatuses(prev => {
      const next: Record<string, EventStatus> = { ...prev };
      let changed = false;
      enabledEvents.forEach(e => {
        if (next[e.id] === undefined) {
          next[e.id] = '-';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [enabledEvents]);

  // 변경 시 세션 저장
  useEffect(() => {
    saveEventSession({ positions, statuses, floorIds, firePercentages });
  }, [positions, statuses, floorIds, firePercentages]);

  // ── 액션 ──────────────────────────────────

  const moveEvent = useCallback((id: string, x: number, y: number) => {
    setPositions(prev => ({ ...prev, [id]: { x, y } }));
  }, []);

  const setEventFloorId = useCallback((id: string, floorId: string | null) => {
    setFloorIds(prev => {
      if (floorId === null) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: floorId };
    });
  }, []);

  const setFirePercentage = useCallback((id: string, pct: number) => {
    setFirePercentages(prev => ({ ...prev, [id]: pct }));
  }, []);

  const setEventStatus = useCallback((id: string, status: EventStatus) => {
    setStatuses(prev => ({ ...prev, [id]: status }));
    // 화재계 상태 전환 시 % 초기화
    if (status === '최성기' || status === '화재') {
      setFirePercentages(prev => ({ ...prev, [id]: 100 }));
    } else if (status === '큰불잡음') {
      setFirePercentages(prev => ({ ...prev, [id]: 70 }));
    } else if (status === '50%') {
      setFirePercentages(prev => ({ ...prev, [id]: 50 }));
    } else {
      setFirePercentages(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  }, []);

  return (
    <EventContext.Provider value={{ enabledEvents, positions, statuses, firePercentages, floorIds, moveEvent, setEventStatus, setFirePercentage, setEventFloorId }}>
      {children}
    </EventContext.Provider>
  );
}
