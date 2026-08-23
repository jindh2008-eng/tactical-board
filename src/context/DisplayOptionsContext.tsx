import { createContext, useContext } from 'react';

/** 표시옵션 키 — 토글 진입점(`toggleOption`)이 받는 값 */
export type DisplayOptionKey =
  | 'waterSupply' | 'spray' | 'controlLine' | 'victims' | 'drawing';

export interface DisplayOptions {
  /**
   * 송수·수량 사용 여부. 송수 연결선 표시와 수량 게이지를 하나로 묶은 옵션이다.
   *
   * OFF 면 급수 계통을 아예 쓰지 않는 훈련이라는 뜻이다 — 송수 핸들·연결선·게이지가
   * 모두 사라지고, 방수는 급수 연결 없이 무조건 가능해진다.
   * ON 이면 전 차종(진압·구조·고가·굴절)이 송수 연결이 있어야만 방수할 수 있다.
   */
  showWaterSupply: boolean;
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
  showWaterSupply: true,
  showSpray:       true,
  showControlLine: true,
  showAllVictims:  false,
  showDrawingTools: false,
  toggleOption: () => {},
});

export function useDisplayOptions(): DisplayOptions {
  return useContext(DisplayOptionsContext);
}
