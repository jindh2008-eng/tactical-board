import {
  createContext, useContext, useState, type Dispatch, type SetStateAction, type ReactNode,
} from 'react';
import { loadPostsSession } from '../utils/runtimeSession';

// ─────────────────────────────────────────────
// 자원대기소 운영(지정) 여부 · 대기1단계 운영 여부 — 출동대현황의 더블클릭 이동 로직이
// 참조해야 해서 SimpleStandbyBox 밖에서도 구독 가능하도록 컨텍스트로 관리.
// 둘 다 「대기 박스의 출동대가 어디로 나가는가」를 정한다(utils/dispatchTarget).
// ─────────────────────────────────────────────

interface ResourceStatusContextValue {
  resourceAssigned:    boolean;
  setResourceAssigned: Dispatch<SetStateAction<boolean>>;
  /**
   * 대기1단계 운영 여부 — 기본은 운영이다(예전에는 늘 운영이었다).
   * 미운영이면 출동대현황·추가출동대의 출동대가 대기1단계를 거치지 않고 A면으로 나간다.
   * 대기1단계 제목 옆 [운영]·[미운영] 버튼이 바꾼다(StandbyColumn BottomStandbyBoxes).
   */
  standby1Operating:    boolean;
  setStandby1Operating: Dispatch<SetStateAction<boolean>>;
}

const ResourceStatusContext = createContext<ResourceStatusContextValue | null>(null);

export function ResourceStatusProvider({ children }: { children: ReactNode }) {
  // 저장은 MedicalPostProvider가 한 키에 묶어서 한다(같은 성격의 상태라 파일을 나누지 않았다)
  const [resourceAssigned, setResourceAssigned]   = useState(() => loadPostsSession()?.resourceAssigned ?? false);
  const [standby1Operating, setStandby1Operating] = useState(() => loadPostsSession()?.standby1Operating ?? true);

  return (
    <ResourceStatusContext.Provider value={{
      resourceAssigned, setResourceAssigned, standby1Operating, setStandby1Operating,
    }}>
      {children}
    </ResourceStatusContext.Provider>
  );
}

export function useResourceStatus(): ResourceStatusContextValue {
  const ctx = useContext(ResourceStatusContext);
  if (!ctx) throw new Error('useResourceStatus must be used within ResourceStatusProvider');
  return ctx;
}
