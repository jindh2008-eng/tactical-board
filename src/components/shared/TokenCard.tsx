import { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { TokenPos } from '../../context/TokenContext';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
import type { UnitToken, TokenBadge } from '../../types';
import { PRESET_COLORS } from '../../types/presets';
import { secsToMmss } from '../../utils/dispatchRoster';
import { TokenContextMenu } from './TokenContextMenu';
import './TokenCard.css';

interface Props {
  token:   UnitToken;
  absPos?: TokenPos;
}

export function TokenCard({ token, absPos }: Props) {
  const { addBadge, removeBadge }    = useTokens();
  const { sharedBadgePresets, unitBadgePresets }       = useSettings();

  const [ctxMenu,    setCtxMenu]    = useState<{ x: number; y: number } | null>(null);
  const [isRecent,   setIsRecent]   = useState(false);
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

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    e.dataTransfer.setData('tokenId', token.id);
    e.dataTransfer.setData('tokenW', String(el.offsetWidth));
    e.dataTransfer.setData('tokenH', String(el.offsetHeight));
    e.dataTransfer.effectAllowed = 'move';
    setCtxMenu(null);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  const handleClose       = useCallback(() => setCtxMenu(null), []);
  const handleAddBadge    = useCallback((badge: Omit<TokenBadge, 'id'>) => addBadge(token.id, badge),      [addBadge,    token.id]);
  const handleRemoveBadge = useCallback((badgeId: string)               => removeBadge(token.id, badgeId), [removeBadge, token.id]);

  const wrapperStyle: React.CSSProperties | undefined = absPos
    ? {
        position:  'absolute',
        left:      absPos.x,
        top:       absPos.y,
        transform: 'translate(-50%, -50%)',
        zIndex:    5,
      }
    : undefined;

  const { medicalCountdowns, moveCountdowns, arrivalCountdowns } = useTokens();
  // 구조중: medical-post에 있을 때만 표시
  const medicalCountdown = token.zoneKey === 'medical-post' ? (medicalCountdowns[token.id] ?? null) : null;
  // 이동중: 구조중 우선 — 구조중이 있으면 이동중은 표시하지 않음
  const moveCountdown = medicalCountdown === null ? (moveCountdowns[token.id] ?? null) : null;
  // 도착대기: pool(zoneKey===null)에 있을 때만 표시 — 구조중/이동중과 별개로 관리
  const arrivalCountdown = token.zoneKey === null ? (arrivalCountdowns[token.id] ?? null) : null;

  const hasBadges = token.badges.length > 0;

  // 카운트다운 포털 위치 계산 — wrapper ref 기준 top-right 모서리
  function countdownPortal(
    className: string,
    label: string,
    content: React.ReactNode,
  ): React.ReactNode {
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

  return (
    <>
      <div className="token-card-wrapper" style={wrapperStyle} ref={wrapperRef}>
        {hasBadges && (
          <div className="token-badge-overlay" aria-hidden="true">
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

        <div
          className={`token-card token-card--${token.color}${isRecent ? ' token-card--recently-moved' : ''}`}
          draggable
          onDragStart={handleDragStart}
          onContextMenu={handleContextMenu}
          title={token.label}
        >
          {token.label}
        </div>
      </div>

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

      {ctxMenu && (
        <TokenContextMenu
          token={token}
          x={ctxMenu.x}
          y={ctxMenu.y}
          sharedBadgePresets={sharedBadgePresets}
          unitBadgePresets={unitBadgePresets}
          onAddBadge={handleAddBadge}
          onRemoveBadge={handleRemoveBadge}
          onClose={handleClose}
        />
      )}
    </>
  );
}
