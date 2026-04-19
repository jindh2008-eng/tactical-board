/**
 * playStore — 실행(Play) 데이터 레이어
 *
 * 실행 중 생성·조작되는 토큰/로그 상태는 기존 Context가 담당합니다:
 *  - 출동대 토큰 · 로그:  TokenContext  (src/context/TokenContext.tsx)
 *  - 구조대상자 토큰:     VictimContext (src/context/VictimContext.tsx)
 *
 * 향후 시나리오 저장/불러오기, 초기화, 스냅샷 기능 추가 시
 * 이 파일에서 두 Context를 조합한 PlayStore로 확장합니다.
 *
 * 설계 원칙:
 *  - settingsStore 의 값은 직접 참조하지 않고 PlayPage 진입 시 clone 해서 사용
 *  - 실행 중 변경되는 상태(토큰 위치, 로그)는 이 레이어에서만 관리
 */
export { TokenProvider, useTokens } from '../context/TokenContext';
export { VictimProvider, useVictims } from '../context/VictimContext';
