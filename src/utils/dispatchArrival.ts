/**
 * dispatchRoster 항목 → UnitToken 변환 유틸
 * PlayPage의 초기 출동대 생성에 사용
 */

import type { DispatchRosterItem } from '../types/settings';
import type { UnitToken, TokenColor, TokenType } from '../types';

/** label 파싱에 사용하는 공통 매핑 (roster 와 동일 기준) */
const LABEL_COUNTER_DEFS = [
  { baseKey: '진압대', regex: /^진압(\d+)대$/ },
  { baseKey: '구조대', regex: /^구조(\d+)대$/ },
  { baseKey: '구급대', regex: /^구급(\d+)대$/ },
  { baseKey: '펌프',   regex: /^펌프(\d+)호$/ },
  { baseKey: '구조차', regex: /^구조차(\d+)호$/ },
  { baseKey: '구급차', regex: /^구급차(\d+)호$/ },
  { baseKey: '고가차', regex: /^고가차(\d+)호$/ },
  { baseKey: '굴절차', regex: /^굴절차(\d+)호$/ },
  { baseKey: '배연차', regex: /^배연차(\d+)호$/ },
  { baseKey: '지휘차', regex: /^지휘차(\d+)호$/ },
  { baseKey: '물탱크', regex: /^물탱크(\d+)호$/ },
] as const;

/** roster unitType → TokenColor */
export function rosterItemColor(unitType: string): TokenColor {
  switch (unitType) {
    case 'suppression': return 'red';
    case 'rescue':      return 'yellow';
    case 'ems':         return 'green';
    default:            return 'vehicle';
  }
}

/** roster unitType → TokenType */
export function rosterItemTokenType(unitType: string): TokenType {
  switch (unitType) {
    case 'suppression':
    case 'rescue':
    case 'ems':         return 'activity';
    default:            return 'vehicle';
  }
}

/**
 * DispatchRosterItem → UnitToken
 * zoneKey: null(pool) = 도착 대기, 'standby-standby1' = 즉시 배치
 */
export function rosterItemToToken(
  item:    DispatchRosterItem,
  zoneKey: string | null = null,
): UnitToken {
  return {
    id:       `roster-${item.id}`,
    label:    item.name,
    type:     rosterItemTokenType(item.unitType),
    color:    rosterItemColor(item.unitType),
    unitType: item.unitType,
    zoneKey,
    badges:   [],
    source:   'roster',
  };
}

/**
 * 로스터 기반으로 createToken 카운터 초기값을 계산한다.
 * 수동 버튼 생성 시 번호 중복을 방지한다.
 *
 * 예: "진압1대", "진압2대" 가 있으면 counters['진압대'] = 2
 *     → 이후 버튼으로 생성하면 "진압3대"부터 시작
 */
export function initCountersFromRoster(
  roster: DispatchRosterItem[],
): Record<string, number> {
  const mapping = [
    { unitType: 'suppression',    baseKey: '진압대' },
    { unitType: 'rescue',         baseKey: '구조대' },
    { unitType: 'ems',            baseKey: '구급대' },
    { unitType: 'pump',           baseKey: '펌프'   },
    { unitType: 'rescue_vehicle', baseKey: '구조차' },
    { unitType: 'ambulance',      baseKey: '구급차' },
    { unitType: 'aerial',         baseKey: '고가차' },
    { unitType: 'ladder',         baseKey: '굴절차' },
    { unitType: 'smokeExhaust',   baseKey: '배연차' },
    { unitType: 'command',        baseKey: '지휘차' },
    { unitType: 'water_tank',     baseKey: '물탱크' },
  ] as const;

  const counters: Record<string, number> = {};
  for (const item of roster) {
    const def = mapping.find(m => m.unitType === item.unitType);
    if (!def) continue;
    const labelDef = LABEL_COUNTER_DEFS.find(d => d.baseKey === def.baseKey);
    if (!labelDef) continue;
    const m = item.name.match(labelDef.regex);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    counters[def.baseKey] = Math.max(counters[def.baseKey] ?? 0, n);
  }
  return counters;
}

/**
 * 복원된 토큰 레이블에서 카운터 최댓값을 계산한다.
 * 세션 복원 시 session.counters 와 병합(max)하여 번호 중복을 방지한다.
 *
 * 예: "진압3대" 레이블이 있으면 counters['진압대'] ≥ 3 이 보장됨
 */
export function computeCountersFromTokens(
  tokens: UnitToken[],
): Record<string, number> {
  const counters: Record<string, number> = {};
  for (const token of tokens) {
    for (const def of LABEL_COUNTER_DEFS) {
      const m = token.label.match(def.regex);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      counters[def.baseKey] = Math.max(counters[def.baseKey] ?? 0, n);
    }
  }
  return counters;
}
