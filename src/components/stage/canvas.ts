/**
 * 캔버스 치수 — StageRoot.tsx 와 분리해 둔다.
 *
 * 컴포넌트 파일이 컴포넌트 외의 값을 export 하면 Fast Refresh 가 깨진다
 * (`react-refresh/only-export-components`). 이 코드베이스는 Provider/훅 때문에
 * 이미 그 오류를 여럿 안고 있지만, 새로 만드는 파일까지 늘릴 이유는 없다.
 *
 * ## 높이 1440 은 왜 고정인가
 *
 * 균일 배율에서 **캔버스 크기는 단위 선택일 뿐 표시 크기에 영향을 주지 않는다**
 * — 캔버스를 c 배로 키우고 값도 c 배로 키우면 배율이 1/c 이 되어 상쇄된다.
 * 따라서 고를 기준은 하나뿐이다: **기존 px 를 그대로 쓸 수 있는 크기.**
 * 훈련장 PC 훈련영역이 2560×1404 라 배율이 0.975 로 거의 1:1 이 되고,
 * 지금 코드의 px 를 환산 없이 그대로 쓸 수 있다.
 *
 * ## 폭은 왜 가변인가 (가로 모드)
 *
 * 폭을 2560 으로 못 박으면 캔버스 종횡비(1.778)와 훈련영역 종횡비가 어긋나는
 * 만큼이 **좌우 레터박스**가 된다. 창 모드에서는 한쪽 140px, 울트라와이드에서는
 * 472px 까지 벌어진다.
 *
 * 폭을 화면에서 역산하면 그 손실이 **구조적으로 0** 이 된다.
 *
 * ```
 * canvasW = 1440 × 종횡비   →   hostW/canvasW === hostH/1440
 * ```
 *
 * 두 비가 같아지므로 `min()` 이 무의미해지고 배율이 정확히 `hostH/1440` 이 된다.
 * 남는 폭은 전부 상황판(그리드의 `1fr` 열)이 흡수한다 — 패널은 내용에 맞춰
 * 설계된 폭을 유지하고, 넓어진 만큼은 토큰을 놓는 자리로 간다.
 *
 * → docs/SCREEN_STAGE_PLAN.md §3.1, §3.10.2
 */

/** 캔버스 높이 — 가로 모드에서 고정. 모든 캔버스 px 의 기준이 되는 값이다. */
export const CANVAS_H = 1440;

/**
 * 가로 모드의 좌우 패널 폭 (캔버스 px). 화면이 넓어져도 이 값은 변하지 않는다
 * — 패널 내용이 이 폭을 전제로 설계돼 있기 때문이다.
 *
 * 이 값은 두 곳에서 쓰인다: 아래 `SIDE_TOTAL`(캔버스 폭 클램프)과 CSS 의
 * `grid-template-columns`. **CSS 에 숫자를 다시 적지 않는다** — StageRoot 가
 * 이 값을 `--op-panel-w` / `--proc-panel-w` 로 심고 PlayPage.css 가 그걸 읽는다.
 * 예전에는 양쪽에 숫자가 따로 박혀 있었고, 어긋나면 클램프 계산이 틀어져
 * 레터박스가 조용히 되살아났다.
 */
export const OP_PANEL_W   = 719;
export const PROC_PANEL_W = 401;
const SIDE_TOTAL = OP_PANEL_W + PROC_PANEL_W;   // 1120

/**
 * 상황판 폭의 허용 범위 (캔버스 px).
 *
 * - **하한 900** — 건물 열의 고정부(계단실 93 + 화재표현 74 + 층라벨 29 = 196)에
 *   토큰을 놓을 가변 구역 100 을 더하면 건물 열이 296 이어야 한다. B:건물:D 비율을
 *   가장 불리한 `1:1:1`(설정 하한)로 잡으면 건물 열이 보드의 1/3 이므로 보드는 889.
 *   올려서 900.
 * - **상한 2600** — 그 이상 넓어지면 층이 지나치게 납작해진다. 넘어가는 폭은
 *   레터박스로 돌린다(21:9 까지는 상한에 닿지 않는다).
 *
 * 범위를 벗어나면 클램프가 걸리고 그만큼 레터박스가 되살아난다. 이게 안전한
 * 실패 방식이다 — 구성이 깨지느니 여백이 생기는 편이 낫다(계획서 §3.10.1).
 */
export const BOARD_MIN_W = 900;
export const BOARD_MAX_W = 2600;

const CANVAS_W_MIN = SIDE_TOTAL + BOARD_MIN_W;   // 2020
const CANVAS_W_MAX = SIDE_TOTAL + BOARD_MAX_W;   // 3720

/** 기본 가로 캔버스 — 훈련장 PC 기준값. 측정 전 첫 렌더의 폴백으로 쓴다. */
export const CANVAS_LANDSCAPE_DEFAULT_W = 2560;

/**
 * 세로 캔버스 9:16 — **아직 고정이다.**
 *
 * 세로도 같은 방식으로 가변화하려면 `TacticalArea` 의 `BOARD_INNER_H = 1432`
 * 상수를 먼저 파생값으로 바꿔야 한다. 그 상수가 건물↔A면 높이 비율의 클램프
 * 기준이라, 보드 높이가 변하는데 상수로 두면 클램프가 엉뚱한 범위로 잡혀
 * 상황판이 꼬인다(계획서 §3.10.4).
 *
 * 가로에서는 보드 높이가 언제나 `CANVAS_H` 라 그 상수가 참이므로 문제없다.
 */
export const CANVAS_PORTRAIT = { w: 1440, h: 2560 } as const;

/**
 * 세로 모드 하단 대역의 3열 폭 (캔버스 px) — 운영 / 지휘절차 / 이벤트 로그.
 *
 * 세 값의 합이 `CANVAS_PORTRAIT.w` 와 **정확히** 같아야 한다. 어긋나면 대역이
 * 캔버스를 넘치거나 남긴다. 로그 폭을 상수로 적지 않고 뺄셈으로 두는 이유가
 * 그것이다 — 합이 맞지 않을 방법을 없앤다.
 *
 * 지휘절차를 가로(401)와 비슷한 400 으로 둔 것은 패널 내부 배치를 손대지
 * 않기 위해서다.
 */
export const PORTRAIT_OP_W   = 640;
export const PORTRAIT_PROC_W = 400;
export const PORTRAIT_LOG_W  = CANVAS_PORTRAIT.w - PORTRAIT_OP_W - PORTRAIT_PROC_W;   // 400

/**
 * 훈련영역 종횡비로부터 가로 캔버스 폭을 구한다.
 * 반환값이 `1440 × aspect` 와 같으면 레터박스가 0, 클램프에 걸리면 그만큼 생긴다.
 */
export function landscapeCanvasWidth(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return CANVAS_LANDSCAPE_DEFAULT_W;
  const raw = CANVAS_H * aspect;
  return Math.round(Math.min(CANVAS_W_MAX, Math.max(CANVAS_W_MIN, raw)));
}

/**
 * 가로/세로 전환 경계.
 * 하나의 값으로 자르면 종횡비 1.0 근처에서 창을 조금만 흔들어도 구성이
 * 왕복한다. 훈련 중 이 깜빡임은 치명적이므로 둔 구간(히스테리시스)을 둔다.
 * → 계획서 §3.8
 */
export const ASPECT_TO_LANDSCAPE = 1.15;
export const ASPECT_TO_PORTRAIT  = 0.87;

export type Orientation = 'landscape' | 'portrait';
