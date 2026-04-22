import { useRef } from 'react';
import type { EventStatus } from '../../types/events';
import { EVENT_STATUS_ORDER } from '../../types/events';
import './EventTokenCard.css';

// ─────────────────────────────────────────────
// 이벤트 토큰 카드
// — 마우스 드래그로 자유 이동
// — 인라인 드롭다운으로 상태 선택
// ─────────────────────────────────────────────

const TOKEN_W = 96;
const TOKEN_H = 26;

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

  // ── 마우스 드래그 핸들러 ──────────────────────
  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // select / option 클릭 시 드래그 시작 안 함
    if ((e.target as HTMLElement).closest('select')) return;
    e.preventDefault();
    e.stopPropagation();

    const container = document.querySelector('.tactical-area') as HTMLElement | null;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    // 컨테이너 기준 현재 토큰 위치와 마우스 오프셋 계산
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

  // ── 아이콘: '-'(미지정)·'완진' 제외 ─────────────
  const showIcon = status !== '-' && status !== '완진';

  return (
    <div
      className="event-token"
      data-status={status}
      style={{ left: x, top: y }}
      onMouseDown={handleMouseDown}
    >
      {/* 아이콘 (완진 제외) */}
      {showIcon && (
        <img className="event-token__icon" src="/fire.png" alt="" draggable={false} />
      )}

      {/* 이름 */}
      <span className="event-token__label">{label}</span>

      {/* 상태 드롭다운 */}
      <select
        className="event-token__select"
        value={status}
        onChange={e => onStatusChange(id, e.target.value as EventStatus)}
        onMouseDown={e => e.stopPropagation()}
      >
        {EVENT_STATUS_ORDER.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
