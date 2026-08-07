import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import './ImminentStandby.css';

// ─────────────────────────────────────────────
// ImminentStandby — 직전대기(2/3) + RIT(1/3) 독립 드롭존
//
// TacticalArea col 2, row 3 (A면 좌측)에 배치됨.
// StandbyColumn과 독립적으로 동작하며
// unit token + victim token 모두 수용.
// RIT 구역으로 드롭된 출동대 토큰은 임무 태그 "RIT"가 자동 부여됨.
// ─────────────────────────────────────────────

const ZONE_KEY_IMMINENT = 'standby-imminent';
const ZONE_KEY_RIT      = 'standby-rit';
const RIT_TAG           = { label: 'RIT', color: 'red' } as const;

function SubZone({
  zoneKey,
  label,
  className,
  taggedAsRit,
}: {
  zoneKey:     string;
  label:       string;
  className:   string;
  taggedAsRit: boolean;
}) {
  const { tokens, moveToken, toggleMissionTag } = useTokens();
  const { victims, moveVictim }                 = useVictims();

  const zoneTokens  = tokens.filter(t => t.zoneKey  === zoneKey);
  const zoneVictims = victims.filter(v => v.zoneKey === zoneKey);
  const isEmpty     = zoneTokens.length === 0 && zoneVictims.length === 0;

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation(); // A면(부모) 드롭존으로 버블링 방지
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation(); // A면(부모) 드롭존으로 버블링 방지 — 안 하면 A면 핸들러가
    // 같은 이벤트를 또 처리해서 zoneKey가 'face-A'로 덮어써짐(토큰이
    // 직전대기 박스 밑에 깔려 안 보이는 원인이었음)
    const tokenId  = e.dataTransfer.getData('tokenId');
    const victimId = e.dataTransfer.getData('victimId');
    if (tokenId) {
      moveToken(tokenId, zoneKey);
      if (taggedAsRit) {
        const token = tokens.find(t => t.id === tokenId);
        const alreadyTagged = token?.missionTags?.some(m => m.label === RIT_TAG.label) ?? false;
        if (!alreadyTagged) toggleMissionTag(tokenId, RIT_TAG);
      }
    }
    if (victimId) moveVictim(victimId, zoneKey);
  }

  return (
    <div className={`imminent-standby__sub ${className}`}>
      <div className="imminent-standby__header">{label}</div>
      <div
        className="imminent-standby__body"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isEmpty ? (
          <span className="imminent-standby__placeholder">―</span>
        ) : (
          <>
            {zoneTokens.map(t  => <TokenCard  key={t.id}  token={t}  />)}
            {zoneVictims.map(v => <VictimCard key={v.id}  victim={v} />)}
          </>
        )}
      </div>
    </div>
  );
}

export function ImminentStandby() {
  return (
    <div className="imminent-standby">
      <SubZone zoneKey={ZONE_KEY_IMMINENT} label="직전대기" className="imminent-standby__sub--imminent" taggedAsRit={false} />
      <SubZone zoneKey={ZONE_KEY_RIT}      label="RIT"      className="imminent-standby__sub--rit"      taggedAsRit={true} />
    </div>
  );
}
