/**
 * 현장요소 토큰의 배치 위치 판정.
 *
 * ⚠ 코드 식별자는 아직 `event*`다 — 화면 용어만 '돌발상황'에서 '현장요소'로 바꿨고(2026-08-20),
 *   식별자 정리는 최종 단계로 미뤘다. docs/EVENT_LOG_PLAN.md §6 LD-14
 *
 * 현장요소 토큰은 좌표(보드 대비 0~1)만 갖고 있어서, "A면인지 3층 내부인지"는
 * 매번 화면을 hit-test 해서 알아내야 했다. 그 값을 **토큰이 직접 갖도록** 하기 위한 유틸이다.
 * 판정 결과(`zoneKey`)는 출동대 구역 키와 같은 문법이라 `utils/logLabels.ts`의
 * `parseZoneKey()`·`zoneLabel()`을 그대로 쓸 수 있다.
 *
 * docs/EVENT_LOG_PLAN.md X-5
 */

export interface EventLocation {
  /** 'face-A' | '3F-center' | '3F-stair' | '3F-right' … 출동대 구역 키와 같은 문법 */
  zoneKey: string;
  /** 건물 안이면 층 id, 방면이면 null */
  floorId: string | null;
  /** 방면이면 'A'~'D', 건물 안이면 null */
  face:    string | null;
}

/** zoneKey 하나에서 floorId·face를 갈라낸다 */
export function splitEventZoneKey(zoneKey: string): EventLocation {
  if (zoneKey.startsWith('face-')) {
    return { zoneKey, floorId: null, face: zoneKey.slice('face-'.length) };
  }
  const dashIdx = zoneKey.lastIndexOf('-');
  if (dashIdx > 0) {
    return { zoneKey, floorId: zoneKey.slice(0, dashIdx), face: null };
  }
  return { zoneKey, floorId: zoneKey, face: null };
}

/**
 * 화면 좌표 → 이벤트 위치.
 *
 * 우선순위는 **구체적인 것부터**다.
 *  1) 건물 내부 구역 키(`3F-center`·`3F-stair`·`3F-right`) — 층과 구역까지 알 수 있다
 *  2) `data-floor-id` — 층만 (층 행 위이지만 구역 밖일 때)
 *  3) 방면 키(`face-A`~`face-D`)
 *
 * 방면을 마지막에 두는 이유: A~D면 구역이 건물 층을 감싸고 있어, 먼저 잡으면
 * 건물 안에 놓은 토큰까지 전부 면으로 판정된다.
 */
export function readEventLocationAtPoint(cx: number, cy: number): EventLocation | null {
  let faceKey:  string | null = null;
  let floorIdOnly: string | null = null;

  for (const el of document.elementsFromPoint(cx, cy)) {
    let cur: Element | null = el;
    while (cur) {
      const zk = cur.getAttribute('data-zone-key');
      if (zk) {
        if (zk.startsWith('face-')) {
          faceKey ??= zk;
        } else {
          return splitEventZoneKey(zk);   // 건물 내부 구역 — 가장 구체적
        }
      }
      if (!floorIdOnly) {
        const fid = cur.getAttribute('data-floor-id');
        if (fid) floorIdOnly = fid;
      }
      cur = cur.parentElement;
    }
  }

  if (floorIdOnly) return { zoneKey: floorIdOnly, floorId: floorIdOnly, face: null };
  if (faceKey)     return splitEventZoneKey(faceKey);
  return null;
}

/* ─────────────────────────────────────────────
   이벤트 토큰 크기 — 단일 출처

   토큰을 **층 행 높이에 비례**시킨다. 예전에는 100px 고정이라 층 높이가
   79~734px(9.3배) 로 움직이는 동안 토큰만 그대로였고, 건물을 줄이거나 층이
   많아지면 토큰이 층보다 커져 위아래 층으로 삐져나갔다.

   크기를 정하는 곳은 TacticalArea 한 곳뿐이고, CSS 변수 `--event-token-size`
   로 내려보낸다. 크기를 쓰는 나머지(클램프·초기배치·글자크기)는 전부 이 변수를
   읽는다 — 값을 여러 곳에 박아 두면 어긋난다.
   ───────────────────────────────────────────── */

/** 층 행 높이 대비 토큰 크기. 0.8 이면 "이 층에 있다"가 한눈에 읽힌다 */
export const EVENT_TOKEN_FLOOR_RATIO = 0.8;
/** 상한 (캔버스 px). 저층 건물에서 층이 아주 높아져도 토큰이 과하게 커지지 않게 한다 */
export const EVENT_TOKEN_MAX = 140;
/** 변수를 못 읽을 때의 폴백 — 예전 고정 크기 */
export const EVENT_TOKEN_FALLBACK = 100;
/** CSS 변수 이름 */
export const EVENT_TOKEN_SIZE_VAR = '--event-token-size';

/** 층 행 높이(캔버스 px) → 토큰 크기(캔버스 px). 하한은 두지 않는다 */
export function computeEventTokenSize(floorRowH: number): number {
  if (!Number.isFinite(floorRowH) || floorRowH <= 0) return EVENT_TOKEN_FALLBACK;
  return Math.min(EVENT_TOKEN_MAX, floorRowH * EVENT_TOKEN_FLOOR_RATIO);
}

/**
 * 현재 토큰 크기(캔버스 px)를 읽는다. 사용자 지정 속성은 지정된 토큰 그대로
 * 반환되므로 `"140px"` → `140` 이 되고, 이 값은 **캔버스 px** 다
 * (스테이지 변환 전 좌표계 — 뷰포트 px 가 필요하면 배율을 곱해야 한다).
 */
export function readEventTokenSize(): number {
  const board = document.getElementById('tactical-area');
  if (!board) return EVENT_TOKEN_FALLBACK;
  const raw = parseFloat(getComputedStyle(board).getPropertyValue(EVENT_TOKEN_SIZE_VAR));
  return Number.isFinite(raw) && raw > 0 ? raw : EVENT_TOKEN_FALLBACK;
}

/**
 * 보드 대비 0~1 좌표 → 이벤트 위치.
 * 저장된 위치로부터 다시 판정할 때 쓴다(레이아웃이 바뀌어 저장값이 낡았을 때의 대비책).
 *
 * `pos` 는 토큰의 **중심**이다. 예전에는 좌상단이라 중심을 얻으려고 크기의 절반을
 * 더해야 했는데, 크기가 층 높이에 따라 변하게 되면서 그 방식은 성립하지 않는다 —
 * 같은 저장값이 크기에 따라 다른 중심을 가리키게 되기 때문이다. 중심으로 저장하면
 * 크기가 아무리 변해도 토큰이 제자리에 머문다.
 */
export function readEventLocationAtPos(pos: { x: number; y: number }): EventLocation | null {
  const board = document.getElementById('tactical-area');
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  return readEventLocationAtPoint(
    rect.left + pos.x * rect.width,
    rect.top  + pos.y * rect.height,
  );
}
