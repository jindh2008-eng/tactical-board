import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type { DoorState, FireStatus } from '../types';
import type { ExtraFireFloor } from '../types/settings';
import { saveBuildingSession, loadBuildingSession } from '../utils/runtimeSession';

// ─────────────────────────────────────────────
// 연기 강도 (표시용 3단계)
// ─────────────────────────────────────────────

export type SmokeLevel = 'none' | 'weak' | 'full';

// ─────────────────────────────────────────────
// Context 값 타입
// ─────────────────────────────────────────────

interface BuildingStateValue {
  doorStates:         Record<string, DoorState>;
  fireStates:         Record<string, FireStatus | null>;
  firePercentages:    Record<string, number>;    // peak/seventy/half 구간의 연속 % (0~100)
  stairSmokeFloor:    number | null;  // 연기 유입 최저 층번호 (null = 클린)
  smokeConcentration: number;          // 0~100 농도 (현재는 0 / 50 / 100 세 값만 사용)
  setDoorState:       (floorId: string, state: DoorState) => void;
  setFireStatus:      (floorId: string, status: FireStatus | null) => void;
  setFirePercentage:  (floorId: string, pct: number) => void;
}

const BuildingStateContext = createContext<BuildingStateValue | null>(null);

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

interface Props {
  children:            ReactNode;
  allFloorIds:         string[];
  fireFloor:           number;            // 화점층 (문 초기화 기준)
  initialFireStatus:   FireStatus | null; // 훈련 시작 시 자동 설정할 화재상태
  extraFireFloors?:    ExtraFireFloor[];  // 추가 화재 층 (항상 문 Open)
  aboveGroundFloors:   number;
  onFireChange?:       (floorId: string, status: FireStatus | null) => void;
  onDoorChange?:       (floorId: string, state: DoorState) => void;
  onSmokeChange?:      (level: SmokeLevel) => void;
}

const FIRE_SMOKE_STATUSES = new Set<FireStatus>(['extension-peak', 'peak', 'seventy', 'half']);

/** floorId → 연속 층 번호 (지하 음수, 지상 양수). RF는 null. */
function floorIdToNum(fid: string): number | null {
  if (fid === 'RF') return null;
  if (fid.startsWith('B')) {
    const n = parseInt(fid.slice(1), 10);
    return isNaN(n) ? null : -n;
  }
  const n = parseInt(fid, 10);
  return isNaN(n) ? null : n;
}

/** floor number → floorId */
function floorNumToId(n: number): string {
  return n < 0 ? `B${-n}` : `${n}F`;
}

function buildInitDoorStates(allFloorIds: string[], fireFloor: number, extraFireFloors: ExtraFireFloor[]): Record<string, DoorState> {
  const extraNums = new Set(extraFireFloors.map(e => e.floor));
  const m: Record<string, DoorState> = {};
  for (const id of allFloorIds) {
    if (id === 'RF') {
      m[id] = 'closed';
    } else {
      const num = floorIdToNum(id);
      m[id] = (num !== null && (num <= fireFloor || extraNums.has(num))) ? 'open' : 'closed';
    }
  }
  return m;
}

function buildInitFireStates(fireFloor: number, initialFireStatus: FireStatus | null, extraFireFloors: ExtraFireFloor[]): Record<string, FireStatus | null> {
  const states: Record<string, FireStatus | null> = {};
  if (initialFireStatus) states[floorNumToId(fireFloor)] = initialFireStatus;
  for (const { floor, status } of extraFireFloors) {
    states[floorNumToId(floor)] = status;
  }
  return states;
}

function buildInitFirePercentages(fireFloor: number, initialFireStatus: FireStatus | null, extraFireFloors: ExtraFireFloor[]): Record<string, number> {
  const pct: Record<string, number> = {};
  function applyPct(floorId: string, status: FireStatus | null) {
    if (status === 'peak')         pct[floorId] = 100;
    else if (status === 'seventy') pct[floorId] = 70;
    else if (status === 'half')    pct[floorId] = 50;
  }
  applyPct(floorNumToId(fireFloor), initialFireStatus);
  for (const { floor, status } of extraFireFloors) {
    applyPct(floorNumToId(floor), status);
  }
  return pct;
}

function resolveInitSmokeLevelStr(smokeFloor: number | null, concentration: number): SmokeLevel {
  if (smokeFloor === null) return 'none';
  if (concentration >= 67) return 'full';
  if (concentration > 0)   return 'weak';
  return 'none';
}

/** 현재 열려있는 활성 화점 계단문이 하나라도 있는지 확인 (excludeFloor 제외) */
function hasActiveOpenSource(
  fireStates: Record<string, FireStatus | null>,
  doorStates: Record<string, DoorState>,
  excludeFloor?: string,
): boolean {
  return Object.entries(fireStates).some(([fid, fStatus]) => {
    if (fid === excludeFloor) return false;
    if (!fStatus || !FIRE_SMOKE_STATUSES.has(fStatus)) return false;
    return (doorStates[fid] ?? 'open') === 'open';
  });
}

/**
 * 주어진 문·화재 상태에서 초기 연기값을 계산.
 * 초기화 시 문·화재상태를 교차 검사해 연기 여부를 결정한다.
 */
function computeSmokeFromStates(
  fireStates: Record<string, FireStatus | null>,
  doorStates: Record<string, DoorState>,
): { smokeFloor: number | null; concentration: number } {
  const rfOpen = (doorStates['RF'] ?? 'closed') === 'open';
  let lowestSrc: number | null = null;

  for (const [fid, fStatus] of Object.entries(fireStates)) {
    if (!fStatus || !FIRE_SMOKE_STATUSES.has(fStatus)) continue;
    if ((doorStates[fid] ?? 'open') !== 'open') continue;
    const srcNum = floorIdToNum(fid);
    if (srcNum === null) continue;
    if (lowestSrc === null || srcNum < lowestSrc) lowestSrc = srcNum;
  }

  if (lowestSrc === null) return { smokeFloor: null, concentration: 0 };
  return { smokeFloor: lowestSrc, concentration: rfOpen ? 50 : 100 };
}

export function BuildingStateProvider({
  children,
  allFloorIds,
  fireFloor,
  initialFireStatus,
  extraFireFloors = [],
  onFireChange,
  onDoorChange,
  onSmokeChange,
}: Props) {
  // ── 초기 상태: sessionStorage 복원 우선, 없으면 설정값으로 계산 ──
  // (useState lazy initializer는 마운트 1회만 실행 — props 변경에 반응 안 함)
  const [init] = useState(() => {
    const saved = loadBuildingSession();
    if (saved) {
      return {
        doorStates:         saved.doorStates,
        fireStates:         saved.fireStates,
        firePercentages:    saved.firePercentages,
        stairSmokeFloor:    saved.stairSmokeFloor,
        smokeConcentration: saved.smokeConcentration,
        prevSmokeLevel:     resolveInitSmokeLevelStr(saved.stairSmokeFloor, saved.smokeConcentration),
      };
    }
    const doors = buildInitDoorStates(allFloorIds, fireFloor, extraFireFloors);
    const fires = buildInitFireStates(fireFloor, initialFireStatus, extraFireFloors);
    const ptcs  = buildInitFirePercentages(fireFloor, initialFireStatus, extraFireFloors);
    const { smokeFloor, concentration } = computeSmokeFromStates(fires, doors);
    return {
      doorStates:         doors,
      fireStates:         fires,
      firePercentages:    ptcs,
      stairSmokeFloor:    smokeFloor,
      smokeConcentration: concentration,
      prevSmokeLevel:     resolveInitSmokeLevelStr(smokeFloor, concentration),
    };
  });

  const [doorStates,         setDoorStates]         = useState(() => init.doorStates);
  const [fireStates,         setFireStates]         = useState(() => init.fireStates);
  const [firePercentages,    setFirePercentages]    = useState(() => init.firePercentages);
  const [stairSmokeFloor,    setStairSmokeFloor]    = useState(() => init.stairSmokeFloor);
  const [smokeConcentration, setSmokeConcentration] = useState(() => init.smokeConcentration);

  const fireStatesRef      = useRef<Record<string, FireStatus | null>>(init.fireStates);
  const doorStatesRef      = useRef<Record<string, DoorState>>(init.doorStates);
  const stairSmokeFloorRef = useRef<number | null>(init.stairSmokeFloor);
  const prevSmokeLevelRef  = useRef<SmokeLevel>(init.prevSmokeLevel);

  useEffect(() => { fireStatesRef.current = fireStates; },           [fireStates]);
  useEffect(() => { doorStatesRef.current = doorStates; },           [doorStates]);
  useEffect(() => { stairSmokeFloorRef.current = stairSmokeFloor; }, [stairSmokeFloor]);

  // 상태 변경 시 sessionStorage 저장
  useEffect(() => {
    saveBuildingSession({ doorStates, fireStates, firePercentages, stairSmokeFloor, smokeConcentration });
  }, [doorStates, fireStates, firePercentages, stairSmokeFloor, smokeConcentration]);

  // 연기 레벨 변화 감지 → onSmokeChange 호출
  const globalSmokeLevel: SmokeLevel =
    stairSmokeFloor === null ? 'none' :
    smokeConcentration >= 67 ? 'full' :
    smokeConcentration > 0   ? 'weak' : 'none';

  useEffect(() => {
    if (globalSmokeLevel === prevSmokeLevelRef.current) return;
    onSmokeChange?.(globalSmokeLevel);
    prevSmokeLevelRef.current = globalSmokeLevel;
  }, [globalSmokeLevel, onSmokeChange]);

  const setDoorState = useCallback((floorId: string, state: DoorState) => {
    if (doorStatesRef.current[floorId] === state) return;
    setDoorStates(prev => prev[floorId] === state ? prev : { ...prev, [floorId]: state });
    onDoorChange?.(floorId, state);

    const fire   = fireStatesRef.current;
    const doors  = doorStatesRef.current;
    const rfOpen = (doors['RF'] ?? 'closed') === 'open';

    // ── 화점층 계단 방화문 열림 ──────────────────────────────────────────
    if (state === 'open' && floorId !== 'RF') {
      const fireStatus = fire[floorId];
      if (fireStatus && FIRE_SMOKE_STATUSES.has(fireStatus)) {
        const srcNum = floorIdToNum(floorId);
        if (srcNum !== null) {
          setStairSmokeFloor(prev => prev === null ? srcNum : Math.min(prev, srcNum));
          // RF 열림 → 배연+유입 동시(weak=50), RF 닫힘 → 누적(full=100)
          setSmokeConcentration(rfOpen ? 50 : 100);
        }
      }
    }

    // ── 화점층 계단 방화문 닫힘 ──────────────────────────────────────────
    if (state === 'closed' && floorId !== 'RF') {
      if (rfOpen && stairSmokeFloorRef.current !== null) {
        // RF 열린 상태에서 마지막 유입 경로까지 닫힘 → 배연 완료
        if (!hasActiveOpenSource(fire, doors, floorId)) {
          setStairSmokeFloor(null);
          setSmokeConcentration(0);
        }
      }
      // RF 닫힘: 연기 잔류 (농도 유지)
    }

    // ── RF(옥상) 방화문 열림 ─────────────────────────────────────────────
    if (floorId === 'RF' && state === 'open') {
      if (stairSmokeFloorRef.current !== null) {
        if (hasActiveOpenSource(fire, doors)) {
          // 유입 경로 아직 열림 → 배연 중이지만 연기 있음 (weak)
          setSmokeConcentration(50);
        } else {
          // 유입 경로 모두 닫힘 → 배연 완료
          setStairSmokeFloor(null);
          setSmokeConcentration(0);
        }
      }
    }

    // ── RF(옥상) 방화문 닫힘 ─────────────────────────────────────────────
    if (floorId === 'RF' && state === 'closed') {
      if (stairSmokeFloorRef.current !== null) {
        // 배연 중단 → 연기 누적 (full)
        setSmokeConcentration(100);
      }
    }
  }, []);

  const setFirePercentage = useCallback((floorId: string, pct: number) => {
    setFirePercentages(prev => ({ ...prev, [floorId]: pct }));
  }, []);

  const setFireStatus = useCallback((floorId: string, status: FireStatus | null) => {
    if (fireStatesRef.current[floorId] === status) return;
    setFireStates(prev => ({ ...prev, [floorId]: status }));
    onFireChange?.(floorId, status);
    // 상태 전환 시 % 초기화 (소화 효과 인터벌 동기화용)
    if (status === 'peak')         setFirePercentages(prev => ({ ...prev, [floorId]: 100 }));
    else if (status === 'seventy') setFirePercentages(prev => ({ ...prev, [floorId]: 70 }));
    else if (status === 'half')    setFirePercentages(prev => ({ ...prev, [floorId]: 50 }));
    else setFirePercentages(prev => { const n = { ...prev }; delete n[floorId]; return n; });

    // 해당 층 문이 이미 열린 상태에서 활성 화재상태로 변경 → 연기 발생
    if (status && FIRE_SMOKE_STATUSES.has(status)) {
      if ((doorStatesRef.current[floorId] ?? 'open') === 'open') {
        const rfOpen = (doorStatesRef.current['RF'] ?? 'closed') === 'open';
        const srcNum = floorIdToNum(floorId);
        if (srcNum !== null) {
          setStairSmokeFloor(prev => prev === null ? srcNum : Math.min(prev, srcNum));
          setSmokeConcentration(rfOpen ? 50 : 100);
        }
      }
    }
    // 비활성 화재상태(초진·완진·해제)로의 변경은 연기를 건드리지 않음
    // (연기는 RF 개방으로만 해제 — 실제 물리 현상과 동일)
  }, [onFireChange]);

  return (
    <BuildingStateContext.Provider
      value={{ doorStates, fireStates, firePercentages, stairSmokeFloor, smokeConcentration, setDoorState, setFireStatus, setFirePercentage }}
    >
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
// smokeConcentration(0~100)을 3단계 SmokeLevel로 매핑.
// 연속형 전환 시: smokeConcentration을 타이머로 점진적으로 변경하면
// 이 함수와 렌더링 레이어는 수정 없이 중간 단계를 자연스럽게 표현 가능.
// ─────────────────────────────────────────────

/**
 * 계단실 연기 레벨 계산
 *
 * - stairSmokeFloor: 연기 유입 최저 층번호 (null = 전체 클린)
 * - smokeConcentration: 0~100 (현재는 0 / 50 / 100만 사용)
 * - 임계값: 0 → none, 1~66 → weak, 67~100 → full
 */
export function computeStairSmokeLevel(params: {
  floorEndNum:        number;
  stairSmokeFloor:    number | null;
  smokeConcentration: number;
}): SmokeLevel {
  const { floorEndNum, stairSmokeFloor, smokeConcentration } = params;
  if (stairSmokeFloor === null || floorEndNum < stairSmokeFloor) return 'none';
  if (smokeConcentration >= 67) return 'full';
  if (smokeConcentration > 0)   return 'weak';
  return 'none';
}
