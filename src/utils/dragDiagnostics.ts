/**
 * 출동대/구조대상자 드래그 진단용 순환 버퍼 (개발 모드 전용).
 * dragstart 미발생·차단, DataTransfer payload 누락, drop 거부 사유를
 * 사후에 확인할 수 있도록 최근 이벤트를 메모리에 보관한다.
 * (docs/TECHNICAL_IMPROVEMENT_PLAN.md P0-DRAG-01)
 */

export interface DragLogEntry {
  ts:     number;
  label:  string;   // 예: "TokenCard dragstart", "ZoneCell drop"
  detail: string;
}

const RING_SIZE = 60;
const ring: DragLogEntry[] = [];

export function logDragEvent(label: string, detail: string = ''): void {
  if (!import.meta.env.DEV) return;
  ring.push({ ts: Date.now(), label, detail });
  if (ring.length > RING_SIZE) ring.shift();
}

export function getDragLog(): DragLogEntry[] {
  return ring;
}

export function clearDragLog(): void {
  ring.length = 0;
}
