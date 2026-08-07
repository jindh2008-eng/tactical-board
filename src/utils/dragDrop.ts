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
 * 드롭 시 카드의 새 중심좌표(구역 기준 상대좌표, 구역 경계로 클램프)를 계산한다.
 * grabOffset 정보가 없으면(과거 동작과 동일하게) 카드 중심을 기준으로 계산한다.
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

  return {
    x: Math.max(tokenW / 2, Math.min(rect.width  - tokenW / 2, rawX)),
    y: Math.max(tokenH / 2, Math.min(rect.height - tokenH / 2, rawY)),
  };
}
