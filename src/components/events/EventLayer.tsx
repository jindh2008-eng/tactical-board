import { useLayoutEffect, useEffect, useRef, useCallback } from 'react';
import { useEvents } from '../../context/EventContext';
import { resolveEventType, EVENT_TYPE_STATUSES } from '../../types/events';
import type { EventStatus } from '../../types/events';
import { useTokens } from '../../context/TokenContext';
import { EventTokenCard } from './EventTokenCard';
import { useActionMode } from '../../context/ActionModeContext';
import { zoneLabel } from '../../utils/logLabels';
import { readEventLocationAtPos, splitEventZoneKey } from '../../utils/eventLocation';
import './EventLayer.css';

// ─────────────────────────────────────────────
// EventLayer (= EventOverlay)
// — TacticalArea 전체를 덮는 position:absolute 레이어
// — 이벤트 토큰을 자유 좌표로 렌더링
// — 자체 포인터이벤트 없음, 토큰만 상호작용
// ─────────────────────────────────────────────

// 토큰 크기 (클램핑용) — 기준 화면 기준. 실제로는 --ui-scale 을 곱해 쓴다
const TOKEN_W_BASE = 104;
const TOKEN_H_BASE = 104;

// 초기 배치 상수 (A면 중앙 상단)
const GAP = 4;
const PAD = 8;

/** 화재계 이벤트 진행 %를 다시 남기기까지 필요한 하락폭(%). 작을수록 촘촘해진다 */
const EVENT_PCT_LOG_STEP = 20;

export function EventLayer() {
  const { mode } = useActionMode();
  const drawingInteraction = mode.type === 'drawing' || mode.type === 'drawing-erase';
  const { enabledEvents, positions, statuses, firePercentages, zoneKeys, moveEvent, setEventStatus, setEventZoneKey } = useEvents();
  const { addLog } = useTokens();
  const layerRef = useRef<HTMLDivElement>(null);
  const initRef  = useRef(false);

  const handleStatusChange = useCallback((id: string, status: EventStatus) => {
    const ev = enabledEvents.find(e => e.id === id);
    if (ev) {
      const eventType  = resolveEventType(ev);
      const statusItem = EVENT_TYPE_STATUSES[eventType].find(s => s.value === status);
      const resolved   = status === '-';
      const note       = resolved ? '해제' : (statusItem?.label ?? status);
      // 이벤트가 **어디서** 났는지가 로그에 없으면 대응 출동대와 이어 붙일 수 없다.
      const zoneKey = zoneKeys[id] ?? null;
      const loc     = zoneKey ? splitEventZoneKey(zoneKey) : null;
      const where   = zoneKey ? zoneLabel(zoneKey) : null;
      addLog({
        logType:    'event-status',
        tokenId:    id,
        tokenName:  ev.label,
        fromZoneId: zoneKey ?? '',
        toZoneId:   '',
        note:       where ? `${where} ${note}` : note,
        payload: {
          kind: 'event-status', eventId: id, eventLabel: ev.label, eventType,
          status, resolved,
          zoneKey, floorId: loc?.floorId ?? null, face: loc?.face ?? null,
          firePercentage: firePercentages[id] ?? null,
        },
      });
    }
    setEventStatus(id, status);
  }, [enabledEvents, addLog, setEventStatus, zoneKeys, firePercentages]);

  // ── 화재계 이벤트 진행 % — 구간을 넘길 때만 기록 ──────────────────
  // %는 1초마다 연속으로 변한다. 전부 남기면 로그를 뒤덮으므로 20% 구간 경계만 남긴다.
  // 상태 전환(최성기→큰불잡음→…)은 위 event-status가 이미 잡고 있어, 여기서는
  // 같은 상태 안의 진행 속도만 보완하는 셈이다. docs/EVENT_LOG_PLAN.md N-8
  // 마지막으로 남긴 % — 고정 경계(100/80/60…)로 자르면 100%에서 조금만 내려가도
  // 곧바로 경계를 넘어 첫 줄이 바로 찍힌다. **직전에 남긴 값에서 얼마나 떨어졌는지**로 판단한다.
  const lastLoggedPctRef = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const [id, pct] of Object.entries(firePercentages)) {
      const prev = lastLoggedPctRef.current[id];
      if (prev === undefined) {
        lastLoggedPctRef.current[id] = pct;   // 최초 관측은 기준점만 잡는다
        continue;
      }
      if (prev - pct < EVENT_PCT_LOG_STEP) continue;
      lastLoggedPctRef.current[id] = pct;
      const shown = Math.round(pct);
      const ev = enabledEvents.find(e => e.id === id);
      if (!ev) continue;
      const zoneKey = zoneKeys[id] ?? null;
      addLog({
        logSource:  'system',
        logType:    'event-status',
        tokenId:    id,
        tokenName:  ev.label,
        fromZoneId: zoneKey ?? '',
        toZoneId:   '',
        note:       `${zoneKey ? `${zoneLabel(zoneKey)} ` : ''}진행 ${shown}%`,
        payload:    { kind: 'event-fire-pct', eventId: id, eventLabel: ev.label, zoneKey, percentage: shown },
      });
    }
  }, [firePercentages, enabledEvents, zoneKeys, addLog]);

  // 위치 미지정 이벤트를 A면 중앙 상단에 배치 (레이어 기준 상대좌표로 환산)
  const placeUnplaced = useCallback((unplaced: typeof enabledEvents) => {
    if (!layerRef.current || unplaced.length === 0) return;
    const aRect = document.querySelector('.exterior-zone--a')?.getBoundingClientRect();
    if (!aRect) return; // A면 아직 렌더링 전
    const layerRect = layerRef.current.getBoundingClientRect();

    const aCenterX = (aRect.left - layerRect.left) + aRect.width / 2;
    const aTop     = aRect.top - layerRect.top;

    // 토큰이 --ui-scale 로 줄어들면 배치 간격도 같이 줄어야 겹치지 않는다
    const uiScale = parseFloat(
      getComputedStyle(layerRef.current).getPropertyValue('--ui-scale')
    ) || 1;
    const TOKEN_W = TOKEN_W_BASE * uiScale;
    const TOKEN_H = TOKEN_H_BASE * uiScale;
    // A면 실제 너비에 맞춰 한 줄에 최대한 많이 담아 상단에 밀착시킴
    // (열 수를 고정하면 이벤트가 많을 때 아래쪽 줄로 밀려 "중앙"처럼 보이는 문제가 있었음)
    // unplaced.length로 상한을 둬 — 실제 개수보다 열이 많으면 첫 줄이 중앙에서 한쪽으로 치우쳐 보임
    const maxColsFit = Math.max(1, Math.floor((aRect.width + GAP) / (TOKEN_W + GAP)));
    const cols       = Math.min(maxColsFit, unplaced.length);
    const rowWidth = cols * TOKEN_W + (cols - 1) * GAP;
    const startX   = aCenterX - rowWidth / 2;
    const baseY    = aTop + PAD;

    // 배치 계산은 px 로 하고, 저장은 보드 대비 0~1 정규화 좌표로 한다
    // → docs/RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md Phase 4
    unplaced.forEach((ev, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (TOKEN_W + GAP);
      const y = baseY + row * (TOKEN_H + GAP);
      const px = Math.max(0, Math.min(layerRect.width - TOKEN_W, x));
      const py = Math.max(0, y);
      moveEvent(ev.id,
        layerRect.width  > 0 ? px / layerRect.width  : 0,
        layerRect.height > 0 ? py / layerRect.height : 0,
      );
    });
  }, [moveEvent]);

  // ── 배치 구역 보정 ────────────────────────────────────────────────
  // 위치는 있는데 구역 값이 없는 이벤트(자동 배치분·구버전 세션)를 화면에서 판정해 채운다.
  // 이 값이 있어야 이벤트가 "A면인지 3층 내부인지"를 스스로 알게 된다.
  // docs/EVENT_LOG_PLAN.md X-5
  useEffect(() => {
    for (const ev of enabledEvents) {
      if (zoneKeys[ev.id]) continue;
      const pos = positions[ev.id];
      if (!pos) continue;
      const loc = readEventLocationAtPos(pos);
      if (loc) setEventZoneKey(ev.id, loc.zoneKey);
    }
  }, [enabledEvents, positions, zoneKeys, setEventZoneKey]);

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
            zoneKey={zoneKeys[ev.id] ?? null}
            onMove={moveEvent}
            onStatusChange={handleStatusChange}
            onDrop={setEventZoneKey}
          />
        );
      })}
    </div>
  );
}
