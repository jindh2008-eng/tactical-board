import { useState } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import { RescueStats } from './RescueStats';
import './StandbyColumn.css';

// ─────────────────────────────────────────────
// 드롭 패널 공통 훅
// ─────────────────────────────────────────────

function useDropPanel() {
  const [isDragOver, setIsDragOver] = useState(false);

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  return { isDragOver, setIsDragOver, onDragOver, onDragLeave };
}

// ─────────────────────────────────────────────
// 임시의료소 — 좌(구조대상자) / 우(출동대) 분리
// ─────────────────────────────────────────────

function MedicalPostBox() {
  const { tokens, moveToken }   = useTokens();
  const { victims, moveVictim } = useVictims();

  const zoneKey     = 'medical-post';
  const zoneTokens  = tokens.filter(t => t.zoneKey === zoneKey);
  const zoneVictims = victims.filter(v => v.zoneKey === zoneKey);

  // 좌측(구조대상자) 드롭
  const victimPanel = useDropPanel();
  function onVictimDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    victimPanel.setIsDragOver(false);
    const victimId = e.dataTransfer.getData('victimId');
    if (victimId) moveVictim(victimId, zoneKey);
  }

  // 우측(출동대) 드롭
  const tokenPanel = useDropPanel();
  function onTokenDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    tokenPanel.setIsDragOver(false);
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, zoneKey);
  }

  return (
    <div className="standby-box standby-box--medical standby-box--medical-large">
      <div className="standby-box__header">임시의료소</div>

      <div className="medical-split">
        {/* 좌: 구조대상자 */}
        <div className="medical-split__pane">
          <div className="medical-split__pane-label">구조대상자</div>
          <div
            className={[
              'medical-split__body',
              victimPanel.isDragOver ? 'drop-target--active' : '',
            ].filter(Boolean).join(' ')}
            onDragOver={victimPanel.onDragOver}
            onDragLeave={victimPanel.onDragLeave}
            onDrop={onVictimDrop}
          >
            {zoneVictims.length === 0 ? (
              <span className="standby-box__placeholder">―</span>
            ) : (
              zoneVictims.map(v => <VictimCard key={v.id} victim={v} />)
            )}
          </div>
        </div>

        <div className="medical-split__divider" />

        {/* 우: 출동대 */}
        <div className="medical-split__pane">
          <div className="medical-split__pane-label">출동대</div>
          <div
            className={[
              'medical-split__body',
              tokenPanel.isDragOver ? 'drop-target--active' : '',
            ].filter(Boolean).join(' ')}
            onDragOver={tokenPanel.onDragOver}
            onDragLeave={tokenPanel.onDragLeave}
            onDrop={onTokenDrop}
          >
            {zoneTokens.length === 0 ? (
              <span className="standby-box__placeholder">―</span>
            ) : (
              zoneTokens.map(t => <TokenCard key={t.id} token={t} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 일반 대기구역 박스
// ─────────────────────────────────────────────

interface StandbyBoxProps {
  label:    string;
  zoneKey:  string;
  colorMod: string;
}

function StandbyBox({ label, zoneKey, colorMod }: StandbyBoxProps) {
  const { tokens, moveToken }   = useTokens();
  const { victims, moveVictim } = useVictims();
  const [isDragOver, setIsDragOver] = useState(false);

  const zoneTokens  = tokens.filter(t => t.zoneKey  === zoneKey);
  const zoneVictims = victims.filter(v => v.zoneKey === zoneKey);
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
    if (tokenId)  moveToken(tokenId,   zoneKey);
    if (victimId) moveVictim(victimId, zoneKey);
  }

  return (
    <div className={`standby-box standby-box--${colorMod}`}>
      <div className="standby-box__header">{label}</div>
      <div
        className={[
          'standby-box__body',
          isDragOver ? 'drop-target--active' : '',
        ].filter(Boolean).join(' ')}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isEmpty ? (
          <span className="standby-box__placeholder">―</span>
        ) : (
          <>
            {zoneTokens.map(token   => <TokenCard  key={token.id}  token={token}  />)}
            {zoneVictims.map(victim => <VictimCard key={victim.id} victim={victim} />)}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// StandbyColumn — TacticalArea col 1 좌측 운영패널
//
// 순서: 임시의료소(분할) → 구조현황통계 → 자원대기소 → 대기1단계
// 직전대기는 ImminentStandby (TacticalArea col 2, row 3) 로 분리
// ─────────────────────────────────────────────

export const STANDBY_ZONE_KEYS = [
  'medical-post',
  'standby-resource',
  'standby-standby1',
  'standby-imminent',
] as const;

export type StandbyZoneKey = typeof STANDBY_ZONE_KEYS[number];

export function StandbyColumn() {
  return (
    <div className="standby-column">
      {/* 임시의료소 — 좌(구조대상자) / 우(출동대) 분리 */}
      <MedicalPostBox />

      {/* 구조현황통계 */}
      <RescueStats />

      {/* 자원대기소, 대기1단계 — 절반 높이 */}
      <StandbyBox label="자원대기소" zoneKey="standby-resource" colorMod="resource" />
      <StandbyBox label="대기1단계"  zoneKey="standby-standby1" colorMod="standby1" />
    </div>
  );
}
