// ─────────────────────────────────────────────
// 방수 지점 판정 — 클릭·드롭 좌표 → 전술상황판 기준 정규화 좌표
//
// 출발 구역과 대상 구역을 일치시키는 제한은 두지 않는다. A면에 선 진압대가
// B·C·D면으로 방수하는 상황이 실제로 있어서, 같은 방면·같은 층만 허용하면
// 훈련이 막힌다. 전술상황판 밖(좌우 패널·여백)만 걸러 오조작을 막는다.
// ─────────────────────────────────────────────

import { splitEventZoneKey } from './eventLocation';

export interface SprayPoint {
  /** 전술상황판 대비 0~1 정규화 좌표 */
  x: number;
  y: number;
  /** 건물 내부면 층 id, 방면이면 `face-X` */
  floorId?: string;
  /** 상태 태그에 쓰는 사람이 읽는 이름 ("3층", "옥상", "B면", "LPG가스통") */
  label: string;
  /** 현장요소 토큰을 직접 겨눴을 때의 현장요소 id */
  eventId?: string;
}

/** 클릭 좌표에서 data-floor-id, data-zone-key, 층 표시명 탐색 */
function getPointInfo(cx: number, cy: number): {
  floorId?: string; zoneKey?: string; floorLabel?: string;
} {
  const elements = document.elementsFromPoint(cx, cy);
  let floorId:    string | undefined;
  let zoneKey:    string | undefined;
  let floorLabel: string | undefined;
  for (const el of elements) {
    let cur: Element | null = el;
    while (cur) {
      if (!floorId) {
        const v = cur.getAttribute('data-floor-id');
        if (v) { floorId = v; floorLabel = cur.getAttribute('data-floor-label') ?? v; }
      }
      if (!zoneKey) { const v = cur.getAttribute('data-zone-key');  if (v) zoneKey  = v; }
      if (floorId && zoneKey) break;
      cur = cur.parentElement;
    }
    if (floorId && zoneKey) break;
  }
  return { floorId, zoneKey, floorLabel };
}

/** 클릭 지점이 현장요소 토큰 위인지 본다 */
function getEventAtPoint(cx: number, cy: number): { eventId: string; zoneKey: string | null; label: string } | null {
  for (const el of document.elementsFromPoint(cx, cy)) {
    const host = (el as Element).closest?.('[data-event-id]');
    if (host) {
      return {
        eventId: host.getAttribute('data-event-id')!,
        zoneKey: host.getAttribute('data-event-zone'),
        // title은 "이름 — 위치" 형식이라 앞부분만 쓴다
        label:   (host.getAttribute('title') ?? '').split(' — ')[0] || '현장요소',
      };
    }
  }
  return null;
}

/**
 * 방수 지점을 만든다. 전술상황판 안(건물 층 · A~D면 · 현장요소 토큰)이 아니면 null.
 *
 * 현장요소 토큰을 직접 겨누는 경우를 먼저 본다. 토큰이 층·면 위에 겹쳐 있어
 * 나중에 보면 항상 밑에 깔린 구역이 먼저 잡혀 토큰을 조준할 수 없다.
 * 진압 판정(BuildingBoard)은 위치 키로 집계하므로, 토큰이 가진 배치 구역을
 * 그대로 floorId로 넘겨 같은 위치에 점수가 쌓이게 한다.
 */
export function resolveSprayTarget(cx: number, cy: number): SprayPoint | null {
  const rect = document.getElementById('tactical-area')?.getBoundingClientRect();
  if (!rect) return null;
  const x = (cx - rect.left) / rect.width;
  const y = (cy - rect.top)  / rect.height;

  const ev = getEventAtPoint(cx, cy);
  if (ev) {
    const loc = ev.zoneKey ? splitEventZoneKey(ev.zoneKey) : null;
    return {
      x, y,
      floorId: loc ? (loc.floorId ?? loc.zoneKey) : undefined,
      label:   ev.label,
      eventId: ev.eventId,
    };
  }

  const { floorId, zoneKey, floorLabel } = getPointInfo(cx, cy);
  const isFace = !!zoneKey?.startsWith('face-');
  if (floorId == null && !isFace) return null;

  return {
    x, y,
    floorId: floorId ?? (isFace ? zoneKey : undefined),
    label:   floorLabel ?? (isFace ? `${zoneKey!.slice('face-'.length)}면` : ''),
  };
}
