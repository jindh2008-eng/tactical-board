// ─────────────────────────────────────────────
// 판 위 안내 말풍선 — 부르는 쪽과 그리는 쪽을 가른다
//
// 「급수차 지정필요」 같은 안내를 `alert()` 로 띄우고 있었다. 브라우저 기본 창은
// 판 밖에서 뜨고, 배율을 따르지 않으며, 확인을 누를 때까지 훈련을 멈춘다 —
// 훈련 중에 손이 멈추는 것이 가장 나쁘다.
//
// ## 왜 Context 가 아니라 모듈 전역인가
//
// 부르는 쪽이 **부르자마자 사라진다.** 우클릭 메뉴의 「방수개시」는 막히면
// 안내를 띄우고 그 자리에서 메뉴를 닫는데, 안내를 메뉴 안에서 그리면 메뉴와
// 함께 언마운트되어 한 프레임도 안 보인다. 그래서 표시는 오래 사는 한 곳
// (`BoardNoticeHost`, PlayPage 에 하나)이 맡고, 부르는 쪽은 함수만 호출한다.
//
// 같은 이유로 Context 도 아니다 — 안내를 띄우는 곳이 오버레이·토큰 핸들·메뉴로
// 흩어져 있어 Provider 안쪽인지 매번 따져야 한다. `stagePortalTarget()` 이
// 모듈 전역인 것과 같은 판단이다.
// ─────────────────────────────────────────────

export interface BoardNotice {
  message: string;
  /** 뷰포트 기준 지점 — 이 자리 **위**에 말풍선이 뜬다 */
  x: number;
  y: number;
  /** 같은 안내가 연달아 올 때도 다시 띄우기 위한 일련번호 */
  seq: number;
}

type Listener = (notice: BoardNotice) => void;

let listener: Listener | null = null;
let seq = 0;

/**
 * 안내를 띄운다. 표시하는 곳이 없으면 조용히 아무 일도 하지 않는다
 * (설정모드처럼 `BoardNoticeHost` 가 없는 화면).
 */
export function showBoardNotice(message: string, x: number, y: number): void {
  listener?.({ message, x, y, seq: ++seq });
}

/** 표시하는 쪽이 자기를 건다. 반환값을 부르면 등록이 풀린다 */
export function subscribeBoardNotice(fn: Listener): () => void {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

/** 요소 위에 띄울 때 쓰는 지점 — 그 요소의 위 가운데 */
export function noticeAnchorOf(el: Element | null | undefined): { x: number; y: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top };
}
