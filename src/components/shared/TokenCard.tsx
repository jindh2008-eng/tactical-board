import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { TokenPos } from '../../context/TokenContext';
import { useTokens } from '../../context/TokenContext';
import { useActionMode } from '../../context/ActionModeContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import type { UnitToken } from '../../types';
import { PRESET_COLORS } from '../../types/presets';
import { secsToMmss } from '../../utils/dispatchRoster';
import { UnitStatusBarMenu } from './UnitStatusBarMenu';
import { HydrantBarMenu }    from './HydrantBarMenu';
import './TokenCard.css';

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
  const { mode, clearMode } = useActionMode();
  const { addConnection }   = useWaterConnections();

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
      addConnection(mode.sourceId, token.id, mode.sourceType, token.unitType);
      clearMode();
      return;
    }
    if (isSource) return;
    if (isInMode) { e.stopPropagation(); clearMode(); }
  }

  const handleClose = useCallback(() => setBarMenu(null), []);

  // customNote 말풍선: hover 중, 메뉴 닫혀 있고, statusTag가 없을 때만
  const showNoteTooltip = isHovered && !barMenu && !!token.customNote && !token.statusTag;

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
  const { medicalCountdowns, moveCountdowns, arrivalCountdowns } = useTokens();
  const medicalCountdown = token.zoneKey === 'medical-post'
    ? (medicalCountdowns[token.id] ?? null) : null;
  const moveCountdown    = medicalCountdown === null
    ? (moveCountdowns[token.id] ?? null) : null;
  const arrivalCountdown = token.zoneKey === null
    ? (arrivalCountdowns[token.id] ?? null) : null;

  const hasBadges = token.badges.length > 0;

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

  // ── 소화전 ───────────────────────────────────
  const isHydrant       = token.unitType === 'hydrant';
  const isHydrantBroken = isHydrant && token.statusTag?.label === '소화전고장';

  // ── CSS 클래스 조합 ──────────────────────────
  const cardClasses = [
    'token-card',
    `token-card--${token.color}`,
    isRecent        ? 'token-card--recently-moved'  : '',
    isSource        ? 'token-card--mode-source'     : '',
    isInMode        ? 'token-card--mode-dim'        : '',
    barMenu         ? 'token-card--menu-open'       : '',
    isHydrantBroken ? 'token-card--hydrant-broken'  : '',
  ].filter(Boolean).join(' ');

  const hasOverlay = hasBadges || (!!token.statusTag && !isHydrantBroken) || showNoteTooltip;

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
              const col = STATUS_TAG_COLORS[token.statusTag!.color] ?? STATUS_TAG_COLORS.white;
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

            {/* 메모 말풍선 */}
            {showNoteTooltip && (
              <div className="token-note-tooltip">{token.customNote}</div>
            )}
          </div>
        )}

        <div
          className={cardClasses}
          draggable={mode.type === null}
          onDragStart={handleDragStart}
          onContextMenu={handleContextMenu}
          onClick={handleClick}
          title={token.label}
        >
          {isHydrantBroken ? `${token.label} [고장]` : token.label}
        </div>
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
