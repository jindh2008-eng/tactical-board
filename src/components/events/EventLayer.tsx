import { useLayoutEffect, useRef, useCallback } from 'react';
import { useEvents } from '../../context/EventContext';
import { resolveEventType, EVENT_TYPE_STATUSES } from '../../types/events';
import type { EventStatus } from '../../types/events';
import { useTokens } from '../../context/TokenContext';
import { EventTokenCard } from './EventTokenCard';
import './EventLayer.css';

// ─────────────────────────────────────────────
// EventLayer (= EventOverlay)
// — TacticalArea 전체를 덮는 position:absolute 레이어
// — 이벤트 토큰을 자유 좌표로 렌더링
// — 자체 포인터이벤트 없음, 토큰만 상호작용
// ─────────────────────────────────────────────

// 토큰 크기 (클램핑용)
const TOKEN_W = 54;
const TOKEN_H = 54;

// 초기 배치 상수 (직전대기 좌측 영역)
const COLS     = 3;
const GAP      = 4;
const PAD      = 8;
const ROW3_H   = 166; // TacticalArea row 3 고정 높이

export function EventLayer() {
  const { enabledEvents, positions, statuses, moveEvent, setEventStatus } = useEvents();
  const { addLog } = useTokens();
  const layerRef = useRef<HTMLDivElement>(null);
  const initRef  = useRef(false);

  const handleStatusChange = useCallback((id: string, status: EventStatus) => {
    const ev = enabledEvents.find(e => e.id === id);
    if (ev) {
      const eventType  = resolveEventType(ev);
      const statusItem = EVENT_TYPE_STATUSES[eventType].find(s => s.value === status);
      const note = status === '-' ? '해제' : (statusItem?.label ?? status);
      addLog({ logType: 'event-status', tokenId: id, tokenName: ev.label, fromZoneId: '', toZoneId: '', note });
    }
    setEventStatus(id, status);
  }, [enabledEvents, addLog, setEventStatus]);

  // 최초 마운트 시 위치 미지정 이벤트를 좌측 하단 직전대기 옆 공간에 배치
  useLayoutEffect(() => {
    if (initRef.current || !layerRef.current) return;
    const { height } = layerRef.current.getBoundingClientRect();
    if (height === 0) return; // 아직 렌더링 전

    const unplaced = enabledEvents.filter(ev => !positions[ev.id]);
    if (unplaced.length === 0) {
      initRef.current = true;
      return;
    }

    const baseY = Math.max(0, height - ROW3_H + PAD);
    unplaced.forEach((ev, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      moveEvent(ev.id,
        PAD + col * (TOKEN_W + GAP),
        Math.min(height - TOKEN_H, baseY + row * (TOKEN_H + GAP)),
      );
    });
    initRef.current = true;
  }, [enabledEvents, positions, moveEvent]);

  // 새로 추가된 이벤트 (initRef 이후)도 위치 초기화
  useLayoutEffect(() => {
    if (!initRef.current || !layerRef.current) return;
    const { height } = layerRef.current.getBoundingClientRect();
    if (height === 0) return;

    const unplaced = enabledEvents.filter(ev => !positions[ev.id]);
    if (unplaced.length === 0) return;

    const baseY = Math.max(0, height - ROW3_H + PAD);
    unplaced.forEach((ev, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      moveEvent(ev.id,
        PAD + col * (TOKEN_W + GAP),
        Math.min(height - TOKEN_H, baseY + row * (TOKEN_H + GAP)),
      );
    });
  }, [enabledEvents, positions, moveEvent]);

  if (enabledEvents.length === 0) return null;

  return (
    <div className="event-layer" ref={layerRef}>
      {enabledEvents.map(ev => {
        const pos    = positions[ev.id];
        const status = statuses[ev.id] ?? '-';
        if (!pos) return null; // 위치 초기화 전 렌더 안 함
        return (
          <EventTokenCard
            key={ev.id}
            id={ev.id}
            label={ev.label}
            icon={ev.icon ?? ''}
            eventType={resolveEventType(ev)}
            status={status}
            x={pos.x}
            y={pos.y}
            onMove={moveEvent}
            onStatusChange={handleStatusChange}
          />
        );
      })}
    </div>
  );
}
