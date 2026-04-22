import { useState, useCallback } from 'react';
import type { TokenPos } from '../../context/TokenContext';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
import type { UnitToken, TokenBadge } from '../../types';
import { secsToMmss } from '../../utils/dispatchRoster';
import { TokenContextMenu } from './TokenContextMenu';
import './TokenCard.css';

interface Props {
  token:   UnitToken;
  absPos?: TokenPos;
}

export function TokenCard({ token, absPos }: Props) {
  const { addBadge, removeBadge }                     = useTokens();
  const { sharedBadgePresets, unitBadgePresets }       = useSettings();

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

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
  const handleAddBadge    = useCallback((badge: Omit<TokenBadge, 'id'>) => addBadge(token.id, badge),    [addBadge,    token.id]);
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

  return (
    <>
      <div className="token-card-wrapper" style={wrapperStyle}>
        {hasBadges && (
          <div className="token-badge-overlay" aria-hidden="true">
            {token.badges.map(badge => (
              <div key={badge.id} className="token-badge">
                <span className="token-badge__line">{badge.line1}</span>
                {badge.line2 && <span className="token-badge__line token-badge__line--sub">{badge.line2}</span>}
              </div>
            ))}
          </div>
        )}
        {medicalCountdown !== null && (
          <div className="token-countdown" aria-label={`직전대기 이동까지 ${medicalCountdown}초`}>
            구조중 {medicalCountdown}초
          </div>
        )}
        {moveCountdown !== null && (
          <div className="token-countdown token-countdown--move" aria-label={`이동 완료까지 ${moveCountdown}초`}>
            이동중 {moveCountdown}초
          </div>
        )}
        {arrivalCountdown !== null && (
          <div className="token-countdown token-countdown--arrival" aria-label={`출동중 — 도착까지 ${secsToMmss(arrivalCountdown)}`}>
            출동중 {secsToMmss(arrivalCountdown)}
          </div>
        )}

        <div
          className={`token-card token-card--${token.color}`}
          draggable
          onDragStart={handleDragStart}
          onContextMenu={handleContextMenu}
          title={token.label}
        >
          {token.label}
        </div>
      </div>

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
