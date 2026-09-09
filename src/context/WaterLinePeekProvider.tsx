import { useMemo, useState, type ReactNode } from 'react';
import { WaterLinePeekContext } from './waterLinePeek';

/**
 * 짚은 송수라인 하나를 담는 Provider. 근거와 이 상태가 React 에 있어야 하는
 * 이유는 [waterLinePeek.ts](./waterLinePeek.ts) 주석에 적어 뒀다.
 *
 * 훈련이 초기화될 때(`runKey`) 함께 비워질 필요가 없다 — 짚기는 마우스를
 * 치우면 풀리는 순간의 표시라서 남을 것이 없다.
 */
export function WaterLinePeekProvider({ children }: { children: ReactNode }) {
  const [peekConnId, setPeekConnId] = useState<string | null>(null);
  const value = useMemo(() => ({ peekConnId, setPeekConnId }), [peekConnId]);
  return (
    <WaterLinePeekContext.Provider value={value}>
      {children}
    </WaterLinePeekContext.Provider>
  );
}
