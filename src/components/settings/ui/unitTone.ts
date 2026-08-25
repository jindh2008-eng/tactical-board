/**
 * 로스터 unitType → 훈련모드 토큰 색 계열.
 *
 * `utils/dispatchArrival.ts` 의 `rosterItemColor` 와 **같은 분류**다 — 저쪽은
 * 훈련모드용 `TokenColor` 를 돌려주고 여기는 설정모드 CSS 수식 클래스 이름을
 * 돌려준다. 둘이 갈라지면 설정에서 만든 대가 훈련 화면에서 다른 색이 된다.
 *
 * 별도 파일인 이유는 쓰는 곳이 둘이기 때문이다 — 출동대 생성 패널과 도착 순서
 * 목록. 한쪽 컴포넌트 파일에 두고 다른 쪽이 가져다 쓰면 react-refresh 가
 * "컴포넌트 파일이 컴포넌트 아닌 것을 export 한다"고 잡는다.
 */
export type UnitTone = 'red' | 'yellow' | 'green' | 'vehicle' | 'agency';

export function unitTone(unitType: string): UnitTone {
  switch (unitType) {
    case 'suppression': return 'red';
    case 'rescue':      return 'yellow';
    case 'ems':         return 'green';
    case 'agency':
    case 'general':     return 'agency';
    default:            return 'vehicle';
  }
}
