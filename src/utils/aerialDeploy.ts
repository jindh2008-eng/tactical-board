// ─────────────────────────────────────────────
// 고가차·굴절차 전개 지점 → 층 판정
//
// 전개는 원래 건물 내부(층 행)에만 가능했다. 실제로는 B·D면에 차량을 대고
// 외벽을 향해 사다리를 올리는 상황이 훨씬 흔해서 방면 전개를 허용한다.
//
// 높이 판정 근거는 화면 배치다. TacticalArea 그리드에서 B·D면은 건물과 같은 row
// (RF 트랙 포함)를 공유하므로 층 행과 세로로 정렬돼 있다. 따라서 클릭한 Y와
// 겹치는 층 행이 곧 전개 높이가 된다.
//
// A·C면은 건물 위아래에 눕힌 가로 띠라 층에 대응하는 세로 위치가 없다.
// 전개 대상에서 제외한다.
// ─────────────────────────────────────────────

/** 층 판정 결과 — DOM 에서 읽는 세 값을 그대로 옮긴다 */
export interface AerialDeployFloor {
  floorId:      string;
  /** 높이 제한 비교용 층수 (RF 는 지상층수 + 1) */
  floorHeight:  number;
  /** 상태 태그에 쓰는 표시 문구 ("3층", "옥상", "10~5층") */
  displayLabel: string;
}

/** 차종별 전개 가능 높이(층) */
export const AERIAL_MAX_HEIGHT = 15;   // 고가차
export const LADDER_MAX_HEIGHT = 7;    // 굴절차

/** 이 차종이 몇 층까지 전개할 수 있는가 */
export function maxDeployHeight(unitType: string): number {
  return unitType === 'ladder' ? LADDER_MAX_HEIGHT : AERIAL_MAX_HEIGHT;
}

/** 전개 동작 이름 */
export function deployLabelOf(unitType: string): string {
  return unitType === 'ladder' ? '바스켓전개' : '사다리전개';
}

/** 높이 초과 안내 문구 */
export function overHeightMessage(unitType: string): string {
  const name = unitType === 'ladder' ? '굴절차' : '고가차';
  return `${name}는 ${maxDeployHeight(unitType)}층 높이까지만 전개 가능합니다.`;
}

/** 사다리를 세로로 걸 수 있는 방면 — 건물과 같은 그리드 row 를 쓰는 좌·우 열 */
const LADDER_FACE_KEYS = new Set(['face-B', 'face-D']);

function readFloor(el: Element): AerialDeployFloor {
  const floorId = el.getAttribute('data-floor-id')!;
  return {
    floorId,
    floorHeight:  Number(el.getAttribute('data-floor-height') ?? 0),
    displayLabel: el.getAttribute('data-floor-label') ?? floorId,
  };
}

/** 클릭 지점의 조상 중 해당 속성을 가진 첫 요소 */
function ancestorWithAttr(cx: number, cy: number, attr: string, accept?: (v: string) => boolean): Element | null {
  for (const el of document.elementsFromPoint(cx, cy)) {
    let cur: Element | null = el;
    while (cur) {
      const v = cur.getAttribute(attr);
      if (v && (!accept || accept(v))) return cur;
      cur = cur.parentElement;
    }
  }
  return null;
}

/** 지상 층 행을 화면 위→아래 순으로 (지하층 제외 — 사다리 전개 대상이 아니다) */
function aboveGroundRows(): Element[] {
  return [...document.querySelectorAll('[data-floor-id]')]
    .filter(el => !el.classList.contains('floor-row--basement'))
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
}

/**
 * 클릭 좌표에서 전개 층을 판정한다.
 * 건물 내부 → 그 층 행. B·D면 → 같은 높이의 층 행. 그 외 → null.
 */
export function resolveAerialDeployFloor(cx: number, cy: number): AerialDeployFloor | null {
  // 1) 건물 내부 — 층 행을 직접 찾는다
  const floorEl = ancestorWithAttr(cx, cy, 'data-floor-id');
  if (floorEl) {
    if (floorEl.classList.contains('floor-row--basement')) return null; // 지하층 전개 불가
    return readFloor(floorEl);
  }

  // 2) B·D면 — 클릭 Y가 걸치는 층 행으로 환산
  const faceEl = ancestorWithAttr(cx, cy, 'data-zone-key', v => LADDER_FACE_KEYS.has(v));
  if (!faceEl) return null;

  const rows = aboveGroundRows();
  if (rows.length === 0) return null;

  for (const row of rows) {
    const r = row.getBoundingClientRect();
    if (cy >= r.top && cy <= r.bottom) return readFloor(row);
  }

  // 최상층 위쪽 여백(방면 열이 RF 행보다 조금 높게 시작하는 경우)은 옥상으로 본다.
  // 아래쪽 여백은 지하 구간이므로 전개하지 않는다.
  const top = rows[0].getBoundingClientRect();
  return cy < top.top ? readFloor(rows[0]) : null;
}
