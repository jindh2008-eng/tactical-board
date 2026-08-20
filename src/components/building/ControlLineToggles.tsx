import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Face, UnitToken } from '../../types';
import { useFireLine } from '../../context/FireLineContext';
import { useTokens } from '../../context/TokenContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useSettings } from '../../store/settingsStore';
import { logDragEvent } from '../../utils/dragDiagnostics';
import '../shared/HydrantIcon.css';   // hi-menu 스타일 공유
import './ExteriorZone.css';

/**
 * ControlLineToggles — 소방통제선·경찰통제선·연결송수구 설치 버튼 묶음.
 *
 * 원래 통제선 두 개는 A면 좌측 상단·하단 코너에 흩어져 있었는데(2026-08-18),
 * 연결송수구가 더해지면서 B면 상단에 세로로 모았다(2026-08-20).
 * 통제선 띠(ControlLine)를 그리는 쪽은 여전히 A면(ExteriorZone)이다 —
 * 이 컴포넌트는 설치 상태를 켜고 끄는 조작부만 담당한다.
 *
 * 조작 방식(2026-08-20 드롭다운 추가):
 * · 소방/경찰통제선 — 좌클릭은 그대로 단순 토글. 우클릭(또는 태블릿 롱프레스)하면
 *   A~D면에 배치된 출동대 목록이 뜨고, 고르면 "누가 설치했는지"가 버튼 옆에 텍스트로 남는다.
 *   경찰통제선은 목록 자체가 라벨 "경찰"인 출동대만 담는다 — 다른 출동대는 드롭으로도 설치 못한다.
 * · 연결송수구 — 토글 개념이 없다. 좌클릭하면 A~D면의 펌프·물탱크 목록이 뜨고,
 *   고른 차량이 실제 송수 연결(WaterConnectionContext)로 이어진다. 활성 여부·표시 이름 모두
 *   이 연결 목록에서 그대로 파생된다 — 버튼 자체는 상태를 갖지 않는다.
 */

/** SiamesePipeIcon 이 쓰는 것과 같은 식별자 — 연결송수구는 건물에 하나뿐이다 */
const SIAMESE_ID   = 'siamese-pipe';
const SIAMESE_TYPE = 'siamese_pipe';

const WATER_SOURCES = new Set(['pump', 'water_tank']);
const FACE_ORDER: Face[] = ['A', 'B', 'C', 'D'];

/** 경찰통제선을 설치할 수 있는 출동대 판별 — 유관기관 프리셋 "경찰"은 번호 없이 이 라벨 그대로 생성된다 */
function isPoliceUnit(token: UnitToken): boolean {
  return token.label === '경찰';
}

function unitTypeOrder(token: UnitToken): number {
  return token.unitType === 'pump' ? 0 : 1;
}

/** 특정 방면(A~D)에 배치된 토큰만 골라 방면 순서대로 그룹핑한다 */
function groupByFace(candidates: UnitToken[]): { face: Face; tokens: UnitToken[] }[] {
  return FACE_ORDER
    .map(face => ({ face, tokens: candidates.filter(t => t.zoneKey === `face-${face}`) }))
    .filter(g => g.tokens.length > 0);
}

// ─────────────────────────────────────────────
// 드롭다운 메뉴 — 방면별 그룹 목록에서 담당 출동대를 고른다
// ─────────────────────────────────────────────

interface MenuOption {
  key:      string;
  label:    string;
  active?:  boolean;
  disabled?: boolean;
  onSelect: () => void;
}
interface MenuGroup {
  heading: string;
  options: MenuOption[];
}

function InstallerMenu({
  anchorRef, onClose, groups, emptyText, topOption,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose:   () => void;
  groups:    MenuGroup[];
  emptyText: string;
  topOption?: MenuOption | null;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    visibility: 'hidden', position: 'fixed', left: 0, top: 0,
  });

  const optionCount = groups.reduce((n, g) => n + g.options.length, 0);

  // ── 메뉴 위치 계산 — SiamesePipeIcon 의 컨텍스트 메뉴와 같은 방식 ──
  useLayoutEffect(() => {
    const menu   = menuRef.current;
    const anchor = anchorRef.current;
    if (!menu || !anchor) return;
    const anchorRect = anchor.getBoundingClientRect();
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    const vw    = window.innerWidth;
    const vh    = window.innerHeight;
    const GAP   = 6;

    const cx  = anchorRect.left + anchorRect.width / 2;
    let left  = Math.round(cx - menuW / 2);
    left      = Math.max(8, Math.min(left, vw - menuW - 8));

    const spaceAbove = anchorRect.top;
    const spaceBelow = vh - anchorRect.bottom;
    const top = (spaceAbove >= menuH + GAP || spaceAbove >= spaceBelow)
      ? Math.max(8, anchorRect.top - menuH - GAP)
      : Math.min(anchorRect.bottom + GAP, vh - menuH - 8);

    setMenuStyle({ position: 'fixed', left, top, visibility: 'visible' });
  }, [anchorRef, optionCount]);

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

  return createPortal(
    <>
      <div className="hi-menu__backdrop" onMouseDown={onClose} />
      <div
        ref={menuRef}
        className="hi-menu"
        style={menuStyle}
        onContextMenu={e => e.preventDefault()}
      >
        <div className="hi-menu__msg-list hi-menu__msg-list--standalone">
          {topOption && (
            <button
              className="hi-menu__msg-btn"
              onMouseDown={e => { e.stopPropagation(); topOption.onSelect(); }}
            >
              {topOption.label}
            </button>
          )}
          {topOption && optionCount > 0 && <div className="hi-menu__section-sep" />}
          {optionCount === 0 && <div className="ctrl-line-menu__empty">{emptyText}</div>}
          {groups.map(group => (
            <div key={group.heading} className="ctrl-line-menu__group">
              <div className="ctrl-line-menu__group-label">{group.heading}</div>
              {group.options.map(opt => (
                <button
                  key={opt.key}
                  className={[
                    'hi-menu__msg-btn',
                    opt.active   ? 'hi-menu__msg-btn--active'        : '',
                    opt.disabled ? 'ctrl-line-menu__msg-btn--disabled' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={opt.disabled}
                  onMouseDown={e => { e.stopPropagation(); if (!opt.disabled) opt.onSelect(); }}
                >
                  {opt.active ? `✓ ${opt.label}` : opt.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─────────────────────────────────────────────
// ControlLineToggles
// ─────────────────────────────────────────────

type OpenMenu = 'fire' | 'police' | 'siamese' | null;

export function ControlLineToggles() {
  const {
    showFireLine, setFireLine,
    showPoliceLine, setPoliceLine,
    fireLineInstaller, setFireLineInstaller,
    policeLineInstaller, setPoliceLineInstaller,
  } = useFireLine();
  const { tokens, addLog }                        = useTokens();
  const { connections, addConnection, removeConnection } = useWaterConnections();
  // 설정(BuildingConfigPanel)의 "연결송수구 표시" 체크를 꺼 두면 버튼 자체가 없다 —
  // 건물에 연결송수구 설비가 없다는 뜻이라 조작할 대상도 없는 셈이다.
  const { building } = useSettings();
  const hasSiamesePipe = building.hasSiamesePipe ?? false;

  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const fireBtnRef    = useRef<HTMLButtonElement>(null);
  const policeBtnRef  = useRef<HTMLButtonElement>(null);
  const siameseBtnRef = useRef<HTMLButtonElement>(null);

  // ── 연결송수구에 물린 급수원 — 활성 여부·표시 이름 모두 이 목록에서 파생된다 ──
  const siameseSourceIds = connections
    .filter(c => c.toId === SIAMESE_ID && c.toType === SIAMESE_TYPE)
    .map(c => c.fromId);
  const siameseActive = siameseSourceIds.length > 0;
  const siameseNames  = siameseSourceIds.map(id => tokens.find(t => t.id === id)?.label ?? id);

  /** 급수원 목록을 문자열 하나로 눌러 효과 비교에 쓴다(배열은 매 렌더 새로 만들어진다) */
  const sourceKey = siameseSourceIds.join('|');
  // 마운트 시점 값으로 초기화한다 — 세션에서 복원된 연결까지 다시 로그로 남기지 않기 위함
  const prevSourceKeyRef = useRef(sourceKey);

  useEffect(() => {
    const prev = prevSourceKeyRef.current;
    if (sourceKey === prev) return;
    prevSourceKeyRef.current = sourceKey;

    const prevIds = new Set(prev ? prev.split('|') : []);
    const nowIds  = sourceKey ? sourceKey.split('|') : [];
    // 새로 물린 급수원이 있을 때만 점령 로그를 남긴다(해제는 water-relay 로그가 이미 남긴다)
    if (!nowIds.some(id => !prevIds.has(id))) return;

    // 지금 물려 있는 급수원을 전부 나열한다 — "00펌프, 00물탱크 연결송수구 점령"
    const names = nowIds.map(id => tokens.find(t => t.id === id)?.label ?? id);
    addLog({
      logType:    'status-tag',
      tokenId:    SIAMESE_ID,
      tokenName:  names.join(', '),
      fromZoneId: '',
      toZoneId:   '',
      note:       '연결송수구 점령',
    });
  }, [sourceKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── 로그 ────────────────────────────────────────────────────
  /** 통제선 로그 한 줄. 담당 출동대가 있으면 그 이름으로, 없으면 설비 이름으로 남긴다. */
  function logLine(name: string, action: '설치' | '해제', token?: UnitToken) {
    addLog({
      logType:    'status-tag',
      tokenId:    token?.id    ?? name,
      tokenName:  token?.label ?? name,
      tokenColor: token?.color,
      fromZoneId: '',
      toZoneId:   '',
      note:       token ? `${name} ${action}` : action,
    });
  }

  // ── 좌클릭 — 단순 토글(담당 출동대 지정 없음) ────────────────
  function handleFireLineClick() {
    const next = !showFireLine;
    setFireLine(next);
    if (!next) setFireLineInstaller(null);
    logLine('소방통제선', next ? '설치' : '해제');
  }

  function handlePoliceLineClick() {
    const next = !showPoliceLine;
    setPoliceLine(next);
    if (!next) setPoliceLineInstaller(null);
    logLine('경찰통제선', next ? '설치' : '해제');
  }

  // ── 우클릭 — 담당 출동대 드롭다운 ─────────────────────────────
  function selectFireInstaller(token: UnitToken) {
    if (fireLineInstaller === token.label) {
      setFireLine(false);
      setFireLineInstaller(null);
      logLine('소방통제선', '해제', token);
    } else {
      setFireLine(true);
      setFireLineInstaller(token.label);
      logLine('소방통제선', '설치', token);
    }
    setOpenMenu(null);
  }

  function selectPoliceInstaller(token: UnitToken) {
    if (!isPoliceUnit(token)) return;   // 방어적 — 목록 자체가 이미 걸러져 있다
    if (policeLineInstaller === token.label) {
      setPoliceLine(false);
      setPoliceLineInstaller(null);
      logLine('경찰통제선', '해제', token);
    } else {
      setPoliceLine(true);
      setPoliceLineInstaller(token.label);
      logLine('경찰통제선', '설치', token);
    }
    setOpenMenu(null);
  }

  function selectSiameseSource(token: UnitToken) {
    const existing = connections.find(
      c => c.fromId === token.id && c.toId === SIAMESE_ID && c.toType === SIAMESE_TYPE,
    );
    if (existing) {
      removeConnection(existing.id);
    } else if (siameseSourceIds.length < 2) {
      addConnection(token.id, SIAMESE_ID, token.unitType, SIAMESE_TYPE, token.label, '연결송수구');
    }
    setOpenMenu(null);
  }

  // ── 출동대 드롭 → 설치 기록 ─────────────────────────────────
  // 버튼은 방면 드롭존(.face-general-zone) 바깥이라 서로 겹치지 않는다.
  // 토큰은 옮기지 않는다 — 설치했다는 기록만 남긴다.
  function handleDragOver(e: React.DragEvent<HTMLButtonElement>) {
    if (!e.dataTransfer.types.includes('tokenid') && !e.dataTransfer.types.includes('tokenId')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }

  /** 드롭된 출동대를 찾아 넘긴다. 없으면 아무 일도 하지 않는다 */
  function withDroppedToken(e: React.DragEvent<HTMLButtonElement>, run: (token: UnitToken) => void) {
    const tokenId = e.dataTransfer.getData('tokenId');
    if (!tokenId) return;
    e.preventDefault();
    e.stopPropagation();
    const token = tokens.find(t => t.id === tokenId);
    if (!token) return;
    run(token);
  }

  function handleFireLineDrop(e: React.DragEvent<HTMLButtonElement>) {
    withDroppedToken(e, token => {
      setFireLine(true);
      setFireLineInstaller(token.label);
      logLine('소방통제선', '설치', token);
      logDragEvent('FireLine install', `${token.label}`);
    });
  }

  function handlePoliceLineDrop(e: React.DragEvent<HTMLButtonElement>) {
    withDroppedToken(e, token => {
      if (!isPoliceUnit(token)) {
        logDragEvent('PoliceLine install rejected', `${token.label} 은 경찰이 아님`);
        return;
      }
      setPoliceLine(true);
      setPoliceLineInstaller(token.label);
      logLine('경찰통제선', '설치', token);
      logDragEvent('PoliceLine install', `${token.label}`);
    });
  }

  function handleSiameseDrop(e: React.DragEvent<HTMLButtonElement>) {
    withDroppedToken(e, token => {
      if (!WATER_SOURCES.has(token.unitType)) return;
      const already = connections.some(
        c => c.fromId === token.id && c.toId === SIAMESE_ID && c.toType === SIAMESE_TYPE,
      );
      if (already || siameseSourceIds.length >= 2) return;
      addConnection(token.id, SIAMESE_ID, token.unitType, SIAMESE_TYPE, token.label, '연결송수구');
      logDragEvent('SiamesePipe connect', `${token.label}`);
    });
  }

  // ── 방면별 후보 목록 ──────────────────────────────────────────
  const faceDeployed = (t: UnitToken) => t.zoneKey === 'face-A' || t.zoneKey === 'face-B'
    || t.zoneKey === 'face-C' || t.zoneKey === 'face-D';

  const fireGroups = groupByFace(tokens.filter(faceDeployed));
  const policeGroups = groupByFace(tokens.filter(t => faceDeployed(t) && isPoliceUnit(t)));
  const siameseGroups = groupByFace(
    tokens
      .filter(t => faceDeployed(t) && WATER_SOURCES.has(t.unitType))
      .sort((a, b) => unitTypeOrder(a) - unitTypeOrder(b) || a.label.localeCompare(b.label, 'ko')),
  );

  const fireTopOption: MenuOption | null = showFireLine ? {
    key: 'fire-clear', label: '해제 (담당 미지정)',
    onSelect: () => {
      setFireLine(false);
      setFireLineInstaller(null);
      logLine('소방통제선', '해제');
      setOpenMenu(null);
    },
  } : null;

  const policeTopOption: MenuOption | null = showPoliceLine ? {
    key: 'police-clear', label: '해제 (담당 미지정)',
    onSelect: () => {
      setPoliceLine(false);
      setPoliceLineInstaller(null);
      logLine('경찰통제선', '해제');
      setOpenMenu(null);
    },
  } : null;

  const MENU_TITLE = '클릭 — 표시 전환 · 우클릭 — 담당 출동대 선택 · 출동대를 끌어다 놓으면 설치 기록';

  return (
    <div className="ctrl-line-toggles">
      <div className="ctrl-line-toggle-row">
        <button
          ref={fireBtnRef}
          className={`ctrl-line-toggle ctrl-line-toggle--fire${showFireLine ? ' ctrl-line-toggle--fire-active' : ''}`}
          onClick={handleFireLineClick}
          onContextMenu={e => { e.preventDefault(); setOpenMenu('fire'); }}
          data-touch-drop-target="true"
          onDragOver={handleDragOver}
          onDrop={handleFireLineDrop}
          title={MENU_TITLE}
        >
          소방통제선
        </button>
        {fireLineInstaller && <span className="ctrl-line-toggle__installer ctrl-line-toggle__installer--fire">{fireLineInstaller}</span>}
      </div>

      <div className="ctrl-line-toggle-row">
        <button
          ref={policeBtnRef}
          className={`ctrl-line-toggle ctrl-line-toggle--police${showPoliceLine ? ' ctrl-line-toggle--police-active' : ''}`}
          onClick={handlePoliceLineClick}
          onContextMenu={e => { e.preventDefault(); setOpenMenu('police'); }}
          data-touch-drop-target="true"
          onDragOver={handleDragOver}
          onDrop={handlePoliceLineDrop}
          title={MENU_TITLE}
        >
          경찰통제선
        </button>
        {policeLineInstaller && <span className="ctrl-line-toggle__installer ctrl-line-toggle__installer--police">{policeLineInstaller}</span>}
      </div>

      {/* 설정에서 "연결송수구 표시"를 껐으면 건물에 그 설비 자체가 없다는 뜻 — 버튼도 없앤다 */}
      {hasSiamesePipe && (
        <div className="ctrl-line-toggle-row">
          <button
            ref={siameseBtnRef}
            className={`ctrl-line-toggle ctrl-line-toggle--siamese${siameseActive ? ' ctrl-line-toggle--siamese-active' : ''}`}
            onClick={() => setOpenMenu('siamese')}
            onContextMenu={e => { e.preventDefault(); setOpenMenu('siamese'); }}
            data-touch-drop-target="true"
            onDragOver={handleDragOver}
            onDrop={handleSiameseDrop}
            title="클릭 — 연결할 펌프·물탱크 선택 · 출동대를 끌어다 놓아도 연결된다"
          >
            연결송수구
          </button>
          {siameseNames.length > 0 && <span className="ctrl-line-toggle__installer ctrl-line-toggle__installer--siamese">{siameseNames.join(', ')}</span>}
        </div>
      )}

      {openMenu === 'fire' && (
        <InstallerMenu
          anchorRef={fireBtnRef}
          onClose={() => setOpenMenu(null)}
          emptyText="A~D면에 배치된 출동대가 없습니다"
          topOption={fireTopOption}
          groups={fireGroups.map(g => ({
            heading: `${g.face}면`,
            options: g.tokens.map(t => ({
              key: t.id, label: t.label,
              active: fireLineInstaller === t.label,
              onSelect: () => selectFireInstaller(t),
            })),
          }))}
        />
      )}

      {openMenu === 'police' && (
        <InstallerMenu
          anchorRef={policeBtnRef}
          onClose={() => setOpenMenu(null)}
          emptyText="A~D면에 배치된 경찰이 없습니다"
          topOption={policeTopOption}
          groups={policeGroups.map(g => ({
            heading: `${g.face}면`,
            options: g.tokens.map(t => ({
              key: t.id, label: t.label,
              active: policeLineInstaller === t.label,
              onSelect: () => selectPoliceInstaller(t),
            })),
          }))}
        />
      )}

      {hasSiamesePipe && openMenu === 'siamese' && (
        <InstallerMenu
          anchorRef={siameseBtnRef}
          onClose={() => setOpenMenu(null)}
          emptyText="A~D면에 배치된 펌프·물탱크가 없습니다"
          groups={siameseGroups.map(g => ({
            heading: `${g.face}면`,
            options: g.tokens.map(t => {
              const isConnected = siameseSourceIds.includes(t.id);
              return {
                key: t.id, label: t.label,
                active:   isConnected,
                disabled: !isConnected && siameseSourceIds.length >= 2,
                onSelect: () => selectSiameseSource(t),
              };
            }),
          }))}
        />
      )}
    </div>
  );
}
