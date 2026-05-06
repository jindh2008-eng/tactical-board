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
  enabledEvents:  EventSetupItem[];
  positions:      Record<string, EventPos>;
  statuses:       Record<string, EventStatus>;
  moveEvent:      (id: string, x: number, y: number) => void;
  setEventStatus: (id: string, status: EventStatus) => void;
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
    saveEventSession({ positions, statuses });
  }, [positions, statuses]);

  // ── 액션 ──────────────────────────────────

  const moveEvent = useCallback((id: string, x: number, y: number) => {
    setPositions(prev => ({ ...prev, [id]: { x, y } }));
  }, []);

  const setEventStatus = useCallback((id: string, status: EventStatus) => {
    setStatuses(prev => ({ ...prev, [id]: status }));
  }, []);

  return (
    <EventContext.Provider value={{ enabledEvents, positions, statuses, moveEvent, setEventStatus }}>
      {children}
    </EventContext.Provider>
  );
}
