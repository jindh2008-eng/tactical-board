import {
  createContext, useContext, useState, type Dispatch, type SetStateAction, type ReactNode,
} from 'react';

// ─────────────────────────────────────────────
// 임시의료소 설치 여부 + 담당 출동대(토큰 ID) — 컴포넌트 로컬 상태였던 것을
// 세션 범위 Context로 이동 (P0-MED-02). 설치 상태와 담당자 지정은 서로
// 다른 개념이므로 별도 필드로 관리한다 (P0-MED-01).
// ─────────────────────────────────────────────

interface MedicalPostContextValue {
  isInstalled:        boolean;
  setIsInstalled:     Dispatch<SetStateAction<boolean>>;
  assignedTokenId:    string | null;
  setAssignedTokenId: Dispatch<SetStateAction<string | null>>;
}

const MedicalPostContext = createContext<MedicalPostContextValue | null>(null);

export function MedicalPostProvider({ children }: { children: ReactNode }) {
  const [isInstalled, setIsInstalled]         = useState(false);
  const [assignedTokenId, setAssignedTokenId] = useState<string | null>(null);

  return (
    <MedicalPostContext.Provider value={{ isInstalled, setIsInstalled, assignedTokenId, setAssignedTokenId }}>
      {children}
    </MedicalPostContext.Provider>
  );
}

export function useMedicalPost(): MedicalPostContextValue {
  const ctx = useContext(MedicalPostContext);
  if (!ctx) throw new Error('useMedicalPost must be used within MedicalPostProvider');
  return ctx;
}
