import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useActionMode }  from '../../context/ActionModeContext';
import { useHydrantState } from '../../context/HydrantStateContext';
import './HydrantIcon.css';

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface Props {
  id:        string;   // hydrantSetup item id — data-token-id 기준
  name:      string;
  distanceM: number;
}

// ─────────────────────────────────────────────
// HydrantIcon
// ─────────────────────────────────────────────

export function HydrantIcon({ id, name, distanceM }: Props) {
  const { mode, enterMode, clearMode } = useActionMode();
  const { isBroken, toggleBroken }     = useHydrantState();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);

  const broken   = isBroken(id);
  const isSource = mode.type === 'water-connect' && mode.sourceId === id;

  const [menuOpen,  setMenuOpen]  = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    visibility: 'hidden', position: 'fixed', left: 0, top: 0,
  });

  // ── 우클릭 핸들러 ──────────────────────────
  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (mode.type !== null) { clearMode(); return; }
    setMenuOpen(true);
  }

  // ── 송수 연결 모드 진입 ──────────────────────
  function handleWaterConnect() {
    if (broken) return;
    enterMode({ type: 'water-connect', sourceId: id, sourceType: 'hydrant' });
    setMenuOpen(false);
  }

  // ── 소화전고장 토글 ─────────────────────────
  function handleToggleBroken() {
    toggleBroken(id);
    setMenuOpen(false);
  }

  // ── 메뉴 위치 계산 ─────────────────────────
  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current || !wrapperRef.current) return;
    const menu   = menuRef.current;
    const anchor = wrapperRef.current.getBoundingClientRect();
    const menuW  = menu.offsetWidth;
    const menuH  = menu.offsetHeight;
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    const GAP    = 6;

    const cx  = anchor.left + anchor.width / 2;
    let left  = Math.round(cx - menuW / 2);
    left      = Math.max(8, Math.min(left, vw - menuW - 8));

    const spaceAbove = anchor.top;
    const spaceBelow = vh - anchor.bottom;
    const top = (spaceAbove >= menuH + GAP || spaceAbove >= spaceBelow)
      ? Math.max(8, anchor.top - menuH - GAP)
      : Math.min(anchor.bottom + GAP, vh - menuH - 8);

    setMenuStyle({ position: 'fixed', left, top, visibility: 'visible' });
  }, [menuOpen]);

  // ── 외부 클릭·ESC → 메뉴 닫기 ─────────────
  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown',   onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown',   onKeyDown);
    };
  }, [menuOpen]);

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────

  return (
    <>
      <div
        ref={wrapperRef}
        className={[
          'hydrant-icon',
          broken   ? 'hydrant-icon--broken' : '',
          isSource ? 'hydrant-icon--source' : '',
        ].filter(Boolean).join(' ')}
        data-token-id={id}
        onContextMenu={handleContextMenu}
      >
        <span className="hydrant-icon__name">{name}</span>
        <img src="/소화전.png" className="hydrant-icon__img" alt="소화전" draggable={false} />
        <span className="hydrant-icon__dist">{distanceM}m</span>

        {/* 송수연결 소스 펄스 링 */}
        {isSource && <div className="hydrant-icon__pulse-ring" aria-hidden="true" />}
      </div>

      {/* ── 우클릭 컨텍스트 메뉴 ── */}
      {menuOpen && createPortal(
        <>
          <div className="hi-menu__backdrop" onMouseDown={() => setMenuOpen(false)} />
          <div
            ref={menuRef}
            className="hi-menu"
            style={menuStyle}
            onContextMenu={e => e.preventDefault()}
          >
            <div className="hi-menu__bar">
              {/* 송수 */}
              <button
                className={[
                  'hi-menu__btn',
                  'hi-menu__btn--water',
                  broken ? 'hi-menu__btn--disabled' : '',
                ].filter(Boolean).join(' ')}
                onMouseDown={e => { e.stopPropagation(); handleWaterConnect(); }}
                title={broken ? '고장 상태에서는 송수 불가' : '송수 연결 대상을 클릭하세요'}
              >
                송수
              </button>

              <div className="hi-menu__sep" aria-hidden="true" />

              {/* 소화전고장 */}
              <button
                className={[
                  'hi-menu__btn',
                  'hi-menu__btn--broken',
                  broken ? 'hi-menu__btn--broken-active' : '',
                ].filter(Boolean).join(' ')}
                onMouseDown={e => { e.stopPropagation(); handleToggleBroken(); }}
                title={broken ? '고장 해제' : '소화전 고장 처리'}
              >
                {broken ? '고장 해제' : '소화전고장'}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
