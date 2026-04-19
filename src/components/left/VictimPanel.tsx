import { useState } from 'react';
import { useVictims } from '../../context/VictimContext';
import { VictimCard } from '../shared/VictimCard';
import './VictimPanel.css';

/** 구조대상자 현황 — pool(미배치) 목록 + 반환 드롭 영역 */
export function VictimPanel() {
  const { victims, moveVictim } = useVictims();
  const [isDragOver, setIsDragOver] = useState(false);

  const poolVictims = victims.filter(v => v.zoneKey === null);

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    // victimId 드롭만 허용
    if (!e.dataTransfer.types.includes('text/plain') && !e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    } else {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const victimId = e.dataTransfer.getData('victimId');
    if (victimId) moveVictim(victimId, null);
  }

  return (
    <div className="panel victim-panel">
      <div className="panel__header">구조대상자현황</div>
      <div
        className={[
          'victim-panel__body',
          isDragOver ? 'drop-target--active' : '',
        ].filter(Boolean).join(' ')}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {poolVictims.length === 0 ? (
          <span className="victim-panel__placeholder">―</span>
        ) : (
          poolVictims.map(v => <VictimCard key={v.id} victim={v} />)
        )}
      </div>
    </div>
  );
}
