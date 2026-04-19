import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VictimToken, VictimCondition } from '../../types/victim';
import { VICTIM_CONDITIONS } from '../../types/victim';
import type { VictimUpdate } from '../../context/VictimContext';
import './VictimContextMenu.css';

interface Props {
  victim:   VictimToken;
  x:        number;
  y:        number;
  onUpdate: (update: VictimUpdate) => void;
  onClose:  () => void;
}

export function VictimContextMenu({ victim, x, y, onUpdate, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 세부위치 편집 상태 (Enter 또는 ✓ 버튼으로 commit)
  const [subDraft, setSubDraft] = useState(victim.subLocation);
  // 라벨 편집 (custom only)
  const [labelDraft, setLabelDraft] = useState(victim.customLabel ?? '');

  // 외부 클릭 / Esc → 닫기
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown',   onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown',   onKeyDown);
    };
  }, [onClose]);

  // 화면 경계 보정
  const safeX = Math.min(x, window.innerWidth  - 218 - 8);
  const safeY = Math.min(y, window.innerHeight - 260 - 8);

  function applySubLocation() {
    onUpdate({ subLocation: subDraft.trim() });
  }

  function applyLabel() {
    onUpdate({ customLabel: labelDraft.trim() || '기타' });
  }

  function applyCondition(c: VictimCondition) {
    onUpdate({ condition: c });
  }

  const autoLocation = victim.location || null; // null = 미배치

  return createPortal(
    <div
      ref={menuRef}
      className="vcm"
      style={{ left: safeX, top: safeY }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* 헤더 */}
      <div className="vcm__header">
        <span className="vcm__header-top">{victim.displayTop}</span>
        <span className="vcm__header-bottom">{victim.displayBottom}</span>
      </div>

      {/* ── 자동 위치 (읽기전용) ───────────────── */}
      <div className="vcm__section vcm__section--location-info">
        <div className="vcm__section-label">배치 위치</div>
        <span className={`vcm__auto-location ${!autoLocation ? 'vcm__auto-location--empty' : ''}`}>
          {autoLocation ?? '미배치'}
        </span>
      </div>

      {/* ── 세부위치 입력 (수동) ────────────────── */}
      <div className="vcm__section">
        <div className="vcm__section-label">세부위치</div>
        <div className="vcm__input-row">
          <input
            className="vcm__input"
            value={subDraft}
            onChange={e => setSubDraft(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') { applySubLocation(); onClose(); }
            }}
            placeholder="212호, 복도…"
            maxLength={20}
            autoFocus={victim.kind !== 'custom'}
          />
          <button
            className="vcm__apply-btn"
            onClick={() => { applySubLocation(); onClose(); }}
          >
            ✓
          </button>
        </div>
      </div>

      {/* ── custom: 라벨 변경 ───────────────────── */}
      {victim.kind === 'custom' && (
        <div className="vcm__section">
          <div className="vcm__section-label">라벨</div>
          <div className="vcm__input-row">
            <input
              className="vcm__input"
              value={labelDraft}
              onChange={e => setLabelDraft(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') { applyLabel(); onClose(); }
              }}
              placeholder="기타"
              maxLength={20}
              autoFocus
            />
            <button
              className="vcm__apply-btn"
              onClick={() => { applyLabel(); onClose(); }}
            >
              ✓
            </button>
          </div>
        </div>
      )}

      {/* ── person: 상태 변경 ───────────────────── */}
      {victim.kind === 'person' && (
        <div className="vcm__section">
          <div className="vcm__section-label">상태</div>
          <div className="vcm__cond-grid">
            {VICTIM_CONDITIONS.map(c => (
              <button
                key={c}
                className={[
                  'vcm__cond-btn',
                  `vcm__cond-btn--${condClass(c)}`,
                  victim.condition === c ? 'vcm__cond-btn--active' : '',
                ].join(' ')}
                onClick={() => applyCondition(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function condClass(c: VictimCondition): string {
  switch (c) {
    case '경상':    return 'alive';
    case '중상':    return 'alive';
    case '고립':    return 'isolated';
    case '의식없음': return 'unconscious';
    case '사망':    return 'dead';
  }
}
