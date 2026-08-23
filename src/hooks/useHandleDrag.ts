import { useEffect, useRef } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';

// ─────────────────────────────────────────────
// 토큰 핸들 드래그 — 관창·사다리·수량 게이지·소화전 토출구 공용
//
// 왜 Pointer Events 인가:
//   - 끄는 동안 고무줄 선을 실시간으로 그려야 한다(HTML5 DnD 로는 지저분하다).
//   - 마우스·터치·S펜을 한 경로로 처리한다. 이 앱의 입력 목표가 터치 모니터다.
//   - 드롭 판정은 elementsFromPoint → [data-token-id] 로, 이 코드베이스가
//     이미 여러 곳에서 쓰는 방식과 같다.
//
// 핸들은 반드시 `.token-card` **바깥**(wrapper 자식)에 둘 것. 카드 안에 두면
// 토큰 이동용 HTML5 drag / useTouchDrag 와 물린다.
// ─────────────────────────────────────────────

/** useTouchDrag 와 같은 기준 — 이 거리를 넘겨야 드래그, 못 넘기면 클릭 */
const DRAG_START_DISTANCE = 8;
const SVG_NS = 'http://www.w3.org/2000/svg';

export interface HandleDropInfo {
  clientX:  number;
  clientY:  number;
  /** 놓은 지점의 토큰·설비 id (`data-token-id`). 없으면 null */
  targetId: string | null;
  /** 그 요소. 종류(`data-water-type`) 등을 읽을 때 쓴다 */
  targetEl: HTMLElement | null;
}

interface Options {
  enabled: boolean;
  /** 고무줄 선 색 */
  lineColor?: string;
  /** 선의 시작점을 잡을 요소. 없으면 핸들 자신의 중심에서 출발한다 */
  originRef?: RefObject<HTMLElement | null>;
  /** 드래그를 놓았을 때 */
  onDrop: (info: HandleDropInfo) => void;
  /** 임계값을 못 넘기고 뗐을 때(클릭) */
  onTap?: () => void;
  /** 드래그가 실제로 시작된 순간 (유효 대상 하이라이트용) */
  onDragStart?: () => void;
  /** 드래그가 끝난 순간 — 성공·취소 모두 */
  onDragEnd?: () => void;
}

interface DragState {
  pointerId: number;
  startX:    number;
  startY:    number;
  originX:   number;
  originY:   number;
  handle:    HTMLElement;
  svg:       SVGSVGElement | null;
  line:      SVGLineElement | null;
  active:    boolean;
}

function centerOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** 드래그 중에만 존재하는 고무줄 선 — React 리렌더 없이 직접 갱신한다 */
function createLine(color: string): { svg: SVGSVGElement; line: SVGLineElement } {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;z-index:9880;pointer-events:none;overflow:visible;';

  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '3');
  line.setAttribute('stroke-dasharray', '7 5');
  line.setAttribute('stroke-linecap', 'round');
  svg.appendChild(line);

  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('r', '4');
  dot.setAttribute('fill', color);
  svg.appendChild(dot);

  document.body.appendChild(svg);
  return { svg, line };
}

function updateLine(state: DragState, x: number, y: number): void {
  if (!state.line || !state.svg) return;
  state.line.setAttribute('x1', String(state.originX));
  state.line.setAttribute('y1', String(state.originY));
  state.line.setAttribute('x2', String(x));
  state.line.setAttribute('y2', String(y));
  const dot = state.svg.querySelector('circle');
  if (dot) { dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(y)); }
}

/** 놓은 지점 아래에서 토큰·설비를 찾는다 (핸들 자신이 속한 토큰은 건너뛴다) */
function findTarget(x: number, y: number, selfId: string | null): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const holder = el.closest<HTMLElement>('[data-token-id]');
    if (!holder) continue;
    const id = holder.getAttribute('data-token-id');
    if (id && id !== selfId) return holder;
  }
  return null;
}

export function useHandleDrag({
  enabled, lineColor = '#66ccff', originRef, onDrop, onTap, onDragStart, onDragEnd,
}: Options) {
  const stateRef = useRef<DragState | null>(null);
  // 콜백은 ref 로 들고 있는다. 아래 window 리스너·언마운트 정리가 최신 콜백을
  // 봐야 하는데, 매번 리스너를 다시 붙이면 드래그 중에 끊긴다.
  const cbRef = useRef({ onDrop, onDragEnd });
  cbRef.current = { onDrop, onDragEnd };

  function cleanup() {
    const s = stateRef.current;
    if (!s) return;
    s.svg?.remove();
    detachWindowListeners();
    try { s.handle.releasePointerCapture(s.pointerId); } catch { /* 이미 해제됨 */ }
    stateRef.current = null;
  }

  /* ─────────────────────────────────────────────
     고무줄 선이 화면에 남는 문제(잔상)

     선은 `document.body` 에 직접 붙인 <svg> 이고, 지우는 곳은 cleanup() 뿐이다.
     그런데 cleanup 을 부르는 onPointerUp/onPointerCancel 은 **핸들 엘리먼트의
     React 핸들러**라, 그 이벤트가 핸들에 도달하지 못하면 영영 안 지워진다.

     도달하지 못하는 경로가 실제로 있다.

     1. `setPointerCapture` 가 실패하면(try/catch 로 삼키고 진행한다) 포인터가
        핸들을 벗어나는 순간 up 이 **다른 엘리먼트**에서 발생한다.
     2. 캡처가 도중에 해제되면(`lostpointercapture`) 같은 일이 벌어진다.
     3. 드래그 중 핸들이 언마운트되면(토큰이 구역을 옮겨 리렌더되는 등)
        React 핸들러 자체가 사라진다.

     세 경우 모두 <svg> 가 body 에 남아 새로고침 전까지 지워지지 않는다.
     그래서 **window 레벨 백스톱**과 **언마운트 정리**를 둔다.
     ───────────────────────────────────────────── */
  const winRef = useRef<(() => void) | null>(null);

  function detachWindowListeners() {
    winRef.current?.();
    winRef.current = null;
  }

  function attachWindowListeners() {
    detachWindowListeners();
    const onUp     = (ev: PointerEvent) => endDrag(ev.clientX, ev.clientY, false, ev.pointerId);
    const onCancel = (ev: PointerEvent) => endDrag(ev.clientX, ev.clientY, true,  ev.pointerId);
    // lostpointercapture 는 따로 듣지 않는다 — 캡처를 잃어도 포인터는 살아 있고,
    // 실제 종료는 위 두 리스너가 window 에서 받는다.
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    winRef.current = () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }

  /**
   * 드래그 종료의 **단일 진입점**. 어느 경로로 들어와도 한 번만 처리된다 —
   * cleanup() 이 stateRef 를 비우므로 뒤이어 도착한 호출은 조용히 반환한다.
   */
  function endDrag(clientX: number, clientY: number, canceled: boolean, pointerId?: number) {
    const s = stateRef.current;
    if (!s) return;
    if (pointerId !== undefined && pointerId !== s.pointerId) return;
    const wasActive = s.active;
    const selfId = s.handle.closest<HTMLElement>('[data-token-id]')?.getAttribute('data-token-id') ?? null;
    cleanup();

    if (!wasActive) {
      if (!canceled) onTap?.();
      return;
    }
    cbRef.current.onDragEnd?.();
    if (canceled) return;

    const targetEl = findTarget(clientX, clientY, selfId);
    cbRef.current.onDrop({
      clientX, clientY,
      targetId: targetEl?.getAttribute('data-token-id') ?? null,
      targetEl,
    });
  }

  // 언마운트 백스톱 — 드래그 중 핸들이 사라져도 선을 반드시 지운다.
  // cleanup 을 의존성에 넣으면 매 렌더마다 효과가 다시 돌아 **진행 중인 드래그를
  // 취소한다.** 마운트/언마운트에 한 번씩만 돌아야 하므로 빈 배열이 맞다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => cleanup, []);

  function handlePointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (!enabled || e.button !== 0) return;
    // 토큰 이동 드래그·구역 클릭으로 새어나가지 않게 여기서 끊는다
    e.preventDefault();
    e.stopPropagation();

    const handle = e.currentTarget;
    const origin = centerOf(originRef?.current ?? handle);

    // 캡처 실패(포인터가 이미 사라진 경우 등)해도 드래그는 계속 진행한다
    try { handle.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    stateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      originX: origin.x, originY: origin.y,
      handle, svg: null, line: null, active: false,
    };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLElement>) {
    const s = stateRef.current;
    if (!s || e.pointerId !== s.pointerId) return;

    if (!s.active) {
      const dist = Math.hypot(e.clientX - s.startX, e.clientY - s.startY);
      if (dist < DRAG_START_DISTANCE) return;
      const { svg, line } = createLine(lineColor);
      s.svg = svg; s.line = line; s.active = true;
      attachWindowListeners();   // 핸들이 up 을 못 받아도 선이 남지 않게
      onDragStart?.();
    }
    updateLine(s, e.clientX, e.clientY);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLElement>) {
    endDrag(e.clientX, e.clientY, false, e.pointerId);
  }

  function handlePointerCancel(e: ReactPointerEvent<HTMLElement>) {
    endDrag(e.clientX, e.clientY, true, e.pointerId);
  }

  return {
    onPointerDown:   handlePointerDown,
    onPointerMove:   handlePointerMove,
    onPointerUp:     handlePointerUp,
    onPointerCancel: handlePointerCancel,
    // 핸들 위에서 시작한 조작이 토큰 메뉴·이동으로 번지지 않게 막는다
    onContextMenu:   (e: ReactMouseEvent<HTMLElement>) => { e.preventDefault(); e.stopPropagation(); },
    onClick:         (e: ReactMouseEvent<HTMLElement>) => { e.stopPropagation(); },
    draggable:       false as const,
  };
}
