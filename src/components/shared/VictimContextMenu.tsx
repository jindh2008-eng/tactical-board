import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VictimToken, VictimCondition } from '../../types/victim';
import { VICTIM_CONDITIONS } from '../../types/victim';
import type { UnitToken } from '../../types';
import type { VictimUpdate } from '../../context/VictimContext';
import './VictimContextMenu.css';

interface Props {
  victim:   VictimToken;
  x:        number;
  y:        number;
  tokens:   UnitToken[];
  onUpdate: (update: VictimUpdate) => void;
  onRescue: (unit: UnitToken) => void;
  onClose:  () => void;
}

export function VictimContextMenu({ victim, x, y, tokens, onUpdate, onRescue, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  const [subDraft,    setSubDraft]    = useState(victim.subLocation);
  const [labelDraft,  setLabelDraft]  = useState(victim.customLabel ?? '');
  const [showRescue,  setShowRescue]  = useState(false);

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
  const safeX = Math.min(x, window.innerWidth  - 230 - 8);
  const safeY = Math.min(y, window.innerHeight - 380 - 8);

  function applySubLocation() {
    onUpdate({ subLocation: subDraft.trim() });
  }

  function applyLabel() {
    onUpdate({ customLabel: labelDraft.trim() || '기타' });
  }

  function applyCondition(c: VictimCondition) {
    onUpdate({ condition: c });
  }

  // ── 구조 처리 관련 ────────────────────────────────
  const isAlreadyRescued = victim.zoneKey === 'medical-post';

  /** 같은 구역에 있는 출동대 중 이미 "구조중"이 아닌 것만 */
  const rescuableUnits = victim.zoneKey
    ? tokens.filter(t =>
        t.zoneKey === victim.zoneKey &&
        !t.badges.some(b => b.line1 === '구조중')
      )
    : [];

  return createPortal(
    <div
      ref={menuRef}
      className="vcm"
      style={{ left: safeX, top: safeY }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* ── 1. 환자정보 ─────────────────────────── */}
      <div className="vcm__header">
        <span className="vcm__header-top">
          {victim.kind === 'person'
            ? [victim.gender, victim.age, victim.condition].filter(v => v != null && v !== '').join('/')
            : victim.kind === 'group' ? `다수 ${victim.groupCount ?? 2}명`
            : victim.customLabel?.trim() || '기타'}
        </span>
      </div>

      {/* ── 2. 구조 처리 ────────────────────────── */}
      <div className="vcm__section vcm__section--rescue">
        <button
          className={`vcm__rescue-toggle ${showRescue ? 'vcm__rescue-toggle--open' : ''}`}
          onClick={() => setShowRescue(v => !v)}
          disabled={isAlreadyRescued}
        >
          <span>{isAlreadyRescued ? '이미 임시의료소에 있습니다' : '구조 처리'}</span>
          {!isAlreadyRescued && (
            <span className="vcm__arrow">{showRescue ? '▲' : '▼'}</span>
          )}
        </button>

        {showRescue && !isAlreadyRescued && (
          <div className="vcm__rescue-list">
            {rescuableUnits.length === 0 ? (
              <div className="vcm__rescue-empty">
                같은 공간에 구조 가능한<br />출동대가 없습니다
              </div>
            ) : (
              rescuableUnits.map(unit => (
                <button
                  key={unit.id}
                  className={`vcm__rescue-unit vcm__rescue-unit--${unit.color}`}
                  onClick={() => { onRescue(unit); }}
                >
                  <span className="vcm__rescue-unit-name">{unit.label}</span>
                  <span className="vcm__rescue-unit-arrow">→ 임시의료소</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── 3. 상태 변경 (person) ───────────────── */}
      {victim.kind === 'person' && (
        <div className="vcm__section">
          <div className="vcm__section-label">환자상태</div>
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

      {/* ── 3. 라벨 변경 (custom) ───────────────── */}
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

      {/* ── 4. 세부위치 입력 ────────────────────── */}
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
    </div>,
    document.body,
  );
}

function condClass(c: VictimCondition): string {
  switch (c) {
    case '경상': return 'minor';
    case '중상': return 'critical';
    case '사망': return 'dead';
    default:     return '';
  }
}
