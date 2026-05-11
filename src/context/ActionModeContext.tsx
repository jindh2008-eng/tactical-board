import {
  createContext, useContext, useState, useCallback,
  useEffect, type ReactNode,
} from 'react';

// ─────────────────────────────────────────────
// ActionMode 타입 정의
// ─────────────────────────────────────────────

/**
 * rescue        : 출동대가 구조대상자를 선택하는 모드
 *                 sourceId = 출동대 토큰 ID
 *                 피해자 클릭 → rescueUnit(sourceId, victimLabel) 자동 실행
 *
 * select-floor  : 특정 층/구역을 선택하는 모드 (진입층 지정 등)
 *                 actionKey = 어떤 액션인지 구분 ('enter-floor' | 'suppress-floor' | ...)
 *
 * select-pump   : 부서 위치(펌프 위치)를 선택하는 모드
 *                 차량/펌프차 전용
 *
 * water-connect       : 송수 연결 모드 — 펌프/물탱크/소화전이 소스,
 *                       다음 클릭하는 토큰이 수신 대상이 됨
 *
 * aerial-floor-select : 고가차/굴절차 층 선택 모드
 *                       건물 층 레이블 클릭 → 해당 층으로 전개/방수 상태 확정
 *                       unitType = 'aerial'(고가차) | 'ladder'(굴절차)
 *                       actionLabel = '사다리전개' | '바스켓전개' | '방수'
 */
export type ActionModeState =
  | { type: null }
  | { type: 'rescue';              sourceId: string; selectedVictims: string[] }
  | { type: 'select-floor';        sourceId: string; actionKey: string }
  | { type: 'select-pump';         sourceId: string }
  | { type: 'water-connect';       sourceId: string; sourceType: string; sourceName?: string }
  | { type: 'aerial-floor-select'; sourceId: string; unitType: string; actionLabel: string }
  | { type: 'aerial-spray-target'; sourceId: string }
  | { type: 'spray-target';        sourceId: string; sourceZoneKey: string | null };

interface ActionModeContextValue {
  mode:       ActionModeState;
  enterMode:  (mode: ActionModeState) => void;
  clearMode:  () => void;
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const ActionModeContext = createContext<ActionModeContextValue | null>(null);

export function ActionModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ActionModeState>({ type: null });

  const enterMode = useCallback((m: ActionModeState) => setMode(m), []);
  const clearMode = useCallback(() => setMode({ type: null }), []);

  // 전역 ESC → 모드 취소
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') clearMode();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [clearMode]);

  return (
    <ActionModeContext.Provider value={{ mode, enterMode, clearMode }}>
      {children}
    </ActionModeContext.Provider>
  );
}

export function useActionMode(): ActionModeContextValue {
  const ctx = useContext(ActionModeContext);
  if (!ctx) throw new Error('useActionMode must be used within ActionModeProvider');
  return ctx;
}
