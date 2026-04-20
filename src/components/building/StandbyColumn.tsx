import { useState } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import { RescueStats } from './RescueStats';
import './StandbyColumn.css';

// ─────────────────────────────────────────────
// 대기구역 박스 — ZoneCell과 동일한 드롭 처리
// 출동대 토큰 + 구조대상자 토큰 모두 수용
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
            {zoneTokens.map(token  => <TokenCard  key={token.id}  token={token}  />)}
            {zoneVictims.map(victim => <VictimCard key={victim.id} victim={victim} />)}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 좌측 운영패널 구역 목록
// 직전대기는 TacticalArea row 3 (A면 좌측)으로 이동됨
// ─────────────────────────────────────────────

export const STANDBY_ZONE_KEYS = [
  'medical-post',
  'standby-resource',
  'standby-standby1',
  'standby-imminent',
] as const;

export type StandbyZoneKey = typeof STANDBY_ZONE_KEYS[number];

const STANDBY_BOXES: StandbyBoxProps[] = [
  { label: '임시의료소', zoneKey: 'medical-post',    colorMod: 'medical'  },
  { label: '자원대기소', zoneKey: 'standby-resource', colorMod: 'resource' },
  { label: '대기1단계',  zoneKey: 'standby-standby1', colorMod: 'standby1' },
];

// ─────────────────────────────────────────────
// StandbyColumn — TacticalArea col 1 좌측 운영패널
//
// 순서: 임시의료소 → 구조현황통계 → 자원대기소 → 대기1단계
// 직전대기는 ImminentStandby (TacticalArea col 2, row 3) 로 분리
// ─────────────────────────────────────────────

export function StandbyColumn() {
  return (
    <div className="standby-column">
      {/* 임시의료소 */}
      <StandbyBox
        label="임시의료소"
        zoneKey="medical-post"
        colorMod="medical"
      />

      {/* 구조현황통계 — 임시의료소 바로 아래 */}
      <RescueStats />

      {/* 자원대기소, 대기1단계 */}
      {STANDBY_BOXES.slice(1).map(box => (
        <StandbyBox key={box.zoneKey} {...box} />
      ))}
    </div>
  );
}
