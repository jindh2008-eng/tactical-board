// ─────────────────────────────────────────────
// 구조대상자 토큰 생성·변환 유틸리티
// UI와 독립적 — 설정창 등 어디서든 재사용 가능
// ─────────────────────────────────────────────

import type {
  VictimToken,
  CreateVictimInput,
  VictimGender,
  VictimAgeGroup,
  VictimCondition,
} from '../types/victim';
import {
  VICTIM_GENDERS,
  VICTIM_AGE_GROUPS,
  VICTIM_CONDITIONS,
} from '../types/victim';

function uid(): string {
  return `victim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─────────────────────────────────────────────
// zone 키 → 사람이 읽는 위치 레이블
// ─────────────────────────────────────────────

/**
 * ZoneCell / ExteriorZone 의 zoneKey 를 짧은 한글 레이블로 변환.
 * 토큰이 드롭될 때 VictimToken.location 에 자동 저장됨.
 *
 * 예:
 *   "3F-left"  → "3F"
 *   "3F-stair" → "3F 계단"
 *   "RF-left"  → "옥상"
 *   "B1-stair" → "B1 계단"
 *   "face-A"   → "A면"
 *   null       → ""   (pool = 미배치)
 */
export function zoneKeyToLabel(zoneKey: string | null): string {
  if (!zoneKey) return '';

  // 외곽 방면
  if (zoneKey.startsWith('face-')) {
    return zoneKey.slice('face-'.length) + '면';
  }

  // 임시의료소
  if (zoneKey === 'medical-post') return '임시의료소';

  // 대기 구역 (구조대상자가 배치될 가능성은 낮지만 대비)
  if (zoneKey.startsWith('standby-')) {
    const map: Record<string, string> = {
      'standby-resource': '자원대기소',
      'standby-standby1': '대기1단계',
      'standby-imminent': '직전대기',
    };
    return map[zoneKey] ?? zoneKey;
  }

  // 건물 구역: "{floorId}-{zoneType}"
  const dashIdx = zoneKey.indexOf('-');
  if (dashIdx === -1) return zoneKey;

  const floorId  = zoneKey.slice(0, dashIdx);
  const zoneType = zoneKey.slice(dashIdx + 1);

  const floorLabel = floorId === 'RF' ? '옥상' : floorId;

  // 계단실은 명시
  return zoneType === 'stair' ? `${floorLabel} 계단` : floorLabel;
}

/**
 * zoneKey 를 층+구역까지 포함한 상세 레이블로 변환.
 * 구조위치(rescueLocation) 기록 전용.
 *
 * 예:
 *   "3F-center" → "3F 중앙구역"
 *   "3F-left"   → "3F 좌구역"
 *   "3F-right"  → "3F 우구역"
 *   "3F-stair"  → "3F 계단실"
 *   "face-B"    → "B면"
 *   "medical-post" → "임시의료소"
 *   null        → ""
 */
const ZONE_AREA_LABELS: Record<string, string> = {
  left:   '좌구역',
  center: '중앙구역',
  right:  '우구역',
  stair:  '계단실',
};

export function zoneKeyToFullLabel(zoneKey: string | null): string {
  if (!zoneKey) return '';
  if (zoneKey === 'medical-post') return '임시의료소';
  if (zoneKey.startsWith('face-')) return zoneKey.slice('face-'.length) + '면';
  if (zoneKey.startsWith('standby-')) {
    const map: Record<string, string> = {
      'standby-resource': '자원대기소',
      'standby-standby1': '대기1단계',
      'standby-imminent': '직전대기',
    };
    return map[zoneKey] ?? zoneKey;
  }
  const dashIdx = zoneKey.indexOf('-');
  if (dashIdx === -1) return zoneKey;
  const floorId  = zoneKey.slice(0, dashIdx);
  const zoneType = zoneKey.slice(dashIdx + 1);
  const floorLabel = floorId === 'RF' ? '옥상' : floorId;
  const areaLabel  = ZONE_AREA_LABELS[zoneType];
  return areaLabel ? `${floorLabel} ${areaLabel}` : floorLabel;
}

// ─────────────────────────────────────────────
// displayBottom 조합
// ─────────────────────────────────────────────

/**
 * 자동위치(location)와 수동 세부위치(subLocation)를 합쳐 하단 표시 텍스트 생성.
 *
 * 경우의 수:
 *   location="3F",  subLocation="212호" → "3F 212호"
 *   location="3F",  subLocation=""      → "3F"
 *   location="",    subLocation="212호" → "212호"
 *   location="",    subLocation=""      → "위치미상"
 */
export function buildDisplayBottom(location: string, subLocation: string): string {
  const loc = location.trim();
  const sub = subLocation.trim();
  if (loc && sub) return `${loc} ${sub}`;
  if (loc)        return loc;
  if (sub)        return sub;
  return '위치미상';
}

// ─────────────────────────────────────────────
// display 필드 재계산
// ─────────────────────────────────────────────

export function rebuildVictimDisplay(
  victim: VictimToken,
): Pick<VictimToken, 'displayTop' | 'displayBottom'> {
  const displayTop =
    victim.kind === 'person'
      ? [victim.gender, victim.ageGroup, victim.condition].filter(Boolean).join('/')
      : victim.customLabel?.trim() || '기타';

  // 위치 줄: buildLocationLine 이 있으면 그것을, 없으면 기존 방식
  // (lazy import 방지를 위해 inline 재현)
  const displayBottom = buildVictimDisplayLine(victim);

  return { displayTop, displayBottom };
}

/**
 * 구조대상자 위치 표시 두 번째 줄 (슬래시 구분 형식)
 *
 * 층/면/상세위치 조합. 있는 것만 포함.
 * 예: "3층/A면/창문", "3층/205호", "A면/공터", "복도"
 */
export function buildVictimDisplayLine(victim: VictimToken): string {
  const parts: string[] = [];
  const loc = victim.location.trim();

  // ① 층: location 에서 파싱
  const floorDisplay = locationToFloorDisplay(loc);
  if (floorDisplay) {
    parts.push(floorDisplay);
  }

  // ② 면
  if (victim.face) {
    parts.push(`${victim.face}면`);
  } else if (!floorDisplay && /^[A-D]면$/.test(loc)) {
    // face 필드 없이 위치가 "A면" 형태인 경우
    parts.push(loc);
  }

  // ③ 상세위치
  const detail = getVictimDetail(victim);
  if (detail) parts.push(detail);

  // 아무것도 없으면 location 원문 또는 빈 문자열
  if (parts.length === 0 && loc && !/^[A-D]면$/.test(loc)) {
    parts.push(loc);
  }

  return parts.join('/');
}

/** zone 레이블 → 한글 층 표시 변환 */
function locationToFloorDisplay(loc: string): string | null {
  if (!loc) return null;
  if (loc === 'RF') return '옥상';
  const above = loc.match(/^(\d+)F$/);
  if (above) return `${above[1]}층`;
  const below = loc.match(/^B(\d+)$/);
  if (below) return `B${below[1]}층`;
  return null;
}

/** victim 상세위치 텍스트 추출 */
function getVictimDetail(victim: VictimToken): string {
  // 명시적 detailLocation 우선
  if (victim.detailLocation !== undefined) return victim.detailLocation.trim();
  // face 없으면 subLocation 그대로 사용
  if (!victim.face) return victim.subLocation.trim();
  // face 있으면 "X면 / " 접두어 제거
  const prefix = `${victim.face}면`;
  const sub = victim.subLocation.trim();
  if (sub.startsWith(prefix)) {
    return sub.slice(prefix.length).replace(/^\s*\/\s*/, '').trim();
  }
  return sub;
}

// ─────────────────────────────────────────────
// 랜덤 생성
// ─────────────────────────────────────────────

export function randomVictim(subLocation: string): VictimToken {
  const gender:    VictimGender    = pick(VICTIM_GENDERS);
  const ageGroup:  VictimAgeGroup  = pick(VICTIM_AGE_GROUPS);
  const condition: VictimCondition = pick(VICTIM_CONDITIONS);
  const sub = subLocation.trim();

  return {
    id:            uid(),
    kind:          'person',
    gender,
    ageGroup,
    condition,
    location:      '',        // 배치 전 — zone 드롭 시 자동 설정
    subLocation:   sub,
    displayTop:    `${gender}/${ageGroup}/${condition}`,
    displayBottom: buildDisplayBottom('', sub),
    zoneKey:       null,
  };
}

// ─────────────────────────────────────────────
// 직접선택 / 기타 생성
// ─────────────────────────────────────────────

export function buildVictim(input: CreateVictimInput): VictimToken {
  if (input.kind === 'person') {
    const sub = input.subLocation.trim();
    return {
      id:            uid(),
      kind:          'person',
      gender:        input.gender,
      ageGroup:      input.ageGroup,
      condition:     input.condition,
      location:      '',
      subLocation:   sub,
      displayTop:    `${input.gender}/${input.ageGroup}/${input.condition}`,
      displayBottom: buildDisplayBottom('', sub),
      zoneKey:       null,
    };
  } else {
    const label = input.customLabel.trim() || '기타';
    const sub   = input.subLocation.trim();
    return {
      id:            uid(),
      kind:          'custom',
      customLabel:   label,
      location:      '',
      subLocation:   sub,
      displayTop:    label,
      displayBottom: buildDisplayBottom('', sub),
      zoneKey:       null,
    };
  }
}
