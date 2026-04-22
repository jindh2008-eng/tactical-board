/** 이벤트 토큰 상태 — 실행창에서 변경 가능. '-' = 미지정(초기) */
export type EventStatus = '-' | '폭발' | '화재' | '초진' | '완진';

/** 설정 데이터 — 설정창에서 생성/관리 */
export interface EventSetupItem {
  id:      string;
  label:   string;    // 표시 이름 (예: '화재1', '폭발지점')
  enabled: boolean;   // 실행창 표시 여부
}

/** 드롭다운 순서: '-'(미지정) 첫 번째 */
export const EVENT_STATUS_ORDER: EventStatus[] = ['-', '화재', '초진', '완진', '폭발'];
