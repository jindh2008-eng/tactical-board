import type { UnitCommandGroupMap } from './runtimeSession';

// ─────────────────────────────────────────────
// 단위지휘관 무리의 **범위(scope)** 셈법
//
// 무리는 지휘관 토큰 id 를 열쇠로 담고, 그 무리가 성립하는 자리를 `scope` 로
// 들고 있다(UnitCommanderContext 주석). 여기 있는 것은 그 자리를 따지는
// 순수 함수들이다 — Context 파일에 두면 Provider·훅과 섞여 Fast Refresh 가
// 깨지고, 화면 부품들이 Context 를 거치지 않고도 써야 할 계산이라 갈라 둔다.
// ─────────────────────────────────────────────

/**
 * 넓은 범위 둘 — **판에서는 칸으로 나뉘어 있지만 실제로는 하나로 이어진 공간**
 * 이다. 그 안에서 옮겨 다니는 것은 자리를 뜨는 것이 아니라서 지휘 관계가
 * 풀리지 않는다.
 *
 *   건물 밖  — A~D면. 면 경계는 실제 경계가 아니라 판 위의 칸이다.
 *   계단실   — 층마다 칸으로 그리지만 수직으로 하나로 이어진 통로다.
 *
 * 나머지(층 중앙 구역)는 **자리 하나**다. 그 층 슬롯이 곧 자리라, 벗어나면
 * — 같은 층 안에서 자리만 옮겨도 — 물러난다.
 */
export const EXTERIOR_SCOPE  = 'exterior';
export const STAIRWELL_SCOPE = 'stairwell';

/**
 * 순환급수팀 — **소화전마다 하나의 자리.**
 *
 * 순환칸에서 「단위」를 지정하면 그 팀 전체의 지휘관이라는 뜻이다
 * (2026-09-09 사용자 결정). 소속대를 따로 지정하지 않는다 — **줄 자체가
 * 무리**여서, 누가 그 밑인지는 칸에 서 있는 차들이 이미 말하고 있다.
 * 그래서 `members` 는 비어 있고, 무리는 순환칸에서 언제든 다시 센다.
 *
 * 「자리 하나짜리」다(isSpotScope). 칸을 떠나면 물러나고, 한 칸에 지휘관은
 * 하나다 — 건물 안 층과 같은 성질이고 건물 밖(여럿 가능)과 다르다.
 */
const CIRCULATION_SCOPE_PREFIX = 'circ-';

/** 소화전 id → 그 순환급수팀의 지휘 범위 */
export function circulationScope(hydrantId: string): string {
  return `${CIRCULATION_SCOPE_PREFIX}${hydrantId}`;
}

/** 순환급수팀 범위인가 */
export function isCirculationScope(scope: string): boolean {
  return scope.startsWith(CIRCULATION_SCOPE_PREFIX);
}

/** 구역 키 → 무리의 범위 */
export function commandScopeOf(zoneKey: string): string {
  if (zoneKey.startsWith('face-')) return EXTERIOR_SCOPE;
  if (zoneKey.endsWith('-stair'))  return STAIRWELL_SCOPE;
  return zoneKey;
}

/** 그 구역이 이 무리의 범위 안인가 */
export function isInCommandScope(scope: string, zoneKey: string | null): boolean {
  if (zoneKey === null) return false;
  if (scope === EXTERIOR_SCOPE)  return zoneKey.startsWith('face-');
  if (scope === STAIRWELL_SCOPE) return zoneKey.endsWith('-stair');
  return zoneKey === scope;
}

/**
 * **자리 하나짜리** 범위인가 — 층 중앙 구역이 그렇다.
 *
 * 자리 하나짜리는 움직이는 즉시 물러난다(그 층 슬롯을 떠난 것이므로).
 * 넓은 범위(건물 밖·계단실)는 그 안에 있는 한 그대로다.
 */
export function isSpotScope(scope: string): boolean {
  return scope !== EXTERIOR_SCOPE && scope !== STAIRWELL_SCOPE;
}

/**
 * 범위 → 사람이 읽는 이름. 로그 문구에 쓴다.
 *
 * 층 구역은 `3F-center`·`B1-center`, 요약 행은 `1F-3F-center` 꼴이다.
 * 층 레이블과 같은 순서로 「3~1층」·「지하1~3층」이라 읽는다(buildingData.ts).
 */
export function unitCommanderZoneLabel(scope: string): string {
  if (scope === EXTERIOR_SCOPE)  return '건물 외부';
  if (scope === STAIRWELL_SCOPE) return '계단실';
  /*
   * 소화전 이름은 설정에 있고 이 함수는 순수 함수라 닿지 않는다. 어느
   * 소화전인지는 로그 payload 의 `floorId`(= 이 범위 문자열)가 들고 있어
   * 분석에서 되찾을 수 있으므로, 사람이 읽는 문장은 여기까지만 말한다.
   */
  if (isCirculationScope(scope))  return '순환급수팀';

  const floorId = scope.endsWith('-center') ? scope.slice(0, -'-center'.length) : scope;
  if (floorId === 'RF') return '옥상';
  let m = floorId.match(/^(\d+)F-(\d+)F$/);
  if (m) return `${m[2]}~${m[1]}층`;
  m = floorId.match(/^B(\d+)-B(\d+)$/);
  if (m) return `지하${m[1]}~${m[2]}층`;
  m = floorId.match(/^B(\d+)$/);
  if (m) return `지하${m[1]}층`;
  m = floorId.match(/^(\d+)F$/);
  if (m) return `${m[1]}층`;
  return scope;
}

/** 그 범위를 맡은 지휘관 토큰 id. 건물 밖을 뺀 나머지는 한 범위에 하나뿐이다 */
export function commanderOfScope(groups: UnitCommandGroupMap, zoneKey: string): string | undefined {
  const scope = commandScopeOf(zoneKey);
  return Object.keys(groups).find(id => groups[id].scope === scope);
}

/** 그 토큰이 든 무리 — [지휘관 id, 범위] */
export function groupOfMember(
  groups: UnitCommandGroupMap,
  tokenId: string,
): { commanderId: string; scope: string } | undefined {
  const commanderId = Object.keys(groups).find(id => groups[id].members.includes(tokenId));
  return commanderId ? { commanderId, scope: groups[commanderId].scope } : undefined;
}
