import { useEffect, type RefObject } from 'react';

/**
 * useUiScale — 훈련 화면 공통 배율
 *
 * 기준 화면 대비 현재 크기의 비율을 계산해
 *  1. 대상 요소에 `--ui-scale` CSS 변수를 심고
 *  2. 루트 글꼴(html)을 같은 비율로 조정한다
 * 두 번째가 핵심이다. 이 코드베이스는 치수를 rem 으로 쓰는 곳이 많아
 * 루트 글꼴 하나만 움직여도 글자·간격·아이콘이 함께 따라온다.
 * px 로 박힌 값들만 `--ui-scale` 로 개별 환산하면 된다.
 *
 * 루트를 건드려도 안전한 이유: /play 와 /settings 는 서로 다른 라우트라
 * 동시에 마운트되지 않는다. 언마운트 시 원래 값으로 되돌린다.
 *
 * → docs/RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md Phase 3
 */

/**
 * 기준 뷰포트 (CSS px).
 * 물리 3840×2160 4K PC 를 Windows 150% 배율로 쓸 때 실측한 값이며,
 * 여기서 세로는 상단 내비를 뺀 훈련 영역 높이다.
 * ★ 3840 은 물리 픽셀이므로 기준으로 쓰면 안 된다 (계획서 §0.1)
 */
export const UI_REF_W = 2560;
export const UI_REF_H = 1364;

/** 루트 글꼴 기준값 — App.css 의 `html, body, #root { font-size: 15px }` */
const ROOT_FONT_PX = 15;

/** 기하 배율 범위 — 패딩·토큰·아이콘 등 치수에 적용 */
const UI_SCALE_MIN = 0.50;
const UI_SCALE_MAX = 1.60;

/**
 * 글꼴 배율 하한.
 * 기하와 글꼴을 분리하는 이유는 계획서 §3.2 그대로다 — 작은 화면에서
 * "완전히 동일한 축소"와 "실제로 읽히는 크기"가 충돌하면 읽히는 쪽을 택한다.
 * 0.78 이면 기준 15px 본문이 11.7px 까지만 내려가 권장 하한(10~12px)을 지킨다.
 * 결과적으로 작은 화면일수록 글자가 상대적으로 커지는데, 이게 의도한 절충이다.
 */
const FONT_SCALE_MIN = 0.78;

export function useUiScale(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const root = document.documentElement;
    const prevRootFont = root.style.fontSize;

    function apply(w: number, h: number) {
      // 숨겨진 탭·전환 순간의 0 측정값은 무시한다.
      // 이걸 반영하면 화면이 0 배율로 굳어 복구되지 않는다 (계획서 §0.5).
      if (w <= 0 || h <= 0) return;

      const raw       = Math.min(w / UI_REF_W, h / UI_REF_H);
      const uiScale   = Math.max(UI_SCALE_MIN,   Math.min(UI_SCALE_MAX, raw));
      const fontScale = Math.max(FONT_SCALE_MIN, Math.min(UI_SCALE_MAX, raw));

      el!.style.setProperty('--ui-scale',   uiScale.toFixed(4));
      el!.style.setProperty('--font-scale', fontScale.toFixed(4));
      root.style.fontSize = `${(ROOT_FONT_PX * fontScale).toFixed(2)}px`;
    }

    function measure() {
      const el2 = ref.current;
      if (!el2) return;
      const rect = el2.getBoundingClientRect();
      apply(rect.width, rect.height);
    }

    // ResizeObserver 는 컨테이너 자체가 바뀌는 경우(패널 토글 등)를 잡는다.
    // 다만 렌더링 생명주기에 묶여 있어 화면이 합성되지 않는 환경에서는
    // 콜백이 전달되지 않는다 → window 이벤트를 백스톱으로 함께 건다.
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);

    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    measure();

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      root.style.fontSize = prevRootFont;
    };
  }, [ref]);
}
