// ─────────────────────────────────────────────
// 대기 박스(출동대현황·추가출동대)의 출동대를 어디로 내보내는가 — 한 곳에서 정한다.
//
//   자원대기소가 지정됐으면   → 자원대기소
//   아니면 대기1단계 운영 중 → 대기1단계
//   대기1단계도 미운영       → A면(2026-09-14 사용자 정의)
//
// 더블클릭(출동대현황·추가출동대)·차수 더블클릭·동승 펌프 하차 지점이 모두 이 규칙이다.
// 예전에는 세 파일이 `resourceAssigned ? 자원대기소 : 대기1단계` 를 저마다 적었다.
// ─────────────────────────────────────────────

export const ZONE_RESOURCE = 'standby-resource';
export const ZONE_STANDBY1 = 'standby-standby1';
export const ZONE_FACE_A   = 'face-A';

/**
 * 대기1단계가 운영 중이면 대기1단계, 아니면 A면.
 * 자원대기소를 보지 않는 자리 — 시간 도착(TokenContext)과 자원대기소에서 내보낼 때다.
 */
export function standby1OrFace(standby1Operating: boolean): string {
  return standby1Operating ? ZONE_STANDBY1 : ZONE_FACE_A;
}

/** 자원대기소(지정) → 대기1단계(운영) → A면 */
export function dispatchTarget(resourceAssigned: boolean, standby1Operating: boolean): string {
  return resourceAssigned ? ZONE_RESOURCE : standby1OrFace(standby1Operating);
}
