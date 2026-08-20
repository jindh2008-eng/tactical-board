// ─────────────────────────────────────────────
// 급수 판정 — 방수 가능 여부의 단일 출처
//
// `송수·수량` 표시옵션(DisplayOptions.showWaterSupply)이 이 판정의 스위치다.
//   OFF — 급수 계통을 쓰지 않는 훈련. 전 차종이 조건 없이 방수한다.
//   ON  — 급수원이 붙어 있고, 그 급수원에 물이 남아 있어야 방수한다.
//
// 수량 소진 시 진행 중인 방수를 멈추는 쪽은 WaterLevelContext 가 맡는다.
// 여기는 "지금 새로 방수를 걸 수 있는가"를 답한다.
// ─────────────────────────────────────────────

/** 진압대·구조대에 물을 대줄 수 있는 출발 종류 */
const SUPPLY_FROM_TYPES        = new Set(['pump', 'water_tank', 'indoor_hydrant']);
/** 고가차·굴절차는 압력 문제로 펌프·물탱크 직결만 인정한다(기존 규칙 유지) */
const AERIAL_SUPPLY_FROM_TYPES = new Set(['pump', 'water_tank']);
/** 건물 배관에서 받으므로 잔량 개념이 없는 급수원 */
const UNLIMITED_FROM_TYPES     = new Set(['indoor_hydrant']);

const AERIAL_TYPES  = new Set(['aerial', 'ladder']);
/** 자체 물탱크로 쏘는 방수포 차종 */
const MONITOR_TYPES = new Set(['pump', 'water_tank']);

interface ConnectionLike {
  fromId:   string;
  toId:     string;
  fromType: string;
}

/** 방수를 못 하는 이유. null 이면 가능 */
export type SprayBlockReason = 'no-supply' | 'empty';

/** 이 토큰으로 들어오는 급수 연결이 하나라도 있는가 */
export function hasWaterSupply(
  connections: readonly ConnectionLike[],
  tokenId:     string,
  unitType:    string,
): boolean {
  const allowed = AERIAL_TYPES.has(unitType) ? AERIAL_SUPPLY_FROM_TYPES : SUPPLY_FROM_TYPES;
  return connections.some(c => c.toId === tokenId && allowed.has(c.fromType));
}

/**
 * 방수를 못 하는 이유를 돌려준다.
 * 송수 미사용 훈련이면 언제나 null(가능).
 *
 * @param emptyVehicleIds 수량 0% 차량 id 집합 (WaterLevelContext). 없으면 잔량 검사 생략.
 */
export function sprayBlockReason(
  showWaterSupply: boolean,
  connections:     readonly ConnectionLike[],
  tokenId:         string,
  unitType:        string,
  emptyVehicleIds?: ReadonlySet<string> | null,
): SprayBlockReason | null {
  if (!showWaterSupply) return null;

  // 방수포 — 제 물탱크로 쏜다. 연결은 필요 없고 자기 잔량만 본다.
  if (MONITOR_TYPES.has(unitType)) {
    return emptyVehicleIds?.has(tokenId) ? 'empty' : null;
  }

  // 관창·고가·굴절 — 급수원이 붙어 있어야 하고, 그중 물이 남은 곳이 있어야 한다
  const allowed  = AERIAL_TYPES.has(unitType) ? AERIAL_SUPPLY_FROM_TYPES : SUPPLY_FROM_TYPES;
  const supplies = connections.filter(c => c.toId === tokenId && allowed.has(c.fromType));
  if (supplies.length === 0) return 'no-supply';

  const anyAlive = supplies.some(
    c => UNLIMITED_FROM_TYPES.has(c.fromType) || !emptyVehicleIds?.has(c.fromId),
  );
  return anyAlive ? null : 'empty';
}

/** 방수를 시작할 수 있는가 */
export function canStartSpray(
  showWaterSupply: boolean,
  connections:     readonly ConnectionLike[],
  tokenId:         string,
  unitType:        string,
  emptyVehicleIds?: ReadonlySet<string> | null,
): boolean {
  return sprayBlockReason(showWaterSupply, connections, tokenId, unitType, emptyVehicleIds) === null;
}

/** 사용자에게 보여줄 안내 문구 */
export function sprayBlockMessage(reason: SprayBlockReason, unitType: string): string {
  if (reason === 'empty') {
    return MONITOR_TYPES.has(unitType)
      ? '수량이 소진되어 방수할 수 없습니다.'
      : '급수원의 수량이 소진되어 방수할 수 없습니다.';
  }
  return AERIAL_TYPES.has(unitType)
    ? '급수차 지정필요: 펌프차 또는 물탱크차를 먼저 송수 연결하세요.'
    : '급수 지정필요: 펌프차·물탱크차 또는 옥내소화전을 먼저 송수 연결하세요.';
}
