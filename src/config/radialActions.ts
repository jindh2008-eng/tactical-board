import type { TokenColor } from '../types';

// ─────────────────────────────────────────────
// 액션 정의 타입
// ─────────────────────────────────────────────

export type BadgeSpec = { line1: string; line2?: string; color?: TokenColor };

/**
 * RadialActionDef — 각 버튼 클릭 시 실행될 동작
 *
 * toggle-badge  : 해당 line1의 배지가 있으면 제거, 없으면 추가 (토글)
 * open-badge-panel : 배지 관리 서브 패널 열기 (추가/삭제/프리셋)
 * enter-mode    : ActionMode 진입 (단계형 액션 시작)
 * move-to       : 해당 zoneKey로 즉시 이동
 */
export type RadialActionDef =
  | { type: 'toggle-badge';    badge: BadgeSpec }
  | { type: 'open-badge-panel' }
  | { type: 'enter-mode'; modeType: 'rescue' | 'select-floor' | 'select-pump'; actionKey?: string }
  | { type: 'move-to'; zoneKey: string };

/**
 * 버튼 색상 테마
 * default  : 어두운 청회색 (일반)
 * warning  : 주황/노랑 (주의 상태)
 * info     : 파랑 (정보/방수)
 * success  : 초록 (완료/정상)
 * danger   : 빨강 (철수/위험)
 * purple   : 보라 (배지 관리)
 */
export type RadialColorScheme = 'default' | 'warning' | 'info' | 'success' | 'danger' | 'purple';

/** 4방향 위치 */
export type RadialPosition = 'top' | 'right' | 'bottom' | 'left';

export interface RadialItemDef {
  position:    RadialPosition;
  label:       string;       // 버튼 윗줄
  sublabel?:   string;       // 버튼 아랫줄 (작게)
  colorScheme: RadialColorScheme;
  action:      RadialActionDef;
}

// ─────────────────────────────────────────────
// 공통 배지 관리 버튼 (9시 방향 고정)
// ─────────────────────────────────────────────

const BADGE_BTN: RadialItemDef = {
  position:    'left',
  label:       '배지',
  sublabel:    '관리',
  colorScheme: 'purple',
  action:      { type: 'open-badge-panel' },
};

// ─────────────────────────────────────────────
// unitType별 액션 정의
// ─────────────────────────────────────────────

/**
 * 각 unitType에 대해 최대 4개의 방향 버튼을 정의.
 * position이 겹치면 마지막 것이 우선 (선언 순서대로).
 * BADGE_BTN(left)는 모든 타입에 공통 포함.
 */
const UNIT_RADIAL_ACTIONS: Record<string, RadialItemDef[]> = {

  // ── 진압대 (빨강) ──────────────────────────────
  suppression: [
    {
      position:    'top',
      label:       '진입보고',
      colorScheme: 'warning',
      action:      { type: 'toggle-badge', badge: { line1: '진입중', color: 'yellow' } },
    },
    {
      position:    'right',
      label:       '방수개시',
      colorScheme: 'info',
      action:      { type: 'toggle-badge', badge: { line1: '방수중', color: 'blue' } },
    },
    {
      position:    'bottom',
      label:       '철수',
      colorScheme: 'danger',
      action:      { type: 'toggle-badge', badge: { line1: '철수중', color: 'white' } },
    },
    BADGE_BTN,
  ],

  // ── 구조대 (노랑) ──────────────────────────────
  rescue: [
    {
      position:    'top',
      label:       '구조개시',
      colorScheme: 'warning',
      action:      { type: 'toggle-badge', badge: { line1: '구조중' } },
    },
    {
      position:    'right',
      label:       '대상선택',
      sublabel:    '→ 클릭',
      colorScheme: 'success',
      action:      { type: 'enter-mode', modeType: 'rescue' },
    },
    {
      position:    'bottom',
      label:       '철수',
      colorScheme: 'danger',
      action:      { type: 'toggle-badge', badge: { line1: '철수중', color: 'white' } },
    },
    BADGE_BTN,
  ],

  // ── 구급대 (초록) ──────────────────────────────
  ems: [
    {
      position:    'top',
      label:       '응급처치',
      colorScheme: 'success',
      action:      { type: 'toggle-badge', badge: { line1: '처치중', color: 'green' } },
    },
    {
      position:    'right',
      label:       '이송',
      sublabel:    '의료소',
      colorScheme: 'info',
      action:      { type: 'move-to', zoneKey: 'medical-post' },
    },
    {
      position:    'bottom',
      label:       '철수',
      colorScheme: 'danger',
      action:      { type: 'toggle-badge', badge: { line1: '철수중', color: 'white' } },
    },
    BADGE_BTN,
  ],

  // ── 펌프차 ─────────────────────────────────────
  pump: [
    {
      position:    'top',
      label:       '부서완료',
      colorScheme: 'success',
      action:      { type: 'toggle-badge', badge: { line1: '부서완료' } },
    },
    {
      position:    'right',
      label:       '방수개시',
      colorScheme: 'info',
      action:      { type: 'toggle-badge', badge: { line1: '방수중', color: 'blue' } },
    },
    {
      position:    'bottom',
      label:       '대기',
      colorScheme: 'default',
      action:      { type: 'toggle-badge', badge: { line1: '대기중' } },
    },
    BADGE_BTN,
  ],

  // ── 굴절차 / 고가차 ────────────────────────────
  ladder: [
    {
      position:    'top',
      label:       '전개중',
      colorScheme: 'warning',
      action:      { type: 'toggle-badge', badge: { line1: '전개중' } },
    },
    {
      position:    'right',
      label:       '구조개시',
      colorScheme: 'success',
      action:      { type: 'toggle-badge', badge: { line1: '구조중' } },
    },
    {
      position:    'bottom',
      label:       '철수',
      colorScheme: 'danger',
      action:      { type: 'toggle-badge', badge: { line1: '철수중', color: 'white' } },
    },
    BADGE_BTN,
  ],

  aerial: [
    {
      position:    'top',
      label:       '전개중',
      colorScheme: 'warning',
      action:      { type: 'toggle-badge', badge: { line1: '전개중' } },
    },
    {
      position:    'right',
      label:       '구조개시',
      colorScheme: 'success',
      action:      { type: 'toggle-badge', badge: { line1: '구조중' } },
    },
    {
      position:    'bottom',
      label:       '방수개시',
      colorScheme: 'info',
      action:      { type: 'toggle-badge', badge: { line1: '방수중', color: 'blue' } },
    },
    BADGE_BTN,
  ],

  // ── 물탱크차 ───────────────────────────────────
  water_tank: [
    {
      position:    'top',
      label:       '부서완료',
      colorScheme: 'success',
      action:      { type: 'toggle-badge', badge: { line1: '부서완료' } },
    },
    {
      position:    'right',
      label:       '급수중',
      colorScheme: 'info',
      action:      { type: 'toggle-badge', badge: { line1: '급수중', color: 'blue' } },
    },
    {
      position:    'bottom',
      label:       '대기',
      colorScheme: 'default',
      action:      { type: 'toggle-badge', badge: { line1: '대기중' } },
    },
    BADGE_BTN,
  ],

  // ── 구조차 ─────────────────────────────────────
  rescue_vehicle: [
    {
      position:    'top',
      label:       '부서완료',
      colorScheme: 'success',
      action:      { type: 'toggle-badge', badge: { line1: '부서완료' } },
    },
    {
      position:    'right',
      label:       '대상선택',
      sublabel:    '→ 클릭',
      colorScheme: 'warning',
      action:      { type: 'enter-mode', modeType: 'rescue' },
    },
    {
      position:    'bottom',
      label:       '철수',
      colorScheme: 'danger',
      action:      { type: 'toggle-badge', badge: { line1: '철수중', color: 'white' } },
    },
    BADGE_BTN,
  ],

  // ── 화학차 ─────────────────────────────────────
  hazmat: [
    {
      position:    'top',
      label:       '오염통제',
      colorScheme: 'warning',
      action:      { type: 'toggle-badge', badge: { line1: '오염통제', color: 'yellow' } },
    },
    {
      position:    'right',
      label:       '제독중',
      colorScheme: 'info',
      action:      { type: 'toggle-badge', badge: { line1: '제독중', color: 'blue' } },
    },
    {
      position:    'bottom',
      label:       '철수',
      colorScheme: 'danger',
      action:      { type: 'toggle-badge', badge: { line1: '철수중', color: 'white' } },
    },
    BADGE_BTN,
  ],

  // ── 배연차 ─────────────────────────────────────
  smoke_exhaust: [
    {
      position:    'top',
      label:       '배연개시',
      colorScheme: 'warning',
      action:      { type: 'toggle-badge', badge: { line1: '배연중' } },
    },
    {
      position:    'right',
      label:       '완료',
      colorScheme: 'success',
      action:      { type: 'toggle-badge', badge: { line1: '배연완료' } },
    },
    {
      position:    'bottom',
      label:       '철수',
      colorScheme: 'danger',
      action:      { type: 'toggle-badge', badge: { line1: '철수중', color: 'white' } },
    },
    BADGE_BTN,
  ],

  // ── 유관기관 / 일반 ────────────────────────────
  agency: [
    {
      position:    'top',
      label:       '임무중',
      colorScheme: 'info',
      action:      { type: 'toggle-badge', badge: { line1: '임무중' } },
    },
    {
      position:    'right',
      label:       '완료',
      colorScheme: 'success',
      action:      { type: 'toggle-badge', badge: { line1: '완료' } },
    },
    {
      position:    'bottom',
      label:       '철수',
      colorScheme: 'danger',
      action:      { type: 'toggle-badge', badge: { line1: '철수중', color: 'white' } },
    },
    BADGE_BTN,
  ],
};

// general / vehicle 등 미정의 타입에 대한 기본값
const DEFAULT_ACTIONS: RadialItemDef[] = [
  {
    position:    'top',
    label:       '임무중',
    colorScheme: 'info',
    action:      { type: 'toggle-badge', badge: { line1: '임무중' } },
  },
  {
    position:    'right',
    label:       '완료',
    colorScheme: 'success',
    action:      { type: 'toggle-badge', badge: { line1: '완료' } },
  },
  {
    position:    'bottom',
    label:       '철수',
    colorScheme: 'danger',
    action:      { type: 'toggle-badge', badge: { line1: '철수중', color: 'white' } },
  },
  BADGE_BTN,
];

export function getRadialActions(unitType: string): RadialItemDef[] {
  return UNIT_RADIAL_ACTIONS[unitType] ?? DEFAULT_ACTIONS;
}
