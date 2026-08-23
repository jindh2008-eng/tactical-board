import { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { EventType, EventStatus } from '../../types/events';
import { EVENT_TYPE_STATUSES } from '../../types/events';
import type { FireStatus } from '../../types';
import { FireEventIcon, FlameIcon, EVENT_STATUS_TO_FIRE, gasElectricFireStage } from '../shared/FlameIcon';
import { readEventLocationAtPoint, EVENT_TOKEN_SIZE_VAR, EVENT_TOKEN_FALLBACK } from '../../utils/eventLocation';
import { zoneLabel } from '../../utils/logLabels';
import './EventTokenCard.css';
import { stagePortalTarget } from '../../utils/stagePortal';

// ─────────────────────────────────────────────
// 원형 상태 선택 메뉴 — 아이콘 + 텍스트 세로 배치
// ─────────────────────────────────────────────

const RADIAL_RADIUS = 64;

function RadialMenu({ cx, cy, eventType, current, onSelect, onClose }: {
  cx:        number;
  cy:        number;
  eventType: EventType;
  current:   EventStatus;
  onSelect:  (s: EventStatus) => void;
  onClose:   () => void;
}) {
  const items = EVENT_TYPE_STATUSES[eventType];
  const count = items.length;

  return ReactDOM.createPortal(
    <>
      <div className="radial-backdrop" onMouseDown={onClose} />
      <div className="radial-menu" style={{ left: cx, top: cy }}>
        {items.map((item, i) => {
          const angleDeg = i * (360 / count) - 90;
          const angleRad = angleDeg * (Math.PI / 180);
          const rx = Math.round(RADIAL_RADIUS * Math.cos(angleRad));
          const ry = Math.round(RADIAL_RADIUS * Math.sin(angleRad));
          const isActive = current === item.value;
          const isNone   = item.value === '-';

          return (
            <button
              key={item.value}
              className={[
                'radial-item',
                isNone   ? 'radial-item--none'   : '',
                isActive ? 'radial-item--active'  : '',
              ].filter(Boolean).join(' ')}
              data-value={item.value}
              style={{
                transform: `translate(calc(-50% + ${rx}px), calc(-50% + ${ry}px))`,
                ...(isActive ? { background: item.color } : {}),
              }}
              onMouseDown={e => { e.stopPropagation(); onSelect(item.value); onClose(); }}
            >
              {eventType === 'fire' && item.value !== '-'
                ? <FireEventIcon status={item.value} size={22} />
                : <span className="radial-item__icon" aria-hidden="true">{item.icon}</span>
              }
              <span className="radial-item__label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>,
    stagePortalTarget(),
  );
}

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

function getStatusItem(eventType: EventType, value: EventStatus) {
  return EVENT_TYPE_STATUSES[eventType].find(s => s.value === value);
}

// ─────────────────────────────────────────────
// EventTokenCard — 카드형 UI (아이콘 중심)
// ─────────────────────────────────────────────

// 실측(getBoundingClientRect)이 0 으로 나오는 순간에만 쓰는 폴백이다.
// 진짜 크기는 --event-token-size 가 정한다 → utils/eventLocation.ts
const TOKEN_W = EVENT_TOKEN_FALLBACK;
const TOKEN_H = EVENT_TOKEN_FALLBACK;

interface Props {
  id:              string;
  label:           string;
  icon:            string;      // 파일명 (예: 'LPG가스통.png') — 빈 문자열이면 미표시
  eventType:       EventType;
  status:          EventStatus;
  firePercentage?: number;      // 연속 화재 % (소화 진행 표시용)
  x:               number;
  y:               number;
  onMove:          (id: string, x: number, y: number) => void;
  onStatusChange:  (id: string, status: EventStatus) => void;
  /** 현재 배치 구역('face-A' · '3F-center' …). 보드 밖이면 null */
  zoneKey:         string | null;
  /** 드롭 지점의 배치 구역. 보드 밖이면 null */
  onDrop?:         (id: string, zoneKey: string | null) => void;
}

export function EventTokenCard({
  id, label, icon, eventType, status, firePercentage, x, y, zoneKey, onMove, onStatusChange, onDrop,
}: Props) {
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const touchPrimaryRef = useRef(false);
  const [radialCenter, setRadialCenter] = useState<{ x: number; y: number } | null>(null);

  // ── 드래그 ────────────────────────────────────
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) {
      touchPrimaryRef.current = false;
      return;
    }
    touchPrimaryRef.current = e.pointerType !== 'mouse';
    e.preventDefault();
    e.stopPropagation();

    const container = document.querySelector('.tactical-area') as HTMLElement | null;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    // 클램프 경계는 실측값을 쓴다 — 토큰 크기가 층 행 높이에 따라 변하기 때문이다
    const cardRect = e.currentTarget.getBoundingClientRect();
    const tw = cardRect.width  || TOKEN_W;
    const th = cardRect.height || TOKEN_H;

    // x, y 는 보드 대비 0~1 정규화 좌표 → 드래그 계산은 px 로 하고 경계에서만 환산
    dragOffsetRef.current = {
      x: e.clientX - rect.left - x * rect.width,
      y: e.clientY - rect.top  - y * rect.height,
    };
    document.body.style.userSelect = 'none';

    const pointerId = e.pointerId;

    function onPointerMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const r = container!.getBoundingClientRect();
      // x, y 는 토큰 **중심**이므로 경계도 절반만큼 안쪽이다
      const newX = Math.max(tw / 2, Math.min(r.width  - tw / 2, ev.clientX - r.left - dragOffsetRef.current.x));
      const newY = Math.max(th / 2, Math.min(r.height - th / 2, ev.clientY - r.top  - dragOffsetRef.current.y));
      onMove(id, r.width > 0 ? newX / r.width : 0, r.height > 0 ? newY / r.height : 0);
    }
    function onPointerUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup',   onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      onDrop?.(id, readEventLocationAtPoint(ev.clientX, ev.clientY)?.zoneKey ?? null);
      window.setTimeout(() => { touchPrimaryRef.current = false; }, 0);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup',   onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (touchPrimaryRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    setRadialCenter({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  // ── 상태 파생값 ──────────────────────────────
  const statusItem  = getStatusItem(eventType, status);
  const statusLabel = status !== '-' ? (
    firePercentage != null ? `${Math.round(firePercentage)}%` : (statusItem?.label ?? status)
  ) : null;

  // 가스/전기 '화재' 상태는 % 구간에 따라 배경색 변경
  const tokenBg = (() => {
    if (status === '-') return undefined;
    if (status === '화재' && (eventType === 'gas' || eventType === 'electric') && firePercentage != null) {
      if (firePercentage >= 70) return '#b83010';
      if (firePercentage >= 50) return '#FF9800';
      return '#FFC107';
    }
    return statusItem?.color;
  })();

  // 상태 텍스트를 항상 1줄로 꽉 채우기 위해 글자 수 기반 font-size 계산.
  // 카드 크기가 층 행 높이를 따라 변하므로 글자도 같은 비율로 따라가야 한다 —
  // 카드 폭 대비 비율로 내고 CSS 변수에 곱한다.
  const statusRatio = statusLabel
    ? Math.min(0.24, (1 - 4 / EVENT_TOKEN_FALLBACK) / statusLabel.length)
    : 0.24;
  const statusFontSize = `calc(var(${EVENT_TOKEN_SIZE_VAR}, ${EVENT_TOKEN_FALLBACK}px) * ${statusRatio.toFixed(4)})`;

  // 화염 오버레이 — 아이콘 위에 반투명 화염 이미지를 겹쳐 "불타는" 느낌 표현
  // (fire 타입 + 커스텀 아이콘 없음인 경우는 화염 자체가 이미 베이스 아이콘이므로 중복 생략)
  const flameStatus: FireStatus | null =
    status === '-' ? null :
    eventType === 'fire' ? (EVENT_STATUS_TO_FIRE[status] ?? null) :
    (eventType === 'gas' || eventType === 'electric') && status === '화재' ? gasElectricFireStage(firePercentage) :
    null;
  const showFlameOverlay = flameStatus !== null && (Boolean(icon) || eventType !== 'fire');

  // ── 상태별 CSS 클래스 ─────────────────────────
  const statusClass = status !== '-' ? `event-token--s-${status.replace('%', 'pct')}` : '';

  // data-event-zone: 자기 배치 구역을 스스로 갖는다 — 방수 대상 판정·로그가 이 값을 쓴다.
  // `data-zone-key`라는 이름을 쓰지 않는 이유: 그 이름은 드롭 존 선택자라
  // 여기에 붙이면 이벤트 토큰이 출동대 드롭 대상으로 잡힌다.
  return (
    <>
      <div
        className={[
          'event-token',
          `event-token--type-${eventType}`,
          status !== '-' ? 'event-token--active' : '',
          statusClass,
        ].filter(Boolean).join(' ')}
        data-status={status}
        data-event-type={eventType}
        data-event-id={id}
        data-event-zone={zoneKey ?? undefined}
        title={zoneKey ? `${label} — ${zoneLabel(zoneKey)}` : label}
        style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
      >
        {/* 카드 박스 — 이미지가 꽉 채움 */}
        <div
          className="event-token__card"
          style={tokenBg ? { background: tokenBg } : undefined}
        >
          {icon
            ? <img className="event-token__icon" src={`/event-icon/${icon}`} alt="" draggable={false} />
            : eventType === 'fire'
              ? <FireEventIcon
                  status={status}
                  size={40}
                  className="event-token__icon event-token__icon--flame"
                />
              : <span className="event-token__icon event-token__icon--emoji" aria-hidden="true">
                  {eventType === 'gas' ? '💨' : '⚡'}
                </span>
          }

          {/* 화염 오버레이 — 아이콘 위에 반투명하게 겹침 */}
          {showFlameOverlay && flameStatus && (
            <FlameIcon status={flameStatus} className="event-token__flame-overlay" />
          )}

          {/* 상태 — 카드 하단 오버레이 */}
          {statusLabel && (
            <span className="event-token__status" style={{ fontSize: statusFontSize }}>{statusLabel}</span>
          )}
        </div>

        {/* 이벤트명 — 카드 아래 */}
        <span className="event-token__label">{label}</span>
      </div>

      {radialCenter && (
        <RadialMenu
          cx={radialCenter.x}
          cy={radialCenter.y}
          eventType={eventType}
          current={status}
          onSelect={s => onStatusChange(id, s)}
          onClose={() => setRadialCenter(null)}
        />
      )}
    </>
  );
}
