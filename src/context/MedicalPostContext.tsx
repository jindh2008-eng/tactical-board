import {
  createContext, useContext, useState, useEffect, type Dispatch, type SetStateAction, type ReactNode,
} from 'react';
import { savePostsSession, loadPostsSession } from '../utils/runtimeSession';
import { useResourceStatus } from './ResourceStatusContext';

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
  // 새로고침에도 유지된다 — 설치 시각·소장 지명이 평가 대상이라 로그와 상태가 어긋나면 안 된다
  const [isInstalled, setIsInstalled]         = useState(() => loadPostsSession()?.medicalInstalled ?? false);
  const [assignedTokenId, setAssignedTokenId] = useState<string | null>(() => loadPostsSession()?.medicalChiefTokenId ?? null);

  // 자원대기소와 한 키에 함께 담는다 — 둘 다 '현장에 무엇을 세웠는가'라는 같은 성격이다
  const { resourceAssigned } = useResourceStatus();
  useEffect(() => {
    savePostsSession({
      medicalInstalled:    isInstalled,
      medicalChiefTokenId: assignedTokenId,
      resourceAssigned,
    });
  }, [isInstalled, assignedTokenId, resourceAssigned]);

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
