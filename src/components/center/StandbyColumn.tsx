import { useState } from 'react';
import { useTokens } from '../../context/TokenContext';
import { TokenCard } from '../shared/TokenCard';
import './StandbyColumn.css';

// ─────────────────────────────────────────────
// 대기구역 컬럼 — 중앙 영역 좌측 고정 폭 컬럼
// 4개 박스 세로 스택: 임시의료소 / 자원대기소 / 대기1단계 / 대기2단계
// ─────────────────────────────────────────────

interface BoxDef {
  label:    string;
  zoneKey:  string;
  colorMod: string;
}

const BOXES: BoxDef[] = [
  { label: '임시의료소', zoneKey: 'medical-post',     colorMod: 'medical'  },
  { label: '자원대기소', zoneKey: 'standby-resource',  colorMod: 'resource' },
  { label: '대기1단계',  zoneKey: 'standby-standby1',  colorMod: 'standby1' },
  { label: '대기2단계',  zoneKey: 'standby-standby2',  colorMod: 'standby2' },
];

function StandbyBox({ label, zoneKey, colorMod }: BoxDef) {
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
    <div className={`sbc-box sbc-box--${colorMod}`}>
      <div className="sbc-box__header">{label}</div>
      <div
        className={[
          'sbc-box__body',
          isDragOver ? 'drop-target--active' : '',
        ].filter(Boolean).join(' ')}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {zoneTokens.length === 0 ? (
          <span className="sbc-box__placeholder">― 대기 없음 ―</span>
        ) : (
          <div className="sbc-box__tokens">
            {zoneTokens.map(token => <TokenCard key={token.id} token={token} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export function StandbyColumn() {
  return (
    <div className="standby-column">
      {BOXES.map(box => (
        <StandbyBox key={box.zoneKey} {...box} />
      ))}
    </div>
  );
}
