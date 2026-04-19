import { useState } from 'react';
import { useTokens } from '../../context/TokenContext';
import { TokenCard } from '../shared/TokenCard';
import './UnitStatusPanel.css';

/** 출동대현황 — pool(미배치) 토큰 목록 + 반환 드롭 영역
 *
 * 2열 세로 정렬: 우측 열을 먼저 채우고 이후 좌측 열을 채움.
 */
export function UnitStatusPanel() {
  const { tokens, moveToken } = useTokens();
  const [isDragOver, setIsDragOver] = useState(false);

  const poolTokens  = tokens.filter(t => t.zoneKey === null);
  const n           = poolTokens.length;
  const rightTokens = poolTokens.slice(0, Math.ceil(n / 2));
  const leftTokens  = poolTokens.slice(Math.ceil(n / 2));

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
    if (tokenId) moveToken(tokenId, null);
  }

  return (
    <div className="panel unit-status-panel">
      <div className="panel__header">출동대현황</div>
      <div
        className={[
          'unit-status-panel__body',
          isDragOver ? 'drop-target--active' : '',
        ].filter(Boolean).join(' ')}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {poolTokens.length === 0 ? (
          <span className="unit-status-panel__placeholder">―</span>
        ) : (
          <div className="unit-status-panel__columns">
            <div className="unit-status-panel__col">
              {leftTokens.map(token => <TokenCard key={token.id} token={token} />)}
            </div>
            <div className="unit-status-panel__col">
              {rightTokens.map(token => <TokenCard key={token.id} token={token} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
