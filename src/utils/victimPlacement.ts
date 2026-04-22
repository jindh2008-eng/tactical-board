/**
 * VictimSetupItem → VictimToken 변환 및 위치 관련 유틸
 * PlayPage 초기 구조대상자 자동 배치에 사용
 */

import type { VictimSetupItem } from '../types/settings';
import type { VictimFace, VictimToken } from '../types/victim';
import { buildDisplayBottom } from './victimUtils';

/** VictimSetupItem.floor 에서 'RF' 의 location 문자열 */
const RF_LOCATION = 'RF';

// ─────────────────────────────────────────────
// 좌표 타입
// ─────────────────────────────────────────────

export interface VictimPos { x: number; y: number; }

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

/**
 * 구조대상자 위치 표시 두 번째 줄을 생성한다.
 *
 * 형식: 층/면/상세위치 (존재하는 항목만 `/` 로 연결)
 *
 * 우선순위:
 *   1. location 에서 층 레이블 추출 (zone 기준 "3F" → "3층")
 *   2. victim.face (명시적 방면)
 *   3. detailLocation (명시적 상세위치) 또는 subLocation 파싱 결과
 *
 * @param victim VictimToken 전체 객체
 */
export function buildLocationLine(victim: VictimToken): string {
  const parts: string[] = [];
  const loc = victim.location.trim();

  // ① 층
  const floorDisplay = locationToFloorDisplay(loc);
  if (floorDisplay) {
    parts.push(floorDisplay);
  }

  // ② 면 (명시적 face 필드 우선)
  if (victim.face) {
    parts.push(`${victim.face}면`);
  } else if (!floorDisplay && loc && `${victim.face}면` !== loc) {
    // face가 없고 층도 아닌 위치(예: "A면", "임시의료소" 등)는 그대로 표시
    // 단, 특수 구역(대기, 임시의료소)은 제외하고 face zone만 추가
    if (/^[A-D]면$/.test(loc)) {
      parts.push(loc);  // "A면" 형식
    }
  }

  // ③ 상세위치: detailLocation > subLocation 파싱 순
  const detail = getEffectiveDetail(victim);
  if (detail) parts.push(detail);

  return parts.join('/');
}

/**
 * 표시에 사용할 상세위치 문자열 추출.
 *
 * - detailLocation 이 있으면 그것을 사용 (가장 정확한 값)
 * - 없고 face 도 없으면 subLocation 을 그대로 사용 (수동 생성 victim)
 * - 없고 face 가 있으면 subLocation 에서 "X면 / " 접두어를 제거한 나머지
 */
function getEffectiveDetail(victim: VictimToken): string {
  if (victim.detailLocation !== undefined) {
    return victim.detailLocation.trim();
  }
  if (!victim.face) {
    return victim.subLocation.trim();
  }
  // face 는 있지만 detailLocation 이 없는 경우:
  // subLocation 이 "A면 / 창문" 형태이면 "A면 / " 부분을 제거
  const facePrefix = `${victim.face}면`;
  const sub = victim.subLocation.trim();
  if (sub.startsWith(facePrefix)) {
    return sub.slice(facePrefix.length).replace(/^\s*\/\s*/, '').trim();
  }
  return sub;
}

// ─────────────────────────────────────────────
// 오프셋 사전 정의
// ─────────────────────────────────────────────

/**
 * zone 내 victim 자동 배치 오프셋.
 * 기준: zone 너비 ~120px, 높이 ~80px 을 상정.
 * 드래그로 수동 재배치는 언제나 가능.
 */
const PRESETS: Array<Array<VictimPos>> = [
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
): VictimPos[] {
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
export function computeInitialVictimPositions(
  victims: VictimToken[],
  zoneW:   number = 120,
  zoneH:   number = 80,
): Record<string, VictimPos> {
  const byZone: Record<string, string[]> = {};
  for (const v of victims) {
    if (!v.zoneKey) continue;
    if (!byZone[v.zoneKey]) byZone[v.zoneKey] = [];
    byZone[v.zoneKey].push(v.id);
  }

  const positions: Record<string, VictimPos> = {};
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
// subLocation 문자열 (표시/호환용)
// ─────────────────────────────────────────────

/**
 * face + detailLocation → subLocation 표시 문자열
 * 역호환 및 rescueLocation 기록용으로 유지.
 *
 * 예) 'A', '203호' → 'A면 / 203호'
 *     null, '203호' → '203호'
 *     'B', ''       → 'B면'
 *     null, ''      → ''
 */
export function setupItemSubLocation(face: VictimFace | null, detailLocation: string): string {
  const parts: string[] = [];
  if (face) parts.push(`${face}면`);
  const detail = detailLocation.trim();
  if (detail) parts.push(detail);
  return parts.join(' / ');
}

// ─────────────────────────────────────────────
// VictimSetupItem → VictimToken
// ─────────────────────────────────────────────

/**
 * VictimSetupItem → VictimToken
 *
 * - zoneKey: floor 우선 → face 차순 → null(pool) 의 배치 우선순위 적용
 * - face: 명시적 필드로 저장
 * - detailLocation: 순수 상세위치 텍스트 저장 (subLocation 과 별도)
 * - displayBottom: 새 슬래시 형식 ("3층/A면/창문")
 */
export function victimSetupToToken(item: VictimSetupItem): VictimToken {
  const zoneKey = victimSetupZoneKey(item.floor, item.face);

  // location: zoneKey 에서 층 레이블 파생 (이동 시 변경됨)
  let location = '';
  if (item.floor !== null) {
    location = item.floor === 'RF'
      ? RF_LOCATION
      : item.floor > 0 ? `${item.floor}F` : `B${-item.floor}`;
  } else if (item.face !== null) {
    location = `${item.face}면`;
  }

  const subLocation    = setupItemSubLocation(item.face, item.detailLocation);
  const displayTop     = `${item.gender}/${item.ageGroup}/${item.condition}`;

  // displayBottom: 새 슬래시 형식으로 사전 계산
  const bottomParts: string[] = [];
  if (item.floor !== null) {
    bottomParts.push(item.floor === 'RF' ? '옥상' : floorNumberToLabel(item.floor));
  }
  if (item.face  !== null) bottomParts.push(`${item.face}면`);
  const detail = item.detailLocation.trim();
  if (detail) bottomParts.push(detail);
  const displayBottom = bottomParts.join('/') || buildDisplayBottom(location, subLocation);

  return {
    id:                 `victim-setup-${item.id}`,
    kind:               'person',
    gender:             item.gender,
    ageGroup:           item.ageGroup,
    condition:          item.condition,
    face:               item.face,
    detailLocation:     item.detailLocation,   // 원본 상세위치 보존
    location,
    subLocation,
    displayTop,
    displayBottom,
    originDisplayBottom: displayBottom,        // 최초 구조위치 고정
    zoneKey,
  };
}
