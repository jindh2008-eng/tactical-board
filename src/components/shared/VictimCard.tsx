import { useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { VictimPos, VictimUpdate } from '../../context/VictimContext';
import { useVictims } from '../../context/VictimContext';
import { useTokens } from '../../context/TokenContext';
import { useActionMode } from '../../context/ActionModeContext';
import type { UnitToken } from '../../types';
import type { VictimToken, VictimCondition } from '../../types/victim';
import { VictimContextBarMenu, type AnchorRect } from './VictimContextBarMenu';
import { zoneKeyToFullLabel, buildVictimDisplayLine } from '../../utils/victimUtils';
import { setDragGrabOffset } from '../../utils/dragDrop';
import { logDragEvent } from '../../utils/dragDiagnostics';
import './VictimCard.css';

interface Props {
  victim:  VictimToken;
  absPos?: VictimPos;
}

function condKey(c: VictimCondition | undefined): string {
  switch (c) {
    case '경상': return 'minor';
    case '중상': return 'critical';
    case '사망': return 'dead';
    default:     return 'minor';
  }
}

// ─── 개별 구조대상자 아이콘 ───────────────────────

function MaleIcon() {
  /* 픽토그램 — 머리 + 팔(직선) + 몸통 + 두 다리 */
  return (
    <svg className="victim-gender-icon victim-gender-icon--male" viewBox="0 0 14 26" fill="currentColor" aria-hidden="true">
      <circle cx="7" cy="3" r="2.8"/>
      {/* 왼팔 */}
      <rect x="2.6" y="7" width="1.9" height="7.5" rx="0.6"/>
      {/* 오른팔 */}
      <rect x="9.5" y="7" width="1.9" height="7.5" rx="0.6"/>
      {/* 몸통 */}
      <rect x="5" y="7" width="4" height="8.5" rx="0.4"/>
      {/* 왼다리 */}
      <rect x="5" y="15.5" width="1.8" height="10.5" rx="0.6"/>
      {/* 오른다리 */}
      <rect x="7.2" y="15.5" width="1.8" height="10.5" rx="0.6"/>
    </svg>
  );
}

function FemaleIcon() {
  /* 픽토그램 — 머리 + 팔(바깥 사선) + 상체 + A라인 치마 + 두 다리 */
  return (
    <svg className="victim-gender-icon victim-gender-icon--female" viewBox="0 0 14 26" fill="currentColor" aria-hidden="true">
      <circle cx="7" cy="3" r="2.8"/>
      {/* 왼팔 (바깥 사선) */}
      <polygon points="5.2,7 6.4,7 4,14 2.8,14"/>
      {/* 오른팔 (바깥 사선) */}
      <polygon points="7.6,7 8.8,7 11.2,14 10,14"/>
      {/* 상체 */}
      <rect x="5.2" y="7" width="3.6" height="5.5" rx="0.4"/>
      {/* A라인 치마 */}
      <polygon points="4.8,12.5 0.5,22.5 13.5,22.5 9.2,12.5"/>
      {/* 왼다리 */}
      <rect x="3.8" y="22.5" width="2.2" height="3.5" rx="0.6"/>
      {/* 오른다리 */}
      <rect x="8" y="22.5" width="2.2" height="3.5" rx="0.6"/>
    </svg>
  );
}

// ─── 다수 구조대상자 아이콘 (소형) ───────────────

function GroupPersonIcon() {
  return (
    <svg className="group-person-icon" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="3.5" r="2.8"/>
      <path d="M0.5 13.5 Q0.5 8 5 8 Q9.5 8 9.5 13.5Z"/>
    </svg>
  );
}

// ─── 카드 본체 ───────────────────────────────────

export function VictimCard({ victim, absPos }: Props) {
  const { updateVictim, moveVictim } = useVictims();
  const { tokens, rescueUnit }       = useTokens();
  const { mode, clearMode }          = useActionMode();
  const [ctxMenu,     setCtxMenu]     = useState<AnchorRect | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // rescue 모드 여부 및 대상 가능 여부
  const isRescueMode = mode.type === 'rescue';
  // 같은 구역에 있는 피해자만 대상으로 허용 (구역 없는 피해자는 제외)
  const sourceToken  = isRescueMode
    ? tokens.find(t => t.id === (mode as { sourceId: string }).sourceId) ?? null
    : null;
  const isRescueTarget = isRescueMode && victim.zoneKey !== null &&
    sourceToken !== null && sourceToken.zoneKey === victim.zoneKey;

  // rescue 모드에서 피해자 클릭 → 구조 실행
  function handleRescueClick(e: React.MouseEvent) {
    if (!isRescueTarget || !sourceToken) return;
    e.stopPropagation();
    const locationLabel = zoneKeyToFullLabel(victim.zoneKey);
    const rescueLocLabel = [locationLabel, victim.subLocation]
      .filter(Boolean).join(' ') || '위치미상';
    rescueUnit(sourceToken.id, rescueLocLabel);
    moveVictim(victim.id, 'medical-post');
    clearMode();
  }

  function handleMouseEnter() {
    if (wrapperRef.current) setTooltipRect(wrapperRef.current.getBoundingClientRect());
  }
  function handleMouseLeave() { setTooltipRect(null); }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    e.dataTransfer.setData('victimId', victim.id);
    e.dataTransfer.setData('tokenW', String(el.offsetWidth));
    e.dataTransfer.setData('tokenH', String(el.offsetHeight));
    setDragGrabOffset(e);
    e.dataTransfer.effectAllowed = 'move';
    setCtxMenu(null);       // 드래그 시작 시 메뉴 닫기
    setTooltipRect(null);
    logDragEvent('VictimCard dragstart', `victim=${victim.id}`);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // 토큰 wrapper rect 스냅샷 → 가로 막대 메뉴 열기
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) {
      setCtxMenu({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
    }
  }

  const handleClose  = useCallback(() => setCtxMenu(null), []);
  const handleUpdate = useCallback(
    (u: VictimUpdate) => updateVictim(victim.id, u),
    [updateVictim, victim.id],
  );

  const handleRescue = useCallback((unit: UnitToken) => {
    const locationLabel = zoneKeyToFullLabel(victim.zoneKey);
    const rescueLocLabel = [locationLabel, victim.subLocation]
      .filter(Boolean)
      .join(' ') || '위치미상';

    // 굴절차/고가차는 현장에서 사다리 전개 구조 — 차량 위치 변경 없음
    if (unit.unitType !== 'ladder' && unit.unitType !== 'aerial') {
      rescueUnit(unit.id, rescueLocLabel);
    }
    moveVictim(victim.id, 'medical-post');
    setCtxMenu(null);
  }, [rescueUnit, moveVictim, victim]);

  const wrapperStyle: React.CSSProperties | undefined = absPos
    ? {
        position:  'absolute',
        left:      absPos.x,
        top:       absPos.y,
        transform: 'translate(-50%, -50%)',
        zIndex:    5,
      }
    : undefined;

  const displayTop =
    victim.kind === 'person'
      ? [victim.gender, victim.ageGroup ?? victim.age, victim.condition].filter(v => v != null).join('/')
      : victim.kind === 'group' ? `다수 ${victim.groupCount ?? 2}명`
      : victim.customLabel?.trim() || '기타';
  const title = [displayTop, buildVictimDisplayLine(victim)].filter(Boolean).join(' · ');

  // ── 개별 구조대상자 ─────────────────────────────
  if (victim.kind === 'person') {
    const ck = condKey(victim.condition);
    const genderKey = victim.gender === '남' ? 'male' : 'female';
    const subLoc = victim.subLocation.trim();
    return (
      <>
        <div
          className="victim-card-wrapper"
          style={wrapperStyle}
          ref={wrapperRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className={[
              'victim-card',
              `victim-card--person`,
              `victim-gender--${genderKey}`,
              isRescueTarget ? 'victim-card--rescue-target' : '',
              isRescueMode && !isRescueTarget ? 'victim-card--rescue-dim' : '',
            ].filter(Boolean).join(' ')}
            draggable={!isRescueMode}
            onDragStart={handleDragStart}
            onContextMenu={isRescueMode ? e => e.preventDefault() : handleContextMenu}
            onClick={isRescueTarget ? handleRescueClick : undefined}
            style={isRescueTarget ? { cursor: 'pointer' } : undefined}
          >
            {victim.gender === '남' ? <MaleIcon /> : <FemaleIcon />}
            <span className="victim-card__subloc">{subLoc}</span>
          </div>
        </div>
        {/* hover 말풍선 — 메뉴 닫혀 있을 때만 표시 */}
        {tooltipRect && !ctxMenu && ReactDOM.createPortal(
          <div
            className={`victim-tooltip-portal victim-cond--${ck}`}
            style={{
              position: 'fixed',
              left:     Math.round(tooltipRect.left + tooltipRect.width / 2),
              top:      Math.round(tooltipRect.top - 6),
              transform: 'translate(-50%, -100%)',
              zIndex:   9999,
              pointerEvents: 'none',
            }}
          >
            <span className="tooltip__age">{victim.ageGroup ?? (victim.age != null ? `${victim.age}세` : '?세')}</span>
            <span className="tooltip__cond">{victim.condition ?? '경상'}</span>
            {subLoc && <span className="tooltip__loc">{subLoc}</span>}
          </div>,
          document.body,
        )}
        {ctxMenu && (
          <VictimContextBarMenu
            victim={victim}
            anchorRect={ctxMenu}
            tokens={tokens}
            onUpdate={handleUpdate}
            onRescue={handleRescue}
            onClose={handleClose}
          />
        )}
      </>
    );
  }

  // ── 다수 구조대상자 ─────────────────────────────
  if (victim.kind === 'group') {
    const count = victim.groupCount ?? 2;
    return (
      <>
        <div className="victim-card-wrapper" style={wrapperStyle} ref={wrapperRef}>
          <div
            className={[
              'victim-card',
              'victim-card--group',
              'victim-cond--minor',
              isRescueTarget ? 'victim-card--rescue-target' : '',
              isRescueMode && !isRescueTarget ? 'victim-card--rescue-dim' : '',
            ].filter(Boolean).join(' ')}
            draggable={!isRescueMode}
            onDragStart={handleDragStart}
            onContextMenu={isRescueMode ? e => e.preventDefault() : handleContextMenu}
            onClick={isRescueTarget ? handleRescueClick : undefined}
            title={isRescueTarget ? `${title} — 클릭하여 구조` : title}
            style={isRescueTarget ? { cursor: 'pointer' } : undefined}
          >
            <div className="group-icons">
              {Array.from({ length: count }).map((_, i) => (
                <GroupPersonIcon key={i} />
              ))}
            </div>
            <div className="group-info">
              <span className="group-info__count">{count}명</span>
              <span className="group-info__cond">경상</span>
            </div>
          </div>
        </div>
        {ctxMenu && (
          <VictimContextBarMenu
            victim={victim}
            anchorRect={ctxMenu}
            tokens={tokens}
            onUpdate={handleUpdate}
            onRescue={handleRescue}
            onClose={handleClose}
          />
        )}
      </>
    );
  }

  // ── 기타 (custom) ───────────────────────────────
  return (
    <>
      <div className="victim-card-wrapper" style={wrapperStyle} ref={wrapperRef}>
        <div
          className={[
            'victim-card',
            'victim-card--custom',
            isRescueTarget ? 'victim-card--rescue-target' : '',
            isRescueMode && !isRescueTarget ? 'victim-card--rescue-dim' : '',
          ].filter(Boolean).join(' ')}
          draggable={!isRescueMode}
          onDragStart={handleDragStart}
          onContextMenu={isRescueMode ? e => e.preventDefault() : handleContextMenu}
          onClick={isRescueTarget ? handleRescueClick : undefined}
          title={isRescueTarget ? `${title} — 클릭하여 구조` : title}
          style={isRescueTarget ? { cursor: 'pointer' } : undefined}
        >
          <span className="victim-card__top">{victim.customLabel?.trim() || '기타'}</span>
          {(victim.originDisplayBottom ?? buildVictimDisplayLine(victim)) && (
            <span className="victim-card__bottom">
              {victim.originDisplayBottom ?? buildVictimDisplayLine(victim)}
            </span>
          )}
        </div>
      </div>
      {ctxMenu && (
        <VictimContextBarMenu
          victim={victim}
          anchorRect={ctxMenu}
          tokens={tokens}
          onUpdate={handleUpdate}
          onRescue={handleRescue}
          onClose={handleClose}
        />
      )}
    </>
  );
}
