import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useActionMode }  from '../../context/ActionModeContext';
import { useHydrantState } from '../../context/HydrantStateContext';
import { useSettings }    from '../../store/settingsStore';
import { useTokens }      from '../../context/TokenContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useWaterConnectDrag }  from '../../hooks/useWaterConnectDrag';
import { useDisplayOptions }    from '../../context/DisplayOptionsContext';
import './HydrantIcon.css';
import { stagePortalTarget, stageBounds, rectToStage } from '../../utils/stagePortal';

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
  const { mode, enterMode, clearMode }                                       = useActionMode();
  const { isBroken, toggleBroken, getEquipmentMessage,
          setEquipmentMessage, clearEquipmentMessage }                       = useHydrantState();
  const { unitStatusConfig }                                                 = useSettings();
  const { addLog }                                                           = useTokens();
  const { connections }                                                      = useWaterConnections();
  const { showWaterSupply }                                                  = useDisplayOptions();
  const statusMessages = unitStatusConfig['hydrant'] ?? [];
  const activeMsg      = getEquipmentMessage(id);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);

  const broken   = isBroken(id);
  const isSource = mode.type === 'water-connect' && mode.sourceId === id;

  // 연결·해제 로그·송수 모드에 쓰는 이름 — 설정창 명칭("47호")만으로는 소화전인지
  // 알기 어려워 접미사를 붙인다("47호 소화전"). 아이콘 자체에 붙는 이름표(hydrant-icon__name)는
  // 자리가 좁아 그대로 둔다.
  const logName = `${name} 소화전`;

  // 토출구 2개 — 둘 다 같은 소화전에서 나가므로 최대 연결 수(2)를 공유한다
  const { drag: outletDrag, full: outletsFull } = useWaterConnectDrag({
    fromId: id, fromType: 'hydrant', fromName: logName, disabled: broken,
  });
  const usedOutlets = connections.filter(c => c.fromId === id).length;
  const showOutlets = showWaterSupply && !broken;

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
    enterMode({ type: 'water-connect', sourceId: id, sourceType: 'hydrant', sourceName: logName });
    setMenuOpen(false);
  }

  // ── 소화전고장 토글 ─────────────────────────
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
        tokenId: id, tokenName: name,
        fromZoneId: '', toZoneId: '',
        note: msg,
      });
    }
    setMenuOpen(false);
  }

  // ── 메뉴 위치 계산 ─────────────────────────
  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current || !wrapperRef.current) return;
    const menu   = menuRef.current;
    // 뷰포트 rect → 캔버스 rect. bottom 은 rectToStage 결과에 없으므로 직접 만든다.
    const a0 = rectToStage(wrapperRef.current.getBoundingClientRect());
    const anchor = { ...a0, bottom: a0.top + a0.height };
    // 메뉴는 이제 스테이지(배율) 안의 포털에 그려진다. 그래서 여기 좌표는 전부
    // **캔버스 px** 여야 한다 — offsetWidth 가 곧 캔버스 폭이고, 뷰포트에서 온
    // 앵커는 rectToStage 로, 화면 경계는 stageBounds 로 바꿔 쓴다.
    // → docs/SCREEN_STAGE_PLAN.md §4.1
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    const { width: vw, height: vh } = stageBounds();
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
        data-water-type="hydrant"
        onContextMenu={handleContextMenu}
      >
        <span className="hydrant-icon__name">{name}</span>
        <div className="hydrant-icon__body">
          <img src="/소화전.png" className="hydrant-icon__img" alt="소화전" draggable={false} />
          {/* 좌·우 토출구 — 끌어서 펌프·물탱크에 연결한다 */}
          {showOutlets && [0, 1].map(i => (
            <span
              key={i}
              className={[
                'hydrant-outlet',
                i === 0 ? 'hydrant-outlet--left' : 'hydrant-outlet--right',
                usedOutlets > i ? 'hydrant-outlet--used' : '',
                outletsFull     ? 'hydrant-outlet--full' : '',
              ].filter(Boolean).join(' ')}
              title={outletsFull ? '토출구 2구를 모두 사용 중입니다' : '끌어서 펌프·물탱크에 송수 연결'}
              {...outletDrag}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
        <span className="hydrant-icon__dist">{distanceM}m</span>
        {activeMsg && (
          <div className="hydrant-icon__msg equip-status-msg">
            <span className="equip-status-msg__text">{activeMsg}</span>
            <button
              className="equip-status-msg__close"
              onMouseDown={e => { e.stopPropagation(); clearEquipmentMessage(id); }}
              aria-label="메세지 닫기"
            >×</button>
          </div>
        )}

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
        stagePortalTarget(),
      )}
    </>
  );
}
