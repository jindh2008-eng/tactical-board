import { useState, useCallback } from 'react';
import type { VictimPos, VictimUpdate } from '../../context/VictimContext';
import { useVictims } from '../../context/VictimContext';
import { useTokens } from '../../context/TokenContext';
import type { UnitToken } from '../../types';
import type { VictimToken } from '../../types/victim';
import { VictimContextMenu } from './VictimContextMenu';
import { zoneKeyToFullLabel } from '../../utils/victimUtils';
import './VictimCard.css';

interface Props {
  victim:  VictimToken;
  absPos?: VictimPos;
}

/** 상태별 CSS 수식어 */
function conditionMod(victim: VictimToken): string {
  if (victim.kind === 'custom') return 'victim-card--custom';
  if (!victim.condition)        return '';
  switch (victim.condition) {
    case '사망':    return 'victim-card--dead';
    case '의식없음': return 'victim-card--unconscious';
    case '고립':    return 'victim-card--isolated';
    default:        return 'victim-card--alive';
  }
}

export function VictimCard({ victim, absPos }: Props) {
  const { updateVictim, moveVictim } = useVictims();
  const { tokens, rescueUnit }       = useTokens();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    e.dataTransfer.setData('victimId', victim.id);
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

  const handleClose  = useCallback(() => setCtxMenu(null), []);
  const handleUpdate = useCallback(
    (u: VictimUpdate) => updateVictim(victim.id, u),
    [updateVictim, victim.id],
  );

  /** 구조 처리: 출동대 + 구조대상자 모두 임시의료소로 이동 */
  const handleRescue = useCallback((unit: UnitToken) => {
    const locationLabel = zoneKeyToFullLabel(victim.zoneKey);
    const rescueLocLabel = [locationLabel, victim.subLocation]
      .filter(Boolean)
      .join(' ') || '위치미상';

    rescueUnit(unit.id, rescueLocLabel);
    moveVictim(victim.id, 'medical-post');
    setCtxMenu(null);
  }, [rescueUnit, moveVictim, victim]);

  const wrapperStyle: React.CSSProperties | undefined = absPos
    ? {
        position:  'absolute',
        left:      absPos.x,
        top:       absPos.y,
        transform: 'translate(-50%, -50%)',
        zIndex:    5,
      }
    : undefined;

  return (
    <>
      <div className="victim-card-wrapper" style={wrapperStyle}>
        <div
          className={`victim-card ${conditionMod(victim)}`}
          draggable
          onDragStart={handleDragStart}
          onContextMenu={handleContextMenu}
          title={`${victim.displayTop} / ${victim.displayBottom}`}
        >
          <span className="victim-card__top">{victim.displayTop}</span>
          <span className="victim-card__bottom">{victim.displayBottom}</span>
        </div>
      </div>

      {ctxMenu && (
        <VictimContextMenu
          victim={victim}
          x={ctxMenu.x}
          y={ctxMenu.y}
          tokens={tokens}
          onUpdate={handleUpdate}
          onRescue={handleRescue}
          onClose={handleClose}
        />
      )}
    </>
  );
}
