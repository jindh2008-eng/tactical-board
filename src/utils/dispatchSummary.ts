/**
 * 출동대 편성 요약 — 토큰 목록을 "진압 2개대, 펌프차 2대" 형태로 집계한다.
 *
 * 쓰이는 곳
 *  - 초기 출동 편성 로그 (훈련 시작 시점의 출동대현황)
 *  - 추가출동대 요청·회수 로그 (생성 창을 닫는 시점의 순증·순감)
 *
 * docs/EVENT_LOG_PLAN.md N-4 · N-5 · N-6
 */

import type { UnitToken, DispatchSummaryItem, DispatchUnitRef } from '../types';
import { getUnitLabel } from '../types/presets';

/**
 * 활동대는 "N개대", 그 밖(차량·유관기관)은 "N대"로 센다.
 * 활동대 이름은 뒤의 '대'를 떼 "진압 2개대"로 읽히게 한다 — '구조대'와 '구조차'가
 * 둘 다 '구조'로 줄어 섞이는 것을 막으려고 차량은 전체 이름을 그대로 쓴다.
 */
const ACTIVITY_TYPES = new Set(['suppression', 'rescue', 'ems']);

function shortLabel(unitType: string): string {
  const full = getUnitLabel(unitType);
  return ACTIVITY_TYPES.has(unitType) && full.endsWith('대') ? full.slice(0, -1) : full;
}

function counterWord(unitType: string): string {
  return ACTIVITY_TYPES.has(unitType) ? '개대' : '대';
}

export function toUnitRefs(tokens: UnitToken[]): DispatchUnitRef[] {
  return tokens.map(t => ({ tokenId: t.id, label: t.label, unitType: t.unitType }));
}

/** unitType별 개수 집계. 정렬은 활동대 → 그 외, 각 그룹 안에서는 많은 순 */
export function summarizeUnits(tokens: UnitToken[]): DispatchSummaryItem[] {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t.unitType, (counts.get(t.unitType) ?? 0) + 1);

  return [...counts.entries()]
    .map(([unitType, count]) => ({ unitType, label: shortLabel(unitType), count }))
    .sort((a, b) => {
      const aAct = ACTIVITY_TYPES.has(a.unitType) ? 0 : 1;
      const bAct = ACTIVITY_TYPES.has(b.unitType) ? 0 : 1;
      if (aAct !== bAct) return aAct - bAct;
      return b.count - a.count;
    });
}

/** "진압 2개대, 구조 1개대, 펌프차 2대" */
export function summaryText(summary: DispatchSummaryItem[]): string {
  return summary
    .map(s => `${s.label} ${s.count}${counterWord(s.unitType)}`)
    .join(', ');
}
