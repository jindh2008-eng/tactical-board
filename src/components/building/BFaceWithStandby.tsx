import { useState } from 'react';
import { getFaceZones, getFaceZoneDataAttrs } from '../../data/faceZoneData';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import './BFaceWithStandby.css';

// ─────────────────────────────────────────────
// B면 일반 드롭 영역 (FaceGeneralZone과 동일한 로직, B면 전용)
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
// 대기 구역 박스 (B면 좌측, ctr 라이트 테마)
// ─────────────────────────────────────────────

interface StandbyBoxProps {
  label:    string;
  zoneKey:  string;
  colorMod: string;
}

function BfaceStandbyBox({ label, zoneKey, colorMod }: StandbyBoxProps) {
  const { tokens, moveToken } = useTokens();
  const [isDragOver, setIsDragOver] = useState(false);

  const zoneTokens = tokens.filter(t => t.zoneKey === zoneKey);

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
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, zoneKey);
  }

  return (
    <div className={`bface-standby-box bface-standby-box--${colorMod}`}>
      <div className="bface-standby-box__header">{label}</div>
      <div
        className={[
          'bface-standby-box__body',
          isDragOver ? 'drop-target--active' : '',
        ].filter(Boolean).join(' ')}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {zoneTokens.length === 0 ? (
          <span className="bface-standby-box__placeholder">―</span>
        ) : (
          <div className="bface-standby-box__tokens">
            {zoneTokens.map(token => <TokenCard key={token.id} token={token} />)}
          </div>
        )}
      </div>
    </div>
  );
}

const STANDBY_BOXES: StandbyBoxProps[] = [
  { label: '임시의료소', zoneKey: 'medical-post',     colorMod: 'medical'  },
  { label: '자원대기소', zoneKey: 'standby-resource',  colorMod: 'resource' },
  { label: '대기1단계',  zoneKey: 'standby-standby1',  colorMod: 'standby1' },
  { label: '직전대기',   zoneKey: 'standby-imminent',  colorMod: 'imminent' },
];

// ─────────────────────────────────────────────
// BFaceWithStandby — B면 + 좌측 대기 구역 컬럼
// ─────────────────────────────────────────────

export function BFaceWithStandby() {
  return (
    <div className="exterior-zone exterior-zone--b exterior-zone--primary bface-with-standby">
      <div className="bface-with-standby__layout">
        {/* 좌측: 대기 구역 4개 */}
        <div className="bface-with-standby__standby-col">
          {STANDBY_BOXES.map(box => (
            <BfaceStandbyBox key={box.zoneKey} {...box} />
          ))}
        </div>

        {/* 구분선 */}
        <div className="bface-with-standby__divider" />

        {/* 우측: B면 드롭 영역 */}
        <div className="bface-with-standby__face-wrap">
          <BFaceDropZone />
        </div>
      </div>
    </div>
  );
}
