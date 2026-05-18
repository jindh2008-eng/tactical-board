import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { TokenPos } from '../../context/TokenContext';
import { useTokens } from '../../context/TokenContext';
import { useActionMode } from '../../context/ActionModeContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import type { UnitToken } from '../../types';
import { PRESET_COLORS } from '../../types/presets';
import { secsToMmss } from '../../utils/dispatchRoster';
import { useWaterLevel }       from '../../context/WaterLevelContext';
import { useDisplayOptions }   from '../../context/DisplayOptionsContext';
import { UnitStatusBarMenu } from './UnitStatusBarMenu';
import { HydrantBarMenu }    from './HydrantBarMenu';
import './TokenCard.css';

// ── 수량 게이지 바 ───────────────────────────

const WATER_UNIT_TYPES  = new Set(['pump', 'water_tank']);
const AERIAL_UNIT_TYPES = new Set(['aerial', 'ladder']);

function WaterGauge({ levelL, capacityL }: { levelL: number; capacityL: number }) {
  const pct       = capacityL > 0 ? Math.max(0, Math.min(1, levelL / capacityL)) : 0;
  const pctInt    = Math.round(pct * 100);
  const isLow     = pct < 0.5;
  const fillColor = isLow ? '#d94040' : '#2a8fd4';

  return (
    <div
      className="water-gauge"
      title={`${Math.round(levelL).toLocaleString()}L / ${capacityL.toLocaleString()}L`}
    >
      {/* 채움 바 — 아래에서 위로 */}
      <div
        className="water-gauge__fill"
        style={{ height: `${pct * 100}%`, background: fillColor }}
      />
      {/* 25% 단위 구분선 3개 */}
      {[25, 50, 75].map(p => (
        <div key={p} className="water-gauge__divider" style={{ bottom: `${p}%` }} />
      ))}
      {/* 퍼센트 수치 */}
      <span className="water-gauge__pct">{pctInt}</span>
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
  token:   UnitToken;
  absPos?: TokenPos;
}

export function TokenCard({ token, absPos }: Props) {
  const { mode, clearMode }        = useActionMode();
  const { addConnection, connections } = useWaterConnections();
  const waterLevel                 = useWaterLevel();
  const { showWaterLevel }         = useDisplayOptions();

  const [barMenu,      setBarMenu]      = useState<{
    left: number; top: number; right: number; bottom: number; width: number; height: number;
  } | null>(null);
  const [isRecent,     setIsRecent]     = useState(false);
  const [isHovered,    setIsHovered]    = useState(false);
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
    if (mode.type !== null) { e.preventDefault(); return; }
    const el = e.currentTarget;
    e.dataTransfer.setData('tokenId', token.id);
    e.dataTransfer.setData('tokenW', String(el.offsetWidth));
    e.dataTransfer.setData('tokenH', String(el.offsetHeight));
    e.dataTransfer.effectAllowed = 'move';
    setBarMenu(null);
    if (wrapperRef.current) wrapperRef.current.dataset.dragging = 'true';
  }

  function handleDragEnd() {
    if (wrapperRef.current) delete wrapperRef.current.dataset.dragging;
  }

  function handleContextMenu(e: React.MouseEvent) {
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

  // customNote 말풍선: 설정된 경우 항상 표시 (X로 닫기 가능)
  const showBubble = !!token.customNote && !barMenu;

  // ── 절대 위치 스타일 ─────────────────────────
  const wrapperStyle: React.CSSProperties | undefined = absPos
    ? {
        position:  'absolute',
        left:      absPos.x,
        top:       absPos.y,
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
  const hasMission   = !!token.missionTag;

  // 카운트다운은 우측 고정 위치 표시용으로 포털 유지
  // (드래그 중 표시되지 않으므로 좌표 지연 문제 없음)
  function countdownPortal(className: string, label: string, content: React.ReactNode) {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return ReactDOM.createPortal(
      <div
        className={`token-countdown ${className}`}
        aria-label={label}
        style={{
          position:      'fixed',
          left:          rect.right,
          top:           rect.top,
          transform:     'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex:        9999,
        }}
      >
        {content}
      </div>,
      document.body,
    );
  }

  // ── 수량 게이지 ──────────────────────────────
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
  // 수량표시 OFF여도 소진 시에는 게이지 표시
  const showWaterGauge = isWaterUnit && (showWaterLevel || isWaterEmpty);

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

  const hasOverlay = hasBadges || (!!token.statusTag && !isHydrantBroken);

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────

  return (
    <>
      <div
        className="token-card-wrapper"
        style={wrapperStyle}
        ref={wrapperRef}
        data-token-id={token.id}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
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

            {/* 상태 태그 (소화전 고장은 토큰 본문에 표시) */}
            {token.statusTag && !isHydrantBroken && (() => {
              const baseCol = STATUS_TAG_COLORS[token.statusTag!.color] ?? STATUS_TAG_COLORS.white;
              const col = aerialBansuNoSource ? STATUS_TAG_COLORS.red : baseCol;
              return (
                <div className="token-status-tag-overlay">
                  <div
                    className="token-status-tag"
                    style={{ background: col.bg, borderColor: col.border, color: col.text }}
                  >
                    <span className="token-status-tag__main">{token.statusTag!.label}</span>
                    {token.customNote && (
                      <span className="token-status-tag__linked">{token.customNote}</span>
                    )}
                  </div>
                </div>
              );
            })()}

          </div>
        )}

        {/* ── 좌측 임무 레이블 (세로쓰기, 3글자씩 컬럼) ── */}
        {hasMission && (() => {
          const m    = token.missionTag!;
          const col  = STATUS_TAG_COLORS[m.color] ?? STATUS_TAG_COLORS.white;
          const chars = [...m.label];
          const cols: string[][] = [];
          for (let i = 0; i < chars.length; i += 3) cols.push(chars.slice(i, i + 3));
          return (
            <div
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
        })()}

        <div
          className={cardClasses}
          draggable={mode.type === null}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onContextMenu={handleContextMenu}
          onClick={handleClick}
          title={token.label}
        >
          {isHydrantBroken ? `${token.label} [고장]` : token.label}
        </div>

        {/* ── customNote 말풍선 (항상 표시, X로 닫기) ── */}
        {showBubble && (
          <div className="token-bubble" aria-label={`메모: ${token.customNote}`}>
            <span className="token-bubble__text">{token.customNote}</span>
            <button
              className="token-bubble__close"
              onMouseDown={e => { e.stopPropagation(); setCustomNote(token.id, ''); }}
              aria-label="메모 닫기"
            >×</button>
          </div>
        )}

        {showWaterGauge && (
          <WaterGauge levelL={waterLevelL} capacityL={waterCapL} />
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
