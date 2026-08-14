import {
  createContext, useContext, useState, useEffect,
  type Dispatch, type SetStateAction, type ReactNode,
} from 'react';
import { saveChecklistSession, loadChecklistSession } from '../utils/runtimeSession';

// ─────────────────────────────────────────────
// 진행상황관리(체크리스트) 완료 상태 — ChecklistPanel 밖에서도
// (D면 지휘절차 표시 박스 등) 구독할 수 있도록 컨텍스트로 승격
//
// sessionStorage 키: tactical-board.runtime.checklist
// → 무플 화면 새로고침 시 체크 현황을 복원한다.
//   화면 분리 후에는 이 값이 교수 태블릿 표시의 원천이 되므로
//   (docs/DUAL_SCREEN_SYNC_PLAN.md §5.6) 소실되면 양쪽이 함께 비어 버린다.
// ─────────────────────────────────────────────

interface ChecklistProgressContextValue {
  checked:    Set<string>;
  setChecked: Dispatch<SetStateAction<Set<string>>>;
}

const ChecklistProgressContext = createContext<ChecklistProgressContextValue | null>(null);

export function ChecklistProgressProvider({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState<Set<string>>(() => {
    const saved = loadChecklistSession();
    return new Set(saved?.checkedIds ?? []);
  });

  useEffect(() => {
    saveChecklistSession({ checkedIds: [...checked] });
  }, [checked]);

  return (
    <ChecklistProgressContext.Provider value={{ checked, setChecked }}>
      {children}
    </ChecklistProgressContext.Provider>
  );
}

export function useChecklistProgress(): ChecklistProgressContextValue {
  const ctx = useContext(ChecklistProgressContext);
  if (!ctx) throw new Error('useChecklistProgress must be used within ChecklistProgressProvider');
  return ctx;
}
