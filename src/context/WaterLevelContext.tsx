import {
  createContext, useContext, useState, useEffect,
  useRef, useMemo, useCallback, type ReactNode,
} from 'react';
import type { SprayState }    from '../types';
import { useTokens }         from './TokenContext';
import { useWaterConnections } from './WaterConnectionContext';
import { useTraining }       from './TrainingContext';
import { useFireCommand }    from './FireCommandContext';
import { useHydrantCirculation } from './HydrantCirculationContext';
import { useHydrantState }    from './HydrantStateContext';
import { expandCirculationFlow, consumingUnitOf } from '../utils/circulationFlow';
import { useSettings }       from '../store/settingsStore';
import { saveWaterLevelSession, loadWaterLevelSession } from '../utils/runtimeSession';

// ─────────────────────────────────────────────
// 용량·유량 상수 (추후 설정창에서 조정 가능하도록 분리)
// ─────────────────────────────────────────────

export const WATER_CAPACITIES: Record<string, number> = {
  pump:       2800,
  water_tank: 6000,
};

const HYDRANT_FLOW_PER_MIN            = 1000;  // 소화전 → 차량
const VEHICLE_FLOW_PER_MIN            = 1500;  // 차량 → 차량 (송수)
const SUPPRESSION_FLOW_PER_MIN        = 300;   // 펌프 → 진압대 1팀당 (일반)
const SUPPRESSION_INITIAL_FLOW_PER_MIN = 100;  // 펌프 → 진압대 1팀당 (초진 구역)
const MONITOR_FLOW_PER_MIN            = 1800;  // 방수포 (펌프/물탱크 자체, 또는 고가차/굴절차 급수)

const AERIAL_TYPES   = new Set(['aerial', 'ladder']);
const WATER_SOURCES  = new Set(['pump', 'water_tank']);

// ─────────────────────────────────────────────
// 순 유량 계산 (수요 역산 모델)
//
// 처리 순서:
//   1. 펌프 → 진압대: 연결된 진압대 수 × 300 소모 (고장 시 skip)
//   2. 차량 → 차량: 수신 측 미충족 수요만큼 공급 (최대 1500, 고장 시 skip)
//   3. 소화전 → 차량: 수신 측 잔여 수요만큼 공급 (최대 1000, 고장 소화전 skip)
//
// **순환보수는 여기 들어오기 전에 펴진다.** 순환칸에서 나가는 선은 출발점이 차
// 한 대가 아니라 무리라 이 함수가 그대로는 셈하지 못한다. 호출부가
// `expandCirculationFlow` 로 가상 연결 둘(소화전→3번 · 1번→목적지)을 만들어
// 넘긴다 — utils/circulationFlow.ts
// ─────────────────────────────────────────────

function sprayMultiplier(state: SprayState | null | undefined): number {
  if (state === '100%') return 1;
  if (state === '30%')  return 0.3;
  return 0;
}

function initialFloorIdsFromStates(fireStates: Record<string, import('../types').FireStatus | null>): Set<string> {
  const ids = new Set<string>();
  for (const [floorId, status] of Object.entries(fireStates)) {
    if (status === 'initial') ids.add(floorId);
  }
  return ids;
}

function computeNetFlowRates(
  tokens:          { id: string; unitType: string; statusTag?: { label: string } | null; sprayState?: SprayState | null; sprayTarget?: { floorId?: string } | null; aerialSprayTarget?: { floorId: string; x: number; y: number } | null }[],
  connections:     { fromId: string; toId: string; fromType: string; toType: string }[],
  brokenSenderIds: Set<string>,
  levels:          Record<string, number>,
  capacities:      Record<string, number>,
  initialFloorIds: Set<string> = new Set(),
  brokenHydrantIds: ReadonlySet<string> = new Set(),
): Record<string, number> {
  const net: Record<string, number> = {};
  for (const t of tokens) {
    if (t.unitType === 'pump' || t.unitType === 'water_tank') net[t.id] = 0;
  }

  // 0. 고가차/굴절차 방수 — 연결된 펌프/물탱크에서 1800/min 소모, 복수 공급 시 균등 분담
  const aerialsWithSpray = tokens.filter(
    t => AERIAL_TYPES.has(t.unitType) && t.aerialSprayTarget != null
  );
  for (const aerial of aerialsWithSpray) {
    const supplyConns = connections.filter(
      c => c.toId === aerial.id && c.fromId in net && !brokenSenderIds.has(c.fromId)
    );
    if (supplyConns.length === 0) continue;
    const perPump = MONITOR_FLOW_PER_MIN / supplyConns.length;
    for (const conn of supplyConns) {
      net[conn.fromId] -= perPump;
    }
  }

  // 0a. 펌프/물탱크차 방수포 자체 소모 — 자신의 aerialSprayTarget 설정 시 1800/min (고장 시 skip)
  for (const t of tokens) {
    if (!(t.id in net)) continue;
    if (brokenSenderIds.has(t.id)) continue;
    if (!WATER_SOURCES.has(t.unitType)) continue;
    if (t.aerialSprayTarget == null) continue;
    net[t.id] -= MONITOR_FLOW_PER_MIN;
  }

  // 1. 펌프/물탱크 → 진압대·구조대 소모 (고장 차량 skip, sprayState 비율 적용)
  // 초진 구역 방수 시 SUPPRESSION_INITIAL_FLOW_PER_MIN(100) 적용
  for (const t of tokens) {
    if (!WATER_SOURCES.has(t.unitType) || !(t.id in net)) continue;
    if (brokenSenderIds.has(t.id)) continue;
    const suppConns = connections.filter(
      c => c.fromId === t.id && (c.toType === 'suppression' || c.toType === 'rescue')
    );
    for (const conn of suppConns) {
      const suppToken = tokens.find(tk => tk.id === conn.toId);
      const mult = sprayMultiplier(suppToken?.sprayState);
      if (mult > 0) {
        const floorId   = suppToken?.sprayTarget?.floorId;
        const isInitial = !!floorId && initialFloorIds.has(floorId);
        net[t.id] -= mult * (isInitial ? SUPPRESSION_INITIAL_FLOW_PER_MIN : SUPPRESSION_FLOW_PER_MIN);
      }
    }
  }

  // 2. 차량 → 차량 (고장 차량은 송신 차단)
  //    수신 차량이 100% 미만이면 최대 유량(1500)으로 채움
  //    수신 차량이 만수이면 소모량만큼만 공급 (demand-pull)
  for (const conn of connections) {
    if (!(conn.fromId in net) || !(conn.toId in net)) continue;
    if (conn.fromType === 'hydrant') continue;
    if (brokenSenderIds.has(conn.fromId)) continue;

    const toCap   = capacities[conn.toId] ?? 0;
    const toLevel = levels[conn.toId] ?? toCap;
    const give = toLevel < toCap
      ? VEHICLE_FLOW_PER_MIN                                      // 미만 → 최대 유량으로 채움
      : Math.min(VEHICLE_FLOW_PER_MIN, Math.max(0, -net[conn.toId])); // 만수 → 소모량만 유지

    net[conn.fromId] -= give;
    net[conn.toId]   += give;
  }

  // 2a. 펌프/물탱크 → 연결송수구 → 옥내소화전 → 진압대/구조대
  //     연결송수구 자체는 수량 소모 없음; 진압대 방수량을 활성 펌프 수로 균등 분담
  {
    const activeSiamesePumpIds = [
      ...new Set(
        connections
          .filter(c => c.toType === 'siamese_pipe' && c.fromId in net && !brokenSenderIds.has(c.fromId))
          .map(c => c.fromId),
      ),
    ];

    if (activeSiamesePumpIds.length > 0) {
      let totalFlow = 0;
      for (const conn of connections) {
        if (conn.fromType !== 'indoor_hydrant') continue;
        if (conn.toType !== 'suppression' && conn.toType !== 'rescue') continue;
        const suppToken = tokens.find(tk => tk.id === conn.toId);
        const mult = sprayMultiplier(suppToken?.sprayState);
        if (mult > 0) {
          const floorId   = suppToken?.sprayTarget?.floorId;
          const isInitial = !!floorId && initialFloorIds.has(floorId);
          totalFlow += mult * (isInitial ? SUPPRESSION_INITIAL_FLOW_PER_MIN : SUPPRESSION_FLOW_PER_MIN);
        }
      }
      if (totalFlow > 0) {
        const perPump = totalFlow / activeSiamesePumpIds.length;
        for (const pumpId of activeSiamesePumpIds) {
          net[pumpId] -= perPump;
        }
      }
    }
  }

  // 3. 소화전 → 차량
  //    소화전 1개당 최대 1000/min, 복수 차량 연결 시 균등 분담
  //    수신 차량이 만수이면 소모량만큼만 공급 (demand-pull)
  //    **고장난 소화전에서는 물이 나오지 않는다.** 예전 주석은 「고장 시 연결을 먼저
  //    제거하므로 별도 체크 불필요」였는데, 실제로 지우는 코드가 없어 고장난 소화전이
  //    계속 1000ℓ/min 을 흘렸다(2026-09-09 확인).
  const hydrantGroups = new Map<string, typeof connections>();
  for (const conn of connections) {
    if (conn.fromType !== 'hydrant' || !(conn.toId in net)) continue;
    if (brokenHydrantIds.has(conn.fromId)) continue;
    if (!hydrantGroups.has(conn.fromId)) hydrantGroups.set(conn.fromId, []);
    hydrantGroups.get(conn.fromId)!.push(conn);
  }
  for (const conns of hydrantGroups.values()) {
    const perVehicle = HYDRANT_FLOW_PER_MIN / conns.length;
    for (const conn of conns) {
      const toCap   = capacities[conn.toId] ?? 0;
      const toLevel = levels[conn.toId] ?? toCap;
      const give = toLevel < toCap
        ? perVehicle
        : Math.min(perVehicle, Math.max(0, -net[conn.toId]));
      net[conn.toId] += give;
    }
  }

  return net;
}

// ─────────────────────────────────────────────
// Context 타입
// ─────────────────────────────────────────────

interface WaterLevelValue {
  levels:          Record<string, number>;   // tokenId → 현재 잔량(L)
  flowRates:       Record<string, number>;   // tokenId → 순유량(L/min), 음수=소모
  getCapacity:     (tokenId: string) => number;
  emptyVehicleIds: Set<string>;             // 수량 0%인 차량 ID
}

const WaterLevelContext = createContext<WaterLevelValue | null>(null);

/** WaterLevelProvider 범위 밖에서는 null 반환 (안전한 선택적 사용) */
export function useWaterLevel(): WaterLevelValue | null {
  return useContext(WaterLevelContext);
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function WaterLevelProvider({ children }: { children: ReactNode }) {
  const { tokens, addLog, setSprayState, setAerialSprayTarget } = useTokens();
  const { connections } = useWaterConnections();
  const { status, elapsed }     = useTraining();
  const { realtimeCalcEnabled, hydrantSetup } = useSettings();
  const { getFireStates } = useFireCommand();
  /*
   * 순환보수 — 칸에서 나가는 선 하나를 가상 연결 둘로 펴서 계산한다
   * (utils/circulationFlow.ts). 소화전 고장은 여기서 본다: 예전에는
   * 「고장 시 연결을 먼저 제거하므로 별도 체크 불필요」라고 적혀 있었으나
   * 실제로는 지우지 않아 **고장난 소화전이 계속 물을 주고 있었다.**
   */
  const { slots: circulationSlots, rotate } = useHydrantCirculation();
  const { brokenHydrants }                  = useHydrantState();

  // tokenId → 최대 용량 맵
  const capacityMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tokens) {
      if (t.unitType in WATER_CAPACITIES) m[t.id] = WATER_CAPACITIES[t.unitType];
    }
    return m;
  }, [tokens]);

  // 초기 잔량: 세션 복원 우선, 없으면 최대 용량으로 시작
  const [levels, setLevels] = useState<Record<string, number>>(() => {
    const saved = loadWaterLevelSession();
    const m: Record<string, number> = {};
    for (const t of tokens) {
      if (t.unitType in WATER_CAPACITIES) {
        m[t.id] = saved?.levels[t.id] ?? WATER_CAPACITIES[t.unitType];
      }
    }
    return m;
  });

  // 새 펌프/물탱크 토큰이 추가되면 최대 용량으로 초기화
  const prevCapKeys = useRef<string>('');
  useEffect(() => {
    const keys = Object.keys(capacityMap).sort().join(',');
    if (keys === prevCapKeys.current) return;
    prevCapKeys.current = keys;
    setLevels(cur => {
      const next = { ...cur };
      for (const [id, cap] of Object.entries(capacityMap)) {
        if (!(id in next)) next[id] = cap;
      }
      // 삭제된 토큰 정리
      for (const id of Object.keys(next)) {
        if (!(id in capacityMap)) delete next[id];
      }
      return next;
    });
  }, [capacityMap]);

  // 고장 송신자 ID Set (statusTag === '펌프고장')
  const brokenSenderIds = useMemo(
    () => new Set(tokens.filter(t => t.statusTag?.label === '펌프고장').map(t => t.id)),
    [tokens],
  );

  // 0% 소진 차량 ID Set
  const emptyVehicleIds = useMemo(
    () => new Set(
      Object.entries(levels)
        .filter(([id, lvl]) => lvl === 0 && (capacityMap[id] ?? 0) > 0)
        .map(([id]) => id),
    ),
    [levels, capacityMap],
  );

  // 수량 계산에 사용할 통합 송신 차단 Set (펌프고장 + 수량 소진)
  const effectiveBrokenIds = useMemo(
    () => new Set([...brokenSenderIds, ...emptyVehicleIds]),
    [brokenSenderIds, emptyVehicleIds],
  );

  // ref로 최신값 유지 (closure stale 방지)
  const tokensRef            = useRef(tokens);
  const connectionsRef       = useRef(connections);
  const capacityRef          = useRef(capacityMap);
  const effectiveBrokenIdRef = useRef(effectiveBrokenIds);
  const levelsRef            = useRef(levels);
  const addLogRef            = useRef(addLog);
  const circulationRef       = useRef(circulationSlots);
  const brokenHydrantRef     = useRef(brokenHydrants);
  const rotateRef            = useRef(rotate);
  const hydrantSetupRef      = useRef(hydrantSetup);
  useEffect(() => { circulationRef.current   = circulationSlots; }, [circulationSlots]);
  useEffect(() => { brokenHydrantRef.current = brokenHydrants;   }, [brokenHydrants]);
  useEffect(() => { rotateRef.current        = rotate;           }, [rotate]);
  useEffect(() => { hydrantSetupRef.current  = hydrantSetup;     }, [hydrantSetup]);
  useEffect(() => { tokensRef.current            = tokens;            }, [tokens]);
  useEffect(() => { connectionsRef.current       = connections;       }, [connections]);
  useEffect(() => { capacityRef.current          = capacityMap;       }, [capacityMap]);
  useEffect(() => { effectiveBrokenIdRef.current = effectiveBrokenIds; }, [effectiveBrokenIds]);
  useEffect(() => { levelsRef.current            = levels;            }, [levels]);
  useEffect(() => { addLogRef.current            = addLog;            }, [addLog]);

  // 잔량 변경 시 세션 저장 (페이지 전환 후 복원용)
  useEffect(() => {
    saveWaterLevelSession({ levels });
  }, [levels]);

  // 펌프 고장·소진 시 연결된 진압대/고가차·굴절차 방수 자동 중단
  const setSprayStateRef        = useRef(setSprayState);
  const setAerialSprayTargetRef = useRef(setAerialSprayTarget);
  const prevBrokenKeyRef        = useRef('');
  useEffect(() => { setSprayStateRef.current        = setSprayState;        }, [setSprayState]);
  useEffect(() => { setAerialSprayTargetRef.current = setAerialSprayTarget; }, [setAerialSprayTarget]);

  useEffect(() => {
    const key = [...effectiveBrokenIds].sort().join(',');
    if (key === prevBrokenKeyRef.current) return;
    const prevIds = new Set(prevBrokenKeyRef.current ? prevBrokenKeyRef.current.split(',') : []);
    prevBrokenKeyRef.current = key;

    const newlyBroken = [...effectiveBrokenIds].filter(id => !prevIds.has(id));
    if (newlyBroken.length === 0) return;

    // 진압대·구조대: 수원 고장·소진 시 방수 즉시 중단
    for (const brokenId of newlyBroken) {
      for (const conn of connectionsRef.current) {
        if (conn.fromId !== brokenId) continue;
        if (conn.toType !== 'suppression' && conn.toType !== 'rescue') continue;
        const toToken = tokensRef.current.find(t => t.id === conn.toId);
        if (toToken?.sprayState != null) setSprayStateRef.current(conn.toId, null);
      }
    }

    // 펌프/물탱크차: 자체 고장·소진 시 방수포 즉시 중단
    for (const brokenId of newlyBroken) {
      const token = tokensRef.current.find(t => t.id === brokenId);
      if (token && WATER_SOURCES.has(token.unitType) && token.aerialSprayTarget != null) {
        setAerialSprayTargetRef.current(brokenId, null);
      }
    }

    // 고가차/굴절차: 방수 중이고 활성 수원이 하나도 없으면 방수 중단
    const affectedAerialIds = new Set<string>();
    for (const brokenId of newlyBroken) {
      for (const conn of connectionsRef.current) {
        if (conn.fromId !== brokenId || !AERIAL_TYPES.has(conn.toType)) continue;
        const toToken = tokensRef.current.find(t => t.id === conn.toId);
        if (toToken?.aerialSprayTarget != null) affectedAerialIds.add(conn.toId);
      }
    }
    for (const aerialId of affectedAerialIds) {
      const hasActiveSource = connectionsRef.current.some(
        c => c.toId === aerialId && WATER_SOURCES.has(c.fromType) && !effectiveBrokenIds.has(c.fromId),
      );
      if (!hasActiveSource) setAerialSprayTargetRef.current(aerialId, null);
    }
  }, [effectiveBrokenIds]);

  // 수량 50% / 0% 경고 로그 (훈련 중, 임계값 최초 통과 시 1회)
  const warnedHalfRef    = useRef<Set<string>>(new Set());
  const warnedEmptyRef   = useRef<Set<string>>(new Set());
  const prevLevelsLogRef = useRef<Record<string, number>>({});

  useEffect(() => {
    // 실시간 계산을 끄면 잔량이 변하지 않으므로 경고도 울릴 일이 없다.
    // 그래도 명시로 막는다 — 잔량은 용량 동기화(위 이펙트)로도 움직인다.
    if (status !== 'running' || !realtimeCalcEnabled) return;
    const prev = prevLevelsLogRef.current;

    for (const [id, level] of Object.entries(levels)) {
      const cap = capacityRef.current[id] ?? 0;
      if (cap === 0) continue;
      const pct     = level / cap;
      const prevPct = (prev[id] ?? cap) / cap;
      const tk      = tokensRef.current.find(t => t.id === id);

      // 50% 하향 통과 — 1회 경고
      if (prevPct >= 0.5 && pct < 0.5 && !warnedHalfRef.current.has(id)) {
        warnedHalfRef.current.add(id);
        addLogRef.current({
          logType:    'water-relay',
          tokenId:    id,
          tokenName:  tk?.label ?? id,
          tokenColor: tk?.color,
          fromZoneId: id,
          toZoneId:   id,
          note: `${tk?.label ?? id} 수량 50% 경고`,
        });
      }
      if (pct >= 0.5) warnedHalfRef.current.delete(id);

      // 0% 도달 — 1회 소진 알림
      if (level === 0 && !warnedEmptyRef.current.has(id)) {
        warnedEmptyRef.current.add(id);
        addLogRef.current({
          logType:    'water-relay',
          tokenId:    id,
          tokenName:  tk?.label ?? id,
          tokenColor: tk?.color,
          fromZoneId: id,
          toZoneId:   id,
          note: `${tk?.label ?? id} 수량 소진`,
        });
      }
      if (level > 0) warnedEmptyRef.current.delete(id);
    }

    prevLevelsLogRef.current = { ...levels };
  }, [levels, status, realtimeCalcEnabled]);

  // 훈련 진행 중 매 초 잔량 갱신 — 설정에서 실시간 계산을 끄면 쉰다
  useEffect(() => {
    if (status !== 'running' || !realtimeCalcEnabled) return;
    const rates = computeNetFlowRates(
      tokensRef.current,
      expandCirculationFlow(connectionsRef.current, circulationRef.current, brokenHydrantRef.current),
      effectiveBrokenIdRef.current,
      levelsRef.current,
      capacityRef.current,
      initialFloorIdsFromStates(getFireStates()),
      brokenHydrantRef.current,
    );
    const nextLevels = { ...levelsRef.current };
    for (const [id, ratePerMin] of Object.entries(rates)) {
      const cap   = capacityRef.current[id] ?? 0;
      const delta = ratePerMin / 60;   // 1초 기준 변화량
      nextLevels[id] = Math.max(0, Math.min(cap, (nextLevels[id] ?? cap) + delta));
    }
    // 다음 틱이 이 값을 이어받게 한다 — ref 갱신은 렌더 뒤에나 오므로 여기서 먼저 민다
    levelsRef.current = nextLevels;
    setLevels(nextLevels);

    /*
     * 순환보수 교대 — **1번이 비면 줄 끝으로 보낸다.**
     *
     * 2번이 앞으로 나와 소비를 잇고, 3번이 그 뒤에 붙고, 방금 빈 차가 소화전으로
     * 간다. 목록 회전이 곧 순환이다(docs/WATER_SUPPLY_MISSION_PLAN.md §3.3).
     *
     * 뒤에 물이 남은 차가 하나도 없으면 돌리지 않는다 — 돌려 봐야 빈 차가 빈 차와
     * 자리를 바꿀 뿐이고, 매 초 돌면 로그만 쌓인다.
     */
    for (const [hydrantId, line] of Object.entries(circulationRef.current)) {
      const head = consumingUnitOf(line);
      if (!head || line.length < 2) continue;
      if ((nextLevels[head] ?? 0) > 0) continue;
      const anyWaterBehind = line.slice(1).some(id => (nextLevels[id] ?? 0) > 0);
      if (!anyWaterBehind) continue;
      const name = hydrantSetupRef.current.find(h => h.id === hydrantId)?.name;
      rotateRef.current(
        hydrantId,
        name ? `${name} 소화전` : hydrantId,
        // 이름은 여기서 찾아 넘긴다 — 순환 Context 는 TokenProvider 밖이라 못 찾는다
        id => tokensRef.current.find(t => t.id === id)?.label ?? id,
      );
    }
  // elapsed가 1씩 증가할 때마다 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  // 현재 순유량 (표시용 — 렌더링 기준)
  const flowRates = useMemo(
    () => computeNetFlowRates(
      tokens,
      expandCirculationFlow(connections, circulationSlots, brokenHydrants),
      effectiveBrokenIds, levels, capacityMap, initialFloorIdsFromStates(getFireStates()),
      brokenHydrants,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tokens, connections, circulationSlots, brokenHydrants, effectiveBrokenIds, levels, capacityMap],
  );

  const getCapacity = useCallback(
    (id: string) => capacityMap[id] ?? 0,
    [capacityMap],
  );

  return (
    <WaterLevelContext.Provider value={{ levels, flowRates, getCapacity, emptyVehicleIds }}>
      {children}
    </WaterLevelContext.Provider>
  );
}
