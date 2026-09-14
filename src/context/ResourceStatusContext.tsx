import {
  createContext, useContext, useState, useCallback, type Dispatch, type SetStateAction, type ReactNode,
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
   * 대기1단계 운영 여부 — 기본은 미운영이다(2026-09-14 사용자 정의).
   * 미운영이면 출동대현황·추가출동대의 출동대가 대기1단계를 거치지 않고 A면으로 나간다.
   * 대기1단계 제목 옆 버튼이 누를 때마다 바꾼다(StandbyColumn BottomStandbyBoxes).
   */
  standby1Operating:    boolean;
  setStandby1Operating: Dispatch<SetStateAction<boolean>>;
  /**
   * 운영 중에 출동대가 대기1단계에 배치됐다 — 그 뒤로는 미운영으로 되돌릴 수 없다.
   * 풀리는 것은 `훈련 세팅` 뿐이다(세션을 비우고 Provider 가 다시 마운트된다).
   */
  standby1Locked: boolean;
  lockStandby1:   () => void;
}

const ResourceStatusContext = createContext<ResourceStatusContextValue | null>(null);

export function ResourceStatusProvider({ children }: { children: ReactNode }) {
  // 저장은 MedicalPostProvider가 한 키에 묶어서 한다(같은 성격의 상태라 파일을 나누지 않았다)
  const [resourceAssigned, setResourceAssigned]   = useState(() => loadPostsSession()?.resourceAssigned ?? false);
  const [standby1Operating, setStandby1Operating] = useState(() => loadPostsSession()?.standby1Operating ?? false);
  const [standby1Locked, setStandby1Locked]       = useState(() => loadPostsSession()?.standby1Locked ?? false);
  const lockStandby1 = useCallback(() => setStandby1Locked(true), []);

  return (
    <ResourceStatusContext.Provider value={{
      resourceAssigned, setResourceAssigned,
      standby1Operating, setStandby1Operating, standby1Locked, lockStandby1,
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
