// ─────────────────────────────────────────────
// 급수 판정 — 방수 가능 여부의 단일 출처
//
// **급수는 훈련의 전제다.** 급수원이 붙어 있고 그 급수원에 물이 남아 있어야
// 방수한다 — 예외 없이 전 차종에 적용된다.
//
// 예전에는 `송수·수량` 표시옵션이 이 판정 전체를 껐다(OFF 면 연결 없이 방수).
// 그 스위치는 없앴다 — 표시옵션은 이제 선을 그릴지만 정하고(showWaterLine),
// 방수 조건은 화면에 무엇이 보이든 똑같다. 보이는 것과 되는 것이 갈라져 있으면
// 선을 껐다는 이유로 규칙이 달라져 훈련이 어긋난다.
//
// 하나 남은 예외는 **방수포**다(아래 MONITOR_TYPES). 제 물탱크로 쏘므로
// 애초에 연결이라는 것이 없다.
//
// 수량 소진 시 진행 중인 방수를 멈추는 쪽은 WaterLevelContext 가 맡는다.
// 여기는 "지금 새로 방수를 걸 수 있는가"를 답한다.
// ─────────────────────────────────────────────

/** 진압대·구조대에 물을 대줄 수 있는 출발 종류 */
const SUPPLY_FROM_TYPES        = new Set(['pump', 'water_tank', 'indoor_hydrant', 'circulation']);
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
 * 방수를 못 하는 이유를 돌려준다. null 이면 방수할 수 있다.
 *
 * @param emptyVehicleIds 수량 0% 차량 id 집합 (WaterLevelContext). 없으면 잔량 검사 생략.
 */
export function sprayBlockReason(
  connections:     readonly ConnectionLike[],
  tokenId:         string,
  unitType:        string,
  emptyVehicleIds?: ReadonlySet<string> | null,
): SprayBlockReason | null {
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
  connections:     readonly ConnectionLike[],
  tokenId:         string,
  unitType:        string,
  emptyVehicleIds?: ReadonlySet<string> | null,
): boolean {
  return sprayBlockReason(connections, tokenId, unitType, emptyVehicleIds) === null;
}

/**
 * 사용자에게 보여줄 안내 문구.
 *
 * **짧게 끝낸다.** 예전에는 「급수차 지정필요: 펌프차 또는 물탱크차를 먼저 송수
 * 연결하세요」처럼 해법까지 적었는데, 이 문구가 뜨는 자리는 판 위 말풍선이고
 * (BoardNoticeHost) 2.6초 뒤 사라진다 — 훈련 중에 한 줄을 다 읽을 사람은 없다.
 * **무엇이 없는지**만 말하면 무엇을 해야 하는지는 이미 아는 사람들이다
 * (2026-09-09 사용자 결정).
 *
 * 차종으로 문구를 가르던 것도 함께 없앴다. 고가차든 관창이든 「급수가 없다」는
 * 사실은 하나이고, 무엇을 이어야 하는지는 그 차를 보면 안다.
 */
export function sprayBlockMessage(reason: SprayBlockReason, unitType: string): string {
  if (reason === 'empty') {
    return MONITOR_TYPES.has(unitType) ? '수량 소진' : '급수원 수량 소진';
  }
  return '급수 지정필요';
}
