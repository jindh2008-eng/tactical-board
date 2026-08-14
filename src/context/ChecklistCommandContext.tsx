import { createContext, useContext, useRef, useMemo, type ReactNode } from 'react';

/**
 * ChecklistCommandContext — 체크리스트 항목 토글을 외부에서 호출하기 위한 통로
 *
 * FireCommandContext 와 같은 register/call 패턴이다.
 * ChecklistPanel 이 마운트되면서 자신의 토글 처리기를 등록하고,
 * 화면 밖(원격 명령 수신부 등)에서 그 처리기를 호출한다.
 *
 * 목적: 지휘교수 태블릿에서 온 checklist.toggle 명령을
 *       무플 화면의 기존 부수효과 로직으로 그대로 흘려보내기 위함.
 *       → docs/DUAL_SCREEN_SYNC_PLAN.md §7 Phase M-1
 *
 * 이 방식을 택한 이유는 ChecklistPanel 의 분기 로직(화재·이벤트·출동대·도착·
 * 메시지·구조대상자 + 하위 항목 연쇄)을 한 줄도 건드리지 않기 위해서다.
 */

/** itemId 로 항목을 찾아 목표 상태(checking)로 맞춘다. 이미 그 상태면 무시. */
type ToggleItemFn = (itemId: string, checking: boolean) => void;

interface ChecklistCommandValue {
  register:       (fn: ToggleItemFn | null) => void;
  callToggleItem: ToggleItemFn;
}

const ChecklistCommandContext = createContext<ChecklistCommandValue | null>(null);

export function ChecklistCommandProvider({ children }: { children: ReactNode }) {
  const toggleRef = useRef<ToggleItemFn | null>(null);

  const value = useMemo<ChecklistCommandValue>(() => ({
    register:       fn => { toggleRef.current = fn; },
    callToggleItem: (itemId, checking) => toggleRef.current?.(itemId, checking),
  }), []);

  return (
    <ChecklistCommandContext.Provider value={value}>
      {children}
    </ChecklistCommandContext.Provider>
  );
}

export function useChecklistCommand(): ChecklistCommandValue {
  const ctx = useContext(ChecklistCommandContext);
  if (!ctx) throw new Error('useChecklistCommand must be used inside ChecklistCommandProvider');
  return ctx;
}
