// ─────────────────────────────────────────────
// 이벤트 종류
// ─────────────────────────────────────────────

export type EventType = 'fire' | 'gas' | 'electric';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  fire:     '화재',
  gas:      '가스',
  electric: '전기',
};

// ─────────────────────────────────────────────
// 상태값
// ─────────────────────────────────────────────

export type EventStatus = string;

export interface EventStatusItem {
  value: string;   // 저장·비교용 키
  label: string;   // 화면 표시 텍스트
  icon:  string;   // 원형 메뉴 버튼 아이콘 (이모지)
  color: string;   // 원형 버튼 활성 배경색 + 토큰 배경색
}

/** 이벤트 종류별 세부 상태 목록 */
export const EVENT_TYPE_STATUSES: Record<EventType, EventStatusItem[]> = {
  fire: [
    { value: '-',     label: '없음',   icon: '—',  color: '#3a3a42' },
    { value: '연소확대', label: '연소확대', icon: '🔥', color: '#D32F2F' },
    { value: '최성기',  label: '최성기', icon: '🔥', color: '#FF5722' },
    { value: '70%',   label: '70%',   icon: '🔥', color: '#FF9800' },
    { value: '50%',   label: '50%',   icon: '🔥', color: '#FFC107' },
    { value: '초진',   label: '초진',   icon: '🔥', color: '#424242' },
    { value: '완진',   label: '완진',   icon: '—',  color: '#757575' },
  ],
  gas: [
    { value: '-',     label: '없음',   icon: '—',  color: '#3a3a42' },
    { value: '폭발',   label: '폭발',   icon: '💥', color: '#8b0000' },
    { value: '누출',   label: '누출',   icon: '💨', color: '#1a4a2a' },
    { value: '화재',   label: '화재',   icon: '🔥', color: '#b83010' },
    { value: '제어불가', label: '제어불가', icon: '⚠️', color: '#5a1a7a' },
  ],
  electric: [
    { value: '-',    label: '없음',   icon: '—',  color: '#3a3a42' },
    { value: '폭발',  label: '폭발',   icon: '💥', color: '#8b0000' },
    { value: '불꽃',  label: '불꽃',   icon: '⚡', color: '#9a6a00' },
    { value: '열폭주', label: '열폭주', icon: '🌡️', color: '#7a3000' },
    { value: '화재',  label: '화재',   icon: '🔥', color: '#b83010' },
  ],
};

// ─────────────────────────────────────────────
// 이벤트 설정 데이터
// ─────────────────────────────────────────────

export interface EventSetupItem {
  id:         string;
  label:      string;
  enabled:    boolean;
  icon?:      string;      // 파일명 (예: 'LPG가스통.png')
  eventType?: EventType;   // 기본값: 'fire'
}

// ─────────────────────────────────────────────
// 아이콘 목록
// ─────────────────────────────────────────────

export const EVENT_ICON_FILES = [
  'LPG가스통.png',
  'LPG저장소.png',
  '소화전.png',
  '승용차.png',
  '용접용가스.png',
  '지게차.png',
  '탱크로리.png',
  '화물차.jpg',
] as const;

/** 이벤트 토큰의 eventType (기존 데이터 호환: undefined → 'fire') */
export function resolveEventType(item: EventSetupItem): EventType {
  return item.eventType ?? 'fire';
}
