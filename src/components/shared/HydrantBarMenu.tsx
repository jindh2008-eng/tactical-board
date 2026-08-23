import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UnitToken } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { useActionMode } from '../../context/ActionModeContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import './HydrantBarMenu.css';
import { stagePortalTarget, stageBounds, rectToStage } from '../../utils/stagePortal';

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface AnchorRect {
  left: number; top: number; right: number; bottom: number;
  width: number; height: number;
}

interface Props {
  token:      UnitToken;
  anchorRect: AnchorRect;
  onClose:    () => void;
}

// ─────────────────────────────────────────────
// HydrantBarMenu
// ─────────────────────────────────────────────

export function HydrantBarMenu({ token, anchorRect, onClose }: Props) {
  const { setStatusTag }                  = useTokens();
  const { enterMode }                     = useActionMode();
  const { connections, removeConnection } = useWaterConnections();

  const menuRef = useRef<HTMLDivElement>(null);

  const isBroken = token.statusTag?.label === '소화전고장';

  // ── 위치 계산 (레이아웃 후 측정) ────────────
  const [style, setStyle] = useState<React.CSSProperties>({
    visibility: 'hidden', position: 'fixed', left: 0, top: 0,
  });

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

    const cx  = anchor.left + anchor.width / 2;
    let left  = Math.round(cx - menuW / 2);
    left      = Math.max(8, Math.min(left, vw - menuW - 8));

    const spaceAbove = anchor.top;
    const spaceBelow = vh - anchor.bottom;
    const top = (spaceAbove >= menuH + GAP || spaceAbove >= spaceBelow)
      ? Math.max(8, anchor.top - menuH - GAP)
      : Math.min(anchor.bottom + GAP, vh - menuH - 8);

    setStyle({ position: 'fixed', left, top, visibility: 'visible' });
  }, [anchorRect]);

  // ── 외부 클릭 / Esc ──────────────────────────
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

  // ── 핸들러 ──────────────────────────────────

  function handleWaterConnect() {
    if (isBroken) return;
    enterMode({ type: 'water-connect', sourceId: token.id, sourceType: token.unitType });
    onClose();
  }

  function handleToggleBroken() {
    if (!isBroken) {
      // 고장 전환: 기존 송수 연결 전부 해제
      connections
        .filter(c => c.fromId === token.id || c.toId === token.id)
        .forEach(c => removeConnection(c.id));
      setStatusTag(token.id, { label: '소화전고장', color: 'red' });
    } else {
      // 고장 해제
      setStatusTag(token.id, null);
    }
    onClose();
  }

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────

  return createPortal(
    <>
      <div className="hbm__backdrop" onMouseDown={onClose} />

      <div
        ref={menuRef}
        className="hbm"
        style={style}
        onContextMenu={e => e.preventDefault()}
      >
        <div className="hbm__bar">
          {/* 1. 송수 */}
          <button
            className={[
              'hbm__btn',
              'hbm__btn--water',
              isBroken ? 'hbm__btn--water-disabled' : '',
            ].filter(Boolean).join(' ')}
            onMouseDown={e => { e.stopPropagation(); handleWaterConnect(); }}
            title={isBroken ? '고장 상태에서는 송수 불가' : '송수 연결 대상을 클릭하세요'}
          >
            송수
          </button>

          <div className="hbm__sep" aria-hidden="true" />

          {/* 2. 소화전고장 */}
          <button
            className={[
              'hbm__btn',
              'hbm__btn--broken',
              isBroken ? 'hbm__btn--broken-active' : '',
            ].filter(Boolean).join(' ')}
            onMouseDown={e => { e.stopPropagation(); handleToggleBroken(); }}
            title={isBroken ? '고장 해제' : '소화전 고장 처리'}
          >
            {isBroken ? '고장 해제' : '소화전고장'}
          </button>
        </div>
      </div>
    </>,
    stagePortalTarget(),
  );
}
