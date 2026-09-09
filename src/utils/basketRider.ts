import type { UnitToken } from '../types';

// ─────────────────────────────────────────────
// 바스켓 탑승 — 구역 렌더에서 뺄지 판정
//
// 탄 활동대는 바스켓 옆에 그려지므로(AerialOverlay) 구역이 또 그리면 한
// 토큰이 두 번 보인다. 그렇다고 `ridingOn` 만 보고 빼면 **그리는 쪽이
// 없어졌을 때 토큰이 사라진다** — 전개가 풀린 차에 태운 채로 남거나, 차가
// 지워진 경우다. 계단실 단위지휘관이 그렇게 사라진 적이 있다(ZoneCell 주석).
//
// 그래서 **탄 차가 실제로 전개돼 있을 때만** 뺀다. 판정 조건이 그리는 조건
// (`activeTokens` = 전개된 고가·굴절차)과 같은 식이라 둘이 어긋날 수 없다.
// ─────────────────────────────────────────────

/** 이 토큰이 지금 바스켓에 그려지고 있는가 — 참이면 구역은 그리지 않는다 */
export function isDrawnInBasket(tokens: readonly UnitToken[], token: UnitToken): boolean {
  if (!token.ridingOn) return false;
  return tokens.some(t => t.id === token.ridingOn && t.aerialTarget != null);
}
