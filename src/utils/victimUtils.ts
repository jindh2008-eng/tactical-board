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
  const displayBottom = buildDisplayBottom(victim.location, victim.subLocation);

  const displayTop =
    victim.kind === 'person'
      ? [victim.gender, victim.ageGroup, victim.condition].filter(Boolean).join('/')
      : victim.customLabel?.trim() || '기타';

  return { displayTop, displayBottom };
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
