import { useState, useCallback } from 'react';
import type { TokenPos } from '../../context/TokenContext';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
import type { UnitToken, TokenBadge } from '../../types';
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
