import {
  createContext, useContext, useState, type Dispatch, type SetStateAction, type ReactNode,
} from 'react';
import { loadPostsSession } from '../utils/runtimeSession';

// ─────────────────────────────────────────────
// 자원대기소 운영(지정) 여부 — 출동대현황의 더블클릭 이동 로직이
// 참조해야 해서 SimpleStandbyBox 밖에서도 구독 가능하도록 컨텍스트로 관리
// ─────────────────────────────────────────────

interface ResourceStatusContextValue {
  resourceAssigned:    boolean;
  setResourceAssigned: Dispatch<SetStateAction<boolean>>;
}

const ResourceStatusContext = createContext<ResourceStatusContextValue | null>(null);

export function ResourceStatusProvider({ children }: { children: ReactNode }) {
  // 저장은 MedicalPostProvider가 한 키에 묶어서 한다(같은 성격의 상태라 파일을 나누지 않았다)
  const [resourceAssigned, setResourceAssigned] = useState(() => loadPostsSession()?.resourceAssigned ?? false);

  return (
    <ResourceStatusContext.Provider value={{ resourceAssigned, setResourceAssigned }}>
      {children}
    </ResourceStatusContext.Provider>
  );
}

export function useResourceStatus(): ResourceStatusContextValue {
  const ctx = useContext(ResourceStatusContext);
  if (!ctx) throw new Error('useResourceStatus must be used within ResourceStatusProvider');
  return ctx;
}
