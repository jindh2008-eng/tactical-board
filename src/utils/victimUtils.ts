// ─────────────────────────────────────────────
// 구조대상자 토큰 생성·변환 유틸리티
// UI와 독립적 — 설정창 등 어디서든 재사용 가능
// ─────────────────────────────────────────────

import type {
  VictimToken,
  CreateVictimInput,
  VictimGender,
  VictimCondition,
} from '../types/victim';
import {
  VICTIM_GENDERS,
} from '../types/victim';
import { generateId } from './settingsStorage';
import { locationToFloorDisplay } from './victimPlacement';

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
  center: '내부',
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
// 위치 표시 텍스트 생성
// ─────────────────────────────────────────────

/**
 * 위치 두 번째 줄 텍스트 — zoneKey 기반으로 파생.
 * 형식: 층/면/상세위치 (있는 것만 `/` 연결)
 * 예: "3층/A면/205호", "3층/복도", "A면/공터"
 */
export function buildVictimDisplayLine(victim: VictimToken): string {
  const parts: string[] = [];
  const loc = zoneKeyToLabel(victim.zoneKey);

  const floorDisplay = locationToFloorDisplay(loc);
  if (floorDisplay) parts.push(floorDisplay);

  if (victim.face) {
    parts.push(`${victim.face}면`);
  } else if (!floorDisplay && /^[A-D]면$/.test(loc)) {
    parts.push(loc);
  }

  const detail = victim.subLocation.trim();
  if (detail) parts.push(detail);

  if (parts.length === 0 && loc && !/^[A-D]면$/.test(loc)) parts.push(loc);

  return parts.join('/');
}

// ─────────────────────────────────────────────
// 랜덤 생성
// ─────────────────────────────────────────────

export function randomVictim(subLocation: string): VictimToken {
  const gender:    VictimGender    = pick(VICTIM_GENDERS);
  const age        = Math.floor(Math.random() * 65) + 10; // 10-74
  const condition: VictimCondition = pick(['경상', '중상', '사망'] as const);

  return {
    id:          generateId(),
    kind:        'person',
    gender,
    age,
    condition,
    subLocation: subLocation.trim(),
    zoneKey:     null,
  };
}

// ─────────────────────────────────────────────
// 직접선택 / 기타 생성
// ─────────────────────────────────────────────

export function buildVictim(input: CreateVictimInput): VictimToken {
  if (input.kind === 'person') {
    return {
      id:          generateId(),
      kind:        'person',
      gender:      input.gender,
      age:         input.age,
      condition:   input.condition,
      subLocation: input.subLocation.trim(),
      zoneKey:     null,
    };
  } else if (input.kind === 'custom') {
    return {
      id:          generateId(),
      kind:        'custom',
      customLabel: input.customLabel.trim() || '기타',
      subLocation: input.subLocation.trim(),
      zoneKey:     null,
    };
  } else {
    return {
      id:          generateId(),
      kind:        'group',
      groupCount:  Math.min(6, Math.max(2, input.groupCount)),
      condition:   input.condition,
      subLocation: input.subLocation.trim(),
      zoneKey:     null,
    };
  }
}

// ─────────────────────────────────────────────
// 구조 자격 판정
//
// 우클릭 구조 메뉴(VictimContextBarMenu)와 드롭 구조(VictimCard)가
// 같은 규칙을 쓰도록 여기로 모았다. 두 경로가 갈리면 같은 상황에서
// 메뉴에는 뜨는데 드롭은 안 되는 식의 불일치가 생긴다.
// ─────────────────────────────────────────────

/** zoneKey 에서 건물 층 식별자 추출 ("3F-center" → "3F") */
export function extractBuildingFloor(zoneKey: string | null): string | null {
  if (!zoneKey) return null;
  const m = zoneKey.match(/^(RF|\d+F|B\d+)-/);
  return m ? m[1] : null;
}

/** zoneKey 에서 외곽 방면 추출 ("face-A" 또는 "A-..." → "A") */
export function extractFace(zoneKey: string | null): 'A' | 'B' | 'C' | 'D' | null {
  if (!zoneKey) return null;
  const m1 = zoneKey.match(/^face-([ABCD])$/);
  if (m1) return m1[1] as 'A' | 'B' | 'C' | 'D';
  const m2 = zoneKey.match(/^([ABCD])-/);
  if (m2) return m2[1] as 'A' | 'B' | 'C' | 'D';
  return null;
}

/**
 * 이 출동대가 이 구조대상자를 구조할 수 있는가.
 *   - 이미 '구조중' 이면 불가
 *   - 같은 층 또는 같은 구역이면 가능
 *   - 외곽 방면의 고가차·굴절차는 층 무관하게 가능
 */
export function canUnitRescueVictim(
  unitZoneKey:   string | null,
  unitType:      string,
  unitBadges:    { line1?: string }[],
  victimZoneKey: string | null,
): boolean {
  if (!victimZoneKey) return false;
  if (unitBadges.some(b => b.line1 === '구조중')) return false;

  const victimFloor = extractBuildingFloor(victimZoneKey);
  if (victimFloor && extractBuildingFloor(unitZoneKey) === victimFloor) return true;
  if (unitZoneKey === victimZoneKey) return true;

  if ((unitType === 'ladder' || unitType === 'aerial') && extractFace(unitZoneKey) !== null) return true;

  return false;
}
