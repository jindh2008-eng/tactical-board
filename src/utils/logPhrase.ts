import type { LogEntry, ArrivalUnitRef, PostKind, WaterMissionChange } from '../types';
import { zoneLabel } from './logLabels';
import { UNIT_ADD_ZONE } from './unitAddZone';
import {
  MISSION_CIRCULATION, MISSION_FIRST_LINE, MISSION_KEY_WATER_TANK,
} from '../config/unitMissions';

// ─────────────────────────────────────────────
// 로그 문장 — 무전 멘트 형식의 단일 출처
//
// 로그 한 줄이 곧 무전 한 번이다. 「누가 어디서 어디로」를 화살표로 적던 것을
// 현장에서 오가는 말로 바꾼다 — 무전 STT 와 시간축으로 합칠 때 어휘가 같아야
// 대조가 된다(docs/EVENT_LOG_PHRASING_PLAN.md §0).
//
// 문장은 addLog 시점에 만들어 note 에 박는다. 화면·CSV·PDF 는 note 만 읽고,
// 분석은 payload 를 읽는다 — 문장을 고쳐도 분석이 깨지지 않는다.
//
// 순수 함수만 둔다(.ts). Context 파일에 두면 react-refresh 린트 기준선이 불어난다.
// ─────────────────────────────────────────────

/** 도착하는 자리 — 여기로 들어오는 것은 「이동」이 아니라 「도착」이다 */
export const ARRIVAL_ZONES: ReadonlySet<string> = new Set(['standby-standby1', 'standby-resource']);

/** RIT — 공간이 아니라 임무다. 판 위에서는 칸이지만 문장은 임무지정으로 적는다 */
export const RIT_ZONE = 'standby-rit';

/** 아직 출동 전인 자리 — 출동대현황(null · 'pool') · 추가출동대 */
function isStandbyBox(zoneKey: string | null): boolean {
  return zoneKey === null || zoneKey === 'pool' || zoneKey === UNIT_ADD_ZONE;
}

/**
 * 이동의 성격 — 목적지(와 출발지)에서 파생한다. 따로 저장하는 값이 아니다.
 *
 *   arrive   대기 박스 → 대기1단계·자원대기소. 같은 태스크끼리 한 줄로 묶는다
 *   return   현장 → 대기1단계·자원대기소. 되돌아옴
 *   mission  → RIT 칸. 임무지정이다
 *   withdraw → 대기 박스. 기록하지 않고 방금 한 도착을 거둔다(§2.2)
 *   move     그 밖 전부. 대기1단계 ⇄ 자원대기소도 자리 옮김이라 여기다
 */
export type MoveKind = 'arrive' | 'return' | 'mission' | 'withdraw' | 'move';

export function classifyMove(fromZoneKey: string | null, toZoneKey: string | null): MoveKind {
  if (toZoneKey === null || isStandbyBox(toZoneKey)) return 'withdraw';
  if (toZoneKey === RIT_ZONE) return 'mission';
  if (ARRIVAL_ZONES.has(toZoneKey)) {
    if (isStandbyBox(fromZoneKey)) return 'arrive';
    if (fromZoneKey !== null && ARRIVAL_ZONES.has(fromZoneKey)) return 'move';
    return 'return';
  }
  return 'move';
}

// ── 부르는 이름 ───────────────────────────────

/** 활동대 — 무전에서는 「진압1대」처럼 「대」를 붙여 부른다. 차량은 이름 그대로(「물탱크1」) */
const ACTIVITY_TYPES = new Set(['suppression', 'rescue', 'ems']);

export function unitCallName(label: string, unitType: string): string {
  return ACTIVITY_TYPES.has(unitType) && !label.endsWith('대') ? `${label}대` : label;
}

/**
 * 한 줄 안의 호명 순서 — 활동대(진압·구조·구급) → 차량 → 기타 → 유관기관.
 * 차량 안에서는 실무 호명 순서(펌프 → 물탱크 → 고가·굴절 → …)를 따른다.
 *
 * 판 위 정렬(`utils/arrivalOrder.ts` typePriority — 진압>물탱크>구조>구급)과
 * 다르다. 그쪽은 구역 안 토큰 순서라 여기서 재사용하면 판이 흔들린다.
 */
const UNIT_RANK: Record<string, number> = {
  suppression: 0, rescue: 1, ems: 2,
  pump: 10, water_tank: 11, aerial: 12, ladder: 13, rescue_vehicle: 14,
  hazmat: 15, smoke_exhaust: 16, smokeExhaust: 16, wildfire: 17, command: 18, vehicle: 19,
  general: 30,
  agency: 40,
};
/** 모르는 종류는 「기타」로 선다 */
const OTHER_RANK = 30;

export function compareUnitCallOrder(
  a: { label: string; unitType: string },
  b: { label: string; unitType: string },
): number {
  const d = (UNIT_RANK[a.unitType] ?? OTHER_RANK) - (UNIT_RANK[b.unitType] ?? OTHER_RANK);
  if (d !== 0) return d;
  return a.label.localeCompare(b.label, 'ko', { numeric: true });
}

// ── 이동 ─────────────────────────────────────

/** 「대기1단계 도착: 진압1대, 구급1대, 물탱크1」 */
export function arrivalPhrase(
  mode: 'arrive' | 'return', zoneKey: string, units: readonly ArrivalUnitRef[],
): string {
  const names = [...units].sort(compareUnitCallOrder).map(u => unitCallName(u.label, u.unitType));
  return `${zoneLabel(zoneKey)} ${mode === 'arrive' ? '도착' : '복귀'}: ${names.join(', ')}`;
}

/** 「진압1대 대기1단계 → 직전대기 이동」 */
export function movePhrase(
  label: string, unitType: string, fromZoneKey: string, toZoneKey: string,
): string {
  return `${unitCallName(label, unitType)} ${zoneLabel(fromZoneKey)} → ${zoneLabel(toZoneKey)} 이동`;
}

/** 「진압1대 RIT 임무지정」 */
export function missionPhrase(label: string, unitType: string, missionLabel: string): string {
  return `${unitCallName(label, unitType)} ${missionLabel} 임무지정`;
}

// ── 거점 ─────────────────────────────────────

/** 「자원대기소 지정, 소장: 지휘운전」 · 「임시의료소 설치, 소장: 진압1」 */
export function postOpenPhrase(post: PostKind, chiefLabel: string): string {
  return post === 'resource'
    ? `자원대기소 지정, 소장: ${chiefLabel}`
    : `임시의료소 설치, 소장: ${chiefLabel}`;
}

// ── 송수 ─────────────────────────────────────

const WATER_VEHICLE_TYPES = new Set(['pump', 'water_tank']);
const NOZZLE_UNIT_TYPES   = new Set(['suppression', 'rescue']);
const AERIAL_TYPES        = new Set(['aerial', 'ladder']);

/** 판 위 임무 칩 이름 → 무전에서 부르는 이름 */
const MISSION_CALL_NAMES: Record<string, string> = {
  [MISSION_KEY_WATER_TANK.label]: '중요물탱크',
  [MISSION_FIRST_LINE.label]:     '1선펌프',
  [MISSION_CIRCULATION.label]:    '순환보수',
};

export interface WaterRelayInput {
  connected: boolean;
  fromType:  string;
  toType:    string;
  fromName:  string;
  toName:    string;
}

/**
 * 송수 연결·해제 한 건의 문장. `null` 이면 기록하지 않는다(수관철수).
 *
 * 주어가 규칙마다 다르다 — 의도한 것이다(사용자 확정 2026-09-10).
 * 「점령」·「수관전개」는 물을 **받는** 쪽이, 「급수 지원」은 **주는** 쪽이 주어다.
 *
 * `missions` 는 이 연결로 물을 받는 차에 딸려 바뀐 급수 임무다 — 같은 줄 뒤에 붙인다.
 * 「물탱크1 44호 소화전 점령 / 중요물탱크 지정」
 */
export function waterRelayPhrase(
  r: WaterRelayInput, missions: readonly WaterMissionChange[],
): string | null {
  const { connected, fromType, toType, fromName, toName } = r;
  let base: string;

  if (NOZZLE_UNIT_TYPES.has(toType)) {
    if (!connected) return null;   // 수관철수는 기록하지 않는다(사용자 확정)
    base = `${unitCallName(toName, toType)} ${fromName}에서 수관전개`;
  } else if (fromType === 'hydrant') {
    base = `${toName} ${fromName} 점령${connected ? '' : ' 해제'}`;
  } else if (fromType === 'circulation') {
    base = connected ? `${toName}에 순환보수 실시` : `${toName} 순환보수 중단`;
  } else if (toType === 'siamese_pipe') {
    base = `${fromName} ${toName} 점령${connected ? '' : ' 해제'}`;
  } else if (AERIAL_TYPES.has(toType)) {
    base = connected ? `${fromName} ${toName} 급수 펌프 지정` : `${fromName} ${toName} 급수 중단`;
  } else if (WATER_VEHICLE_TYPES.has(toType)) {
    base = connected ? `${fromName} ${toName}에 급수 지원` : `${fromName} ${toName} 급수 중단`;
  } else {
    base = `${fromName} → ${toName} 송수${connected ? '' : ' 해제'}`;
  }

  const tail = missions.map(m =>
    `${MISSION_CALL_NAMES[m.missionLabel] ?? m.missionLabel} ${m.assigned ? '지정' : '해제'}`,
  );
  return [base, ...tail].join(' / ');
}

// ── 철회 판정 ─────────────────────────────────

/** 편성 기록 — 출동대 목록을 통째로 담지만 그 대의 「활동」이 아니다 */
const ROSTER_KINDS = new Set(['dispatch-initial', 'dispatch-add', 'dispatch-remove']);

/**
 * 이 로그 줄이 그 대의 활동 흔적인가.
 * 도착 철회(§2.2)가 「도착 뒤에 이 대가 한 일이 있는가」를 볼 때 쓴다.
 */
export function mentionsToken(entry: LogEntry, tokenId: string): boolean {
  if (entry.tokenId === tokenId) return true;
  const p = entry.payload;
  if (!p || ROSTER_KINDS.has(p.kind)) return false;
  // id 는 따옴표째 찾는다 — 'roster-1' 이 'roster-12' 안에서 걸리지 않게
  return JSON.stringify(p).includes(JSON.stringify(tokenId));
}
