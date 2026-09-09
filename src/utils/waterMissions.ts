import {
  MISSION_CIRCULATION, MISSION_KEY_WATER_TANK, MISSION_FIRST_LINE, WATER_SUPPLY_TYPES,
} from '../config/unitMissions';

// ─────────────────────────────────────────────
// 급수 임무 파생 — 「중요」·「1선」·「순환급수」의 단일 출처
//
// 이 셋은 **연결과 배치가 정한다.** 손으로 붙이는 임무가 아니다
// (config/unitMissions.ts 주석 · docs/WATER_SUPPLY_MISSION_PLAN.md §3.1).
//
//   소화전에 물린 차          → 중요물탱크
//   순환칸에서 나간 선이 닿은 차 → 중요물탱크 (순환은 소화전의 연장이다)
//   중요물탱크가 물린 차       → 1선펌프
//   순환칸에 선 차            → 순환보수
//
// 여기는 **순수 함수만** 둔다. 화면에 붙이고 로그를 남기는 일은
// WaterMissionBridge 가 한다 — 그래야 쓰는 곳이 하나로 모인다.
//
// ## 1선 아래로는 내려가지 않는다
//
// 「2선」이라는 임무가 없다. 1선펌프는 관창을 물린 대를 가리키는 말이라
// 그 아래로 또 차를 물려도 이름이 없다.
//
// ## 사이클이 돌지 않는 이유
//
// 한 번 정해진 차는 **다시 바꾸지 않는다**(`assign` 이 이미 있으면 그냥 나온다).
// A→B, B→A 로 서로 물려 있어도 각자 한 번씩만 정해지고 멈춘다.
// ─────────────────────────────────────────────

export interface WaterMissionConn {
  fromId:   string;
  toId:     string;
  fromType: string;
}

/** 토큰 id → 임무 이름. 이 지도에 없으면 급수 임무가 없는 차다 */
export type WaterMissionMap = ReadonlyMap<string, string>;

/**
 * @param connections    지금 걸린 송수 연결 전부
 * @param circulationIds 순환칸에 놓인 차량 id
 * @param unitTypeOf     토큰 id → 차종. 모르는 id 는 undefined
 */
export function deriveWaterMissions(
  connections:    readonly WaterMissionConn[],
  circulationIds: ReadonlySet<string>,
  unitTypeOf:     (id: string) => string | undefined,
): WaterMissionMap {
  const result = new Map<string, string>();

  const isVehicle = (id: string) => {
    const type = unitTypeOf(id);
    return type !== undefined && WATER_SUPPLY_TYPES.has(type);
  };
  /** 먼저 정해진 것이 이긴다 — 덮어쓰지 않는다 */
  const assign = (id: string, label: string) => {
    if (!result.has(id) && isVehicle(id)) result.set(id, label);
  };

  // ① 순환 — 배치가 곧 지정이라 연결을 보지 않는다
  for (const id of circulationIds) assign(id, MISSION_CIRCULATION.label);

  // ② 중요 — 소화전 직결과 순환칸에서 나온 선
  for (const c of connections) {
    if (c.fromType === 'hydrant' || c.fromType === 'circulation') {
      assign(c.toId, MISSION_KEY_WATER_TANK.label);
    }
  }

  // ③ 1선 — 중요물탱크가 물린 차. 여기서 멈춘다
  const keyTankIds = [...result.entries()]
    .filter(([, label]) => label === MISSION_KEY_WATER_TANK.label)
    .map(([id]) => id);
  const keyTankSet = new Set(keyTankIds);
  for (const c of connections) {
    if (keyTankSet.has(c.fromId)) assign(c.toId, MISSION_FIRST_LINE.label);
  }

  return result;
}
