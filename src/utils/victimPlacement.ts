/**
 * VictimSetupItem → VictimToken 변환 및 위치 관련 유틸
 * PlayPage 초기 구조대상자 자동 배치에 사용
 */

import type { VictimSetupItem } from '../types/settings';
import type { VictimAgeGroup, VictimFace, VictimToken } from '../types/victim';
import type { Pos } from '../types';

const AGE_GROUP_RANGES: Record<VictimAgeGroup, [number, number]> = {
  '소아':  [5,  11],
  '10대': [12, 19],
  '20대': [20, 29],
  '30대': [30, 39],
  '40대': [40, 49],
  '50대': [50, 59],
  '60대': [60, 69],
  '70대': [70, 79],
  '80대': [80, 87],
};

function ageGroupToAge(ag: VictimAgeGroup): number {
  const [min, max] = AGE_GROUP_RANGES[ag];
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** VictimSetupItem.floor 에서 'RF' 의 location 문자열 */
const RF_LOCATION = 'RF';

// ─────────────────────────────────────────────
// 위치 표시 유틸리티
// ─────────────────────────────────────────────

/**
 * zone 레이블 문자열 → 한글 층 표시 변환
 *
 * "3F"  → "3층"
 * "B1"  → "B1층"
 * "RF"  → "옥상"
 * 그 외 → null (층이 아닌 위치)
 */
export function locationToFloorDisplay(loc: string): string | null {
  if (!loc) return null;
  if (loc === 'RF') return '옥상';
  const aboveMatch = loc.match(/^(\d+)F$/);
  if (aboveMatch) return `${aboveMatch[1]}층`;
  const belowMatch = loc.match(/^B(\d+)$/);
  if (belowMatch) return `B${belowMatch[1]}층`;
  return null;
}

/**
 * floor 번호 → 한글 표시 (floorOptions.ts 의 floorLabel 에 대응)
 * 1 → "1층", -1 → "B1층"
 */
export function floorNumberToLabel(floor: number): string {
  return floor > 0 ? `${floor}층` : `B${-floor}층`;
}


// ─────────────────────────────────────────────
// 오프셋 사전 정의
// ─────────────────────────────────────────────

/**
 * zone 내 victim 자동 배치 오프셋.
 * 기준: zone 너비 ~120px, 높이 ~80px 을 상정.
 * 드래그로 수동 재배치는 언제나 가능.
 */
const PRESETS: Array<Array<Pos>> = [
  [],
  [{ x: 60, y: 40 }],
  [{ x: 38, y: 40 }, { x: 82, y: 40 }],
  [{ x: 38, y: 30 }, { x: 82, y: 30 }, { x: 60, y: 58 }],
  [{ x: 38, y: 28 }, { x: 82, y: 28 }, { x: 38, y: 55 }, { x: 82, y: 55 }],
];

/**
 * zone 내 n명 victim 의 초기 배치 좌표를 반환한다.
 */
export function computeVictimOffsets(
  count:  number,
  zoneW:  number = 120,
  zoneH:  number = 80,
): Pos[] {
  if (count <= 0) return [];

  if (count <= PRESETS.length - 1) {
    return PRESETS[count].map(p => ({
      x: Math.round((p.x / 120) * zoneW),
      y: Math.round((p.y / 80)  * zoneH),
    }));
  }

  const cols   = 2;
  const xStep  = Math.min(28, (zoneW - 24) / cols);
  const yStep  = Math.min(22, (zoneH - 16) / Math.ceil(count / cols));
  const rows   = Math.ceil(count / cols);
  const startX = zoneW / 2 - ((cols - 1) * xStep) / 2;
  const startY = zoneH / 2 - ((rows - 1) * yStep) / 2;

  return Array.from({ length: count }, (_, i) => ({
    x: Math.min(Math.max(startX + (i % cols) * xStep, 12), zoneW - 12),
    y: Math.min(Math.max(startY + Math.floor(i / cols) * yStep, 10), zoneH - 10),
  }));
}

/**
 * VictimToken 배열에서 zone별 오프셋 좌표를 일괄 계산한다.
 */
export function computeInitialPositions(
  victims: VictimToken[],
  zoneW:   number = 120,
  zoneH:   number = 80,
): Record<string, Pos> {
  const byZone: Record<string, string[]> = {};
  for (const v of victims) {
    if (!v.zoneKey) continue;
    if (!byZone[v.zoneKey]) byZone[v.zoneKey] = [];
    byZone[v.zoneKey].push(v.id);
  }

  const positions: Record<string, Pos> = {};
  for (const ids of Object.values(byZone)) {
    const offsets = computeVictimOffsets(ids.length, zoneW, zoneH);
    ids.forEach((id, i) => { positions[id] = offsets[i]; });
  }
  return positions;
}

// ─────────────────────────────────────────────
// VictimSetupItem → zoneKey (배치 우선순위)
// ─────────────────────────────────────────────

/** 기본 fallback zone — 층/면 모두 없을 때 pool 에 배치 */
export const VICTIM_FALLBACK_ZONE: string | null = null;

/**
 * VictimSetupItem 의 위치 정보(floor, face)에서 초기 배치 zoneKey 를 결정한다.
 *
 * 우선순위:
 *   1. floor 있음 → 해당 층 중앙구역 ('RF' → "RF-center", 3 → "3F-center")
 *   2. floor 없고 face 있음 → 외곽 면 구역 ("face-A" 등)
 *   3. 둘 다 없음 → null (pool/미배치)
 */
export function victimSetupZoneKey(floor: number | 'RF' | null, face: VictimFace | null): string | null {
  if (floor !== null) {
    if (floor === 'RF') return 'RF-center';
    const floorId = floor > 0 ? `${floor}F` : `B${-floor}`;
    return `${floorId}-center`;
  }
  if (face !== null) {
    return `face-${face}`;  // "face-A", "face-B", ...
  }
  return VICTIM_FALLBACK_ZONE;
}

// ─────────────────────────────────────────────
// VictimSetupItem → VictimToken
// ─────────────────────────────────────────────

export function victimSetupToToken(item: VictimSetupItem): VictimToken {
  const zoneKey = victimSetupZoneKey(item.floor, item.face);
  const age     = ageGroupToAge(item.ageGroup);

  // originDisplayBottom: 층/면/상세위치 슬래시 형식으로 1회 계산
  const bottomParts: string[] = [];
  if (item.floor !== null) {
    bottomParts.push(item.floor === 'RF' ? '옥상' : floorNumberToLabel(item.floor));
  }
  if (item.face !== null) bottomParts.push(`${item.face}면`);
  const detail = item.detailLocation.trim();
  if (detail) bottomParts.push(detail);
  const originDisplayBottom = bottomParts.length > 0 ? bottomParts.join('/') : undefined;

  return {
    id:                  `victim-setup-${item.id}`,
    kind:                'person',
    gender:              item.gender,
    age,
    condition:           item.condition,
    face:                item.face,
    subLocation:         item.detailLocation.trim(),
    originDisplayBottom,
    zoneKey,
  };
}
