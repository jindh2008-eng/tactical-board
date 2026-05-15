import {
  createContext, useContext, useState, useLayoutEffect, useEffect, memo, type ReactNode,
} from 'react';

// ReadCtx와 WriteCtx를 분리하면:
// - PlayPage(WriteCtx 구독)는 슬롯 내용 변경 시 재렌더 안 함
// - NavSlot(ReadCtx 구독)만 재렌더 → 무한 루프 없음
// AppShell을 React.memo로 감싸 NavSlotProvider 재렌더가 하위로 전파되지 않도록 함

const ReadCtx  = createContext<ReactNode>(null);
const WriteCtx = createContext<(n: ReactNode) => void>(() => {});

export function NavSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<ReactNode>(null);
  return (
    <WriteCtx.Provider value={setSlot}>
      <ReadCtx.Provider value={slot}>
        {children}
      </ReadCtx.Provider>
    </WriteCtx.Provider>
  );
}

export const NavSlot = memo(function NavSlot() {
  return <>{useContext(ReadCtx)}</>;
});

export function useNavSlot(content: ReactNode): void {
  const setSlot = useContext(WriteCtx);

  // deps 없음: 호출 컴포넌트가 재렌더될 때마다 슬롯 갱신 (타이머·상태 변경 반영)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { setSlot(content); });

  // 언마운트 시 슬롯 초기화
  useEffect(() => () => setSlot(null), [setSlot]);
}
