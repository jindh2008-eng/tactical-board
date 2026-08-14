/**
 * 토큰/구조대상자 카드 드래그앤드롭 좌표 계산 유틸.
 *
 * 카드의 절대좌표(x,y)는 카드의 "중심"을 의미한다(렌더링 시
 * transform: translate(-50%, -50%) 적용). 드래그 시작 시 카드 내에서
 * 실제로 클릭한 지점(잡은 지점)을 기록해두고, 드롭 시 그 지점이 계속
 * 커서 아래 있도록 중심좌표를 역산한다 — 그렇지 않으면 카드 중앙이 아닌
 * 곳을 잡고 드래그했을 때 드롭 위치가 잡았던 지점만큼 어긋나 보인다.
 */

/** dragstart 시 카드 내에서 잡은 지점을 dataTransfer에 기록 */
export function setDragGrabOffset(e: React.DragEvent<HTMLElement>): void {
  const rect = e.currentTarget.getBoundingClientRect();
  e.dataTransfer.setData('grabOffsetX', String(e.clientX - rect.left));
  e.dataTransfer.setData('grabOffsetY', String(e.clientY - rect.top));
}

/**
 * 드롭 시 카드의 새 중심좌표를 **구역 대비 0~1 정규화 값**으로 계산한다.
 * grabOffset 정보가 없으면(과거 동작과 동일하게) 카드 중심을 기준으로 계산한다.
 *
 * 정규화하는 이유: 저장값이 px이면 해상도·배율이 바뀌어 구역 크기가 달라질 때
 * 토큰이 구역 안에서 밀린다. 0~1로 두면 구역이 커지든 작아지든 상대 위치가 유지되고,
 * 렌더도 left/top 퍼센트로 그대로 넘길 수 있다.
 * → docs/RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md Phase 4
 */
export function computeDropCenter(
  e:      React.DragEvent<HTMLElement>,
  rect:   DOMRect,
  nudgeX: number = 0,
  nudgeY: number = 0,
): { x: number; y: number } {
  const tokenW = parseFloat(e.dataTransfer.getData('tokenW')) || 40;
  const tokenH = parseFloat(e.dataTransfer.getData('tokenH')) || 14;

  const grabOffsetXRaw = e.dataTransfer.getData('grabOffsetX');
  const grabOffsetYRaw = e.dataTransfer.getData('grabOffsetY');
  const grabOffsetX = grabOffsetXRaw !== '' ? parseFloat(grabOffsetXRaw) : tokenW / 2;
  const grabOffsetY = grabOffsetYRaw !== '' ? parseFloat(grabOffsetYRaw) : tokenH / 2;

  const cursorX = (e.clientX - rect.left) + nudgeX;
  const cursorY = (e.clientY - rect.top)  + nudgeY;

  const rawX = cursorX - grabOffsetX + tokenW / 2;
  const rawY = cursorY - grabOffsetY + tokenH / 2;

  // 구역 경계로 클램프 (카드가 절반 이상 삐져나가지 않도록)
  const clampedX = Math.max(tokenW / 2, Math.min(rect.width  - tokenW / 2, rawX));
  const clampedY = Math.max(tokenH / 2, Math.min(rect.height - tokenH / 2, rawY));

  // 구역이 0폭/0높이로 측정되는 순간(숨겨진 탭 등)에는 중앙으로 떨군다
  return {
    x: rect.width  > 0 ? clampedX / rect.width  : 0.5,
    y: rect.height > 0 ? clampedY / rect.height : 0.5,
  };
}
