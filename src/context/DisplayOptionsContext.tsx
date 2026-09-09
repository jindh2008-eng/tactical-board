import { createContext, useContext } from 'react';

/** 표시옵션 키 — 토글 진입점(`toggleOption`)이 받는 값 */
export type DisplayOptionKey =
  | 'waterLine' | 'spray' | 'controlLine' | 'victims' | 'drawing';

export interface DisplayOptions {
  /**
   * 송수라인 표시 여부 — **보이기만 정하는 옵션이다.**
   *
   * 예전 「송수·수량」은 연결선·수량 게이지·송수 손잡이·방수 가능 판정 네 가지를
   * 한꺼번에 껐다. 급수가 이제 훈련의 전제라(연결이 있어야 방수한다) 끄고 켤
   * 대상이 아니다 — 남은 것은 **선이 판을 덮는 문제**뿐이라 그것만 다룬다.
   *
   * OFF 라도 소화전↔차량·차량↔차량 선은 그대로 보인다. 사라지는 것은
   * **진압대·구조대로 가는 선**뿐이다 — 한 펌프에서 여러 대로 뻗어 판을 덮는
   * 것이 그쪽이고, 그 정보는 차량에 붙는 번호 배지가 대신 말한다(TokenCard).
   *
   * OFF 에도 예외가 하나 있다 — **송수를 끄는 동안에는 감춘 선이 다시 보인다.**
   * 이미 물을 받는 대인지 모르면 연결할 곳을 고를 수 없기 때문이다
   * (WaterConnectionOverlay.css `.wco-group--hidden`).
   */
  showWaterLine: boolean;
  showSpray:       boolean;
  /** 소방·경찰 통제선 사용 여부. OFF 면 띠와 설치 버튼이 모두 사라진다 */
  showControlLine: boolean;
  showAllVictims:  boolean;
  /**
   * 그리기 도구모음 표시 여부. 기본 꺼짐 — 상단 `표시옵션`에서 켠다.
   * 끄면 도구상자만 사라지고 **이미 그린 선은 남는다**(그리기를 지우는 옵션이 아니다).
   * 끄는 순간 그리기 모드가 켜져 있으면 함께 해제한다 — 도구상자가 없으면
   * 모드를 빠져나올 방법이 없기 때문이다.
   */
  showDrawingTools: boolean;
  /**
   * 옵션 토글. 표시옵션 UI 가 상단 nav 에서 **C면 좌측 상단**으로 내려가면서
   * 필요해졌다 — C면(ExteriorZone)은 PlayPage 에서 여러 단계 아래라 콜백을
   * prop 으로 내려보낼 수 없다. 값과 토글을 한 Context 에 두는 편이 맞다.
   */
  toggleOption: (key: DisplayOptionKey) => void;
}

export const DisplayOptionsContext = createContext<DisplayOptions>({
  showWaterLine:   true,
  showSpray:       true,
  showControlLine: true,
  showAllVictims:  false,
  showDrawingTools: false,
  toggleOption: () => {},
});

export function useDisplayOptions(): DisplayOptions {
  return useContext(DisplayOptionsContext);
}
