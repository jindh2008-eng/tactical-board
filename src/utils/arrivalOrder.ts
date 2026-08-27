import type { UnitToken } from '../types';
import type { DispatchRosterItem } from '../types/settings';

// ─────────────────────────────────────────────
// 착대 — 훈련 중의 유효값
//
// 착대는 원래 설정모드에만 있는 개념이다(DispatchRosterItem.arrivalOrder).
// 훈련창에서 설정은 읽기 전용이라 로스터를 고칠 수 없으므로, 훈련 중에 바꾼
// 착대는 토큰에 **덮어쓰기 값**(UnitToken.arrivalOrder)으로 얹는다.
//
//   유효 착대 = 토큰의 덮어쓰기 ?? 로스터 값 ?? 없음(UNLISTED_ORDER)
//
// 덮어쓰기는 토큰과 함께 sessionStorage 로 저장되므로 별도 키가 필요 없고,
// `훈련 세팅` 이 sessionStorage 를 비우면 설정값으로 되돌아간다.
// ─────────────────────────────────────────────

/** 착대가 없는 출동대를 모으는 가상 순번 — 목록에서 항상 맨 뒤 */
export const UNLISTED_ORDER = 999;

/**
 * 착대를 갖는 종류인가.
 *
 * 유관기관(경찰·한전·가스…)과 직접입력은 우리 편성이 아니라 착대를 주지 않는다.
 * 훈련 중 만들면 「추가」 줄에 남는다. 설정 로스터에 착대와 함께 등록해 둔
 * 유관기관은 그 값을 그대로 쓴다 — 사용자가 명시적으로 정해 둔 것이다.
 */
export function hasArrivalOrder(unitType: string): boolean {
  return unitType !== 'agency' && unitType !== 'general';
}

/** 로스터 토큰 id(`roster-<id>`) → 착대 */
export function buildRosterOrderMap(
  roster: readonly DispatchRosterItem[],
): Map<string, number> {
  return new Map(roster.map(r => [`roster-${r.id}`, r.arrivalOrder ?? 1]));
}

export function effectiveOrder(
  token:    UnitToken,
  orderMap: ReadonlyMap<string, number>,
): number {
  return token.arrivalOrder ?? orderMap.get(token.id) ?? UNLISTED_ORDER;
}

/**
 * 새로 만든 대에 줄 착대 — **같은 종류 중 최대 + 1**.
 *
 * 설정모드 `dispatchRoster.nextOrderFor` 와 같은 규칙이되 모집단이 다르다.
 * 로스터만 보면 훈련 중 진압대를 연달아 둘 만들 때 둘 다 같은 번호를 받는다.
 * 지금 판에 있는 토큰 전체를 세야 한 칸씩 밀린다.
 *
 * 착대가 없는 종류는 undefined — 덮어쓰기를 얹지 않는다.
 */
export function nextArrivalOrder(
  unitType: string,
  tokens:   readonly UnitToken[],
  orderMap: ReadonlyMap<string, number>,
): number | undefined {
  if (!hasArrivalOrder(unitType)) return undefined;

  let max = 0;
  for (const t of tokens) {
    if (t.unitType !== unitType) continue;
    const order = effectiveOrder(t, orderMap);
    if (order === UNLISTED_ORDER) continue;
    max = Math.max(max, order);
  }
  return max + 1;
}

/**
 * 같은 착대 안의 정렬 — 진압대 > 물탱크 > 구조대 > 구급대 > 나머지.
 * 현장에서 부르는 순서라 목록에서도 그 순서로 선다.
 */
const UNIT_TYPE_PRIORITY: Record<string, number> = {
  suppression: 0,
  water_tank:  1,
  rescue:      2,
  ems:         3,
};

export function typePriority(unitType: string): number {
  return UNIT_TYPE_PRIORITY[unitType] ?? 99;
}
