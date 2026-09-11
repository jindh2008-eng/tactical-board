import type {
  LogEntry, LogPart, ArrivalUnitRef, PostKind, TokenColor, WaterMissionChange,
} from '../types';
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
// 문장은 **조각(LogPart[])** 으로 만든다 — 출동대는 칩, 나머지는 글자(§12).
// 조각을 이은 문자열이 note 이고, 둘 다 addLog 시점에 로그에 박는다.
// 화면은 조각으로 칩을 그리고, CSV·PDF 는 note 를, 분석은 payload 를 읽는다.
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

// ── 부르는 이름 · 칩 ──────────────────────────

/** 활동대 — 무전에서는 「진압1대」처럼 「대」를 붙여 부른다. 차량은 이름 그대로(「물탱크1」) */
const ACTIVITY_TYPES = new Set(['suppression', 'rescue', 'ems']);

export function unitCallName(label: string, unitType: string): string {
  return ACTIVITY_TYPES.has(unitType) && !label.endsWith('대') ? `${label}대` : label;
}

/** 칩으로 그릴 출동대 — 색은 **기록 시점의 토큰 색**을 넘긴다 */
export interface UnitRef {
  tokenId:  string;
  label:    string;
  unitType: string;
  color?:   TokenColor;
}

export function unitPart(u: UnitRef): LogPart {
  return {
    kind: 'unit', text: unitCallName(u.label, u.unitType), tokenId: u.tokenId,
    ...(u.color ? { color: u.color } : {}),
  };
}

function textPart(text: string): LogPart {
  return { kind: 'text', text };
}

/** 글자와 칩을 잇는다. 이웃한 글자 조각은 하나로 합치고 빈 글자는 버린다 */
function seq(...items: (LogPart | string)[]): LogPart[] {
  const out: LogPart[] = [];
  for (const item of items) {
    const part = typeof item === 'string' ? textPart(item) : item;
    const last = out[out.length - 1];
    if (part.kind === 'text') {
      if (!part.text) continue;
      if (last?.kind === 'text') { out[out.length - 1] = textPart(last.text + part.text); continue; }
    }
    out.push(part);
  }
  return out;
}

/** 조각 → note 문자열. CSV·PDF·검색이 읽는 값이다 */
export function partsText(parts: readonly LogPart[]): string {
  return parts.map(p => p.text).join('');
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

/** 「대기1단계 도착: [진압1대], [구급1대], [물탱크1]」 */
export function arrivalParts(
  mode: 'arrive' | 'return', zoneKey: string, units: readonly ArrivalUnitRef[],
): LogPart[] {
  const items: (LogPart | string)[] = [`${zoneLabel(zoneKey)} ${mode === 'arrive' ? '도착' : '복귀'}: `];
  [...units].sort(compareUnitCallOrder).forEach((u, i) => {
    if (i > 0) items.push(', ');
    items.push(unitPart(u));
  });
  return seq(...items);
}

/** 「[진압1대] 대기1단계 → 직전대기 이동」 */
export function moveParts(u: UnitRef, fromZoneKey: string, toZoneKey: string): LogPart[] {
  return seq(unitPart(u), ` ${zoneLabel(fromZoneKey)} → ${zoneLabel(toZoneKey)} 이동`);
}

/** 「[진압1대] RIT 임무지정」 */
export function missionParts(u: UnitRef, missionLabel: string): LogPart[] {
  return seq(unitPart(u), ` ${missionLabel} 임무지정`);
}

// ── 거점 ─────────────────────────────────────

/**
 * 「자원대기소 지정, 소장: [구조1대]」 · 「임시의료소 설치, 소장: [구급1대]」.
 * 자원대기소장은 이름 문자열로 저장돼 같은 이름표의 토큰이 없을 수 있다 — 그때는 글자다.
 */
export function postOpenParts(post: PostKind, chief: UnitRef | string): LogPart[] {
  const head = post === 'resource' ? '자원대기소 지정, 소장: ' : '임시의료소 설치, 소장: ';
  return seq(head, typeof chief === 'string' ? chief : unitPart(chief));
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
  /** 출동대면 칩으로 그린다. 소화전·연결송수구·옥내소화전·순환칸은 넘기지 않는다 */
  fromUnit?: UnitRef | null;
  toUnit?:   UnitRef | null;
}

/**
 * 송수 연결·해제 한 건의 문장. `null` 이면 기록하지 않는다(수관철수).
 *
 * 주어가 규칙마다 다르다 — 의도한 것이다(사용자 확정 2026-09-10).
 * 「점령」·「수관전개」는 물을 **받는** 쪽이, 「급수 지원」은 **주는** 쪽이 주어다.
 *
 * `missions` 는 이 연결로 물을 받는 차에 딸려 바뀐 급수 임무다 — 같은 줄 뒤에 붙인다.
 * 「[물탱크1] 44호 소화전 점령 / 중요물탱크 지정」
 */
export function waterRelayParts(
  r: WaterRelayInput, missions: readonly WaterMissionChange[],
): LogPart[] | null {
  const { connected, fromType, toType, fromName, toName } = r;
  const from: LogPart | string = r.fromUnit ? unitPart(r.fromUnit) : fromName;
  const to:   LogPart | string = r.toUnit
    ? unitPart(r.toUnit)
    : (NOZZLE_UNIT_TYPES.has(toType) ? unitCallName(toName, toType) : toName);
  const off = connected ? '' : ' 해제';

  let base: LogPart[];
  if (NOZZLE_UNIT_TYPES.has(toType)) {
    if (!connected) return null;   // 수관철수는 기록하지 않는다(사용자 확정)
    base = seq(to, ' ', from, '에서 수관전개');
  } else if (fromType === 'hydrant') {
    base = seq(to, ' ', from, ' 점령', off);
  } else if (fromType === 'circulation') {
    base = connected ? seq(to, '에 순환보수 실시') : seq(to, ' 순환보수 중단');
  } else if (toType === 'siamese_pipe') {
    base = seq(from, ' ', to, ' 점령', off);
  } else if (AERIAL_TYPES.has(toType)) {
    base = seq(from, ' ', to, connected ? ' 급수 펌프 지정' : ' 급수 중단');
  } else if (WATER_VEHICLE_TYPES.has(toType)) {
    base = seq(from, ' ', to, connected ? '에 급수 지원' : ' 급수 중단');
  } else {
    base = seq(from, ' → ', to, ' 송수', off);
  }

  const tail = missions.map(m =>
    ` / ${MISSION_CALL_NAMES[m.missionLabel] ?? m.missionLabel} ${m.assigned ? '지정' : '해제'}`,
  );
  return seq(...base, ...tail);
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
