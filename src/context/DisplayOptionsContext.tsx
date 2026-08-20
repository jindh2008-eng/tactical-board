import { createContext, useContext } from 'react';

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
}

export const DisplayOptionsContext = createContext<DisplayOptions>({
  showWaterSupply: true,
  showSpray:       true,
  showControlLine: true,
  showAllVictims:  false,
});

export function useDisplayOptions(): DisplayOptions {
  return useContext(DisplayOptionsContext);
}
