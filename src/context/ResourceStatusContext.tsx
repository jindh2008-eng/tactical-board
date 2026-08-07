import {
  createContext, useContext, useState, type Dispatch, type SetStateAction, type ReactNode,
} from 'react';

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
  const [resourceAssigned, setResourceAssigned] = useState(false);

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
