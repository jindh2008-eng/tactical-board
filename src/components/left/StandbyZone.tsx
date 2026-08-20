import { useState } from 'react';
import { useTokens } from '../../context/TokenContext';
import { TokenCard } from '../shared/TokenCard';
import './StandbyZone.css';

const BOXES = [
  { label: '자원대기소', colorClass: 'standby-box--resource', zoneKey: 'standby-resource' },
  { label: '대기1단계',  colorClass: 'standby-box--standby1', zoneKey: 'standby-standby1' },
  { label: '직전대기',   colorClass: 'standby-box--imminent', zoneKey: 'standby-imminent' },
] as const;

/** 자원대기소 / 대기1단계 / 직전대기 — 드롭 영역 + 토큰 표시 */
export function StandbyZone() {
  return (
    <div className="standby-zone-wrapper">
      {BOXES.map(box => (
        <StandbyBox key={box.zoneKey} {...box} />
      ))}
    </div>
  );
}

function StandbyBox({
  label, colorClass, zoneKey,
}: {
  label:      string;
  colorClass: string;
  zoneKey:    string;
}) {
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
    <div className={`panel standby-box ${colorClass}`}>
      <div className="panel__header">{label}</div>
      <div
        className={[
          'standby-box__body',
          isDragOver ? 'drop-target--active' : '',
        ].filter(Boolean).join(' ')}
        data-zone-key={zoneKey}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {zoneTokens.length === 0 ? (
          <span className="standby-box__placeholder">―</span>
        ) : (
          <div className="standby-box__tokens">
            {zoneTokens.map(token => <TokenCard key={token.id} token={token} />)}
          </div>
        )}
      </div>
    </div>
  );
}
