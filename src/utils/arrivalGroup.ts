// ─────────────────────────────────────────────
// 도착대 — 방금 들어온 한 무리
//
// 자원대기소·대기1단계 맨 윗줄에 "직전에 도착한 무리"를 따로 보여준다.
// 착대 단위로 한꺼번에 보내면 시각이 같아 한 무리가 되고, 하나씩 옮겨도
// 10초 안에 이어지면 같은 무리로 본다. 간격이 10초를 넘으면 거기서 끊어
// 앞 무리는 아래 목록으로 내려간다.
// ─────────────────────────────────────────────

/** 같은 무리로 묶는 최대 간격 */
export const ARRIVAL_GROUP_WINDOW_MS = 10_000;

interface MovableToken {
  lastMovedAt?: number;
}

/**
 * 구역 안 토큰을 "도착대(arrived)"와 "그 아래 목록(rest)"으로 가른다.
 * rest 는 넘겨받은 순서를 그대로 유지한다.
 */
export function splitArrivalGroup<T extends MovableToken>(tokens: T[]): { arrived: T[]; rest: T[] } {
  const stamped = tokens.filter(t => t.lastMovedAt != null);
  if (stamped.length === 0) return { arrived: [], rest: tokens };

  // 최근 순으로 훑으며 바로 앞과의 간격이 창 안이면 계속 묶는다
  const byRecent = [...stamped].sort((a, b) => (b.lastMovedAt ?? 0) - (a.lastMovedAt ?? 0));
  const arrived: T[] = [byRecent[0]];
  for (let i = 1; i < byRecent.length; i++) {
    const prev = arrived[arrived.length - 1].lastMovedAt ?? 0;
    const cur  = byRecent[i].lastMovedAt ?? 0;
    if (prev - cur > ARRIVAL_GROUP_WINDOW_MS) break;
    arrived.push(byRecent[i]);
  }

  const arrivedSet = new Set<T>(arrived);
  return { arrived, rest: tokens.filter(t => !arrivedSet.has(t)) };
}
