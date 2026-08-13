import {
  createContext, useCallback, useContext, useMemo, useReducer, useRef,
  type ReactNode,
} from 'react';

export type DrawingColor = 'black' | 'red' | 'blue' | 'yellow';

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  color: DrawingColor;
  points: DrawingPoint[];
}

interface DrawingState {
  selectedColor: DrawingColor;
  strokes: DrawingStroke[];
  draft: DrawingStroke | null;
  history: DrawingStroke[][];
}

type DrawingAction =
  | { type: 'set-color'; color: DrawingColor }
  | { type: 'start'; stroke: DrawingStroke }
  | { type: 'append'; point: DrawingPoint }
  | { type: 'finish' }
  | { type: 'cancel-draft' }
  | { type: 'remove-stroke'; strokeId: string }
  | { type: 'clear-strokes' }
  | { type: 'undo' };

interface DrawingContextValue extends DrawingState {
  setSelectedColor: (color: DrawingColor) => void;
  startStroke: (point: DrawingPoint) => void;
  appendPoint: (point: DrawingPoint) => void;
  finishStroke: () => void;
  cancelDraft: () => void;
  removeStroke: (strokeId: string) => void;
  clearStrokes: () => void;
  undo: () => void;
}

const INITIAL_STATE: DrawingState = {
  selectedColor: 'red',
  strokes: [],
  draft: null,
  history: [],
};

const MAX_HISTORY = 50;

function appendHistory(history: DrawingStroke[][], strokes: DrawingStroke[]): DrawingStroke[][] {
  return [...history, strokes].slice(-MAX_HISTORY);
}

function drawingReducer(state: DrawingState, action: DrawingAction): DrawingState {
  switch (action.type) {
    case 'set-color':
      return { ...state, selectedColor: action.color };
    case 'start':
      return { ...state, draft: action.stroke };
    case 'append':
      if (!state.draft) return state;
      return {
        ...state,
        draft: { ...state.draft, points: [...state.draft.points, action.point] },
      };
    case 'finish':
      if (!state.draft) return state;
      if (state.draft.points.length <= 1) return { ...state, draft: null };
      return {
        ...state,
        strokes: [...state.strokes, state.draft],
        draft: null,
        history: appendHistory(state.history, state.strokes),
      };
    case 'cancel-draft':
      return state.draft ? { ...state, draft: null } : state;
    case 'remove-stroke': {
      if (!state.strokes.some(stroke => stroke.id === action.strokeId)) return state;
      return {
        ...state,
        strokes: state.strokes.filter(stroke => stroke.id !== action.strokeId),
        history: appendHistory(state.history, state.strokes),
      };
    }
    case 'clear-strokes':
      if (state.strokes.length === 0) {
        return state.draft ? { ...state, draft: null } : state;
      }
      return {
        ...state,
        strokes: [],
        draft: null,
        history: appendHistory(state.history, state.strokes),
      };
    case 'undo': {
      if (state.draft) return { ...state, draft: null };
      const previous = state.history.at(-1);
      if (!previous) return state;
      return {
        ...state,
        strokes: previous,
        history: state.history.slice(0, -1),
      };
    }
    default:
      return state;
  }
}

const DrawingContext = createContext<DrawingContextValue | null>(null);

export function DrawingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(drawingReducer, INITIAL_STATE);
  const nextIdRef = useRef(0);

  const setSelectedColor = useCallback((color: DrawingColor) => {
    dispatch({ type: 'set-color', color });
  }, []);

  const startStroke = useCallback((point: DrawingPoint) => {
    const id = `drawing-${Date.now()}-${nextIdRef.current++}`;
    dispatch({
      type: 'start',
      stroke: { id, color: state.selectedColor, points: [point] },
    });
  }, [state.selectedColor]);

  const appendPoint = useCallback((point: DrawingPoint) => {
    dispatch({ type: 'append', point });
  }, []);

  const finishStroke = useCallback(() => dispatch({ type: 'finish' }), []);
  const cancelDraft = useCallback(() => dispatch({ type: 'cancel-draft' }), []);
  const removeStroke = useCallback((strokeId: string) => {
    dispatch({ type: 'remove-stroke', strokeId });
  }, []);
  const clearStrokes = useCallback(() => dispatch({ type: 'clear-strokes' }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);

  const value = useMemo<DrawingContextValue>(() => ({
    ...state,
    setSelectedColor,
    startStroke,
    appendPoint,
    finishStroke,
    cancelDraft,
    removeStroke,
    clearStrokes,
    undo,
  }), [
    state, setSelectedColor, startStroke, appendPoint, finishStroke, cancelDraft,
    removeStroke, clearStrokes, undo,
  ]);

  return <DrawingContext.Provider value={value}>{children}</DrawingContext.Provider>;
}

// Context와 hook을 한 파일에서 관리하는 현재 프로젝트 패턴을 따른다.
// eslint-disable-next-line react-refresh/only-export-components
export function useDrawing(): DrawingContextValue {
  const ctx = useContext(DrawingContext);
  if (!ctx) throw new Error('useDrawing must be used within DrawingProvider');
  return ctx;
}
