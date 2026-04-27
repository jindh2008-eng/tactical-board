import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { DoorState, FireStatus } from '../types';

// ─────────────────────────────────────────────
// 연기 강도
// ─────────────────────────────────────────────

export type SmokeLevel = 'none' | 'weak' | 'full';

// ─────────────────────────────────────────────
// Context 값 타입
// ─────────────────────────────────────────────

interface BuildingStateValue {
  doorStates:    Record<string, DoorState>;
  fireStates:    Record<string, FireStatus | null>;
  setDoorState:  (floorId: string, state: DoorState) => void;
  setFireStatus: (floorId: string, status: FireStatus | null) => void;
}

const BuildingStateContext = createContext<BuildingStateValue | null>(null);

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

interface Props {
  children:             ReactNode;
  allFloorIds:          string[];   // 모든 층 ID 목록 (RF 포함)
  stairSmokeStartFloor: number | null;
  aboveGroundFloors:    number;
}

/** 층 번호 → floorId 변환 */
function floorNumToId(n: number): string {
  if (n < 0) return `B${-n}`;
  return `${n}F`;
}

export function BuildingStateProvider({
  children,
  allFloorIds,
  stairSmokeStartFloor,
  aboveGroundFloors,
}: Props) {
  // ── 초기 문 상태: RF = closed, 나머지 = open ──
  const initDoorStates = useCallback((): Record<string, DoorState> => {
    const m: Record<string, DoorState> = {};
    for (const id of allFloorIds) {
      m[id] = id === 'RF' ? 'closed' : 'open';
    }
    return m;
  }, [allFloorIds]);

  const [doorStates, setDoorStates] = useState<Record<string, DoorState>>(initDoorStates);
  const [fireStates, setFireStates] = useState<Record<string, FireStatus | null>>({});

  // allFloorIds가 바뀌면(건물 층수 변경) 문 상태 재초기화
  useEffect(() => {
    setDoorStates(initDoorStates());
  }, [initDoorStates]);

  // stairSmokeStartFloor가 설정되면 해당 화점층 문을 closed로
  useEffect(() => {
    if (stairSmokeStartFloor === null) return;
    // stairSmokeStartFloor는 화점층 번호이므로 floorId로 변환
    // RF의 경우 stairSmokeStartFloor = aboveGroundFloors+1
    const targetId = stairSmokeStartFloor === aboveGroundFloors + 1
      ? 'RF'
      : floorNumToId(stairSmokeStartFloor);
    setDoorStates(prev => {
      if (prev[targetId] === 'closed') return prev;
      return { ...prev, [targetId]: 'closed' };
    });
  }, [stairSmokeStartFloor, aboveGroundFloors]);

  const setDoorState = useCallback((floorId: string, state: DoorState) => {
    setDoorStates(prev => prev[floorId] === state ? prev : { ...prev, [floorId]: state });
  }, []);

  const setFireStatus = useCallback((floorId: string, status: FireStatus | null) => {
    setFireStates(prev => prev[floorId] === status ? prev : { ...prev, [floorId]: status });
  }, []);

  return (
    <BuildingStateContext.Provider value={{ doorStates, fireStates, setDoorState, setFireStatus }}>
      {children}
    </BuildingStateContext.Provider>
  );
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useBuildingState(): BuildingStateValue {
  const ctx = useContext(BuildingStateContext);
  if (!ctx) throw new Error('useBuildingState must be used within BuildingStateProvider');
  return ctx;
}

// ─────────────────────────────────────────────
// 계단실 연기 레벨 계산 유틸
//
// 규칙:
// 1. no-smoke override: RF open + 화점층 stair closed → 연기 없음
// 2. 수동 연기(stairSmokeStartFloor): 해당 층 이상 연기
// 3. 화재 기반 연기: 화재상태(최성기/연소확대/50%) + 해당층 문 open
//    RF open  → weak, RF closed → full
// ─────────────────────────────────────────────

const FIRE_SMOKE_STATUSES = new Set<FireStatus>(['extension-peak', 'peak', 'half']);

/** floorId → 연속 층 번호 (지하 음수, 지상 양수). RF/알 수 없는 ID는 null. */
function floorIdToNum(fid: string): number | null {
  if (fid === 'RF') return null; // 옥상은 화재 없음
  if (fid.startsWith('B')) {
    const n = parseInt(fid.slice(1), 10);
    return isNaN(n) ? null : -n;
  }
  const n = parseInt(fid, 10); // '3F' → 3 (parseInt는 비숫자 문자 앞까지 파싱)
  return isNaN(n) ? null : n;
}

/**
 * 계단실 연기 레벨 계산
 *
 * 연기는 소스층(화재 활성 + 계단문 개방)에서 옥상 방향으로 전파된다.
 * floorEndNum 이하에 소스가 있으면 이 층도 연기.
 */
export function computeStairSmokeLevel(params: {
  floorEndNum:          number;   // 이 행의 실제 최상 층번호 (RF = aboveGroundFloors+1)
  doorStates:           Record<string, DoorState>;
  fireStates:           Record<string, FireStatus | null>;
  stairSmokeStartFloor: number | null;
  fireFloor:            number;
}): SmokeLevel {
  const { floorEndNum, doorStates, fireStates, stairSmokeStartFloor, fireFloor } = params;

  const rfDoor        = doorStates['RF'] ?? 'closed';
  const fireFloorDoor = doorStates[floorNumToId(fireFloor)] ?? 'open';

  // no-smoke override: RF 열림 + 화점층 닫힘
  if (rfDoor === 'open' && fireFloorDoor === 'closed') return 'none';

  // 수동 연기 (stairSmokeStartFloor 이상)
  if (stairSmokeStartFloor !== null && floorEndNum >= stairSmokeStartFloor) return 'full';

  // 화재 기반 연기: 이 층 이하에 소스(화재 활성 + 계단문 개방)가 있으면 연기 전파
  let lowestSrc: number | null = null;
  for (const [fid, fStatus] of Object.entries(fireStates)) {
    if (!fStatus || !FIRE_SMOKE_STATUSES.has(fStatus)) continue;
    if ((doorStates[fid] ?? 'open') !== 'open') continue;
    const srcNum = floorIdToNum(fid);
    if (srcNum === null) continue;
    if (lowestSrc === null || srcNum < lowestSrc) lowestSrc = srcNum;
  }

  if (lowestSrc !== null && floorEndNum >= lowestSrc) {
    return rfDoor === 'open' ? 'weak' : 'full';
  }

  return 'none';
}
