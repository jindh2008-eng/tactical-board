import { useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import type { VictimPos, VictimUpdate } from '../../context/VictimContext';
import { useVictims } from '../../context/VictimContext';
import { useTokens } from '../../context/TokenContext';
import { useActionMode } from '../../context/ActionModeContext';
import type { UnitToken } from '../../types';
import type { VictimToken, VictimCondition } from '../../types/victim';
import { VictimContextBarMenu, type AnchorRect } from './VictimContextBarMenu';
import { zoneKeyToFullLabel, buildVictimDisplayLine, canUnitRescueVictim } from '../../utils/victimUtils';
import { setDragGrabOffset } from '../../utils/dragDrop';
import { logDragEvent } from '../../utils/dragDiagnostics';
import './VictimCard.css';

interface Props {
  victim:  VictimToken;
  absPos?: VictimPos;
  /** 출동대에 이송 연결되어 토큰 우측에 부착 렌더되는 형태 — 메모를 숨기고 아이콘만 남긴다 */
  attached?: boolean;
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

export function VictimCard({ victim, absPos, attached }: Props) {
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

  // 임시의료소로 옮겨진 구조대상자는 위치 메모를 숨기고 토큰만 표시한다 —
  // 이미 건물에서 반출된 상태라 발견 위치 정보가 의미를 잃는다.
  const inMedicalPost = victim.zoneKey === 'medical-post';
  // 출동대 우측 부착 렌더도 같은 이유로 메모를 숨긴다 — 이송 중이라 발견 위치가 의미 없고,
  // 출동대 토큰 옆에 붙는 자리라 아이콘 폭만 쓴다.
  const hideMemo = inMedicalPost || !!attached;

  // ── 출동대를 구조대상자 위에 드롭 → 구조 확인 ─────────────────────
  // 자격이 없으면 stopPropagation 하지 않는다 → 밑의 구역이 평범한 위치 이동으로 처리.
  const [rescueAsk, setRescueAsk] = useState<{ unit: UnitToken; x: number; y: number } | null>(null);

  function handleCardDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (isRescueMode) return;
    // dragover 시점에는 dataTransfer 값을 읽을 수 없어(보안) 타입만 본다.
    if (!e.dataTransfer.types.includes('tokenid') && !e.dataTransfer.types.includes('tokenId')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleCardDrop(e: React.DragEvent<HTMLDivElement>) {
    if (isRescueMode) return;
    const tokenId = e.dataTransfer.getData('tokenId');
    if (!tokenId) return;                         // 구조대상자 드롭 등 — 구역에 맡긴다
    const unit = tokens.find(t => t.id === tokenId);
    if (!unit) return;
    if (!canUnitRescueVictim(unit.zoneKey, unit.unitType, unit.badges, victim.zoneKey)) return;

    e.preventDefault();
    e.stopPropagation();                          // 자격 있을 때만 구역 이동을 가로챈다
    setRescueAsk({ unit, x: e.clientX, y: e.clientY });
  }

  function confirmRescue() {
    if (!rescueAsk) return;
    const locationLabel  = zoneKeyToFullLabel(victim.zoneKey);
    const rescueLocLabel = [locationLabel, victim.subLocation].filter(Boolean).join(' ') || '위치미상';
    rescueUnit(rescueAsk.unit.id, rescueLocLabel);
    moveVictim(victim.id, 'medical-post');
    setRescueAsk(null);
  }

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

  const touchDrag = useTouchDrag({
    enabled: !isRescueMode,
    payload: { victimId: victim.id },
    dragElementRef: wrapperRef,
    onDragStart: () => {
      setCtxMenu(null);
      setTooltipRect(null);
      logDragEvent('VictimCard touch dragstart', `victim=${victim.id}`);
    },
    onDragEnd: () => logDragEvent('VictimCard touch dragend', `victim=${victim.id}`),
  });

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

  // absPos 는 구역 대비 0~1 정규화 좌표 (TokenCard 와 동일)
  const wrapperStyle: React.CSSProperties | undefined = absPos
    ? {
        position:  'absolute',
        left:      `${absPos.x * 100}%`,
        top:       `${absPos.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        zIndex:    5,
      }
    : undefined;

  // 구조 확인 팝업 — 세 종류(개별/다수/기타) 렌더 분기에서 공용으로 쓴다
  const rescueAskPortal = rescueAsk && ReactDOM.createPortal(
    <>
      <div className="victim-rescue-ask__backdrop" onMouseDown={() => setRescueAsk(null)} />
      <div className="victim-rescue-ask" style={{ left: rescueAsk.x, top: rescueAsk.y }}>
        <div className="victim-rescue-ask__msg">
          <b>{rescueAsk.unit.label}</b> 구조처리하시겠습니까?
        </div>
        <div className="victim-rescue-ask__btns">
          <button
            className="victim-rescue-ask__btn victim-rescue-ask__btn--yes"
            onMouseDown={e => { e.stopPropagation(); confirmRescue(); }}
          >예</button>
          <button
            className="victim-rescue-ask__btn"
            onMouseDown={e => { e.stopPropagation(); setRescueAsk(null); }}
          >아니오</button>
        </div>
      </div>
    </>,
    document.body,
  );

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
          className={`victim-card-wrapper${attached ? ' victim-card-wrapper--attached' : ''}`}
          style={wrapperStyle}
          ref={wrapperRef}
          data-touch-drop-target="true"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onDragOver={handleCardDragOver}
          onDrop={handleCardDrop}
        >
          <div
            className={[
              'victim-card',
              `victim-card--person`,
              `victim-gender--${genderKey}`,
              attached ? 'victim-card--attached' : '',
              isRescueTarget ? 'victim-card--rescue-target' : '',
              isRescueMode && !isRescueTarget ? 'victim-card--rescue-dim' : '',
            ].filter(Boolean).join(' ')}
            draggable={!isRescueMode}
            {...touchDrag}
            onDragStart={handleDragStart}
            onContextMenu={isRescueMode ? e => e.preventDefault() : handleContextMenu}
            onClick={isRescueTarget ? handleRescueClick : undefined}
            style={isRescueTarget ? { cursor: 'pointer' } : undefined}
          >
            {victim.gender === '남' ? <MaleIcon /> : <FemaleIcon />}
            {!hideMemo && <span className="victim-card__subloc">{subLoc}</span>}
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
        {rescueAskPortal}
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
        <div className={`victim-card-wrapper${attached ? ' victim-card-wrapper--attached' : ''}`} style={wrapperStyle} ref={wrapperRef}
          data-touch-drop-target="true"
          onDragOver={handleCardDragOver}
          onDrop={handleCardDrop}
        >
          <div
            className={[
              'victim-card',
              'victim-card--group',
              'victim-cond--minor',
              attached ? 'victim-card--attached' : '',
              isRescueTarget ? 'victim-card--rescue-target' : '',
              isRescueMode && !isRescueTarget ? 'victim-card--rescue-dim' : '',
            ].filter(Boolean).join(' ')}
            draggable={!isRescueMode}
            {...touchDrag}
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
            {!attached && (
              <div className="group-info">
                <span className="group-info__count">{count}명</span>
                <span className="group-info__cond">경상</span>
              </div>
            )}
          </div>
        </div>
        {rescueAskPortal}
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
      <div className={`victim-card-wrapper${attached ? ' victim-card-wrapper--attached' : ''}`} style={wrapperStyle} ref={wrapperRef}
          data-touch-drop-target="true"
          onDragOver={handleCardDragOver}
          onDrop={handleCardDrop}
        >
        <div
          className={[
            'victim-card',
            'victim-card--custom',
            attached ? 'victim-card--attached' : '',
            isRescueTarget ? 'victim-card--rescue-target' : '',
            isRescueMode && !isRescueTarget ? 'victim-card--rescue-dim' : '',
          ].filter(Boolean).join(' ')}
          draggable={!isRescueMode}
          {...touchDrag}
          onDragStart={handleDragStart}
          onContextMenu={isRescueMode ? e => e.preventDefault() : handleContextMenu}
          onClick={isRescueTarget ? handleRescueClick : undefined}
          title={isRescueTarget ? `${title} — 클릭하여 구조` : title}
          style={isRescueTarget ? { cursor: 'pointer' } : undefined}
        >
          <span className="victim-card__top">{victim.customLabel?.trim() || '기타'}</span>
          {!hideMemo && (victim.originDisplayBottom ?? buildVictimDisplayLine(victim)) && (
            <span className="victim-card__bottom">
              {victim.originDisplayBottom ?? buildVictimDisplayLine(victim)}
            </span>
          )}
        </div>
      </div>
      {rescueAskPortal}
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
