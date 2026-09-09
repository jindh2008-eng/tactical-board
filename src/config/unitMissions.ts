import type { TagPreset } from '../types/settings';

// ─────────────────────────────────────────────
// 출동대 임무 — **코드에 박는다**
//
// 예전에는 설정모드(임무·상태 프리셋)에서 종류별로 손수 채웠다. 임무는
// 시나리오마다 달라지는 값이 아니라 **소방 편성상 정해진 것**이라, 매번
// 채워 넣게 두면 빠뜨리거나 오타가 나고 훈련마다 이름이 달라진다.
// 2026-09-04 부터 여기 목록이 유일한 출처다.
//
//   단위 — 단위지휘관. 활동대와 차량이 **공통으로** 가진다. **손으로 붙인다.**
//   1선 — 1선펌프.    펌프차·물탱크차만. **자동.**
//   중요 — 중요물탱크. 펌프차·물탱크차만. **자동.**
//   순환급수 — 순환보수. 펌프차·물탱크차만. **자동**(소화전 순환칸에 놓는 것이 지정).
//              교리 용어는 「순환보수」이고 판 위 이름은 「순환급수」다 — 화면에서는
//              「무엇을 하는 자리인가」가 바로 읽혀야 한다(2026-09-09 사용자 결정).
//
// ## 급수 임무 셋은 **손으로 붙이지 않는다** (2026-09-09)
//
// 1선·중요·순환은 **연결과 배치가 정한다** — 소화전에 물린 차가 중요물탱크이고,
// 그 밑에 물린 차가 1선펌프이며, 순환칸에 선 차가 순환보수다
// (utils/waterMissions.ts 가 셈하고 WaterMissionBridge 가 붙인다).
//
// 그래서 우클릭 임무 메뉴에서 뺐다. 자동으로 붙는 것을 손으로도 뗄 수 있게 두면
// 뗀 것이 다음 렌더에 되살아나 버튼이 거짓말이 된다. 역할 슬롯의 ✕ 를 없앤 것과
// 같은 이유다(RoleSlot.tsx) — 지우는 방법이 둘이면 어느 쪽이 정본인지 흐려진다.
// → docs/WATER_SUPPLY_MISSION_PLAN.md §3.1
//
// 유관기관은 우리 지휘 계선 밖이라 임무가 없다(역할 슬롯의 `canHoldRole` 과
// 같은 기준 — RoleSlot.tsx).
//
// ## 상태(status)는 그대로 설정모드에 남는다
//
// 상태 태그는 훈련 시나리오에 따라 달라지므로 여기서 다루지 않는다.
// 설정모드의 임무 편집 칸은 이제 아무 데도 쓰이지 않는다 —
// docs/DEFERRED_PROPAGATION.md P-18.
// ─────────────────────────────────────────────

/*
 * 색은 셋 다 같다 — 역할 슬롯의 「소장」·「단위」 칩과 같은 파랑에 흰 글씨다.
 * 「무엇을 맡았는가」를 말하는 표시가 판 위에서 한 가지 모양이어야 읽기 쉽다.
 * (실제 색은 CSS 가 정한다 — TokenCard.css `.token-mission-label`)
 */
/** 단위지휘관 */
export const MISSION_UNIT_COMMANDER: TagPreset = { label: '단위', color: 'blue' };
/** 1선펌프 */
export const MISSION_FIRST_LINE:     TagPreset = { label: '1선', color: 'blue' };
/** 중요물탱크 */
export const MISSION_KEY_WATER_TANK: TagPreset = { label: '중요', color: 'blue' };
/** 순환보수 */
export const MISSION_CIRCULATION:    TagPreset = { label: '순환급수', color: 'blue' };

/**
 * 함께 가질 수 없는 임무 — **급수 임무 셋**.
 *
 * 한 차량이 1선이면서 동시에 중요물탱크일 수는 없고, 순환보수 중인 차가
 * 그 둘일 수도 없다 — 순환대는 소화전 옆에 있고 1선·중요는 중계 지점에 있다.
 * 「단위」와는 겹칠 수 있다(1선 + 단위 · 중요 + 단위). 하나를 켜면 같은 묶음의
 * 나머지가 꺼진다 — TokenContext.toggleMissionTag 가 강제한다.
 */
export const EXCLUSIVE_MISSION_GROUPS: string[][] = [
  [MISSION_FIRST_LINE.label, MISSION_KEY_WATER_TANK.label, MISSION_CIRCULATION.label],
];

/** 급수 임무 — 연결·배치에서 파생되므로 손으로 붙이지 않는다 */
export const DERIVED_MISSION_LABELS: readonly string[] = [
  MISSION_FIRST_LINE.label, MISSION_KEY_WATER_TANK.label, MISSION_CIRCULATION.label,
];

/**
 * 순환보수 칸이 생기는 소화전 거리(m).
 *
 * 이 거리를 넘으면 호스 연장만으로는 압력과 시간이 나오지 않아 차량이 물을
 * 실어 나른다. → docs/WATER_SUPPLY_MISSION_PLAN.md §6
 */
export const CIRCULATION_MIN_DISTANCE_M = 150;
/** 순환칸에 세울 수 있는 최대 대수 — 위로 쌓는다 */
export const CIRCULATION_MAX_UNITS = 5;
/**
 * 순환이 성립하는 최소 대수 — 소비·대기·보수이동 세 자리.
 *
 * **화면에서는 이 값으로 아무것도 막지 않는다.** 부족은 디브리핑·분석에서
 * 지적한다(같은 문서 §6.4). 로그를 읽는 쪽이 쓰라고 둔 값이다.
 */
export const CIRCULATION_MIN_UNITS = 3;

/** `label` 과 함께 설 수 없는 임무 이름들 */
export function conflictingMissionLabels(label: string): string[] {
  const group = EXCLUSIVE_MISSION_GROUPS.find(g => g.includes(label));
  return group ? group.filter(l => l !== label) : [];
}

/** 펌프차·물탱크차 — 물을 대는 두 종류만 1선·중요·순환을 가진다(자동 지정) */
export const WATER_SUPPLY_TYPES: ReadonlySet<string> = new Set(['pump', 'water_tank']);
/** 임무를 갖지 않는 종류 */
const NO_MISSION_TYPES   = new Set(['agency', 'hydrant']);

/**
 * **손으로 붙일 수 있는** 임무 목록. 없으면 빈 배열.
 *
 * 급수 임무 셋은 여기 없다 — 자동이다(위 주석). 그래서 지금 이 함수가 돌려주는
 * 것은 「단위」 하나뿐이고, 종류로 갈리는 것은 그것을 갖느냐 마느냐뿐이다.
 */
export function missionPresetsFor(unitType: string): TagPreset[] {
  if (NO_MISSION_TYPES.has(unitType)) return [];
  return [MISSION_UNIT_COMMANDER];
}
