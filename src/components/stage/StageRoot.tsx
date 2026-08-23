import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { attachStagePortalRoot } from '../../utils/stagePortal';
import { CANVAS_H, CANVAS_PORTRAIT, CANVAS_LANDSCAPE_DEFAULT_W, landscapeCanvasWidth,
         OP_PANEL_W, PROC_PANEL_W, PORTRAIT_OP_W, PORTRAIT_PROC_W, PORTRAIT_LOG_W,
         ASPECT_TO_LANDSCAPE, ASPECT_TO_PORTRAIT, type Orientation } from './canvas';
import './StageRoot.css';

/**
 * StageRoot — 훈련창의 **유일한** 배율 지점.
 *
 * 고정 논리 캔버스에 화면을 그리고, 뷰포트에 맞춰 `transform: scale()` 을
 * 한 번만 건다. 캔버스가 변하지 않으므로 안쪽은 전부 px 로 그려도 되고,
 * 그 px 들이 서로 다른 속도로 어긋날 방법이 없다.
 *
 * 이전 방식(`useUiScale`)은 배율을 CSS 선언 1,157곳이 각자 따라가야 했고
 * — px 는 아예 안 따라가고, rem 은 하한 0.78, `--ui-scale` 은 하한 0.50,
 * % 는 컨테이너를 따라가서 — 기준 해상도를 벗어나면 넷이 갈라졌다.
 *
 * → docs/SCREEN_STAGE_PLAN.md §2.1, §3.3
 */

export function StageRoot({ children }: { children: ReactNode }) {
  const hostRef  = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [box, setBox] = useState({ w: 0, h: 0 });
  const [orientation, setOrientation] = useState<Orientation>('landscape');

  // 포털 루트 배치. 지금은 스테이지 밖(document.body)에 둔다 —
  // 근거는 utils/stagePortal.ts 의 attachStagePortalRoot 주석 참고.
  useLayoutEffect(() => {
    attachStagePortalRoot(stageRef.current);
    return () => attachStagePortalRoot(null);
  }, []);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    function measure(w: number, h: number) {
      // 숨겨진 탭·전환 순간의 0 측정값은 무시한다. 반영하면 배율 0 으로 굳는다.
      if (w <= 0 || h <= 0) return;
      setBox(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
      const aspect = w / h;
      setOrientation(prev => {
        if (aspect >= ASPECT_TO_LANDSCAPE) return 'landscape';
        if (aspect <= ASPECT_TO_PORTRAIT)  return 'portrait';
        return prev;                       // 둔 구간 — 직전 구성을 유지한다
      });
    }

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      measure(width, height);
    });
    ro.observe(el);

    // ── 백스톱 ───────────────────────────────────────────────────────
    //
    // ResizeObserver 는 렌더링 생명주기에 얹혀 있어 **프레임이 생성되지 않는
    // 동안에는 콜백이 아예 전달되지 않는다.** 탭이 백그라운드로 내려가
    // document.hidden 이 되면 rAF 가 멈추고 RO 도 함께 멈춘다
    // (실측: hidden 상태 11초간 rAF 0프레임 · RO 0회).
    function remeasure() {
      const r = hostRef.current?.getBoundingClientRect();
      if (r) measure(r.width, r.height);
    }

    // 회전·리사이즈는 **즉시 1회만** 잰다.
    // 여기에 지연 재측정을 덧붙였다가 iPad 에서 세로 전환이 아예 안 되는 회귀가
    // 났다(2026-08-22) — 늦게 도착한 측정값이 앞서 맞게 잡힌 방향을 되돌린 것으로
    // 보인다. 이 경로는 실기기에서 정상 동작이 확인된 상태이므로 건드리지 않는다.
    window.addEventListener('resize', remeasure);
    window.addEventListener('orientationchange', remeasure);

    // 백그라운드에 있는 동안 크기·방향이 바뀐 경우에만 지연 재측정이 필요하다.
    // iOS 는 visibilitychange 를 레이아웃 갱신 **전에** 던져서 즉시 재면 이전
    // 방향 값이 나온다. 이 경로는 원래 동작하지 않던 곳이라 여러 번 재도
    // 정상 회전을 망칠 수 없다.
    let rafId = 0;
    let timerId = 0;
    function onBecameVisible() {
      if (document.hidden) return;
      remeasure();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(remeasure);
      clearTimeout(timerId);
      timerId = window.setTimeout(remeasure, 350);
    }
    document.addEventListener('visibilitychange', onBecameVisible);
    window.addEventListener('pageshow', onBecameVisible);

    const rect = el.getBoundingClientRect();
    measure(rect.width, rect.height);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('orientationchange', remeasure);
      document.removeEventListener('visibilitychange', onBecameVisible);
      window.removeEventListener('pageshow', onBecameVisible);
    };
  }, []);

  // ── 캔버스 치수 ──
  // 가로는 **폭이 가변**이다. 훈련영역 종횡비에서 역산하면 hostW/canvasW 와
  // hostH/CANVAS_H 가 같아져 레터박스가 0 이 된다(§3.10.2). 남는 폭은 그리드의
  // 1fr 열(=상황판)이 흡수한다. 세로는 아직 고정이다(§3.10.4).
  const measured = box.w > 0 && box.h > 0;
  const canvas = orientation === 'landscape'
    ? { w: measured ? landscapeCanvasWidth(box.w / box.h) : CANVAS_LANDSCAPE_DEFAULT_W,
        h: CANVAS_H }
    : CANVAS_PORTRAIT;

  // contain — 캔버스 전체가 들어가는 최대 배율. 남는 쪽은 레터박스가 된다.
  // 가로에서 클램프에 걸리지 않았다면 두 비가 같으므로 여백이 0 이다.
  const scale = measured
    ? Math.min(box.w / canvas.w, box.h / canvas.h)
    : 1;

  // 패널 폭을 CSS 변수로 내려보낸다. canvas.ts 가 단일 출처이고 PlayPage.css 는
  // 숫자를 모른다 — 양쪽에 따로 박아 두면 어긋날 때 캔버스 폭 클램프가 틀어져
  // 레터박스가 조용히 되살아난다.
  const panelVars = orientation === 'landscape'
    ? { '--op-panel-w':   `${OP_PANEL_W}px`,
        '--proc-panel-w': `${PROC_PANEL_W}px` }
    : { '--op-panel-w':   `${PORTRAIT_OP_W}px`,
        '--proc-panel-w': `${PORTRAIT_PROC_W}px`,
        '--log-panel-w':  `${PORTRAIT_LOG_W}px` };

  return (
    <div className="stage-host" ref={hostRef} data-orientation={orientation}>
      <div
        className="stage"
        ref={stageRef}
        data-orientation={orientation}
        style={{
          width:     canvas.w,
          height:    canvas.h,
          transform: `translate(-50%, -50%) scale(${scale})`,
          ...panelVars,
        } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
