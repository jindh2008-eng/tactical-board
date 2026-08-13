import { useEffect, useRef, useState } from 'react';
import { useActionMode } from '../../context/ActionModeContext';
import {
  useDrawing, type DrawingColor, type DrawingPoint, type DrawingStroke,
} from '../../context/DrawingContext';
import './DrawingBoard.css';

const COLOR_HEX: Record<DrawingColor, string> = {
  black: '#1c1c1c',
  red: '#e53935',
  blue: '#1565c0',
  yellow: '#f9a825',
};

const COLOR_LABEL: Record<DrawingColor, string> = {
  black: '검정',
  red: '빨강',
  blue: '파랑',
  yellow: '노랑',
};

const COLORS: DrawingColor[] = ['black', 'red', 'blue', 'yellow'];
const SVG_SIZE = 1000;
const MIN_POINT_DISTANCE_PX = 3;
const ERASE_HIT_RADIUS_PX = 14;
const TOOLBAR_POSITION_KEY = 'tacticalBoardDrawingToolbarPos';

function strokePoints(stroke: DrawingStroke): string {
  return stroke.points
    .map(point => `${point.x * SVG_SIZE},${point.y * SVG_SIZE}`)
    .join(' ');
}

function pointFromEvent(
  event: React.PointerEvent<HTMLDivElement>,
): DrawingPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

function pointToSegmentDistance(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function findStrokeAt(
  strokes: DrawingStroke[],
  event: React.PointerEvent<HTMLDivElement>,
): string | null {
  const rect = event.currentTarget.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  let best: { id: string; distance: number } | null = null;

  for (let strokeIndex = strokes.length - 1; strokeIndex >= 0; strokeIndex -= 1) {
    const stroke = strokes[strokeIndex];
    for (let pointIndex = 1; pointIndex < stroke.points.length; pointIndex += 1) {
      const from = stroke.points[pointIndex - 1];
      const to = stroke.points[pointIndex];
      const distance = pointToSegmentDistance(
        px, py,
        from.x * rect.width, from.y * rect.height,
        to.x * rect.width, to.y * rect.height,
      );
      if (distance <= ERASE_HIT_RADIUS_PX && (!best || distance < best.distance)) {
        best = { id: stroke.id, distance };
      }
    }
  }
  return best?.id ?? null;
}

export function DrawingBoard() {
  const { mode, enterMode, clearMode } = useActionMode();
  const {
    selectedColor, strokes, draft, history,
    setSelectedColor, startStroke, appendPoint, finishStroke, cancelDraft,
    removeStroke, clearStrokes, undo,
  } = useDrawing();
  const isDrawing = mode.type === 'drawing';
  const isErasing = mode.type === 'drawing-erase';
  const isDrawingInteraction = isDrawing || isErasing;
  const previousModeRef = useRef(mode.type);
  const activePointerRef = useRef<number | null>(null);
  const lastClientPointRef = useRef<{ x: number; y: number } | null>(null);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolbarDragRef = useRef<{
    pointerId: number; startX: number; startY: number; originLeft: number; originTop: number;
  } | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ left: number; top: number } | null>(null);
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);

  // 저장된 도구모음 위치 복원 (화면 밖으로 벗어난 경우 화면 안으로 보정).
  useEffect(() => {
    const saved = localStorage.getItem(TOOLBAR_POSITION_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { left: number; top: number };
      if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
        setToolbarPos(clampToolbarPos(parsed.left, parsed.top));
      }
    } catch {
      // 손상된 저장값은 무시하고 기본 위치를 사용한다.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleResize() {
      setToolbarPos(pos => (pos ? clampToolbarPos(pos.left, pos.top) : pos));
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clampToolbarPos(left: number, top: number) {
    const el = toolbarRef.current;
    const width = el?.offsetWidth ?? 0;
    const height = el?.offsetHeight ?? 0;
    const maxLeft = Math.max(0, window.innerWidth - width);
    const maxTop = Math.max(0, window.innerHeight - height);
    return { left: Math.min(maxLeft, Math.max(0, left)), top: Math.min(maxTop, Math.max(0, top)) };
  }

  function handleGripPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const el = toolbarRef.current;
    if (!el) return;
    event.preventDefault();
    const rect = el.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    toolbarDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
    };
    setIsDraggingToolbar(true);
  }

  function handleGripPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = toolbarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setToolbarPos(clampToolbarPos(
      drag.originLeft + (event.clientX - drag.startX),
      drag.originTop + (event.clientY - drag.startY),
    ));
  }

  function handleGripPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = toolbarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    toolbarDragRef.current = null;
    setIsDraggingToolbar(false);
    setToolbarPos(pos => {
      if (pos) localStorage.setItem(TOOLBAR_POSITION_KEY, JSON.stringify(pos));
      return pos;
    });
  }

  // ESC, 그리기↔지우기 전환 또는 다른 작업 모드 진입 시 미완성 획을 남기지 않는다.
  useEffect(() => {
    const previousMode = previousModeRef.current;
    const previousWasDrawing = previousMode === 'drawing' || previousMode === 'drawing-erase';
    if (previousWasDrawing && previousMode !== mode.type) {
      cancelDraft();
      activePointerRef.current = null;
      lastClientPointRef.current = null;
    }
    previousModeRef.current = mode.type;
  }, [mode.type, cancelDraft]);

  useEffect(() => {
    if (!isDrawingInteraction) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      undo();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingInteraction, undo]);

  function eraseStrokeAt(event: React.PointerEvent<HTMLDivElement>) {
    const strokeId = findStrokeAt(strokes, event);
    if (strokeId) removeStroke(strokeId);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || activePointerRef.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRef.current = event.pointerId;
    lastClientPointRef.current = { x: event.clientX, y: event.clientY };
    if (isDrawing) startStroke(pointFromEvent(event));
    else if (isErasing) eraseStrokeAt(event);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    const last = lastClientPointRef.current;
    if (last && Math.hypot(event.clientX - last.x, event.clientY - last.y) < MIN_POINT_DISTANCE_PX) {
      return;
    }
    event.preventDefault();
    if (isDrawing) appendPoint(pointFromEvent(event));
    else if (isErasing) eraseStrokeAt(event);
    lastClientPointRef.current = { x: event.clientX, y: event.clientY };
  }

  function releasePointer(event: React.PointerEvent<HTMLDivElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerRef.current = null;
    lastClientPointRef.current = null;
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    releasePointer(event);
    if (isDrawing) finishStroke();
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    releasePointer(event);
    if (isDrawing) cancelDraft();
  }

  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    cancelDraft();
    activePointerRef.current = null;
    lastClientPointRef.current = null;
    clearMode();
  }

  return (
    <>
      <svg
        className="drawing-board__strokes"
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {[...strokes, ...(draft ? [draft] : [])].map(stroke => (
          <polyline
            key={stroke.id}
            points={strokePoints(stroke)}
            fill="none"
            stroke={COLOR_HEX[stroke.color]}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {isDrawingInteraction && (
        <div
          className={`drawing-board__input${isErasing ? ' drawing-board__input--erase' : ''}`}
          aria-label="전술상황판 전체 그리기 영역"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={handleContextMenu}
        />
      )}

      <div
        ref={toolbarRef}
        className={`drawing-toolbar${isDraggingToolbar ? ' drawing-toolbar--dragging' : ''}`}
        aria-label="그리기 도구"
        style={toolbarPos
          ? { position: 'fixed', left: toolbarPos.left, top: toolbarPos.top, right: 'auto', margin: 0 }
          : undefined}
      >
        <div
          className="drawing-toolbar__grip"
          aria-hidden="true"
          title="드래그하여 이동"
          onPointerDown={handleGripPointerDown}
          onPointerMove={handleGripPointerMove}
          onPointerUp={handleGripPointerUp}
          onPointerCancel={handleGripPointerUp}
        >
          ⠿
        </div>
        <button
          type="button"
          className={`drawing-toolbar__draw${isDrawing ? ' drawing-toolbar__draw--active' : ''}`}
          aria-pressed={isDrawing}
          aria-label={isDrawing ? '그리기 종료' : '그리기'}
          title={isDrawing ? '그리기 종료' : '그리기'}
          onClick={() => isDrawing ? clearMode() : enterMode({ type: 'drawing' })}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M3 21l1.6-5.6L15.4 4.6a2 2 0 0 1 2.83 0l1.17 1.17a2 2 0 0 1 0 2.83L8.6 19.4 3 21z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d="M13.8 6.2l3.9 3.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={`drawing-toolbar__erase${isErasing ? ' drawing-toolbar__erase--active' : ''}`}
          aria-pressed={isErasing}
          aria-label={isErasing ? '지우기 종료' : '지우기'}
          title={isErasing ? '지우기 종료' : '지우기'}
          onClick={() => isErasing ? clearMode() : enterMode({ type: 'drawing-erase' })}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M17.5 3.5l3 3a1.7 1.7 0 0 1 0 2.4L10.8 18.6H6.2l-2.7-2.7a1.7 1.7 0 0 1 0-2.4l11.6-11.6a1.7 1.7 0 0 1 2.4 0z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M7 16.5l-3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M6.2 18.6h9.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="drawing-toolbar__colors" aria-label="선 색상">
          {COLORS.map(color => (
            <button
              key={color}
              type="button"
              className={`drawing-toolbar__color${selectedColor === color ? ' drawing-toolbar__color--selected' : ''}`}
              style={{ '--drawing-color': COLOR_HEX[color] } as React.CSSProperties}
              aria-label={COLOR_LABEL[color]}
              aria-pressed={selectedColor === color}
              title={COLOR_LABEL[color]}
              onClick={() => setSelectedColor(color)}
            />
          ))}
        </div>
        <button
          type="button"
          className="drawing-toolbar__utility drawing-toolbar__utility--undo"
          aria-label="최근 그림 작업 실행 취소"
          title="실행 취소 (Ctrl+Z)"
          disabled={!draft && history.length === 0}
          onClick={undo}
        >
          ↶
        </button>
        <button
          type="button"
          className="drawing-toolbar__utility drawing-toolbar__clear drawing-toolbar__utility--clear"
          aria-label="전체 삭제"
          title="전체 삭제"
          disabled={strokes.length === 0 && !draft}
          onClick={() => {
            if (strokes.length === 0) {
              cancelDraft();
              return;
            }
            if (window.confirm('작성한 모든 선을 삭제하시겠습니까?')) clearStrokes();
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M4 7h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M9 7V4.5A1 1 0 0 1 10 3.5h4a1 1 0 0 1 1 1V7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M6.5 7l1 13a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M10 11v6M14 11v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </>
  );
}
