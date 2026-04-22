import type {
  BuildingConfig,
  DisplayFloor,
  Floor,
  Zone,
} from '../types';

// ─────────────────────────────────────────────
// 기본 건물 설정값
// ─────────────────────────────────────────────

export const DEFAULT_BUILDING_CONFIG: BuildingConfig = {
  aboveGroundFloors: 10,
  basementFloors: 0,
};

// ─────────────────────────────────────────────
// 층별 구역 배열 생성
//
// 계단실은 항상 좌측 고정: [stair, left, right]
// Zone 배열의 순서 = 화면 렌더링 순서
// ─────────────────────────────────────────────

export function buildZones(): Zone[] {
  return [
    { id: 'stair',  label: '계단',    status: {}, acceptsTokens: true  },
    { id: 'left',   label: '단위지휘관', status: {}, acceptsTokens: true  },
    { id: 'center', label: '중앙',    status: {}, acceptsTokens: true  },
    { id: 'right',  label: '화재상황', status: {}, acceptsTokens: false },
  ];
}

// ─────────────────────────────────────────────
// 건물 층 배열 동적 생성
//
// 렌더링 순서:
//   옥상 → 지상 N층 → 1층 → 지하 1층 → 지하 N층
//
// 참고:
// - 옥상(RF)을 실제 Floor로 추가
// - 화염 표시 여부는 현재 데모용으로 유지
// ─────────────────────────────────────────────

export function generateFloors(config: BuildingConfig): Floor[] {
  const { aboveGroundFloors, basementFloors } = config;
  const floors: Floor[] = [];

  // 옥상
  floors.push({
    id: 'RF',
    label: '옥상',
    isBasement: false,
    zones: buildZones(),
  });

  // 지상층: 위에서 아래 방향으로 (N층 → 1층)
  for (let i = aboveGroundFloors; i >= 1; i--) {
    floors.push({
      id: `${i}F`,
      label: `${i}F`,
      isBasement: false,
      zones: buildZones(),
    });
  }

  // 지하층: B1, B2, ...
  for (let i = 1; i <= basementFloors; i++) {
    floors.push({
      id: `B${i}`,
      label: `B${i}`,
      isBasement: true,
      zones: buildZones(),
    });
  }

  return floors;
}

// ─────────────────────────────────────────────
// 통합 층 표시 행 계산 (지상 + 지하)
//
// 지상층과 지하층을 하나의 연속 공간으로 취급.
// 층 번호: 지하는 음수(-1=B1, -2=B2...), 지상은 양수(1,2...)
//
// 선형 인덱스 매핑 (가장 깊은 지하=1, 최상층=totalFloors):
//   Bn(n층) → basementFloors - n + 1
//   지상 m층 → basementFloors + m
//
// 화점층 포함 위 4개층 개별, 나머지 위/아래 묶음.
// 묶음 범위가 지상/지하 경계를 넘으면 두 개 행으로 분리.
// ─────────────────────────────────────────────

function computeAllFloorRows(
  aboveGroundFloors: number,
  basementFloors: number,
  fireFloor: number,
): { startFloor: number; endFloor: number }[] {
  const totalFloors = aboveGroundFloors + basementFloors;
  if (totalFloors <= 0) return [];

  // 층 번호 → 선형 인덱스 (지하 음수, 지상 양수, 0 없음)
  const toIdx = (n: number): number =>
    n < 0 ? basementFloors + n + 1 : basementFloors + n;

  // 선형 인덱스 → 층 번호
  const toFloor = (idx: number): number =>
    idx <= basementFloors ? idx - basementFloors - 1 : idx - basementFloors;

  // 화점층 클램프: 지하 최하층 ~ 지상 최상층
  const minFloor = basementFloors > 0 ? -basementFloors : 1;
  const clampedFire = Math.max(minFloor, Math.min(aboveGroundFloors, fireFloor));
  const fireIdx = toIdx(clampedFire);

  // 화점 포함 위 4개층 상단 인덱스
  const visibleTopIdx = Math.min(totalFloors, fireIdx + 3);

  // 인덱스 범위 목록 생성 (위 → 아래)
  const idxRanges: { s: number; e: number }[] = [];

  if (visibleTopIdx < totalFloors) {
    idxRanges.push({ s: visibleTopIdx + 1, e: totalFloors }); // 상단 묶음
  }
  for (let i = visibleTopIdx; i >= fireIdx; i--) {
    idxRanges.push({ s: i, e: i }); // 개별 4층
  }
  if (fireIdx > 1) {
    idxRanges.push({ s: 1, e: fireIdx - 1 }); // 하단 묶음
  }

  // 인덱스 범위 → 층 번호 범위 (지상/지하 경계 넘으면 분리)
  const result: { startFloor: number; endFloor: number }[] = [];
  const boundary = basementFloors; // 이 인덱스 이하는 지하

  for (const { s, e } of idxRanges) {
    if (basementFloors > 0 && s <= boundary && e > boundary) {
      // 경계 초과: 지상 부분 먼저(높은 곳), 지하 부분 다음(낮은 곳)
      result.push({ startFloor: 1,           endFloor: toFloor(e) }); // 지상 부분
      result.push({ startFloor: toFloor(s),  endFloor: -1         }); // 지하 부분
    } else {
      result.push({ startFloor: toFloor(s), endFloor: toFloor(e) });
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// 화면 표시용 층 배열 생성 (옥상 포함)
//
// - 옥상은 항상 맨 위 1행
// - 지상+지하 통합 압축 표시 (computeAllFloorRows 사용)
// - 지상/지하 경계를 넘는 묶음은 자동으로 분리됨
// ─────────────────────────────────────────────

export function buildDisplayFloors(
  config: BuildingConfig,
  fireFloor: number,
): DisplayFloor[] {
  const { aboveGroundFloors, basementFloors } = config;
  const actualFloors = generateFloors(config);

  // 층 참조 맵
  const floorByAbove    = new Map<number, Floor>(); // 지상: key=층번호(1,2,...)
  const floorByBasement = new Map<number, Floor>(); // 지하: key=1,2,...(B1=1)
  let roofFloor: Floor | undefined;

  for (const floor of actualFloors) {
    if (floor.id === 'RF') { roofFloor = floor; continue; }
    if (floor.isBasement) {
      const n = parseInt(floor.id.replace('B', ''), 10);
      if (!Number.isNaN(n)) floorByBasement.set(n, floor);
    } else {
      const n = parseInt(floor.id, 10);
      if (!Number.isNaN(n)) floorByAbove.set(n, floor);
    }
  }

  // 층 번호(양수=지상, 음수=지하)로 Floor 참조
  const getRef = (n: number): Floor | undefined =>
    n > 0 ? floorByAbove.get(n) : floorByBasement.get(-n);

  const result: DisplayFloor[] = [];

  // 1) 옥상
  if (roofFloor) {
    result.push({
      id:         'RF',
      label:      '옥상',
      startFloor: aboveGroundFloors + 1,
      endFloor:   aboveGroundFloors + 1,
      isRange:    false,
      isBasement: false,
      zones:      roofFloor.zones,
    });
  }

  // 2) 지상+지하 통합 압축 행
  for (const { startFloor, endFloor } of
      computeAllFloorRows(aboveGroundFloors, basementFloors, fireFloor)) {

    const isRange    = startFloor !== endFloor;
    const isBasement = endFloor < 0; // 행의 상단(endFloor)이 음수면 전체 지하 행

    let label: string;
    let id:    string;
    let refNum: number;

    if (isBasement) {
      // startFloor: 가장 깊은 지하(예 -3=B3), endFloor: 가장 얕은(예 -1=B1)
      const shallow = -endFloor;   // B1=1, B2=2 ...
      const deep    = -startFloor;
      label  = isRange ? `B${shallow}\n~\nB${deep}` : `B${shallow}`;
      id     = isRange ? `B${shallow}-B${deep}`      : `B${shallow}`;
      refNum = endFloor; // 가장 얕은 지하(B1에 가까운) zones 사용
    } else {
      // startFloor: 낮은 지상층, endFloor: 높은 지상층
      label  = isRange ? `${endFloor}\n~\n${startFloor}F` : `${endFloor}F`;
      id     = isRange ? `${startFloor}F-${endFloor}F` : `${endFloor}F`;
      refNum = endFloor;
    }

    const refFloor = getRef(refNum);
    if (!refFloor) continue;

    result.push({ id, label, startFloor, endFloor, isRange, isBasement, zones: refFloor.zones });
  }

  return result;
}

// ─────────────────────────────────────────────
// 배치 가능 층 목록 (구조대상자 전용)
//
// 화면에서 "요약 행(isRange)"으로 묶인 층은 개별 셀이 없으므로
// 구조대상자를 배치할 수 없다. 실제로 개별 행으로 렌더링되는 층만 반환.
// 'RF'는 항상 포함.
// ─────────────────────────────────────────────

/**
 * 구조대상자가 배치 가능한 층 목록을 반환한다.
 *
 * - 'RF' = 옥상 (항상 포함)
 * - 양수  = 지상층 번호
 * - 음수  = 지하층 번호 (-1 = B1)
 * 반환 순서: 옥상 → 높은 지상층 → 낮은 지상층 → 지하층
 */
export function buildPlaceableFloors(
  config:    BuildingConfig,
  fireFloor: number,
): Array<number | 'RF'> {
  const result: Array<number | 'RF'> = [];
  const floors = buildDisplayFloors(config, fireFloor);
  for (const df of floors) {
    if (df.isRange) continue; // 요약 행은 제외
    if (df.id === 'RF') {
      result.push('RF');
    } else if (df.isBasement) {
      // isBasement 행: startFloor ≤ endFloor ≤ -1
      result.push(df.startFloor); // 음수 (예: -1 = B1)
    } else {
      result.push(df.endFloor); // 양수
    }
  }
  return result;
}

/**
 * 구조대상자를 실제로 드롭할 수 있는 zoneKey 집합을 반환한다.
 *
 * - 건물 내부: 개별 렌더링 층의 stair·left·center 구역
 * - 외곽 방면: face-A ~ face-D
 * - 특수 구역: medical-post, standby-*
 * 이 집합에 없는 zoneKey 는 유효하지 않으며 pool 로 이동해야 한다.
 */
export function buildValidVictimZoneKeys(
  config:    BuildingConfig,
  fireFloor: number,
): Set<string> {
  const valid = new Set<string>();
  const floors = buildDisplayFloors(config, fireFloor);

  for (const df of floors) {
    if (df.isRange) continue;
    for (const zone of df.zones) {
      if (!zone.acceptsTokens || zone.id === 'right') continue;
      valid.add(`${df.id}-${zone.id}`);
    }
  }

  // 외곽 방면
  valid.add('face-A');
  valid.add('face-B');
  valid.add('face-C');
  valid.add('face-D');

  // 특수 구역
  valid.add('medical-post');
  valid.add('standby-resource');
  valid.add('standby-standby1');
  valid.add('standby-imminent');

  return valid;
}

// ─────────────────────────────────────────────
// 층 높이 계산
//
// 현재 요구사항:
// - 층고가 너무 높지 않게
// - 한 층에 출동대 토큰을 여러 개 배치할 수 있는 정도면 충분
// - 우선 세로로 3개 정도 배치 가능한 크기면 충분
//
// 권장:
// - 일단 고정에 가까운 낮은 높이 사용
// - 필요 시 실제 displayRows 기준으로만 미세 조정
// ─────────────────────────────────────────────

const FIXED_ROW_HEIGHT = 28;       // 기본 권장 높이
const MIN_ROW_HEIGHT_FLOOR = 20;   // 너무 작아지지 않게
const MAX_ROW_HEIGHT_FLOOR = 26;   // 너무 커지지 않게
const BUILDING_REF_HEIGHT = 170;   // 자동 계산 시 참고용

/**
 * 가장 단순하고 안정적인 방식:
 * 표시 행 수와 관계없이 거의 일정한 층 높이를 사용
 */
export function calcMinRowHeight(): number {
  return FIXED_ROW_HEIGHT;
}

/**
 * 표시 행 수 기준으로 약하게만 자동 조정하고 싶을 때 사용
 * 필요 시 렌더링 쪽에서 이 함수를 선택적으로 사용
 */
export function calcMinRowHeightByDisplayRows(displayRows: number): number {
  if (displayRows <= 0) return FIXED_ROW_HEIGHT;

  const calculated = Math.floor(BUILDING_REF_HEIGHT / displayRows);
  return Math.min(
    MAX_ROW_HEIGHT_FLOOR,
    Math.max(calculated, MIN_ROW_HEIGHT_FLOOR),
  );
}

