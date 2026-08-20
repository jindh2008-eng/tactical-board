import { useRef } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';

const DRAG_START_DISTANCE = 8;
const DROP_TARGET_SELECTOR = '[data-touch-drop-target], [data-zone-key]';

interface TouchDragOptions {
  enabled: boolean;
  payload: Record<string, string>;
  dragElementRef?: RefObject<HTMLElement | null>;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  cardWidth: number;
  cardHeight: number;
  source: HTMLElement;
  visual: HTMLElement;
  transfer: DataTransfer | null;
  active: boolean;
  previousTarget: HTMLElement | null;
  previousTransform: string;
  previousPointerEvents: string;
  previousUserSelect: string;
}

function createDataTransfer(payload: Record<string, string>, state: DragState): DataTransfer {
  const transfer = new DataTransfer();
  for (const [key, value] of Object.entries(payload)) transfer.setData(key, value);
  transfer.setData('tokenW', String(state.cardWidth));
  transfer.setData('tokenH', String(state.cardHeight));
  transfer.setData('grabOffsetX', String(state.grabOffsetX));
  transfer.setData('grabOffsetY', String(state.grabOffsetY));
  transfer.effectAllowed = 'move';
  return transfer;
}

function dispatchDragEvent(
  target: HTMLElement,
  type: 'dragenter' | 'dragover' | 'dragleave' | 'drop',
  clientX: number,
  clientY: number,
  transfer: DataTransfer,
): void {
  target.dispatchEvent(new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    dataTransfer: transfer,
  }));
}

function findDropTarget(clientX: number, clientY: number, visual: HTMLElement): HTMLElement | null {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (element === visual || visual.contains(element)) continue;
    const target = element.closest<HTMLElement>(DROP_TARGET_SELECTOR);
    if (target && target !== visual && !visual.contains(target)) return target;
  }
  return null;
}

/**
 * HTML drag-and-drop을 지원하지 않는 터치·S펜 입력을 기존 drop 핸들러에 연결한다.
 * 마우스는 브라우저 기본 drag 이벤트를 그대로 사용한다.
 */
export function useTouchDrag({
  enabled,
  payload,
  dragElementRef,
  onDragStart,
  onDragEnd,
}: TouchDragOptions) {
  const stateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const suppressContextMenuRef = useRef(false);

  function restoreVisual(state: DragState): void {
    state.visual.style.transform = state.previousTransform;
    state.visual.style.pointerEvents = state.previousPointerEvents;
    document.body.style.userSelect = state.previousUserSelect;
    delete state.visual.dataset.dragging;
  }

  function finishDrag(
    event: ReactPointerEvent<HTMLElement>,
    shouldDrop: boolean,
  ): void {
    const state = stateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    if (state.active) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = true;

      const target = shouldDrop
        ? findDropTarget(event.clientX, event.clientY, state.visual)
        : null;

      if (state.previousTarget && state.previousTarget !== target && state.transfer) {
        dispatchDragEvent(state.previousTarget, 'dragleave', event.clientX, event.clientY, state.transfer);
      }
      if (target && state.transfer) {
        dispatchDragEvent(target, 'drop', event.clientX, event.clientY, state.transfer);
      }

      restoreVisual(state);
      onDragEnd?.();
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }

    if (state.source.hasPointerCapture(event.pointerId)) {
      state.source.releasePointerCapture(event.pointerId);
    }
    stateRef.current = null;
    window.setTimeout(() => { suppressContextMenuRef.current = false; }, 0);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>): void {
    if (!enabled || event.pointerType === 'mouse') return;

    // S펜 측면 버튼 등 보조 버튼은 기존 contextmenu(우클릭) 처리에 맡긴다.
    if (event.button !== 0) {
      suppressContextMenuRef.current = false;
      return;
    }

    const source = event.currentTarget;
    const visual = dragElementRef?.current ?? source;
    const rect = source.getBoundingClientRect();
    suppressContextMenuRef.current = true;
    stateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabOffsetX: event.clientX - rect.left,
      grabOffsetY: event.clientY - rect.top,
      cardWidth: rect.width,
      cardHeight: rect.height,
      source,
      visual,
      transfer: null,
      active: false,
      previousTarget: null,
      previousTransform: visual.style.transform,
      previousPointerEvents: visual.style.pointerEvents,
      previousUserSelect: document.body.style.userSelect,
    };
    source.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>): void {
    const state = stateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.active && Math.hypot(dx, dy) < DRAG_START_DISTANCE) return;

    if (!state.active) {
      state.active = true;
      state.transfer = createDataTransfer(payload, state);
      state.visual.dataset.dragging = 'true';
      state.visual.style.pointerEvents = 'none';
      document.body.style.userSelect = 'none';
      onDragStart?.();
    }

    event.preventDefault();
    state.visual.style.transform = `${state.previousTransform} translate3d(${dx}px, ${dy}px, 0)`;

    const target = findDropTarget(event.clientX, event.clientY, state.visual);
    if (state.previousTarget !== target && state.transfer) {
      if (state.previousTarget) {
        dispatchDragEvent(state.previousTarget, 'dragleave', event.clientX, event.clientY, state.transfer);
      }
      if (target) dispatchDragEvent(target, 'dragenter', event.clientX, event.clientY, state.transfer);
      state.previousTarget = target;
    }
    if (target && state.transfer) {
      dispatchDragEvent(target, 'dragover', event.clientX, event.clientY, state.transfer);
    }
  }

  function onClickCapture(event: ReactMouseEvent<HTMLElement>): void {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  function onContextMenuCapture(event: ReactMouseEvent<HTMLElement>): void {
    if (!suppressContextMenuRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finishDrag(event, true),
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finishDrag(event, false),
    onClickCapture,
    onContextMenuCapture,
  };
}
