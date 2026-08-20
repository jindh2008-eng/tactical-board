// ─────────────────────────────────────────────
// 토큰 조작 핸들의 표시 조건
//
// 관창·사다리·수량 게이지 같은 조작 핸들은 출동대가 현장(ABCD면 또는 건물)에
// 배치돼 있을 때만 의미가 있다. 출동대현황·자원대기소·대기1단계·직전대기·RIT·
// 임시의료소에서는 아직/이미 활동 중이 아니므로 핸들을 숨긴다.
// ─────────────────────────────────────────────

/** 대기·집결 성격의 구역 — 핸들을 띄우지 않는다 */
const OFF_BOARD_ZONE_KEYS = new Set(['medical-post', 'unit-add']);

/** 현장(ABCD면 또는 건물 층)에 배치된 상태인가 */
export function isOnTacticalBoard(zoneKey: string | null | undefined): boolean {
  if (!zoneKey) return false;                       // 출동대현황(미배치)
  if (OFF_BOARD_ZONE_KEYS.has(zoneKey)) return false;
  if (zoneKey.startsWith('standby-')) return false; // 자원대기소·대기1단계·직전대기·RIT
  return true;                                      // face-* 또는 층 구역
}

/**
 * 건물 외곽 방면(A~D면)에 배치된 상태인가.
 *
 * 방수 핸들은 이 조건을 쓴다. 건물 내부 층 구역은 폭이 좁아 토큰 하나에 붙는
 * 부속이 늘면 금세 읽기 어려워진다. 방수 "지점"은 건물 내부도 그대로 허용한다 —
 * 제한하는 것은 핸들이 뜨는 자리뿐이다.
 */
export function isOnBuildingFace(zoneKey: string | null | undefined): boolean {
  return !!zoneKey?.startsWith('face-');
}
