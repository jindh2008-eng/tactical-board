import { useState } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import './ImminentStandby.css';

// ─────────────────────────────────────────────
// ImminentStandby — 직전대기 독립 드롭존
//
// TacticalArea col 2, row 3 (A면 좌측)에 배치됨.
// StandbyColumn과 독립적으로 동작하며
// unit token + victim token 모두 수용.
// ─────────────────────────────────────────────

const ZONE_KEY = 'standby-imminent';

export function ImminentStandby() {
  const { tokens, moveToken }   = useTokens();
  const { victims, moveVictim } = useVictims();
  const [isDragOver, setIsDragOver] = useState(false);

  const zoneTokens  = tokens.filter(t => t.zoneKey  === ZONE_KEY);
  const zoneVictims = victims.filter(v => v.zoneKey === ZONE_KEY);
  const isEmpty     = zoneTokens.length === 0 && zoneVictims.length === 0;

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const tokenId  = e.dataTransfer.getData('tokenId');
    const victimId = e.dataTransfer.getData('victimId');
    if (tokenId)  moveToken(tokenId,   ZONE_KEY);
    if (victimId) moveVictim(victimId, ZONE_KEY);
  }

  return (
    <div className="imminent-standby">
      <div className="imminent-standby__header">직전대기</div>
      <div
        className={[
          'imminent-standby__body',
          isDragOver ? 'drop-target--active' : '',
        ].filter(Boolean).join(' ')}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isEmpty ? (
          <span className="imminent-standby__placeholder">―</span>
        ) : (
          <>
            {zoneTokens.map(t  => <TokenCard  key={t.id}  token={t}  />)}
            {zoneVictims.map(v => <VictimCard key={v.id}  victim={v} />)}
          </>
        )}
      </div>
    </div>
  );
}
