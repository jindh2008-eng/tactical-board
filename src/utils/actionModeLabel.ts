import type { ActionModeState } from '../context/ActionModeContext';

// ─────────────────────────────────────────────
// 작업 모드 이름 · 안내 — 배너(PlayPage ActionModeBanner)와 막힌 끌기 안내가 같은 말을 쓴다
//
// 작업 모드가 켜져 있으면 **모든 출동대 토큰의 끌기가 꺼진다**(TokenCard draggable).
// 모드를 켜 둔 채 잊으면 「토큰이 안 움직인다」로 보인다(2026-09-15 현장 보고) — 그래서
// 무슨 모드인지와 이동이 잠겼다는 사실을 함께 말한다.
//
// 순수 함수만 둔다(.ts) — Context 파일에 두면 react-refresh 린트 기준선이 불어난다.
// ─────────────────────────────────────────────

export type ActiveModeType = Exclude<ActionModeState['type'], null>;

/** 모드 이름 — 배너 앞머리 칩에 쓴다 */
export const ACTION_MODE_NAMES: Record<ActiveModeType, string> = {
  'rescue':              '구조',
  'select-floor':        '층 선택',
  'select-pump':         '부서 위치 선택',
  'water-connect':       '송수 연결',
  'aerial-floor-select': '고가·굴절 전개',
  'aerial-spray-target': '고가·굴절 방수 지점',
  'spray-target':        '방수 지점',
  'drawing':             '선 그리기',
  'drawing-erase':       '선 지우기',
};

/** 지금 할 일 — 배너 본문 */
export const ACTION_MODE_HINTS: Record<ActiveModeType, string> = {
  'rescue':              '구조대상자를 클릭하세요 (같은 구역의 구조대상자만)',
  'select-floor':        '층·구역을 클릭하세요',
  'select-pump':         '부서 위치를 클릭하세요',
  'water-connect':       '송수 대상 토큰을 클릭하세요',
  'aerial-floor-select': '전개 지점을 클릭하세요',
  'aerial-spray-target': '방수 지점을 클릭하세요',
  'spray-target':        '방수 지점을 클릭하세요',
  'drawing':             '전술상황판에 선을 그리세요',
  'drawing-erase':       '삭제할 선을 클릭하거나 드래그하세요',
};

/** 모드 중 출동대를 끌려고 할 때 — 손을 뗀 자리에 띄운다 */
export function blockedDragNotice(type: ActiveModeType): string {
  return `${ACTION_MODE_NAMES[type]} 모드 중에는 출동대를 옮길 수 없습니다 — Esc 또는 [해제]`;
}
