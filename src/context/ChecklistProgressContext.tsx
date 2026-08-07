import {
  createContext, useContext, useState, type Dispatch, type SetStateAction, type ReactNode,
} from 'react';

// ─────────────────────────────────────────────
// 진행상황관리(체크리스트) 완료 상태 — ChecklistPanel 밖에서도
// (D면 지휘절차 표시 박스 등) 구독할 수 있도록 컨텍스트로 승격
// ─────────────────────────────────────────────

interface ChecklistProgressContextValue {
  checked:    Set<string>;
  setChecked: Dispatch<SetStateAction<Set<string>>>;
}

const ChecklistProgressContext = createContext<ChecklistProgressContextValue | null>(null);

export function ChecklistProgressProvider({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

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
