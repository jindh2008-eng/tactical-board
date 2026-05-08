import { useState } from 'react';
import type { Face, FaceZone } from '../../types';

// ── 드롭 위치 보정 상수 ──────────────────────────────────────
const DROP_NUDGE_X = 0;
const DROP_NUDGE_Y = 0;
import { FACE_META, getFaceZones, getFaceZoneDataAttrs } from '../../data/faceZoneData';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { useSettings } from '../../store/settingsStore';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import { HydrantIcon } from '../shared/HydrantIcon';
import './ExteriorZone.css';

// ─────────────────────────────────────────────
// 일반 방면 영역 — 드롭 타겟 + 자유 위치 토큰
// ─────────────────────────────────────────────

// ── 소화전 코너 위치 ────────────────────────────────────────────
// A면: 짝수 인덱스 → 좌측하단, 홀수 인덱스 → 우측하단
// B면: 좌측하단, D면: 우측하단, C면: 좌측하단(기본)
type HydrantCorner = 'bottom-left' | 'bottom-right';

function getHydrantCorner(face: Face, index: number): HydrantCorner {
  if (face === 'A') return index % 2 === 0 ? 'bottom-left' : 'bottom-right';
  if (face === 'D') return 'bottom-right';
  return 'bottom-left';   // B, C
}

function cornerStyle(corner: HydrantCorner): React.CSSProperties {
  const base: React.CSSProperties = {
    position:      'absolute',
    bottom:        4,
    display:       'flex',
    flexDirection: 'column-reverse',
    gap:           4,
    zIndex:        3,
  };
  return corner === 'bottom-left'
    ? { ...base, left: 4, alignItems: 'flex-start' }
    : { ...base, right: 4, alignItems: 'flex-end' };
}

function FaceGeneralZone({ zone, face }: { zone: FaceZone; face: Face }) {
  const { tokens, positions, moveToken }         = useTokens();
  const { victims, victimPositions, moveVictim } = useVictims();
  const { hydrantSetup }                         = useSettings();
  const [isDragOver, setIsDragOver] = useState(false);

  // 이 방면에 배정된 소화전 필터링 후 코너별 그룹화
  const faceHydrants = hydrantSetup.filter(h => h.side === face);
  const leftHydrants  = faceHydrants.filter((_, i) => getHydrantCorner(face, i) === 'bottom-left');
  const rightHydrants = faceHydrants.filter((_, i) => getHydrantCorner(face, i) === 'bottom-right');

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
      data-zone-key={zoneKey}
      {...getFaceZoneDataAttrs(zone)}
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

      {/* 소화전 아이콘 — 좌측하단 */}
      {leftHydrants.length > 0 && (
        <div style={cornerStyle('bottom-left')}>
          {leftHydrants.map(h => (
            <HydrantIcon key={h.id} id={h.id} name={h.name} distanceM={h.distanceM} />
          ))}
        </div>
      )}

      {/* 소화전 아이콘 — 우측하단 */}
      {rightHydrants.length > 0 && (
        <div style={cornerStyle('bottom-right')}>
          {rightHydrants.map(h => (
            <HydrantIcon key={h.id} id={h.id} name={h.name} distanceM={h.distanceM} />
          ))}
        </div>
      )}
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
