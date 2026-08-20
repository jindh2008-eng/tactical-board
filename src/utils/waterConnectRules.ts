// ─────────────────────────────────────────────
// 송수 연결 허용 규칙
//
// 지금까지는 규칙이 UI 에 흩어져 있었다 — 어떤 메뉴에 `송수` 버튼이 뜨는지로
// 출발점을 정하고, 도착점은 사실상 아무 토큰이나 허용했다. 드래그로 바꾸면서
// "끌고 가는 동안 유효한 대상만 밝게" 보여줘야 해서 한곳으로 모은다.
//
// 근거는 WaterLevelContext 의 유량 계산이다. 거기서 실제로 물이 흐르는 조합만
// 연결을 허용한다. (예: 옥외 소화전 → 진압대 직결은 유량 계산 대상이 아니라
// 연결해도 아무 일이 없었다 — 이제 막는다.)
// ─────────────────────────────────────────────

/** 출발 종류 → 연결 가능한 도착 종류 */
const CONNECT_RULES: Record<string, ReadonlySet<string>> = {
  // 옥외 소화전은 차량에 물을 채워준다
  hydrant:        new Set(['pump', 'water_tank']),
  // 옥내 소화전은 건물 안에서 관창으로 직결
  indoor_hydrant: new Set(['suppression', 'rescue']),
  // 펌프·물탱크가 현장 급수의 중심 — 관창·사다리·연결송수구·중계까지
  pump:           new Set(['suppression', 'rescue', 'aerial', 'ladder', 'siamese_pipe', 'pump', 'water_tank']),
  water_tank:     new Set(['suppression', 'rescue', 'aerial', 'ladder', 'siamese_pipe', 'pump', 'water_tank']),
};

/** 이 종류에서 송수를 시작할 수 있는가 */
export function isWaterSource(unitType: string): boolean {
  return unitType in CONNECT_RULES;
}

/** 설비별 최대 연결 수. 없으면 무제한 */
const MAX_CONNECTIONS: Record<string, number> = {
  hydrant:      2,   // 토출구 2개
  siamese_pipe: 2,   // 면당 2구
};

interface ConnectionLike {
  fromId:   string;
  toId:     string;
  fromType: string;
  toType:   string;
}

/** 출발 설비가 이미 최대 연결 수를 채웠는가 */
export function isSourceFull(
  connections: readonly ConnectionLike[],
  fromId:      string,
  fromType:    string,
): boolean {
  const max = MAX_CONNECTIONS[fromType];
  if (max === undefined) return false;
  return connections.filter(c => c.fromId === fromId).length >= max;
}

/** 도착 설비가 이미 최대 연결 수를 채웠는가 */
export function isTargetFull(
  connections: readonly ConnectionLike[],
  toId:        string,
  toType:      string,
): boolean {
  const max = MAX_CONNECTIONS[toType];
  if (max === undefined) return false;
  return connections.filter(c => c.toId === toId).length >= max;
}

/** 이 조합으로 송수를 연결할 수 있는가 */
export function canConnectWater(
  connections: readonly ConnectionLike[],
  fromId:      string,
  fromType:    string,
  toId:        string,
  toType:      string,
): boolean {
  if (fromId === toId) return false;
  if (!(CONNECT_RULES[fromType]?.has(toType))) return false;
  if (connections.some(c => c.fromId === fromId && c.toId === toId)) return false; // 중복
  if (isSourceFull(connections, fromId, fromType)) return false;
  if (isTargetFull(connections, toId, toType))     return false;
  return true;
}
