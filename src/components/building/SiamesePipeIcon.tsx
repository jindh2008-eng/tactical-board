import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Face } from '../../types';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useActionMode }       from '../../context/ActionModeContext';
import { useHydrantState }     from '../../context/HydrantStateContext';
import { useSettings }         from '../../store/settingsStore';
import { useTokens }           from '../../context/TokenContext';
import '../shared/HydrantIcon.css';   // hi-menu 스타일 공유
import './ExteriorZone.css';

const WATER_SOURCES = new Set(['pump', 'water_tank']);

interface Props { face: Face; }

export function SiamesePipeIcon({ face }: Props) {
  const { connections, addConnection }                             = useWaterConnections();
  const { mode, clearMode }                                        = useActionMode();
  const { getEquipmentMessage, setEquipmentMessage,
          clearEquipmentMessage }                                  = useHydrantState();
  const { unitStatusConfig }                                       = useSettings();
  const { addLog }                                                 = useTokens();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);

  const siameseId      = `siamese-pipe-${face}`;
  const siameseLabel   = `연결송수구(${face}면)`;
  const statusMessages = unitStatusConfig['siamese_pipe'] ?? [];
  const activeMsg      = getEquipmentMessage(siameseId);

  const faceConns = connections.filter(
    c => c.toId === siameseId && c.toType === 'siamese_pipe',
  );
  const connCount = faceConns.length;

  const isTarget =
    mode.type === 'water-connect' &&
    WATER_SOURCES.has(mode.sourceType) &&
    connCount < 2;

  const [menuOpen,  setMenuOpen]  = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    visibility: 'hidden', position: 'fixed', left: 0, top: 0,
  });

  // ── 우클릭 → 메뉴 ───────────────────────────
  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (mode.type !== null) { clearMode(); return; }
    if (statusMessages.length === 0) return;
    setMenuOpen(true);
  }

  // ── 좌클릭 → 연결 ────────────────────────────
  function handleClick(e: React.MouseEvent) {
    if (!isTarget) return;
    e.stopPropagation();
    addConnection(
      mode.sourceId, siameseId,
      mode.sourceType, 'siamese_pipe',
      mode.sourceName, siameseLabel,
    );
    clearMode();
  }

  // ── 상태메시지 선택/해제 (토글) ─────────────
  function handleMessageSelect(msg: string) {
    if (activeMsg === msg) {
      clearEquipmentMessage(siameseId);
    } else {
      setEquipmentMessage(siameseId, msg);
      addLog({
        logType: 'status-tag',
        tokenId: siameseId, tokenName: siameseLabel,
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

  const canInteract = isTarget || (mode.type === null && statusMessages.length > 0);

  return (
    <>
      <div
        ref={wrapperRef}
        className={[
          'siamese-pipe-wrap',
          `siamese-pipe-wrap--${face.toLowerCase()}`,
          isTarget ? 'siamese-pipe-wrap--target' : '',
        ].filter(Boolean).join(' ')}
        data-token-id={siameseId}
        style={{ pointerEvents: canInteract ? 'auto' : 'none' }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title="연결송수구"
      >
        <img
          src="/연결송수구.png"
          alt="연결송수구"
          className="siamese-pipe-img"
          draggable={false}
        />
        {connCount >= 1 && <span className="siamese-port siamese-port--left"  aria-hidden="true" />}
        {connCount >= 2 && <span className="siamese-port siamese-port--right" aria-hidden="true" />}
        {activeMsg && (
          <div className="siamese-pipe-msg equip-status-msg">
            <span className="equip-status-msg__text">{activeMsg}</span>
            <button
              className="equip-status-msg__close"
              onMouseDown={e => { e.stopPropagation(); clearEquipmentMessage(siameseId); }}
              aria-label="메세지 닫기"
            >×</button>
          </div>
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
            <div className="hi-menu__msg-list hi-menu__msg-list--standalone">
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
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
