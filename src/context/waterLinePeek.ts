import { createContext, useContext } from 'react';

// ─────────────────────────────────────────────
// 송수라인 짚기(peek) — 배지가 가리키는 선 하나만 도드라지게
//
// 펌프·물탱크 토큰 위 번호 배지(TokenCard)에 마우스를 올리면 그 배지가 맡은
// 연결선이 밝아진다. 「송수라인」을 껐으면 감춰 둔 선이 되살아나기까지 한다
// (WaterConnectionOverlay.css `.wco-group--peek`).
//
// ## 왜 Context 인가 — DOM 을 직접 만졌다가 되돌렸다
//
// 처음에는 배지가 선 `<g>` 에 클래스를 직접 붙였다. 선은 스테이지 포털에,
// 배지는 토큰 안에 있어 부모-자식이 아니고 CSS `:hover` 로는 닿지 않으니
// 그게 싸 보였다. **틀렸다.** `<g>` 의 `className` 은 React 가 쥐고 있어서
// 오버레이가 다시 그려지는 순간 되쓰여 짚기가 조용히 풀린다 — 실측으로
// 확인했다(표시옵션을 토글해 재렌더시키면 클래스가 사라진다).
//
// 그래서 짚은 id 를 React 상태로 올렸다. 값이 바뀔 때 다시 그려지는 것은
// 오버레이 하나뿐이고(선 `<g>` 몇 개), 좌표를 옮기는 rAF 루프는 `connections`
// 만 보므로 영향이 없다.
//
// 짚는 것은 **한 번에 하나**다. 슬롯이 하나뿐이라 새로 짚으면 앞의 것이 풀린다.
// ─────────────────────────────────────────────

export interface WaterLinePeek {
  /** 지금 짚은 연결 id. null 이면 없음 */
  peekConnId: string | null;
  setPeekConnId: (connId: string | null) => void;
}

export const WaterLinePeekContext = createContext<WaterLinePeek>({
  peekConnId: null,
  setPeekConnId: () => {},
});

/** Provider 가 없어도 조용히 아무 일도 하지 않는다 — 짚기는 없어도 되는 기능이다 */
export function useWaterLinePeek(): WaterLinePeek {
  return useContext(WaterLinePeekContext);
}
