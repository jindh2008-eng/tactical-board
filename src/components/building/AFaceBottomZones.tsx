import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import { MedicalPostBox } from './StandbyColumn';
import './AFaceBottomZones.css';

// ─────────────────────────────────────────────
// A면 하단 밴드 — 직전대기 / RIT / 현장지휘소 / 임시의료소
//
// 네 구역이 A면 바닥 전체 폭을 나눠 쓴다(2026-08-21). 종전에는 좌측 상자
// (직전대기+RIT)와 우측 상자(임시의료소) 둘뿐이라 가운데가 비어 있었고,
// 현장지휘소는 아예 없었다.
//
// 소화전은 A면 좌우 코너에 붙으므로 밴드 위로 올려 앉힌다
// (ExteriorZone.tsx 의 cornerStyle — bottom 기준 계산).
//
// 구역 구분은 바탕 8% 틴트 + 하단 명칭 띠 색으로 한다. A면 팔레트(#dedad0)
// 위에서 고른 저채도라 전체 화면과 이질감이 없다.
//
// unit token + victim token 모두 수용.
// RIT 구역으로 드롭된 출동대 토큰은 임무 태그 "RIT"가 자동 부여됨.
// ─────────────────────────────────────────────

const ZONE_KEY_IMMINENT = 'standby-imminent';
const ZONE_KEY_RIT      = 'standby-rit';
const ZONE_KEY_COMMAND  = 'command-post';
const RIT_TAG           = { label: 'RIT', color: 'red' } as const;

function SubZone({
  zoneKey,
  label,
  modifier,
  taggedAsRit,
}: {
  zoneKey:     string;
  label:       string;
  modifier:    string;
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
    // 밴드 밑에 깔려 안 보이는 원인이었음)
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
    <div className={`a-face-band__zone a-face-band__zone--${modifier}`}>
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

export function AFaceBottomZones() {
  return (
    <div className="a-face-band">
      <SubZone zoneKey={ZONE_KEY_IMMINENT} label="직전대기"   modifier="imminent" taggedAsRit={false} />
      <SubZone zoneKey={ZONE_KEY_RIT}      label="RIT"        modifier="rit"      taggedAsRit={true}  />
      <SubZone zoneKey={ZONE_KEY_COMMAND}  label="현장지휘소" modifier="command"  taggedAsRit={false} />
      <MedicalPostBox />
    </div>
  );
}
