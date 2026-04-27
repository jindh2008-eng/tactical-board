import { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { EventStatus } from '../../types/events';
import './EventTokenCard.css';

// ─────────────────────────────────────────────
// 원형 선택 메뉴
// ─────────────────────────────────────────────

const RADIAL_RADIUS = 54;

const RADIAL_ITEMS: { value: EventStatus; label: string }[] = [
  { value: '폭발',   label: '폭발'   },
  { value: '최성기', label: '최성기' },
  { value: '초진',   label: '초진'   },
  { value: '완진',   label: '완진'   },
  { value: '-',     label: '없음'   },
];

function RadialMenu({ cx, cy, current, onSelect, onClose }: {
  cx:       number;
  cy:       number;
  current:  EventStatus;
  onSelect: (s: EventStatus) => void;
  onClose:  () => void;
}) {
  return ReactDOM.createPortal(
    <>
      <div className="radial-backdrop" onMouseDown={onClose} />
      <div className="radial-menu" style={{ left: cx, top: cy }}>
        {RADIAL_ITEMS.map((item, i) => {
          const angleDeg = i * (360 / RADIAL_ITEMS.length) - 90; // 0° = 12시
          const angleRad = angleDeg * (Math.PI / 180);
          const rx = Math.round(RADIAL_RADIUS * Math.cos(angleRad));
          const ry = Math.round(RADIAL_RADIUS * Math.sin(angleRad));
          return (
            <button
              key={item.value}
              className={[
                'radial-item',
                `radial-item--${item.value === '-' ? 'none' : item.value}`,
                current === item.value ? 'radial-item--active' : '',
              ].filter(Boolean).join(' ')}
              style={{ transform: `translate(calc(-50% + ${rx}px), calc(-50% + ${ry}px))` }}
              onMouseDown={e => { e.stopPropagation(); onSelect(item.value); onClose(); }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}

// ─────────────────────────────────────────────
// EventTokenCard
// — 드래그로 자유 이동, 우클릭으로 원형 상태 선택
// ─────────────────────────────────────────────

const TOKEN_W = 60;
const TOKEN_H = 32;

interface Props {
  id:             string;
  label:          string;
  status:         EventStatus;
  x:              number;
  y:              number;
  onMove:         (id: string, x: number, y: number) => void;
  onStatusChange: (id: string, status: EventStatus) => void;
}

export function EventTokenCard({ id, label, status, x, y, onMove, onStatusChange }: Props) {
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [radialCenter, setRadialCenter] = useState<{ x: number; y: number } | null>(null);

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
    setRadialCenter({ x: e.clientX, y: e.clientY });
  }

  const showIcon = status !== '-' && status !== '완진';

  return (
    <>
      <div
        className="event-token"
        data-status={status}
        style={{ left: x, top: y }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        {showIcon && (
          <img className="event-token__icon" src="/fire.png" alt="" draggable={false} />
        )}
        <span className="event-token__label">
          {label}{status !== '-' && <span className="event-token__status">-{status}</span>}
        </span>
      </div>

      {radialCenter && (
        <RadialMenu
          cx={radialCenter.x}
          cy={radialCenter.y}
          current={status}
          onSelect={s => onStatusChange(id, s)}
          onClose={() => setRadialCenter(null)}
        />
      )}
    </>
  );
}
