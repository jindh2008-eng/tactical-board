import { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { EventType, EventStatus } from '../../types/events';
import { EVENT_TYPE_STATUSES } from '../../types/events';
import { FireEventIcon } from '../shared/FlameIcon';
import './EventTokenCard.css';

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
    document.body,
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

const TOKEN_W = 54;
const TOKEN_H = 54;

interface Props {
  id:             string;
  label:          string;
  icon:           string;      // 파일명 (예: 'LPG가스통.png') — 빈 문자열이면 미표시
  eventType:      EventType;
  status:         EventStatus;
  x:              number;
  y:              number;
  onMove:         (id: string, x: number, y: number) => void;
  onStatusChange: (id: string, status: EventStatus) => void;
}

export function EventTokenCard({
  id, label, icon, eventType, status, x, y, onMove, onStatusChange,
}: Props) {
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [radialCenter, setRadialCenter] = useState<{ x: number; y: number } | null>(null);

  // ── 드래그 ────────────────────────────────────
  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();

    const container = document.querySelector('.tactical-area') as HTMLElement | null;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    dragOffsetRef.current = {
      x: e.clientX - rect.left - x,
      y: e.clientY - rect.top  - y,
    };
    document.body.style.userSelect = 'none';

    function onMouseMove(ev: MouseEvent) {
      const r = container!.getBoundingClientRect();
      const newX = Math.max(0, Math.min(r.width  - TOKEN_W, ev.clientX - r.left - dragOffsetRef.current.x));
      const newY = Math.max(0, Math.min(r.height - TOKEN_H, ev.clientY - r.top  - dragOffsetRef.current.y));
      onMove(id, newX, newY);
    }
    function onMouseUp() {
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setRadialCenter({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  // ── 상태 파생값 ──────────────────────────────
  const statusItem  = getStatusItem(eventType, status);
  const statusLabel = status !== '-' ? (statusItem?.label ?? status) : null;
  const tokenBg     = status !== '-' ? statusItem?.color : undefined;

  // ── 상태별 CSS 클래스 ─────────────────────────
  const statusClass = status !== '-' ? `event-token--s-${status.replace('%', 'pct')}` : '';

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
        style={{
          left: x,
          top:  y,
          ...(tokenBg ? { background: tokenBg } : {}),
        }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        {/* 대표 아이콘 (설정된 이미지) */}
        {icon
          ? <img className="event-token__icon" src={`/event-icon/${icon}`} alt="" draggable={false} />
          : eventType === 'fire'
            ? <FireEventIcon
                status={status}
                size={32}
                className="event-token__icon event-token__icon--flame"
              />
            : <span className="event-token__icon event-token__icon--emoji" aria-hidden="true">
                {eventType === 'gas' ? '💨' : '⚡'}
              </span>
        }

        {/* 이벤트명 */}
        <span className="event-token__label">{label}</span>

        {/* 상태 */}
        {statusLabel && (
          <span className="event-token__status">{statusLabel}</span>
        )}
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
