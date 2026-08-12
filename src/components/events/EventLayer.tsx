import { useLayoutEffect, useRef, useCallback } from 'react';
import { useEvents } from '../../context/EventContext';
import { resolveEventType, EVENT_TYPE_STATUSES } from '../../types/events';
import type { EventStatus } from '../../types/events';
import { useTokens } from '../../context/TokenContext';
import { EventTokenCard } from './EventTokenCard';
import { useActionMode } from '../../context/ActionModeContext';
import './EventLayer.css';

// ─────────────────────────────────────────────
// EventLayer (= EventOverlay)
// — TacticalArea 전체를 덮는 position:absolute 레이어
// — 이벤트 토큰을 자유 좌표로 렌더링
// — 자체 포인터이벤트 없음, 토큰만 상호작용
// ─────────────────────────────────────────────

// 토큰 크기 (클램핑용)
const TOKEN_W = 104;
const TOKEN_H = 104;

// 초기 배치 상수 (A면 중앙 상단)
const GAP = 4;
const PAD = 8;

export function EventLayer() {
  const { mode } = useActionMode();
  const drawingInteraction = mode.type === 'drawing' || mode.type === 'drawing-erase';
  const { enabledEvents, positions, statuses, firePercentages, moveEvent, setEventStatus, setEventFloorId } = useEvents();
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

  // 위치 미지정 이벤트를 A면 중앙 상단에 배치 (레이어 기준 상대좌표로 환산)
  const placeUnplaced = useCallback((unplaced: typeof enabledEvents) => {
    if (!layerRef.current || unplaced.length === 0) return;
    const aRect = document.querySelector('.exterior-zone--a')?.getBoundingClientRect();
    if (!aRect) return; // A면 아직 렌더링 전
    const layerRect = layerRef.current.getBoundingClientRect();

    const aCenterX = (aRect.left - layerRect.left) + aRect.width / 2;
    const aTop     = aRect.top - layerRect.top;
    // A면 실제 너비에 맞춰 한 줄에 최대한 많이 담아 상단에 밀착시킴
    // (열 수를 고정하면 이벤트가 많을 때 아래쪽 줄로 밀려 "중앙"처럼 보이는 문제가 있었음)
    // unplaced.length로 상한을 둬 — 실제 개수보다 열이 많으면 첫 줄이 중앙에서 한쪽으로 치우쳐 보임
    const maxColsFit = Math.max(1, Math.floor((aRect.width + GAP) / (TOKEN_W + GAP)));
    const cols       = Math.min(maxColsFit, unplaced.length);
    const rowWidth = cols * TOKEN_W + (cols - 1) * GAP;
    const startX   = aCenterX - rowWidth / 2;
    const baseY    = aTop + PAD;

    unplaced.forEach((ev, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (TOKEN_W + GAP);
      const y = baseY + row * (TOKEN_H + GAP);
      moveEvent(ev.id,
        Math.max(0, Math.min(layerRect.width - TOKEN_W, x)),
        Math.max(0, y),
      );
    });
  }, [moveEvent]);

  // 최초 마운트 시 배치
  useLayoutEffect(() => {
    if (initRef.current) return;
    const unplaced = enabledEvents.filter(ev => !positions[ev.id]);
    if (unplaced.length === 0) {
      if (layerRef.current) initRef.current = true;
      return;
    }
    placeUnplaced(unplaced);
    initRef.current = true;
  }, [enabledEvents, positions, placeUnplaced]);

  // 새로 추가된 이벤트 (initRef 이후)도 위치 초기화
  useLayoutEffect(() => {
    if (!initRef.current) return;
    const unplaced = enabledEvents.filter(ev => !positions[ev.id]);
    if (unplaced.length === 0) return;
    placeUnplaced(unplaced);
  }, [enabledEvents, positions, placeUnplaced]);

  if (enabledEvents.length === 0) return null;

  return (
    <div className={`event-layer${drawingInteraction ? ' event-layer--drawing' : ''}`} ref={layerRef}>
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
            firePercentage={firePercentages[ev.id]}
            x={pos.x}
            y={pos.y}
            onMove={moveEvent}
            onStatusChange={handleStatusChange}
            onDrop={setEventFloorId}
          />
        );
      })}
    </div>
  );
}
