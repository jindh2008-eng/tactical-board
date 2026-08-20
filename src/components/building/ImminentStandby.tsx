import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import './ImminentStandby.css';

// ─────────────────────────────────────────────
// ImminentStandby — 직전대기(3.5) : RIT(1) 가로 분할 독립 드롭존
//
// A면 좌측 하단에 배치된다(ExteriorZone.tsx, face === 'A').
// 현장 지휘소 옆에서 대기하는 공간이라 상황판 위에 있는 것이 교리에 맞다.
// 스타일은 A면과 이질감이 없도록 옅은 선 + 명칭만 — .a-face-zone (ExteriorZone.css)
//
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
  // 이송 연결된 구조대상자는 출동대 토큰 우측에 붙어 렌더된다(TokenCard) — 구역 배치에서 제외.
  const zoneVictims = victims.filter(v => v.zoneKey === zoneKey && !v.carriedBy);

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
    <div className={`a-face-zone__sub ${className}`}>
      <div
        className="a-face-zone__body"
        data-zone-key={zoneKey}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {zoneTokens.map(t  => <TokenCard  key={t.id}  token={t}  />)}
        {zoneVictims.map(v => <VictimCard key={v.id}  victim={v} />)}
      </div>
      {/* 명칭은 박스 하단 — 위쪽은 토큰이 쌓이는 자리라 가려진다 */}
      <span className="a-face-zone__label a-face-zone__label--bottom">{label}</span>
    </div>
  );
}

export function ImminentStandby() {
  return (
    <div className="a-face-zone a-face-zone--imminent">
      <SubZone zoneKey={ZONE_KEY_IMMINENT} label="직전대기" className="a-face-zone__sub--imminent" taggedAsRit={false} />
      <SubZone zoneKey={ZONE_KEY_RIT}      label="RIT"      className="a-face-zone__sub--rit"      taggedAsRit={true} />
    </div>
  );
}
