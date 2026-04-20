import { useState } from 'react';
import { getFaceZones, getFaceZoneDataAttrs } from '../../data/faceZoneData';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import './BFaceWithStandby.css';

// ─────────────────────────────────────────────
// B면 드롭 영역
// ─────────────────────────────────────────────

const DROP_NUDGE_X = 0;
const DROP_NUDGE_Y = 0;

function BFaceDropZone() {
  const { tokens, positions, moveToken }         = useTokens();
  const { victims, victimPositions, moveVictim } = useVictims();
  const [isDragOver, setIsDragOver] = useState(false);

  const zones    = getFaceZones('B');
  const faceZone = zones.find(z => z.category === 'face')!;
  const zoneKey  = 'face-B';

  const zoneTokens  = tokens.filter(t => t.zoneKey === zoneKey);
  const zoneVictims = victims.filter(v => v.zoneKey === zoneKey);

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
    if (!tokenId && !victimId) return;

    const rect  = e.currentTarget.getBoundingClientRect();
    const rawX  = (e.clientX - rect.left)  + DROP_NUDGE_X;
    const rawY  = (e.clientY - rect.top)   + DROP_NUDGE_Y;
    const tokenW = parseFloat(e.dataTransfer.getData('tokenW')) || 40;
    const tokenH = parseFloat(e.dataTransfer.getData('tokenH')) || 14;
    const x = Math.max(tokenW / 2, Math.min(rect.width  - tokenW / 2, rawX));
    const y = Math.max(tokenH / 2, Math.min(rect.height - tokenH / 2, rawY));

    if (tokenId)  moveToken(tokenId,   zoneKey, { x, y });
    if (victimId) moveVictim(victimId, zoneKey, { x, y });
  }

  return (
    <div
      className={[
        'face-general-zone',
        'bface-drop-zone',
        isDragOver ? 'drop-target--active' : '',
      ].filter(Boolean).join(' ')}
      {...getFaceZoneDataAttrs(faceZone)}
      title="B면 일반 이동 영역"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="face-general-zone__label">B</span>

      {zoneTokens.map(token => (
        <TokenCard key={token.id} token={token} absPos={positions[token.id]} />
      ))}
      {zoneVictims.map(victim => (
        <VictimCard key={victim.id} victim={victim} absPos={victimPositions[victim.id]} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// BFaceWithStandby — B면 독립 컬럼 (대기구역 분리됨)
// ─────────────────────────────────────────────

export function BFaceWithStandby() {
  return (
    <div className="exterior-zone exterior-zone--b exterior-zone--primary exterior-zone--vertical">
      <div className="exterior-zone__content">
        <BFaceDropZone />
      </div>
    </div>
  );
}
