import type { CirculationMap } from './runtimeSession';

// ─────────────────────────────────────────────
// 순환보수를 유량 계산이 읽을 수 있는 모양으로 편다
//
// 순환칸에서 나가는 선은 **차 한 대가 아니라 무리**가 출발점이다
// (fromId = `circ-<소화전id>`). 유량 계산은 차량 단위로만 셈하므로, 계산 직전에
// 이 선 하나를 **가상 연결 둘**로 펼친다. 저장하지 않는다.
//
//   소화전 → 줄 3번   보수 — 소화전에서 채운다   (3단계, 1000ℓ/min)
//   줄 1번 → 목적지   소비 — 중요물탱크에 보낸다 (2단계, demand-pull)
//
// 줄 2번은 어느 쪽에도 들지 않는다. **만수로 서 있는 것이 대기다.**
//
// 이렇게 두면 기존 유량 코드를 한 줄도 바꾸지 않고 순환보수의 물리가 나온다 —
// 특히 2단계의 demand-pull 덕분에, 중요물탱크가 만수면 1번은 아래에서 실제로
// 쓰는 만큼만 보낸다. 그래서 「진압대 3대(900ℓ/min)까지는 소화전 유입(1000)으로
// 감당된다」가 저절로 성립한다. → docs/WATER_SUPPLY_MISSION_PLAN.md §3.3 · §6.2
// ─────────────────────────────────────────────

export interface FlowConnection {
  fromId:   string;
  toId:     string;
  fromType: string;
  toType:   string;
}

const CIRC_PREFIX = 'circ-';

/** 소화전 id → 순환칸 합성 급수원 id. 연결·오버레이가 이 이름으로 칸을 가리킨다 */
export function circulationSourceId(hydrantId: string): string {
  return `${CIRC_PREFIX}${hydrantId}`;
}

/** 순환칸 합성 id → 소화전 id. 순환칸이 아니면 null */
export function hydrantIdOfCirculationSource(sourceId: string): string | null {
  return sourceId.startsWith(CIRC_PREFIX) ? sourceId.slice(CIRC_PREFIX.length) : null;
}

/** 줄에서 지금 **소비** 중인 차 — 1번. 없으면 null */
export function consumingUnitOf(line: readonly string[] | undefined): string | null {
  return line?.[0] ?? null;
}

/**
 * 줄에서 지금 **보수받는** 차 — 3번. 2대뿐이면 2번이 그 자리를 겸한다.
 *
 * **1대뿐이면 없다.** 그 한 대는 소화전에 붙어 있거나 중계 지점에 있거나
 * 둘 중 하나다 — 동시에 받으면서 보낼 수는 없다.
 */
export function refillingUnitOf(line: readonly string[] | undefined): string | null {
  if (!line || line.length < 2) return null;
  return line[2] ?? line[1];
}

/**
 * 순환칸 연결을 가상 연결 둘로 편 연결 목록.
 *
 * 원래의 `circulation` 연결은 빼고 나간다 — 유량 계산은 차량 id 만 알므로
 * 그대로 두면 아무 데도 걸리지 않는 채 남는다.
 *
 * @param brokenHydrantIds 고장난 소화전. 여기서는 물이 나오지 않는다
 */
export function expandCirculationFlow(
  connections:      readonly FlowConnection[],
  slots:            CirculationMap,
  brokenHydrantIds: ReadonlySet<string> = new Set(),
): FlowConnection[] {
  const out: FlowConnection[] = [];

  // ① 1번 → 목적지. 순환칸에서 나간 선이 있을 때만 생긴다
  for (const c of connections) {
    const hydrantId = hydrantIdOfCirculationSource(c.fromId);
    if (hydrantId === null) { out.push(c); continue; }

    const head = consumingUnitOf(slots[hydrantId]);
    if (head) out.push({ fromId: head, toId: c.toId, fromType: 'pump', toType: c.toType });
  }

  /*
   * ② 소화전 → 3번. **나가는 선과 무관하게** 생긴다 — 순환칸에 세운 순간
   * 그 차는 소화전에 붙어 있다. 아직 아무 데도 보내지 않는 줄이라도 3번은
   * 물을 받는다(만수면 유량 계산이 알아서 0 을 준다).
   */
  for (const [hydrantId, line] of Object.entries(slots)) {
    if (brokenHydrantIds.has(hydrantId)) continue;     // 고장난 소화전에서는 안 나온다
    const refill = refillingUnitOf(line);
    if (refill) out.push({ fromId: hydrantId, toId: refill, fromType: 'hydrant', toType: 'pump' });
  }

  return out;
}
