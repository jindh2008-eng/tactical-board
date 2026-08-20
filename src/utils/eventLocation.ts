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

/** 이벤트 토큰 중심 보정값(기준 배율). EventLayer·BuildingBoard가 같은 값을 써야 판정이 어긋나지 않는다 */
export const EVENT_TOKEN_HALF_BASE = 26;

/**
 * 보드 대비 0~1 좌표 → 이벤트 위치.
 * 저장된 위치로부터 다시 판정할 때 쓴다(레이아웃이 바뀌어 저장값이 낡았을 때의 대비책).
 */
export function readEventLocationAtPos(pos: { x: number; y: number }): EventLocation | null {
  const board = document.getElementById('tactical-area');
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  // 토큰이 --ui-scale 로 줄어들면 중심 보정값도 함께 줄어야 판정이 어긋나지 않는다
  const uiScale = parseFloat(getComputedStyle(board).getPropertyValue('--ui-scale')) || 1;
  const half = EVENT_TOKEN_HALF_BASE * uiScale;
  return readEventLocationAtPoint(
    rect.left + pos.x * rect.width  + half,
    rect.top  + pos.y * rect.height + half,
  );
}
