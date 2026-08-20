import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useActionMode }       from '../../context/ActionModeContext';
import { useHydrantState }     from '../../context/HydrantStateContext';
import { useSettings }         from '../../store/settingsStore';
import { useTokens }           from '../../context/TokenContext';
import { useWaterConnectDrag }  from '../../hooks/useWaterConnectDrag';
import { useDisplayOptions }    from '../../context/DisplayOptionsContext';
import '../shared/HydrantIcon.css';  // hi-menu 스타일 + hi-pulse 키프레임 공유
import './IndoorHydrantIcon.css';

function floorLabel(floorId: string): string {
  if (floorId === 'RF') return '옥상';
  const n = parseInt(floorId, 10);
  if (isNaN(n)) return floorId;
  return n < 0 ? `지하${Math.abs(n)}층` : `${n}층`;
}

// ─────────────────────────────────────────────
// IndoorHydrantIcon
// ─────────────────────────────────────────────

interface Props { floorId: string; }

export function IndoorHydrantIcon({ floorId }: Props) {
  const id = `indoor-hydrant-${floorId}`;
  const label = `옥내소화전(${floorLabel(floorId)})`;

  const { mode, enterMode, clearMode }                                       = useActionMode();
  const { isBroken, toggleBroken, getEquipmentMessage,
          setEquipmentMessage, clearEquipmentMessage }                       = useHydrantState();
  const { unitStatusConfig }                                                 = useSettings();
  const { addLog }                                                           = useTokens();
  const statusMessages = unitStatusConfig['indoor_hydrant'] ?? [];
  const activeMsg      = getEquipmentMessage(id);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);

  const broken   = isBroken(id);
  const isSource = mode.type === 'water-connect' && mode.sourceId === id;

  const { showWaterSupply } = useDisplayOptions();
  // 옥내소화전은 토출구를 따로 그릴 자리가 없어 아이콘 전체가 손잡이다
  const { drag } = useWaterConnectDrag({
    fromId: id, fromType: 'indoor_hydrant', fromName: label, disabled: broken,
  });
  const dragEnabled = showWaterSupply && !broken && mode.type === null;

  const [menuOpen,  setMenuOpen]  = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    visibility: 'hidden', position: 'fixed', left: 0, top: 0,
  });

  // ── 우클릭 → 메뉴 ────────────────────────────
  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (mode.type !== null) { clearMode(); return; }
    setMenuOpen(true);
  }

  // ── 송수 연결 모드 진입 ───────────────────────
  function handleWaterConnect() {
    if (broken) return;
    enterMode({ type: 'water-connect', sourceId: id, sourceType: 'indoor_hydrant', sourceName: label });
    setMenuOpen(false);
  }

  // ── 소화전고장 토글 ──────────────────────────
  function handleToggleBroken() {
    toggleBroken(id);
    setMenuOpen(false);
  }

  // ── 상태메시지 선택/해제 (토글) ─────────────
  function handleMessageSelect(msg: string) {
    if (activeMsg === msg) {
      clearEquipmentMessage(id);
    } else {
      setEquipmentMessage(id, msg);
      addLog({
        logType: 'status-tag',
        tokenId: id, tokenName: label,
        fromZoneId: '', toZoneId: '',
        note: msg,
      });
    }
    setMenuOpen(false);
  }

  // ── 메뉴 위치 계산 ───────────────────────────
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

  // ── 외부 클릭·ESC → 메뉴 닫기 ──────────────
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
          'indoor-hydrant-icon',
          broken   ? 'indoor-hydrant-icon--broken' : '',
          isSource ? 'indoor-hydrant-icon--source' : '',
          dragEnabled ? 'indoor-hydrant-icon--draggable' : '',
        ].filter(Boolean).join(' ')}
        data-token-id={id}
        data-water-type="indoor_hydrant"
        style={{ pointerEvents: mode.type === null ? 'auto' : 'none' }}
        {...(dragEnabled ? drag : {})}
        onContextMenu={handleContextMenu}
      >
        <img
          src="/옥내소화전_미작동.png"
          alt="옥내소화전"
          className="indoor-hydrant-icon__img"
          draggable={false}
        />
        {activeMsg && (
          <div className="indoor-hydrant-icon__msg equip-status-msg">
            <span className="equip-status-msg__text">{activeMsg}</span>
            <button
              className="equip-status-msg__close"
              onMouseDown={e => { e.stopPropagation(); clearEquipmentMessage(id); }}
              aria-label="메세지 닫기"
            >×</button>
          </div>
        )}

        {/* 송수연결 소스 펄스 링 */}
        {isSource && (
          <div className="indoor-hydrant-icon__pulse-ring" aria-hidden="true" />
        )}
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

            {/* 상태메시지 목록 */}
            {statusMessages.length > 0 && (
              <>
                <div className="hi-menu__section-sep" />
                <div className="hi-menu__msg-list">
                  {statusMessages.map((msg, i) => (
                    <button
                      key={i}
                      className={[
                        'hi-menu__msg-btn',
                        activeMsg === msg ? 'hi-menu__msg-btn--active' : '',
                      ].filter(Boolean).join(' ')}
                      onMouseDown={e => { e.stopPropagation(); handleMessageSelect(msg); }}
                    >{activeMsg === msg ? `✓ ${msg}` : msg}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
