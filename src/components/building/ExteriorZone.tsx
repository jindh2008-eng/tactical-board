import { useState } from 'react';
import type { Face, FaceZone } from '../../types';

// ── 드롭 위치 보정 상수 ──────────────────────────────────────
const DROP_NUDGE_X = 0;
const DROP_NUDGE_Y = 0;
import { FACE_META, getFaceZones, getFaceZoneDataAttrs } from '../../data/faceZoneData';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import './ExteriorZone.css';

// ─────────────────────────────────────────────
// 일반 방면 영역 — 드롭 타겟 + 자유 위치 토큰
// ─────────────────────────────────────────────

function FaceGeneralZone({ zone, face }: { zone: FaceZone; face: Face }) {
  const { tokens, positions, moveToken }         = useTokens();
  const { victims, victimPositions, moveVictim } = useVictims();
  const [isDragOver, setIsDragOver] = useState(false);

  const zoneKey     = `face-${face}`;
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

    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) + DROP_NUDGE_X;
    const rawY = (e.clientY - rect.top)  + DROP_NUDGE_Y;

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
        isDragOver ? 'drop-target--active' : '',
      ].filter(Boolean).join(' ')}
      {...getFaceZoneDataAttrs(zone)}
      title={`${zone.face}면 일반 이동 영역`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="face-general-zone__label">{zone.face}면</span>

      {/* 출동대 토큰 */}
      {zoneTokens.map(token => (
        <TokenCard key={token.id} token={token} absPos={positions[token.id]} />
      ))}
      {/* 구조대상자 토큰 */}
      {zoneVictims.map(victim => (
        <VictimCard key={victim.id} victim={victim} absPos={victimPositions[victim.id]} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// ExteriorZone — 단일 면의 전체 외곽 공간
// ─────────────────────────────────────────────

interface Props {
  face: Face;
}

export function ExteriorZone({ face }: Props) {
  const meta      = FACE_META[face];
  const zones     = getFaceZones(face);
  const faceZone  = zones.find(z => z.category === 'face')!;
  const isHorizontal = face === 'A' || face === 'C';

  return (
    <div
      className={[
        'exterior-zone',
        `exterior-zone--${face.toLowerCase()}`,
        meta.isPrimary  ? 'exterior-zone--primary'    : '',
        isHorizontal    ? 'exterior-zone--horizontal' : 'exterior-zone--vertical',
      ].filter(Boolean).join(' ')}
      data-deployment-face={face}
    >
      <div className="exterior-zone__content">
        <FaceGeneralZone zone={faceZone} face={face} />
      </div>
    </div>
  );
}
