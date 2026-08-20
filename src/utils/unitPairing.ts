import type { UnitToken } from '../types';
import type { DispatchRosterItem } from '../types/settings';
import { UNIT_ADD_ZONE } from './unitAddZone';

// ─────────────────────────────────────────────
// 진압대 ↔ 펌프 연동 — "동승(mounted)"
//
// 진압대는 펌프를 타고 출동한다. 대기 박스(출동대현황·추가출동대)에 함께 있는 동안이
// 동승 상태이고, 이때만 둘을 하나로 다룬다 — 박스에서 펌프를 감추고, 박스를 떠날 때
// 함께 내보낸다(펌프는 자원대기소·대기1단계까지만 간다).
//
// 대원이 펌프에서 내리는 순간(= 대기 박스를 벗어난 순간) 동승은 끝나고,
// 그 뒤로는 서로의 이동·삭제에 일절 관여하지 않는다.
//
// 짝이 맺어지는 경로가 둘이라 한곳에서 합쳐 본다.
//   설정 로스터 — DispatchRosterItem.linkedTo (차량이 활동대를 가리킨다)
//   훈련 중 추가 — UnitToken.pairGroupId (함께 만들어진 토큰이 같은 값)
// ─────────────────────────────────────────────

/** 진압대와 펌프가 함께 대기하는 자리인가 — 출동대현황(null)·추가출동대 */
export function isPoolZone(zoneKey: string | null): boolean {
  return zoneKey === null || zoneKey === UNIT_ADD_ZONE;
}

/** roster 연동 토큰 id 는 `roster-<로스터 id>` 형식이다 */
function rosterIdOf(tokenId: string): string | null {
  return tokenId.startsWith('roster-') ? tokenId.slice('roster-'.length) : null;
}

/** 이 활동대에 딸린 차량 토큰 id 목록 */
export function linkedVehicleIds(
  unit:   UnitToken,
  tokens: readonly UnitToken[],
  roster: readonly DispatchRosterItem[],
): string[] {
  const ids = new Set<string>();

  const rosterId = rosterIdOf(unit.id);
  if (rosterId) {
    for (const item of roster) {
      if (item.linkedTo === rosterId) ids.add(`roster-${item.id}`);
    }
  }

  // 훈련 중 함께 만든 짝
  if (unit.pairGroupId) {
    for (const t of tokens) {
      if (t.id !== unit.id && t.pairGroupId === unit.pairGroupId) ids.add(t.id);
    }
  }

  return [...ids];
}

/** 이 차량을 데리고 다니는 활동대 토큰 id 목록 (linkedVehicleIds 의 반대 방향) */
function ownerUnitIds(
  vehicle: UnitToken,
  tokens:  readonly UnitToken[],
  roster:  readonly DispatchRosterItem[],
): string[] {
  const ids = new Set<string>();

  const rosterId = rosterIdOf(vehicle.id);
  if (rosterId) {
    const item = roster.find(r => r.id === rosterId);
    if (item?.linkedTo) ids.add(`roster-${item.linkedTo}`);
  }

  if (vehicle.pairGroupId) {
    for (const t of tokens) {
      if (t.id !== vehicle.id && t.pairGroupId === vehicle.pairGroupId) ids.add(t.id);
    }
  }

  return [...ids];
}

/**
 * 진압대에 동승 중인 펌프인가 — 짝인 진압대와 같은 대기 박스에 함께 있다.
 * 출동대현황·추가출동대에서는 이런 펌프를 숨긴다(진압대 하나로 다루기 위해서다).
 *
 * 짝을 잃은 펌프(진압대가 먼저 나갔거나, 홀로 만든 펌프)는 숨기지 않는다 —
 * 숨기면 대기 박스에서 꺼낼 방법이 없어진다.
 */
export function isMountedPump(
  token:  UnitToken,
  tokens: readonly UnitToken[],
  roster: readonly DispatchRosterItem[],
): boolean {
  if (token.unitType !== 'pump') return false;
  if (!isPoolZone(token.zoneKey)) return false;

  return ownerUnitIds(token, tokens, roster).some(id => {
    const owner = tokens.find(t => t.id === id);
    return owner !== undefined && owner.zoneKey === token.zoneKey;
  });
}

/**
 * 이 진압대에 동승 중인 펌프 id 목록.
 * 같은 대기 박스에 함께 있는 펌프만 골라낸다 — 이미 상황판에 나가 있는 펌프는
 * 진압대를 옮겨도 따라오지 않는다.
 */
export function mountedPumpIds(
  unit:   UnitToken,
  tokens: readonly UnitToken[],
  roster: readonly DispatchRosterItem[],
): string[] {
  if (!isPoolZone(unit.zoneKey)) return [];

  return linkedVehicleIds(unit, tokens, roster).filter(id => {
    const v = tokens.find(t => t.id === id);
    return v?.unitType === 'pump' && v.zoneKey === unit.zoneKey;
  });
}
