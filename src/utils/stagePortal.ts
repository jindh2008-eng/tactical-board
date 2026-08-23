/**
 * 앱 공용 포털 루트 — 컨텍스트 메뉴·모달·오버레이가 들어가는 단일 컨테이너.
 *
 * ## 왜 document.body 를 직접 쓰지 않는가
 *
 * 훈련창은 고정 캔버스에 `transform: scale()` 을 걸어 배율을 만든다
 * (docs/SCREEN_STAGE_PLAN.md §3.3). `document.body` 는 그 변환 **밖**이라,
 * 상황판이 0.8배로 줄어도 거기 붙은 메뉴는 1.0배로 뜬다 — 크기도 위치도
 * 어긋난다. 포털 루트를 스테이지 **안**으로 옮기면 메뉴가 판과 같은 배율을
 * 따라간다.
 *
 * 부수 효과 하나가 이득이다. `transform` 이 걸린 조상 아래에서는
 * `position: fixed` 가 **그 조상 기준**으로 해석된다. 지금 뷰포트 기준으로
 * 잡혀 있는 메뉴 CSS 16개 파일이 자동으로 "스테이지 기준"이 되어, 큰
 * 화면에서 메뉴가 판 밖으로 날아가던 문제가 같이 사라진다.
 *
 * ## 왜 Context 가 아니라 모듈 전역인가
 *
 * 포털 대상이 React state 면 "스테이지가 마운트되기 전 첫 렌더"에서 대상이
 * 없어 자식 렌더를 막거나 한 번 더 렌더해야 한다. 여기서는 모듈이 로드될 때
 * 엘리먼트를 만들어 `document.body` 에 붙여 두므로 **대상이 항상 존재한다.**
 * 스테이지는 마운트 시 이 노드를 자기 안으로 옮기고, 언마운트 시 되돌린다
 * (`appendChild` 는 노드를 이동시킨다). React 는 컨테이너의 *자식*만
 * 관리하므로 컨테이너 자체가 옮겨 다녀도 안전하다.
 *
 * → docs/SCREEN_STAGE_PLAN.md §4.1
 */

const portalRoot = document.createElement('div');
portalRoot.className = 'app-portal-root';
document.body.appendChild(portalRoot);

/** createPortal 의 두 번째 인자로 쓴다. 항상 유효한 노드를 돌려준다. */
export function stagePortalTarget(): HTMLElement {
  return portalRoot;
}

/**
 * 포털 루트를 스테이지 안으로 옮길지 결정한다.
 *
 * ## 지금은 옮기지 않는다 (2026-08-22)
 *
 * 한 번 옮겼다가 되돌렸다. 옮기면 포털 안의 `position: fixed` 가 뷰포트가
 * 아니라 **캔버스** 기준이 되는데, 위치를 계산하는 코드 20여 곳이 전부
 * `getBoundingClientRect()` · `clientX` — 즉 뷰포트 px 를 쓴다. 실제로
 * 송수 연결선과 건물 화재 우클릭 메뉴가 어긋났다.
 *
 * 특히 세 오버레이 SVG(`.spray-svg`·`.wco-svg`·`.aerial-svg`)는
 * `position: fixed; inset: 0` 로 **뷰포트 전면을 전제**로 설계돼 있다.
 * 뷰포트 공간에 두면 변환 **후** 의 rect 를 재게 되므로 배율이 얼마든
 * 선이 판 위에 정확히 얹힌다 — 변환하는 것보다 오히려 견고하다.
 *
 * 얻을 것과 잃을 것: 스테이지 안에 두면 메뉴가 판과 같은 배율을 따르지만,
 * 훈련장 PC 배율은 **0.975** 라 차이가 2.5% 로 육안 식별이 안 된다.
 * 2.5% 를 얻자고 좌표계를 둘로 나눌 이유가 없다.
 *
 * 나중에 태블릿에서 **조작**까지 하게 되면 이 함수를 되살린다. 그때는
 * 아래 한 줄을 켜는 것으로 끝난다 — `viewportToStage`/`rectToStage`/
 * `stageBounds` 가 이미 자리를 잡고 있고, 지금은 항등 변환으로 동작한다.
 *
 * → docs/SCREEN_STAGE_PLAN.md §4.1
 */
export function attachStagePortalRoot(parent: HTMLElement | null): void {
  // 인자를 지금은 쓰지 않는다. 그래도 시그니처를 남겨 두는 이유는 되살릴 때
  // 호출부(StageRoot)를 건드리지 않기 위해서다 — 아래 한 줄만 바꾸면 된다.
  void parent;   // 되살리려면: (parent ?? document.body).appendChild(portalRoot);
  document.body.appendChild(portalRoot);
}

/* ─────────────────────────────────────────────
   좌표 변환 — 포털을 스테이지로 옮기면 반드시 따라와야 하는 짝

   포털 루트가 배율 안으로 들어가면서 그 안의 `position: fixed` 는
   뷰포트가 아니라 **캔버스** 기준이 됐다. 그런데 메뉴·툴팁 위치를 계산하는
   코드는 전부 `getBoundingClientRect()` · `clientX` · `window.innerWidth`,
   즉 **뷰포트 px** 를 쓴다. 두 좌표계가 어긋나면 메뉴가 엉뚱한 데 뜬다.
   포털 대상만 바꾸고 이 변환을 빠뜨리면 T-2 는 절반만 한 것이다.

   → docs/SCREEN_STAGE_PLAN.md §4.1
   ───────────────────────────────────────────── */

/**
 * 현재 배율. 포털 루트는 스테이지에 `inset: 0` 으로 깔려 있어
 * `offsetWidth`(변환 전) 대비 `getBoundingClientRect().width`(변환 후) 비가
 * 곧 배율이다. 스테이지 밖(설정모드)에서는 1 이 된다.
 */
export function stageScale(): number {
  const layoutW = portalRoot.offsetWidth;
  if (!layoutW) return 1;
  const s = portalRoot.getBoundingClientRect().width / layoutW;
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/** 캔버스 좌표계에서의 표시 영역 크기 — `window.innerWidth/Height` 를 대신한다. */
export function stageBounds(): { width: number; height: number } {
  const w = portalRoot.offsetWidth;
  const h = portalRoot.offsetHeight;
  return w && h ? { width: w, height: h } : { width: window.innerWidth, height: window.innerHeight };
}

/** 뷰포트 px → 캔버스 px. 스테이지 밖에서는 그대로 통과한다. */
export function viewportToStage(x: number, y: number): { x: number; y: number } {
  const r = portalRoot.getBoundingClientRect();
  const s = stageScale();
  return { x: (x - r.left) / s, y: (y - r.top) / s };
}

/** 뷰포트 기준 DOMRect → 캔버스 기준 사각형. 앵커 위치 계산에 쓴다. */
export function rectToStage(rect: DOMRect | { left: number; top: number; width: number; height: number }) {
  const origin = viewportToStage(rect.left, rect.top);
  const s = stageScale();
  return { left: origin.x, top: origin.y, width: rect.width / s, height: rect.height / s };
}
