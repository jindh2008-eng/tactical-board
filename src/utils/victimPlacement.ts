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
 * zone 내 victim 자동 배치 오프셋 — 우측 하단 기준, 겹치지 않게 배치.
 * 기준: zone 너비 ~120px, 높이 ~80px 을 상정.
 * 카드가 우측 하단 모서리부터 왼쪽으로 채워지고, 한 줄이 차면 위로 새 줄을 쌓는다.
 * 드래그로 수동 재배치는 언제나 가능.
 */
// 실측 카드 크기(성별 아이콘+상세위치 없음 기준 약 37x39px)보다 여유 있게 잡아
// 인접 카드끼리 겹치지 않도록 함.
const MARGIN_X = 24; // 첫 열 카드 중심 x (우측 경계에서 카드 절반 폭만큼 안쪽)
const MARGIN_Y = 22; // 첫 행(맨 아래) 카드 중심 y (하단 경계에서 카드 절반 높이만큼 안쪽)
const X_STEP   = 44; // 카드 간 가로 간격 — 겹치지 않는 최소 폭
const Y_STEP   = 46; // 카드 간 세로 간격(줄 바뀔 때) — 겹치지 않는 최소 높이

/**
 * 어느 모서리부터 채우는가.
 *
 * `bottom-right` — 기본. 구역 우측 하단부터 왼쪽·위쪽으로 채운다.
 * `top-center`   — A면 전용. 가운데 상단에서 좌우로 펼치고 아래로 쌓는다.
 *
 * A면만 다른 이유는 그 아래에 하단 밴드(직전대기·RIT·현장지휘소·임시의료소·
 * 구조 현황)가 겹쳐 있기 때문이다. 밴드는 A면 위에 떠 있고 `face-A` 구역은
 * 그 밑까지 이어져 있어서, 우측 하단에 놓으면 구조대상자가 밴드에 가린다.
 * B·C·D 면에는 그런 것이 없어 기존 규칙 그대로 둔다.
 */
export type VictimAnchor = 'bottom-right' | 'top-center';

/**
 * zone 내 n명 victim 의 초기 배치 좌표를 **구역 대비 0~1 정규화 값**으로 반환한다.
 *
 * 간격(MARGIN/STEP)은 카드 실측 크기 기준이라 px 로 계산한 뒤 마지막에 나눈다.
 * → docs/RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md Phase 4
 */
export function computeVictimOffsets(
  count:  number,
  zoneW:  number = 120,
  zoneH:  number = 80,
  anchor: VictimAnchor = 'bottom-right',
): Pos[] {
  if (count <= 0) return [];

  const w = zoneW > 0 ? zoneW : 120;
  const h = zoneH > 0 ? zoneH : 80;

  const usableW = Math.max(w - MARGIN_X, 1);
  const cols    = Math.max(1, Math.min(count, Math.floor(usableW / X_STEP)));

  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    if (anchor === 'top-center') {
      // 그 줄에 실제로 들어가는 인원 — 마지막 줄이 짧아도 가운데에 서게 한다
      const inRow    = Math.min(cols, count - row * cols);
      const rowWidth = (inRow - 1) * X_STEP;
      const px = clamp(w / 2 - rowWidth / 2 + col * X_STEP, MARGIN_X, w - MARGIN_X);
      const py = Math.min(MARGIN_Y + row * Y_STEP, Math.max(h - MARGIN_Y, 10));
      return { x: px / w, y: py / h };
    }

    const px = Math.max(w - MARGIN_X - col * X_STEP, 10);
    const py = Math.max(h - MARGIN_Y - row * Y_STEP, 10);
    return { x: px / w, y: py / h };
  });
}

function clamp(v: number, min: number, max: number): number {
  // 구역이 카드 한 장보다 좁으면 범위가 뒤집힌다 — 그때는 왼쪽 여백에 맞춘다
  if (max < min) return min;
  return Math.max(min, Math.min(max, v));
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
export function victimSetupZoneKey(floor: number | 'RF' | null, face: VictimFace | null, isStair?: boolean): string | null {
  if (floor !== null) {
    if (floor === 'RF') return 'RF-center';
    const floorId = floor > 0 ? `${floor}F` : `B${-floor}`;
    return isStair ? `${floorId}-stair` : `${floorId}-center`;
  }
  if (face !== null) {
    return `face-${face}`;
  }
  return VICTIM_FALLBACK_ZONE;
}

// ─────────────────────────────────────────────
// VictimSetupItem → VictimToken
// ─────────────────────────────────────────────

export function victimSetupToToken(item: VictimSetupItem): VictimToken {
  const zoneKey = victimSetupZoneKey(item.floor, item.face, item.isStair);
  const age     = ageGroupToAge(item.ageGroup);

  // originDisplayBottom: 층/계단실/면/상세위치 슬래시 형식으로 1회 계산
  const bottomParts: string[] = [];
  if (item.floor !== null) {
    bottomParts.push(item.floor === 'RF' ? '옥상' : floorNumberToLabel(item.floor));
  }
  if (item.isStair && item.floor !== null) bottomParts.push('계단실');
  if (item.face !== null) bottomParts.push(`${item.face}면`);
  const detail = item.detailLocation.trim();
  if (detail) bottomParts.push(detail);
  const originDisplayBottom = bottomParts.length > 0 ? bottomParts.join('/') : undefined;

  return {
    id:                  `victim-setup-${item.id}`,
    kind:                'person',
    gender:              item.gender,
    age,
    ageGroup:            item.ageGroup,
    condition:           item.condition,
    face:                item.face,
    subLocation:         item.detailLocation.trim(),
    originDisplayBottom,
    // 집계 기준이 되는 최초 배치 구역 — 이후 어디로 옮겨도 이 값은 그대로다
    originZoneKey:       zoneKey ?? undefined,
    zoneKey,
  };
}
