import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { TokenPos } from '../../context/TokenContext';
import { useTokens } from '../../context/TokenContext';
import { useActionMode } from '../../context/ActionModeContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useVictims } from '../../context/VictimContext';
import type { UnitToken } from '../../types';
import { PRESET_COLORS } from '../../types/presets';
import { secsToMmss } from '../../utils/dispatchRoster';
import { setDragGrabOffset } from '../../utils/dragDrop';
import { logDragEvent } from '../../utils/dragDiagnostics';
import { useWaterLevel }       from '../../context/WaterLevelContext';
import { useDisplayOptions }   from '../../context/DisplayOptionsContext';
import { useSettings }         from '../../store/settingsStore';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import { isOnTacticalBoard, isOnBuildingFace } from '../../utils/tokenHandles';
import { useWaterConnectDrag } from '../../hooks/useWaterConnectDrag';
import { VictimCard }       from './VictimCard';
import { NozzleHandle }     from './NozzleHandle';
import { LadderHandle }     from './LadderHandle';
import { UnitStatusBarMenu } from './UnitStatusBarMenu';
import { HydrantBarMenu }    from './HydrantBarMenu';
import './TokenCard.css';
import { stagePortalTarget, rectToStage } from '../../utils/stagePortal';

// ── 수량 게이지 바 ───────────────────────────

const WATER_UNIT_TYPES  = new Set(['pump', 'water_tank']);
const AERIAL_UNIT_TYPES = new Set(['aerial', 'ladder']);
// 관창(진압·구조) + 방수포(펌프·물탱크) — 둘 다 우측 상단 방수 핸들을 쓴다
const SPRAY_HANDLE_TYPES = new Set(['suppression', 'rescue', 'pump', 'water_tank']);

function WaterGauge({ levelL, capacityL, token, draggable, showLevel }: {
  levelL: number; capacityL: number; token: UnitToken; draggable: boolean;
  /**
   * 잔량 **수치**를 보일 것인가.
   *
   * 설정에서 실시간 계산을 끄면 잔량이 줄지 않아 늘 100 이다. 안 변하는 100 은
   * 정보가 아니라 잡음이라 숫자만 숨긴다.
   *
   * 채움 막대는 끄지 않는다 — 파란 게이지가 있어야 이 네모가 물탱크의 수량
   * 칸으로 읽힌다. 비면 빈 상자가 되어 무엇인지 알 수 없고, 이 네모는 곧
   * 송수 연결을 끌어 잡는 손잡이라(아래 useWaterConnectDrag) 눈에 띄어야 한다.
   */
  showLevel: boolean;
}) {
  const pct       = capacityL > 0 ? Math.max(0, Math.min(1, levelL / capacityL)) : 0;
  const pctInt    = Math.round(pct * 100);
  const isLow     = pct < 0.5;
  const fillColor = isLow ? '#d94040' : '#2a8fd4';

  // 게이지 자체가 송수 연결의 손잡이다 — 끌어서 받을 대상에 놓는다
  const { drag } = useWaterConnectDrag({
    fromId:   token.id,
    fromType: token.unitType,
    disabled: !draggable || token.statusTag?.label === '펌프고장',
  });

  const amount = `${Math.round(levelL).toLocaleString()}L / ${capacityL.toLocaleString()}L`;

  return (
    <div
      className={`water-gauge${draggable ? ' water-gauge--draggable' : ''}`}
      title={[showLevel ? amount : '', draggable ? '끌어서 송수 연결' : '']
        .filter(Boolean).join(' — ')}
      {...(draggable ? drag : {})}
    >
      {/* 채움 바 — 아래에서 위로. 실시간 계산을 꺼도 그린다(늘 만수위) */}
      <div
        className="water-gauge__fill"
        style={{ height: `${pct * 100}%`, background: fillColor }}
      />
      {/* 25% 단위 구분선 3개 */}
      {[25, 50, 75].map(p => (
        <div key={p} className="water-gauge__divider" style={{ bottom: `${p}%` }} />
      ))}
      {/* 퍼센트 수치 — 실시간 계산을 끄면 늘 100 이라 숨긴다 */}
      {showLevel && <span className="water-gauge__pct">{pctInt}</span>}
    </div>
  );
}

// ── statusTag 색상 (컴포넌트 외부 상수로 이동) ──────────
const STATUS_TAG_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue:   { bg: '#0d1e3a', border: '#2255aa', text: '#88bbff' },
  yellow: { bg: '#2a1e00', border: '#aa7700', text: '#ffcc44' },
  red:    { bg: '#2a0808', border: '#aa2222', text: '#ff7777' },
  green:  { bg: '#0a1e10', border: '#228844', text: '#55cc88' },
  white:  { bg: '#1e1e22', border: '#888888', text: '#dddddd' },
};

interface Props {
  token:     UnitToken;
  absPos?:   TokenPos;
  selectMode?:     boolean;
  selected?:       boolean;
  onToggleSelect?: () => void;
  onDoubleClick?:  () => void; // 대기 패널 간 더블클릭 이동용
}

export function TokenCard({ token, absPos, selectMode, selected, onToggleSelect, onDoubleClick }: Props) {
  const { mode, clearMode }        = useActionMode();
  const { addConnection, connections } = useWaterConnections();
  const waterLevel                 = useWaterLevel();
  const { showWaterSupply }        = useDisplayOptions();

  const [barMenu,      setBarMenu]      = useState<{
    left: number; top: number; right: number; bottom: number; width: number; height: number;
  } | null>(null);
  const [isRecent,     setIsRecent]     = useState(false);
  // 뷰포트 상단 근접 시 오버레이를 아래쪽으로 전환 (좌표 추적 없이 boolean만)
  const [overlayBelow, setOverlayBelow] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 이동 직후 2초 동안 강조
  useEffect(() => {
    if (!token.lastMovedAt) return;
    const elapsed = Date.now() - token.lastMovedAt;
    if (elapsed >= 2000) return;
    setIsRecent(true);
    const timer = setTimeout(() => setIsRecent(false), 2000 - elapsed);
    return () => clearTimeout(timer);
  }, [token.lastMovedAt]);

  // 위치 변경 후 오버레이 방향 재측정 (DOM 업데이트 이후 실행)
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setOverlayBelow(rect.top < 72);
  }, [absPos?.x, absPos?.y]);

  // ── ActionMode 상태 분류 ──────────────────────
  const isSource = mode.type !== null &&
    'sourceId' in mode && mode.sourceId === token.id;
  const isInMode = mode.type !== null && !isSource && mode.type !== 'water-connect';

  // ── 이벤트 핸들러 ────────────────────────────

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    if (mode.type !== null) {
      logDragEvent('TokenCard dragstart blocked', `token=${token.label} mode=${mode.type}`);
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('tokenId', token.id);
    setDragGrabOffset(e);
    e.dataTransfer.effectAllowed = 'move';
    setBarMenu(null);
    if (wrapperRef.current) wrapperRef.current.dataset.dragging = 'true';
    logDragEvent('TokenCard dragstart', `token=${token.label} id=${token.id}`);
  }

  function handleDragEnd() {
    if (wrapperRef.current) delete wrapperRef.current.dataset.dragging;
    logDragEvent('TokenCard dragend', token.label);
  }

  const touchDrag = useTouchDrag({
    enabled: mode.type === null && !selectMode,
    payload: { tokenId: token.id },
    dragElementRef: wrapperRef,
    onDragStart: () => {
      setBarMenu(null);
      logDragEvent('TokenCard touch dragstart', `token=${token.label} id=${token.id}`);
    },
    onDragEnd: () => logDragEvent('TokenCard touch dragend', token.label),
  });

  // ── 구조대상자를 출동대 위에 드롭 → 이송 연결 ──────────────────────
  // 연결되면 이 출동대가 구역을 옮길 때마다 따라 움직이고(VictimContext),
  // 임시의료소에 도착하면 자동으로 구조 처리된다.
  const { victims, attachVictimToUnit } = useVictims();
  // 연결된 구조대상자는 구역 흐름 배치에서 빼고(각 구역 컴포넌트가 carriedBy 를 걸러낸다)
  // 이 토큰 우측에 아이콘만 붙여 렌더한다.
  /*
   * 고가차·굴절차는 여기 그리지 않는다 — 사람은 땅의 차량이 아니라 **바스켓**에
   * 있다. 그쪽은 AerialOverlay 가 끝단 사각형 위에 얹어 그린다.
   */
  const carriedVictims = AERIAL_UNIT_TYPES.has(token.unitType)
    ? []
    : victims.filter(v => v.carriedBy === token.id);

  function handleVictimDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (token.unitType === 'hydrant') return;
    // dragover 에서는 값을 못 읽으므로 타입만 확인한다(브라우저가 소문자로 준다).
    const types = e.dataTransfer.types;
    if (!types.includes('victimid') && !types.includes('victimId')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleVictimDrop(e: React.DragEvent<HTMLDivElement>) {
    if (token.unitType === 'hydrant') return;
    const victimId = e.dataTransfer.getData('victimId');
    if (!victimId) return;          // 출동대 드롭 등 — 구역이 처리하게 둔다
    e.preventDefault();
    e.stopPropagation();
    attachVictimToUnit(victimId, token.id);
    logDragEvent('TokenCard victim attach', `victim=${victimId} → ${token.label}`);
  }

  function handleContextMenu(e: React.MouseEvent) {
    // 현장(ABCD면·건물)에 배치됐을 때만 상태 메뉴를 연다.
    // 대기 구역·추가출동대 박스에서는 이벤트를 그대로 흘려보내야 한다 —
    // 여기서 stopPropagation 하면 바깥(추가출동대 삭제 등)이 우클릭을 못 받는다.
    if (!onBoard) return;
    e.preventDefault();
    e.stopPropagation();
    if (mode.type !== null) { clearMode(); return; }
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) {
      setBarMenu({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (mode.type === 'water-connect' && !isSource) {
      e.stopPropagation();
      addConnection(mode.sourceId, token.id, mode.sourceType, token.unitType, mode.sourceName);
      clearMode();
      return;
    }
    if (isSource) return;
    if (isInMode) { e.stopPropagation(); clearMode(); }
  }

  const handleClose = useCallback(() => setBarMenu(null), []);

  // 출동대 상태메세지: 항상 토큰 위에 표시 (X로 닫기)
  const showStatusMsg = !!token.customNote;

  // ── 절대 위치 스타일 ─────────────────────────
  // absPos 는 구역 대비 0~1 정규화 좌표 → 퍼센트로 넘겨 구역 크기 변화에 따라간다
  const wrapperStyle: React.CSSProperties | undefined = absPos
    ? {
        position:  'absolute',
        left:      `${absPos.x * 100}%`,
        top:       `${absPos.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        zIndex:    5,
      }
    : undefined;

  // ── 카운트다운 ───────────────────────────────
  const { tokens, medicalCountdowns, moveCountdowns, arrivalCountdowns, setCustomNote } = useTokens();
  const medicalCountdown = token.zoneKey === 'medical-post'
    ? (medicalCountdowns[token.id] ?? null) : null;
  const moveCountdown    = medicalCountdown === null
    ? (moveCountdowns[token.id] ?? null) : null;
  const arrivalCountdown = token.zoneKey === null
    ? (arrivalCountdowns[token.id] ?? null) : null;

  const hasBadges    = token.badges.length > 0;
  const hasMission   = (token.missionTags?.length ?? 0) > 0;

  // 카운트다운은 좌측 상단 고정 위치 표시용으로 포털 유지
  // (드래그 중 표시되지 않으므로 좌표 지연 문제 없음)
  function countdownPortal(className: string, label: string, content: React.ReactNode) {
    const raw = wrapperRef.current?.getBoundingClientRect();
    if (!raw) return null;
    // 포털이 스테이지(배율) 안에 있으므로 left/top 은 캔버스 좌표여야 한다.
    const rect = rectToStage(raw);
    return ReactDOM.createPortal(
      <div
        className={`token-countdown ${className}`}
        aria-label={label}
        style={{
          position:      'fixed',
          left:          rect.left,
          top:           rect.top,
          transform:     'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex:        9999,
        }}
      >
        {content}
      </div>,
      stagePortalTarget(),
    );
  }

  // ── 조작 핸들·게이지 표시 조건 ────────────────
  // 현장(ABCD면·건물)에 배치됐을 때만 띄운다. 출동대현황·자원대기소·대기1단계·
  // 직전대기·RIT·임시의료소에서는 활동 중이 아니라 의미가 없다.
  // 수량 게이지도 같은 규칙을 따른다 — 게이지가 곧 송수 연결 손잡이라서다.
  const onBoard = isOnTacticalBoard(token.zoneKey);

  // ── 수량 게이지 ──────────────────────────────
  // 실시간 계산이 꺼져 있으면 잔량이 늘 100 이라 숫자를 숨긴다(게이지 틀은 남긴다)
  const { realtimeCalcEnabled } = useSettings();
  const isWaterUnit    = waterLevel !== null && WATER_UNIT_TYPES.has(token.unitType);
  const waterLevelL    = isWaterUnit ? (waterLevel!.levels[token.id] ?? waterLevel!.getCapacity(token.id)) : 0;
  const waterCapL      = isWaterUnit ? waterLevel!.getCapacity(token.id) : 0;

  // ── 소화전 ───────────────────────────────────
  const isHydrant       = token.unitType === 'hydrant';
  const isHydrantBroken = isHydrant && token.statusTag?.label === '소화전고장';

  // ── 고가차/굴절차 방수 — 수원 미연결 시 빨간색 ─────
  const isAerialBansu = AERIAL_UNIT_TYPES.has(token.unitType) &&
    !!token.statusTag?.label?.endsWith('방수');
  const aerialHasWaterSource = isAerialBansu &&
    connections.some(c => {
      if (c.toId !== token.id || !WATER_UNIT_TYPES.has(c.fromType)) return false;
      const src = tokens.find(t => t.id === c.fromId);
      return src?.statusTag?.label !== '펌프고장';
    });
  const aerialBansuNoSource = isAerialBansu && !aerialHasWaterSource;

  // ── 수량 소진 (0%) ───────────────────────────
  const isWaterEmpty   = isWaterUnit && waterLevelL === 0;
  const showWaterGauge = onBoard && isWaterUnit && showWaterSupply;

  // ── CSS 클래스 조합 ──────────────────────────
  const cardClasses = [
    'token-card',
    `token-card--${token.color}`,
    isRecent        ? 'token-card--recently-moved'  : '',
    isSource        ? 'token-card--mode-source'     : '',
    isInMode        ? 'token-card--mode-dim'        : '',
    barMenu         ? 'token-card--menu-open'       : '',
    isHydrantBroken ? 'token-card--hydrant-broken'  : '',
    isWaterEmpty    ? 'token-card--water-empty'     : '',
  ].filter(Boolean).join(' ');

  const hasOverlay = hasBadges; // statusTag는 토큰 하단으로 이동

  // 방수 핸들만 방면 한정 — 건물 내부는 자리가 좁아 부속을 붙이지 않는다.
  // (방수 지점은 건물 내부도 그대로 지정할 수 있다)
  const showNozzle      = isOnBuildingFace(token.zoneKey)
                          && SPRAY_HANDLE_TYPES.has(token.unitType) && !selectMode;
  // 전개 전에만 띄운다 — 전개 후에는 사다리 끝단을 직접 끌어 옮긴다(AerialOverlay)
  const showLadder      = onBoard && AERIAL_UNIT_TYPES.has(token.unitType)
                          && !selectMode && token.aerialTarget == null;

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────

  return (
    <>
      <div
        className={`token-card-wrapper${selectMode ? ' token-card-wrapper--select' : ''}${carriedVictims.length > 0 ? ' token-card-wrapper--carrying' : ''}`}
        style={wrapperStyle}
        ref={wrapperRef}
        data-token-id={token.id}
        data-water-type={token.unitType}
        data-touch-drop-target="true"
        onDragOver={handleVictimDragOver}
        onDrop={handleVictimDrop}
      >
        {selectMode && (
          <label className="token-card__checkbox" onMouseDown={e => e.stopPropagation()}>
            <input type="checkbox" checked={!!selected} onChange={onToggleSelect} />
          </label>
        )}
        {/* 모드 소스 링 */}
        {isSource && (
          <div className="token-card-mode-ring" aria-hidden="true" />
        )}

        {/* ── 인라인 오버레이 ──────────────────────────────
            토큰 wrapper 내부에 position:absolute 로 배치.
            토큰이 이동하면 오버레이도 DOM 계층상 자동으로 함께 이동.
            부모 컨테이너(zone-cell 등)는 overflow:visible 로 변경하여 잘림 방지.
            위쪽 뷰포트 경계 근처일 때만 --below 클래스로 아래 방향 전환.
        ────────────────────────────────────────────────── */}
        {hasOverlay && (
          <div
            className={[
              'token-overlay',
              overlayBelow ? 'token-overlay--below' : '',
            ].filter(Boolean).join(' ')}
            aria-hidden="true"
          >
            {/* 시스템 배지 */}
            {hasBadges && (
              <div className="token-badge-overlay">
                {token.badges.map(badge => {
                  const col = badge.color ? PRESET_COLORS.find(c => c.value === badge.color) : null;
                  return (
                    <div
                      key={badge.id}
                      className="token-badge"
                      style={col ? { background: col.bg, borderColor: col.border } : undefined}
                    >
                      <span
                        className="token-badge__line"
                        style={col ? { color: col.text } : undefined}
                      >{badge.line1}</span>
                      {badge.line2 && (
                        <span
                          className="token-badge__line token-badge__line--sub"
                          style={col ? { color: col.text, opacity: 0.85 } : undefined}
                        >{badge.line2}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}


          </div>
        )}

        {/* ── 상단 출동대 상태메세지 ── */}
        {showStatusMsg && (
          <div className="token-status-msg">
            <span className="token-status-msg__text">{token.customNote}</span>
            <button
              className="token-status-msg__close"
              onMouseDown={e => { e.stopPropagation(); setCustomNote(token.id, ''); }}
              aria-label="메세지 닫기"
            >×</button>
          </div>
        )}

        {/* ── 좌측 임무 레이블 (복수, 간격 없이 나란히) ── */}
        {hasMission && (
          <div className="token-mission-labels">
            {token.missionTags!.map(m => {
              const col   = STATUS_TAG_COLORS[m.color] ?? STATUS_TAG_COLORS.white;
              const chars = [...m.label];
              const cols: string[][] = [];
              for (let i = 0; i < chars.length; i += 3) cols.push(chars.slice(i, i + 3));
              return (
                <div
                  key={m.label}
                  className="token-mission-label"
                  style={{ background: col.bg, borderColor: col.border, color: col.text }}
                  aria-label={m.label}
                >
                  {cols.map((colChars, ci) => (
                    <span key={ci} className="token-mission-label__col">
                      {colChars.map((ch, i) => (
                        <span key={i} className="token-mission-label__char">{ch}</span>
                      ))}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        <div
          className={cardClasses}
          draggable={mode.type === null}
          {...touchDrag}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onContextMenu={handleContextMenu}
          onClick={handleClick}
          onDoubleClick={onDoubleClick && mode.type === null ? (e => { e.stopPropagation(); onDoubleClick(); }) : undefined}
        >
          {isHydrantBroken ? `${token.label} [고장]` : token.label}
        </div>

        {/* ── 하단 상태 태그 (임무/상태 프리셋) ── */}
        {token.statusTag && !isHydrantBroken && (() => {
          const baseCol = STATUS_TAG_COLORS[token.statusTag!.color] ?? STATUS_TAG_COLORS.white;
          const col = aerialBansuNoSource ? STATUS_TAG_COLORS.red : baseCol;
          return (
            <div className="token-status-tag-below">
              <div
                className="token-status-tag"
                style={{ background: col.bg, borderColor: col.border, color: col.text }}
              >
                <span className="token-status-tag__main">{token.statusTag!.label}</span>
              </div>
            </div>
          );
        })()}

        {showWaterGauge && (
          <WaterGauge
            levelL={waterLevelL}
            capacityL={waterCapL}
            token={token}
            draggable={onBoard && !selectMode}
            showLevel={realtimeCalcEnabled}
          />
        )}

        {/* ── 관창 핸들 — 끌어서 방수, 클릭해서 중단 ── */}
        {showNozzle && <NozzleHandle token={token} />}

        {/* ── 사다리·바스켓 핸들 — 끌어서 전개 ── */}
        {showLadder && <LadderHandle token={token} />}

        {/* ── 이송 연결된 구조대상자 — 토큰 바로 우측에 아이콘만 부착 ── */}
        {carriedVictims.length > 0 && (
          <div className="token-carried-victims">
            {carriedVictims.map(v => (
              <VictimCard key={v.id} victim={v} attached />
            ))}
          </div>
        )}
      </div>

      {/* 카운트다운 포털 (우측 배지 형태 — 드래그 중 표시 안 됨, 포털 유지) */}
      {medicalCountdown !== null && countdownPortal(
        '',
        `직전대기 이동까지 ${medicalCountdown}초`,
        `구조중 ${medicalCountdown}초`,
      )}
      {moveCountdown !== null && countdownPortal(
        'token-countdown--move',
        `이동 완료까지 ${moveCountdown}초`,
        moveCountdown,
      )}
      {arrivalCountdown !== null && countdownPortal(
        'token-countdown--arrival',
        `출동중 — 도착까지 ${secsToMmss(arrivalCountdown)}`,
        secsToMmss(arrivalCountdown),
      )}

      {/* 가로 막대형 상태 메뉴 */}
      {barMenu && isHydrant && (
        <HydrantBarMenu token={token} anchorRect={barMenu} onClose={handleClose} />
      )}
      {barMenu && !isHydrant && (
        <UnitStatusBarMenu token={token} anchorRect={barMenu} onClose={handleClose} />
      )}
    </>
  );
}
