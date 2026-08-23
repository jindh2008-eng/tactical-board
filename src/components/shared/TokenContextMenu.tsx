import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UnitToken, TokenBadge } from '../../types';
import type { SharedBadgePreset, UnitSpecificBadgePreset } from '../../types/presets';
import { getUnitLabel, PRESET_COLORS } from '../../types/presets';
import './TokenContextMenu.css';
import { stageBounds, stagePortalTarget, viewportToStage } from '../../utils/stagePortal';

type SubPanel = 'add' | 'remove' | null;

interface Props {
  token:              UnitToken;
  x:                  number;
  y:                  number;
  sharedBadgePresets: SharedBadgePreset[];
  unitBadgePresets:   UnitSpecificBadgePreset[];
  onAddBadge:         (badge: Omit<TokenBadge, 'id'>) => void;
  onRemoveBadge:      (badgeId: string) => void;
  onClose:            () => void;
}

export function TokenContextMenu({
  token, x: vx, y: vy,
  sharedBadgePresets, unitBadgePresets,
  onAddBadge, onRemoveBadge, onClose,
}: Props) {
  const [subPanel,    setSubPanel]    = useState<SubPanel>(null);
  const [customLine1, setCustomLine1] = useState('');
  const [customLine2, setCustomLine2] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

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
  const MENU_W = 240;
  const MENU_H = 400;
  // 클릭 좌표는 뷰포트 px 로 들어온다. 메뉴가 스테이지(배율) 안 포털에
  // 그려지므로 캔버스 좌표로 바꿔 쓴다. → docs/SCREEN_STAGE_PLAN.md §4.1
  const { x, y } = viewportToStage(vx, vy);
  const safeX = Math.min(x, stageBounds().width  - MENU_W - 8);
  const safeY = Math.min(y, stageBounds().height - MENU_H - 8);

  // ── 프리셋 필터링 ──────────────────────────────
  // 공통: targetTypes가 비어있거나 이 토큰의 unitType 포함
  const matchingShared = sharedBadgePresets.filter(p =>
    p.targetTypes.length === 0 || p.targetTypes.includes(token.unitType)
  );
  // 전용: 이 토큰의 unitType 전용 프리셋
  const matchingUnit = unitBadgePresets.filter(p => p.unitType === token.unitType);

  const hasShared  = matchingShared.length > 0;
  const hasUnit    = matchingUnit.length > 0;
  const hasPresets = hasShared || hasUnit;

  const unitLabel = getUnitLabel(token.unitType);

  function handleAddShared(p: SharedBadgePreset) {
    onAddBadge({ line1: p.topText, line2: p.bottomText, color: p.color });
    onClose();
  }

  function handleAddUnit(p: UnitSpecificBadgePreset) {
    onAddBadge({ line1: p.topText, line2: p.bottomText, color: p.color });
    onClose();
  }

  function handleAddCustom() {
    const l1 = customLine1.trim();
    if (!l1) return;
    const l2 = customLine2.trim();
    onAddBadge({ line1: l1, line2: l2 || undefined });
    onClose();
  }

  function toggleSub(panel: SubPanel) {
    setSubPanel(s => s === panel ? null : panel);
  }

  const badges    = token.badges;
  const hasBadges = badges.length > 0;

  return createPortal(
    <div
      ref={menuRef}
      className="tcm"
      style={{ left: safeX, top: safeY }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* 헤더 */}
      <div className="tcm__header">{token.label}</div>

      {/* 상태 추가 */}
      <button
        className={`tcm__item ${subPanel === 'add' ? 'tcm__item--active' : ''}`}
        onClick={() => toggleSub('add')}
      >
        <span>상태 추가</span>
        <span className="tcm__arrow">{subPanel === 'add' ? '▲' : '▼'}</span>
      </button>

      {subPanel === 'add' && (
        <div className="tcm__sub">
          {/* ── 저장된 프리셋 ── */}
          {hasPresets && (
            <div className="tcm__preset-scroll">
              {/* 공통 프리셋 */}
              {hasShared && (
                <div className="tcm__preset-section">
                  <div className="tcm__section-label">공통</div>
                  {matchingShared.map(p => {
                    const col = p.color ? PRESET_COLORS.find(c => c.value === p.color) : null;
                    return (
                      <button
                        key={p.id}
                        className="tcm__preset-btn"
                        onClick={() => handleAddShared(p)}
                      >
                        {col && <span className="tcm__preset-dot" style={{ background: col.bg }} />}
                        <div className="tcm__preset-text">
                          <span className="tcm__preset-line1">{p.topText}</span>
                          {p.bottomText && <span className="tcm__preset-line2">{p.bottomText}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 출동대 전용 프리셋 */}
              {hasUnit && (
                <div className="tcm__preset-section">
                  <div className="tcm__section-label">{unitLabel} 전용</div>
                  {matchingUnit.map(p => {
                    const col = p.color ? PRESET_COLORS.find(c => c.value === p.color) : null;
                    return (
                      <button
                        key={p.id}
                        className="tcm__preset-btn"
                        onClick={() => handleAddUnit(p)}
                      >
                        {col && <span className="tcm__preset-dot" style={{ background: col.bg }} />}
                        <div className="tcm__preset-text">
                          <span className="tcm__preset-line1">{p.topText}</span>
                          {p.bottomText && <span className="tcm__preset-line2">{p.bottomText}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="tcm__divider" />
            </div>
          )}

          {/* ── 직접 입력 ── */}
          <div className="tcm__sub-title">직접 입력</div>
          <input
            className="tcm__input"
            placeholder="윗줄 *"
            value={customLine1}
            onChange={e => setCustomLine1(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') handleAddCustom();
            }}
            autoFocus={!hasPresets}
          />
          <input
            className="tcm__input"
            placeholder="아랫줄 (선택)"
            value={customLine2}
            onChange={e => setCustomLine2(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') handleAddCustom();
            }}
          />
          <button
            className="tcm__confirm-btn"
            onClick={handleAddCustom}
            disabled={!customLine1.trim()}
          >
            추가
          </button>
        </div>
      )}

      {/* 상태 삭제 */}
      {hasBadges && (
        <>
          <button
            className={`tcm__item ${subPanel === 'remove' ? 'tcm__item--active' : ''}`}
            onClick={() => toggleSub('remove')}
          >
            <span>상태 삭제</span>
            <span className="tcm__arrow">{subPanel === 'remove' ? '▲' : '▼'}</span>
          </button>

          {subPanel === 'remove' && (
            <div className="tcm__sub">
              {badges.map(badge => (
                <button
                  key={badge.id}
                  className="tcm__badge-remove-btn"
                  onClick={() => { onRemoveBadge(badge.id); onClose(); }}
                >
                  <span className="tcm__badge-remove-text">
                    {badge.line1}{badge.line2 ? ` / ${badge.line2}` : ''}
                  </span>
                  <span className="tcm__badge-remove-x">×</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>,
    stagePortalTarget()
  );
}
