import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VictimToken, VictimCondition } from '../../types/victim';
import { VICTIM_CONDITIONS } from '../../types/victim';
import type { UnitToken } from '../../types';
import type { VictimUpdate } from '../../context/VictimContext';
import './VictimContextBarMenu.css';
import { stagePortalTarget, stageBounds, rectToStage } from '../../utils/stagePortal';

// ─────────────────────────────────────────────
// 헬퍼 (VictimContextMenu 로직 재사용)
// ─────────────────────────────────────────────

function extractBuildingFloor(zoneKey: string | null): string | null {
  if (!zoneKey) return null;
  const m = zoneKey.match(/^(RF|\d+F|B\d+)-/);
  return m ? m[1] : null;
}

function extractFace(zoneKey: string | null): 'A' | 'B' | 'C' | 'D' | null {
  if (!zoneKey) return null;
  const m1 = zoneKey.match(/^face-([ABCD])$/);
  if (m1) return m1[1] as 'A' | 'B' | 'C' | 'D';
  const m2 = zoneKey.match(/^([ABCD])-/);
  if (m2) return m2[1] as 'A' | 'B' | 'C' | 'D';
  return null;
}

const COND_CLASS: Record<VictimCondition, string> = {
  '경상': 'minor',
  '중상': 'critical',
  '사망': 'dead',
};

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

type ActivePanel = 'rescue' | 'condition' | 'label' | 'note' | null;

export interface AnchorRect {
  left: number; top: number; right: number; bottom: number; width: number; height: number;
}

interface Props {
  victim:     VictimToken;
  anchorRect: AnchorRect;
  tokens:     UnitToken[];
  onUpdate:   (update: VictimUpdate) => void;
  onRescue:   (unit: UnitToken) => void;
  onClose:    () => void;
}

// ─────────────────────────────────────────────
// VictimContextBarMenu
// ─────────────────────────────────────────────

export function VictimContextBarMenu({
  victim, anchorRect, tokens, onUpdate, onRescue, onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [noteDraft,   setNoteDraft]   = useState(victim.subLocation ?? '');
  const [labelDraft,  setLabelDraft]  = useState(victim.customLabel ?? '');

  // 레이아웃 상태: 위치 + 방향을 한 번에 갱신해 이중 렌더 방지
  const [layout, setLayout] = useState<{
    openAbove: boolean;
    style:     React.CSSProperties;
  }>({
    openAbove: true,
    style:     { visibility: 'hidden', position: 'fixed', left: 0, top: 0 },
  });

  // ── 위치 계산 (레이아웃 측정 후) ─────────────
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    // 메뉴는 이제 스테이지(배율) 안의 포털에 그려진다. 그래서 여기 좌표는 전부
    // **캔버스 px** 여야 한다 — offsetWidth 가 곧 캔버스 폭이고, 뷰포트에서 온
    // 앵커는 rectToStage 로, 화면 경계는 stageBounds 로 바꿔 쓴다.
    // → docs/SCREEN_STAGE_PLAN.md §4.1
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    const { width: vw, height: vh } = stageBounds();
    // 앵커는 호출부에서 뷰포트 rect 로 넘어온다 → 캔버스 좌표로 바꾼다.
    const a0 = rectToStage(anchorRect);
    const anchor = { ...a0, bottom: a0.top + a0.height };
    const GAP   = 6;

    // 토큰 중앙 기준 수평 정렬, 화면 경계 보정
    const cx  = anchor.left + anchor.width / 2;
    let left  = Math.round(cx - menuW / 2);
    left      = Math.max(8, Math.min(left, vw - menuW - 8));

    // 위쪽 공간이 충분하면 위에, 아래가 더 넓으면 아래에
    const spaceAbove = anchor.top;
    const spaceBelow = vh - anchor.bottom;
    let top: number;
    let openAbove: boolean;

    if (spaceAbove >= menuH + GAP || spaceAbove >= spaceBelow) {
      top       = Math.max(8, anchor.top - menuH - GAP);
      openAbove = true;
    } else {
      top       = Math.min(anchor.bottom + GAP, vh - menuH - 8);
      openAbove = false;
    }

    setLayout({ openAbove, style: { position: 'fixed', left, top, visibility: 'visible' } });
  }, [anchorRect, activePanel]);   // activePanel 변경 시 높이가 달라지므로 재측정

  // ── 외부 클릭 / Esc → 닫기 ──────────────────
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

  // ── 구조 처리 데이터 ─────────────────────────
  const isAlreadyRescued = victim.zoneKey === 'medical-post';
  const victimFloor = extractBuildingFloor(victim.zoneKey);

  const rescuableUnits = victim.zoneKey
    ? tokens.filter(t => {
        if (t.badges.some(b => b.line1 === '구조중')) return false;
        if (victimFloor && extractBuildingFloor(t.zoneKey) === victimFloor) return true;
        return t.zoneKey === victim.zoneKey;
      })
    : [];

  const rescuableUnitIds = new Set(rescuableUnits.map(u => u.id));
  const faceRescuableUnits = tokens.filter(t =>
    (t.unitType === 'ladder' || t.unitType === 'aerial') &&
    extractFace(t.zoneKey) !== null &&
    !t.badges.some(b => b.line1 === '구조중') &&
    !rescuableUnitIds.has(t.id)
  );
  const hasAnyRescuable = rescuableUnits.length > 0 || faceRescuableUnits.length > 0;

  // ── 핸들러 ──────────────────────────────────

  function togglePanel(panel: ActivePanel) {
    setActivePanel(prev => prev === panel ? null : panel);
  }

  function handleCondition(c: VictimCondition) {
    onUpdate({ condition: c });
    onClose();
  }

  function handleSaveNote() {
    onUpdate({ subLocation: noteDraft.trim() });
    onClose();
  }

  function handleSaveLabel() {
    onUpdate({ customLabel: labelDraft.trim() || '기타' });
    onClose();
  }

  // ── 환자정보 헤더 텍스트 ──────────────────────
  const headerText =
    victim.kind === 'person'
      ? [victim.gender,
         victim.ageGroup ?? (victim.age != null ? `${victim.age}세` : null),
         victim.condition,
        ].filter((v): v is NonNullable<typeof v> => v != null).join(' · ')
      : victim.kind === 'group'
        ? `다수 ${victim.groupCount ?? 2}명`
        : victim.customLabel?.trim() || '기타';

  // ── 하위 패널 내용 ────────────────────────────
  const subContent = (() => {
    if (activePanel === 'rescue') {
      if (isAlreadyRescued) {
        return <span className="vcbm__sub-msg">이미 임시의료소에 있습니다</span>;
      }
      if (!hasAnyRescuable) {
        return <span className="vcbm__sub-msg">구조 가능한 출동대가 없습니다</span>;
      }
      return (
        <>
          {/* 같은 층/구역 출동대 */}
          {rescuableUnits.map(unit => (
            <button
              key={unit.id}
              className={`vcbm__rescue-btn vcbm__rescue-btn--${unit.color}`}
              onMouseDown={e => { e.stopPropagation(); onRescue(unit); }}
              title={`${unit.label} → 임시의료소`}
            >
              {unit.label}
            </button>
          ))}
          {/* 외곽 방면 고가차/굴절차 */}
          {faceRescuableUnits.map(unit => {
            const face    = extractFace(unit.zoneKey)!;
            const typeLbl = unit.unitType === 'aerial' ? '고가차' : '굴절차';
            return (
              <button
                key={unit.id}
                className="vcbm__rescue-btn vcbm__rescue-btn--face"
                onMouseDown={e => { e.stopPropagation(); onRescue(unit); }}
                title={`${face}면 ${typeLbl} (${unit.label}) → 임시의료소`}
              >
                {face}면 {typeLbl}
              </button>
            );
          })}
        </>
      );
    }

    if (activePanel === 'condition') {
      return VICTIM_CONDITIONS.map(c => (
        <button
          key={c}
          className={[
            'vcbm__cond-btn',
            `vcbm__cond-btn--${COND_CLASS[c] ?? ''}`,
            victim.condition === c ? 'vcbm__cond-btn--active' : '',
          ].filter(Boolean).join(' ')}
          onMouseDown={e => { e.stopPropagation(); handleCondition(c); }}
        >
          {c}
        </button>
      ));
    }

    if (activePanel === 'label') {
      return (
        <div className="vcbm__input-row">
          <input
            className="vcbm__input"
            value={labelDraft}
            onChange={e => setLabelDraft(e.target.value)}
            onMouseDown={e => e.stopPropagation()}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter')  handleSaveLabel();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="기타"
            maxLength={20}
            autoFocus
          />
          <button
            className="vcbm__input-save"
            onMouseDown={e => { e.stopPropagation(); handleSaveLabel(); }}
          >✓</button>
        </div>
      );
    }

    if (activePanel === 'note') {
      return (
        <div className="vcbm__input-row">
          <input
            className="vcbm__input"
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            onMouseDown={e => e.stopPropagation()}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter')  handleSaveNote();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="212호, 복도…"
            maxLength={20}
            autoFocus
          />
          <button
            className="vcbm__input-save"
            onMouseDown={e => { e.stopPropagation(); handleSaveNote(); }}
          >✓</button>
        </div>
      );
    }

    return null;
  })();

  const subPanel = activePanel !== null && subContent !== null
    ? <div className="vcbm__sub">{subContent}</div>
    : null;

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────

  return createPortal(
    <>
      {/* 백드롭 */}
      <div className="vcbm__backdrop" onMouseDown={onClose} />

      <div
        ref={menuRef}
        className="vcbm"
        style={layout.style}
        onContextMenu={e => e.preventDefault()}
      >
        {/* 하위 패널 — 위쪽 공간 있을 때: 기본 바 위에 표시 */}
        {layout.openAbove && subPanel}

        {/* ── 기본 메뉴 바 ──────────────────────── */}
        <div className="vcbm__bar">
          {/* 환자정보 칩 */}
          <span className="vcbm__info">{headerText}</span>
          <div className="vcbm__sep" aria-hidden="true" />

          {/* 구조 */}
          <button
            className={[
              'vcbm__btn',
              'vcbm__btn--rescue',
              activePanel === 'rescue'    ? 'vcbm__btn--active'   : '',
              isAlreadyRescued            ? 'vcbm__btn--rescued'  : '',
            ].filter(Boolean).join(' ')}
            onMouseDown={e => { e.stopPropagation(); if (!isAlreadyRescued) togglePanel('rescue'); }}
            disabled={isAlreadyRescued}
            title={isAlreadyRescued ? '이미 임시의료소에 있습니다' : '구조 처리'}
          >
            구조
          </button>

          {/* 환자상태 — person 전용 */}
          {victim.kind === 'person' && (
            <button
              className={[
                'vcbm__btn',
                activePanel === 'condition' ? 'vcbm__btn--active' : '',
              ].filter(Boolean).join(' ')}
              onMouseDown={e => { e.stopPropagation(); togglePanel('condition'); }}
            >
              환자상태
            </button>
          )}

          {/* 라벨 변경 — custom 전용 */}
          {victim.kind === 'custom' && (
            <button
              className={[
                'vcbm__btn',
                activePanel === 'label' ? 'vcbm__btn--active' : '',
              ].filter(Boolean).join(' ')}
              onMouseDown={e => { e.stopPropagation(); togglePanel('label'); }}
            >
              라벨
            </button>
          )}

          {/* 메모(세부위치) */}
          <button
            className={[
              'vcbm__btn',
              activePanel === 'note'   ? 'vcbm__btn--active'    : '',
              victim.subLocation       ? 'vcbm__btn--has-note'  : '',
            ].filter(Boolean).join(' ')}
            onMouseDown={e => { e.stopPropagation(); togglePanel('note'); }}
            title={victim.subLocation || '세부위치 입력'}
          >
            {victim.subLocation ? '메모 ✎' : '메모'}
          </button>
        </div>

        {/* 하위 패널 — 위쪽 공간 부족: 기본 바 아래에 표시 */}
        {!layout.openAbove && subPanel}
      </div>
    </>,
    stagePortalTarget(),
  );
}
