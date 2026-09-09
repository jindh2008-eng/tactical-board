import { useEffect } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useUnitCommander } from '../../context/UnitCommanderContext';
import {
  unitCommanderZoneLabel, isInCommandScope, isSpotScope,
} from '../../utils/unitCommandScope';
import { useRoleRelease } from '../../context/RoleReleaseContext';
import { MISSION_UNIT_COMMANDER } from '../../config/unitMissions';

// ─────────────────────────────────────────────
// 단위지휘관 해제 다리 — 그리는 것이 없는 부품
//
// **지휘관이 제 자리를 벗어나면 물러난다.** 무리도 함께 풀리고 「단위」 임무
// 표시도 뗀다 — 셋이 어긋나면 지휘관이 아닌 대가 지휘관 표시를 달고 남는다.
//
// 「제 자리」의 뜻이 건물 안과 밖에서 다르다(UnitCommanderContext 주석).
// 층은 그 층 슬롯이라 **움직이는 즉시**, 건물 밖(A~D면)과 계단실은 이어진
// 한 공간이라 **그 공간을 벗어날 때**다.
//
// ## 왜 Context 가 아니라 여기서 하는가
//
// 이동 알림(`RoleReleaseContext`)은 `TokenProvider` 바깥의
// `UnitCommanderProvider` 도 받을 수 있다. 하지만 임무 표시를 떼려면
// `toggleMissionTag` 가 필요하고 그것은 `TokenProvider` **안**에 있다.
// 그래서 지휘관 몫만 이 부품이 맡는다 — Context 는 소속대 몫만 본다.
//
// 등록부는 이름 하나에 함수 하나라, 지휘관은 `unit-commander-token`,
// 소속대는 `unit-commander` 로 이름을 갈라 서로 덮어쓰지 않게 한다.
// ─────────────────────────────────────────────

export function UnitCommanderBridge() {
  const { tokens, toggleMissionTag, addLog } = useTokens();
  const { groups, release }                  = useUnitCommander();
  const { registerReleaser }                 = useRoleRelease();

  useEffect(() => registerReleaser('unit-commander-token', (tokenId, tokenLabel, toZoneKey) => {
    const group = groups[tokenId];
    if (!group) return;

    /*
     * 넓은 범위(건물 밖·계단실) 지휘관은 그 안에서 옮겨 다녀도 그대로다 —
     * 면 경계도 계단실의 층 칸도 실제 경계가 아니라 판 위의 칸이다.
     * 층 지휘관은 움직이는 즉시 놓는다 — 자리가 곧 그 층 슬롯이라 같은 층
     * 안에서 자리만 옮겨도 슬롯을 떠난 것이다(unitCommandScope 주석).
     */
    if (!isSpotScope(group.scope) && isInCommandScope(group.scope, toZoneKey)) return;

    release(tokenId);

    // 「단위」 임무 표시도 함께 뗀다 (달려 있을 때만)
    const token = tokens.find(t => t.id === tokenId);
    const hasMission = token?.missionTags?.some(m => m.label === MISSION_UNIT_COMMANDER.label);
    if (hasMission) toggleMissionTag(tokenId, MISSION_UNIT_COMMANDER);

    addLog({
      logType: 'post', tokenId, tokenName: tokenLabel, fromZoneId: '', toZoneId: '',
      note:    `단위지휘관 해제: ${unitCommanderZoneLabel(group.scope)} · ${tokenLabel}`,
      payload: {
        kind: 'unit-commander', floorId: group.scope,
        commanderTokenId: null, commanderLabel: null,
      },
    });
  }), [registerReleaser, groups, tokens, release, toggleMissionTag, addLog]);

  return null;
}
