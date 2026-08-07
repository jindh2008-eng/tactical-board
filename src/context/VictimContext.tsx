import { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { VictimToken, CreateVictimInput, VictimCondition } from '../types/victim';
import type { VictimSetupItem } from '../types/settings';
import type { BuildingConfig, Pos } from '../types';
import {
  buildVictim, randomVictim,
  buildVictimDisplayLine, zoneKeyToFullLabel,
} from '../utils/victimUtils';
import { useTokens } from './TokenContext';
import {
  victimSetupToToken,
  computeVictimOffsets,
} from '../utils/victimPlacement';
import { buildValidVictimZoneKeys } from '../data/buildingData';
import {
  saveVictimSession, loadVictimSession,
  saveVictimSearchSession, loadVictimSearchSession,
  type FloorSearchRecord,
} from '../utils/runtimeSession';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type VictimPos = Pos;

export interface VictimUpdate {
  condition?:   VictimCondition;
  subLocation?: string;
  customLabel?: string;
}

interface VictimContextValue {
  victims:             VictimToken[];
  victimPositions:     Record<string, VictimPos>;
  discoveredVictimIds: Set<string>;
  /** 인명검색 활성 세션 (floorId → 레코드) */
  activeSearches:      Record<string, FloorSearchRecord>;
  /** 표시용 현재 점수 (tokenId → 점수) */
  searchScores:        Record<string, number>;
  createVictim:        (input: CreateVictimInput) => void;
  createRandom:        (subLocation: string) => void;
  moveVictim:          (victimId: string, toZoneKey: string | null, pos?: VictimPos) => void;
  updateVictim:        (victimId: string, update: VictimUpdate) => void;
  /** 유닛을 해당 층 인명검색에 추가. 이미 다른 층 검색 중이면 먼저 제거 후 추가. */
  addUnitToSearch:     (tokenId: string, floorId: string, primaryInitial: number, secondaryInitial: number, decrementRate: number, startInSecondary: boolean) => void;
  /** 유닛을 인명검색에서 제거 (점수는 유지). */
  removeUnitFromSearch: (tokenId: string) => void;
  /** 지정 층들을 2차 검색으로 전환 (초진 도달 시 호출). */
  transitionToSecondarySearch: (floorIds: string[]) => void;
  /** 체크리스트 등에서 직접 구조대상자 발견 상태를 변경. */
  setVictimDiscovered: (victimTokenId: string, visible: boolean) => void;
}

const VictimContext = createContext<VictimContextValue | null>(null);

export function useVictims(): VictimContextValue {
  const ctx = useContext(VictimContext);
  if (!ctx) throw new Error('useVictims must be used within VictimProvider');
  return ctx;
}

// ─────────────────────────────────────────────
// 로그용 구조대상자 표시명
// ─────────────────────────────────────────────

function victimDisplayName(v: VictimToken): string {
  if (v.customLabel) return v.customLabel;
  if (v.kind === 'group') return `${v.groupCount ?? '?'}명`;
  const parts = [v.gender, v.ageGroup ?? (v.age != null ? `${v.age}세` : undefined), v.condition].filter(Boolean);
  return parts.length > 0 ? (parts as string[]).join('/') : '구조대상자';
}

// ─────────────────────────────────────────────
// 점수 기반 발견 스케줄 생성
// N명을 initialScore 구간에 균등 배분:
//   i번째 (0-indexed, 랜덤 순서): revealAtScore = round(initialScore*(N-1-i)/N)
//   마지막: revealAtScore = 0
// ─────────────────────────────────────────────

function buildSearchSchedule(
  victimIds:    string[],
  initialScore: number,
): Array<{ victimId: string; revealAtScore: number }> {
  if (victimIds.length === 0) return [];
  const shuffled = [...victimIds].sort(() => Math.random() - 0.5);
  const n = shuffled.length;
  return shuffled.map((victimId, i) => ({
    victimId,
    revealAtScore: Math.round(initialScore * (n - 1 - i) / n),
  }));
}

// RF=Infinity, 3F=3, B1=-1, 비해당=null
function floorIdToNum(floorId: string): number | null {
  if (floorId === 'RF') return Infinity;
  const above = floorId.match(/^(\d+)F$/);
  if (above) return parseInt(above[1]);
  const below = floorId.match(/^B(\d+)$/);
  if (below) return -parseInt(below[1]);
  return null;
}

// 해당 층 미발견 구조대상자 IDs
function undiscoveredVictimIds(
  victims:    VictimToken[],
  floorId:    string,
  discovered: Set<string>,
): string[] {
  return victims
    .filter(v => v.zoneKey && !v.zoneKey.startsWith('face-') && v.zoneKey.split('-')[0] === floorId && !discovered.has(v.id))
    .map(v => v.id);
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function VictimProvider({
  children,
  initialVictimSetup,
  buildingConfig,
  fireFloor,
}: {
  children:            React.ReactNode;
  initialVictimSetup?: VictimSetupItem[];
  buildingConfig?:     BuildingConfig;
  fireFloor?:          number;
}) {
  const { addLog, tokens } = useTokens();

  const validZoneKeysRef = useRef<Set<string>>(
    buildingConfig !== undefined
      ? buildValidVictimZoneKeys(buildingConfig, fireFloor ?? 1)
      : new Set<string>()
  );

  function sanitizeVictim(v: VictimToken): VictimToken {
    if (!buildingConfig) return v;
    if (v.zoneKey === null) return v;
    if (validZoneKeysRef.current.has(v.zoneKey)) return v;
    return { ...v, zoneKey: null };
  }

  const victimsRef = useRef<VictimToken[]>([]);

  // ── 구조대상자 상태 ───────────────────────────────────────────────
  const [victims, setVictims] = useState<VictimToken[]>(() => {
    const session = loadVictimSession();
    if (session && session.victims.length > 0) return session.victims.map(sanitizeVictim);
    return initialVictimSetup && initialVictimSetup.length > 0
      ? initialVictimSetup.map(victimSetupToToken)
      : [];
  });

  const [victimPositions, setVictimPositions] = useState<Record<string, VictimPos>>(() => {
    const session = loadVictimSession();
    if (session && session.victims.length > 0) {
      const invalidIds = new Set(
        session.victims
          .filter(v => v.zoneKey !== null && buildingConfig && !validZoneKeysRef.current.has(v.zoneKey))
          .map(v => v.id)
      );
      if (invalidIds.size === 0) return session.victimPositions;
      const cleaned = { ...session.victimPositions };
      for (const id of invalidIds) delete cleaned[id];
      return cleaned;
    }
    // 초기 세팅 위치는 실제 DOM(구역 폭/높이)을 측정해야 정확히 계산 가능하므로
    // 여기서는 빈 값으로 시작하고, 아래 마운트 후 useLayoutEffect에서 채운다.
    return {};
  });

  useEffect(() => { victimsRef.current = victims; }, [victims]);

  // ── 초기 세팅 구조대상자 위치 배치 (마운트 후, 실제 구역 크기 기준) ──
  // 각 구역의 실제 렌더링 크기(계단실/화재실을 제외한 내부 구역만)를 측정해
  // 우측 하단 모서리부터 겹치지 않게 배치한다. 세션 복원 시에는 이미 위치가
  // 있으므로 대상에서 자동 제외됨.
  useLayoutEffect(() => {
    // 마운트 시점 클로저에 담긴 victims — 초기 세팅 배치 용도로는 이 값으로 충분.
    // (StrictMode의 mount→cleanup→remount 이중 실행에도 안전하도록, 실제 배치는
    // 아래 setTimeout 콜백 안에서 setVictimPositions의 최신 prev 기준으로 판단한다.
    // 그래야 첫 번째(가짜) 마운트의 타이머가 cleanup으로 취소되더라도 재마운트 시
    // 새로 예약되는 타이머가 정상적으로 동작한다.)
    const mountedVictims = victims;

    // TacticalArea의 건물 높이 고정 로직(useLayoutEffect → setState → 재커밋)이
    // 먼저 안정화된 뒤에 측정해야 실제 최종 레이아웃 크기를 얻을 수 있어 살짝 지연한다.
    const timer = setTimeout(() => {
      setVictimPositions(prev => {
        const needsPlacement = mountedVictims.filter(v => v.zoneKey && prev[v.id] === undefined);
        if (needsPlacement.length === 0) return prev;

        const byZone: Record<string, string[]> = {};
        for (const v of needsPlacement) {
          (byZone[v.zoneKey!] ??= []).push(v.id);
        }

        const updates: Record<string, VictimPos> = {};
        for (const [zoneKey, ids] of Object.entries(byZone)) {
          const el   = document.querySelector(`[data-zone-key="${zoneKey}"]`);
          const rect = el?.getBoundingClientRect();
          const zoneW = rect && rect.width  > 0 ? rect.width  : 120;
          const zoneH = rect && rect.height > 0 ? rect.height : 80;
          const offsets = computeVictimOffsets(ids.length, zoneW, zoneH);
          ids.forEach((id, i) => { updates[id] = offsets[i]; });
        }

        return { ...prev, ...updates };
      });
    }, 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 인명검색 상태 ─────────────────────────────────────────────────
  const [discoveredVictimIds, setDiscoveredVictimIds] = useState<Set<string>>(() => {
    const session = loadVictimSearchSession();
    const base = new Set<string>(session?.discoveredVictimIds ?? []);
    // 바로보임 체크된 구조대상자는 세션 유무와 무관하게 항상 발견 상태
    if (initialVictimSetup) {
      for (const item of initialVictimSetup) {
        if (item.immediatelyVisible) base.add(`victim-setup-${item.id}`);
      }
    }
    return base;
  });

  const [activeSearches, setActiveSearches] = useState<Record<string, FloorSearchRecord>>(() => {
    const session = loadVictimSearchSession();
    if (!session) return {};
    // 복원 시 units[] 초기화 — 시작 버튼을 눌러야만 진행되도록
    const restored: Record<string, FloorSearchRecord> = {};
    for (const [fid, rec] of Object.entries(session.activeSearches as Record<string, FloorSearchRecord>)) {
      restored[fid] = { ...rec, units: [] };
    }
    return restored;
  });

  const [searchScores, setSearchScores] = useState<Record<string, number>>({});

  const discoveredVictimIdsRef = useRef<Set<string>>(discoveredVictimIds);
  const activeSearchesRef      = useRef<Record<string, FloorSearchRecord>>(activeSearches);

  useEffect(() => { discoveredVictimIdsRef.current = discoveredVictimIds; }, [discoveredVictimIds]);
  useEffect(() => { activeSearchesRef.current = activeSearches; }, [activeSearches]);

  // ── sessionStorage 저장 ───────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      saveVictimSession({ victims, victimPositions });
    }, 500);
    return () => clearTimeout(timer);
  }, [victims, victimPositions]);

  useEffect(() => {
    saveVictimSearchSession({
      discoveredVictimIds: [...discoveredVictimIds],
      activeSearches,
    });
  }, [discoveredVictimIds, activeSearches]);

  // ── 토큰 이동 감지 → 다른 층으로 이동 시 자동 검색 중단 ──────────
  useEffect(() => {
    setActiveSearches(prev => {
      let changed = false;
      const next: Record<string, FloorSearchRecord> = {};
      for (const [floorId, rec] of Object.entries(prev)) {
        const stillHere = rec.units.filter(u => {
          const token = tokens.find(t => t.id === u.tokenId);
          if (!token?.zoneKey || token.zoneKey.startsWith('face-')) return false;
          return token.zoneKey.split('-')[0] === floorId;
        });
        if (stillHere.length !== rec.units.length) changed = true;
        next[floorId] = { ...rec, units: stillHere };
      }
      return changed ? next : prev;
    });
  }, [tokens]);

  // ── 계단실 피해자: 출동대 배치층 >= 계단실층 → discoveredVictimIds에 영구 등록 ──
  useEffect(() => {
    const stairVictims = victimsRef.current.filter(
      v => v.zoneKey?.endsWith('-stair') && !discoveredVictimIdsRef.current.has(v.id)
    );
    if (stairVictims.length === 0) return;

    const toDiscover: string[] = [];
    for (const victim of stairVictims) {
      const floorId       = victim.zoneKey!.slice(0, -'-stair'.length);
      const victimFloorNum = floorIdToNum(floorId);
      if (victimFloorNum === null) continue;
      const triggered = tokens.some(t => {
        if (!t.zoneKey) return false;
        const unitFloorNum = floorIdToNum(t.zoneKey.split('-')[0]);
        return unitFloorNum !== null && unitFloorNum >= victimFloorNum;
      });
      if (triggered) toDiscover.push(victim.id);
    }

    if (toDiscover.length === 0) return;
    setDiscoveredVictimIds(prev => {
      const next = new Set(prev);
      for (const id of toDiscover) next.add(id);
      return next;
    });
  }, [tokens]);

  // ── 인명검색 점수 tick (1초마다) ──────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const searches = activeSearchesRef.current;
      if (Object.keys(searches).length === 0) return;

      const newlyDiscovered: string[] = [];
      const updatedSearches: Record<string, FloorSearchRecord> = {};
      const newScores:       Record<string, number>            = {};

      for (const [floorId, rec] of Object.entries(searches)) {
        const combinedRate = rec.units.reduce((s, u) => s + u.decrementRate, 0);

        // 유닛 없으면 점수 유지, 레코드 보존
        if (combinedRate === 0) {
          updatedSearches[floorId] = rec;
          continue;
        }

        let newPrimary   = rec.primaryScore;
        let newSecondary = rec.secondaryScore;

        if (!rec.primaryFrozen) {
          newPrimary = Math.max(0, rec.primaryScore - combinedRate);
        }
        if (rec.secondaryActive) {
          newSecondary = Math.max(0, rec.secondaryScore - combinedRate);
        }

        // 발견 처리 — 1차
        const stillPrimary: typeof rec.primarySchedule = [];
        if (!rec.primaryFrozen) {
          for (const item of rec.primarySchedule) {
            if (newPrimary <= item.revealAtScore && !discoveredVictimIdsRef.current.has(item.victimId)) {
              newlyDiscovered.push(item.victimId);
            } else if (!discoveredVictimIdsRef.current.has(item.victimId)) {
              stillPrimary.push(item);
            }
          }
        } else {
          stillPrimary.push(...rec.primarySchedule);
        }

        // 발견 처리 — 2차
        const stillSecondary: typeof rec.secondarySchedule = [];
        if (rec.secondaryActive) {
          for (const item of rec.secondarySchedule) {
            if (newSecondary <= item.revealAtScore && !discoveredVictimIdsRef.current.has(item.victimId)) {
              newlyDiscovered.push(item.victimId);
            } else if (!discoveredVictimIdsRef.current.has(item.victimId)) {
              stillSecondary.push(item);
            }
          }
        } else {
          stillSecondary.push(...rec.secondarySchedule);
        }

        // 표시용 점수: 1차 진행 중이면 1차, 2차 진행 중이면 2차
        const displayScore = !rec.primaryFrozen ? newPrimary : newSecondary;
        for (const unit of rec.units) {
          newScores[unit.tokenId] = displayScore;
        }

        updatedSearches[floorId] = {
          ...rec,
          primaryScore:      newPrimary,
          primarySchedule:   stillPrimary,
          secondaryScore:    newSecondary,
          secondarySchedule: stillSecondary,
        };
      }

      if (newlyDiscovered.length > 0) {
        setDiscoveredVictimIds(prev => {
          const next = new Set(prev);
          for (const id of newlyDiscovered) next.add(id);
          return next;
        });
      }

      setActiveSearches(updatedSearches);
      setSearchScores(newScores);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ── 구조대상자 생성 ───────────────────────────────────────────────
  const createVictim = useCallback((input: CreateVictimInput) => {
    setVictims(prev => [...prev, buildVictim(input)]);
  }, []);

  const createRandom = useCallback((subLocation: string) => {
    setVictims(prev => [...prev, randomVictim(subLocation)]);
  }, []);

  // ── 구조대상자 이동 ───────────────────────────────────────────────
  const moveVictim = useCallback((
    victimId:  string,
    toZoneKey: string | null,
    pos?:      VictimPos,
  ) => {
    if (toZoneKey !== null) {
      const v = victimsRef.current.find(vic => vic.id === victimId);
      if (v && v.zoneKey !== toZoneKey) {
        addLog({
          logType:    'move',
          tokenId:    victimId,
          tokenName:  victimDisplayName(v),
          fromZoneId: v.zoneKey ?? 'pool',
          toZoneId:   toZoneKey,
        });
      }
    }

    setVictims(prev => prev.map(v => {
      if (v.id !== victimId) return v;

      const rescueLocation: string | undefined =
        toZoneKey === 'medical-post' && !v.rescueLocation
          ? (() => {
              const zoneLabel  = zoneKeyToFullLabel(v.zoneKey);
              const subDisplay = v.face
                ? [v.face + '면', v.subLocation].filter(Boolean).join(' / ')
                : v.subLocation;
              return [zoneLabel, subDisplay].filter(Boolean).join(' ') || '위치미상';
            })()
          : v.rescueLocation;

      const isSpecialZone =
        toZoneKey === null ||
        toZoneKey === 'medical-post' ||
        toZoneKey.startsWith('standby-');
      const originDisplayBottom =
        v.originDisplayBottom ??
        (isSpecialZone ? undefined : buildVictimDisplayLine({ ...v, zoneKey: toZoneKey }));

      return { ...v, zoneKey: toZoneKey, rescueLocation, originDisplayBottom };
    }));

    setVictimPositions(prev => {
      if (toZoneKey === null || pos === undefined) {
        const next = { ...prev };
        delete next[victimId];
        return next;
      }
      return { ...prev, [victimId]: pos };
    });
  }, [addLog]);

  // ── 상태·세부위치·라벨 변경 ──────────────────────────────────────
  const updateVictim = useCallback((victimId: string, update: VictimUpdate) => {
    if (update.condition !== undefined) {
      const v = victimsRef.current.find(vic => vic.id === victimId);
      if (v && v.condition !== update.condition) {
        addLog({
          logType:    'status-tag',
          tokenId:    victimId,
          tokenName:  victimDisplayName(v),
          fromZoneId: '',
          toZoneId:   '',
          note:       `환자상태 ${update.condition} 변경`,
        });
      }
    }
    setVictims(prev => prev.map(v => v.id !== victimId ? v : { ...v, ...update }));
  }, [addLog]);

  // ── 유닛 추가 ─────────────────────────────────────────────────────
  const addUnitToSearch = useCallback((
    tokenId:          string,
    floorId:          string,
    primaryInitial:   number,
    secondaryInitial: number,
    decrementRate:    number,
    startInSecondary: boolean,
  ) => {
    setActiveSearches(prev => {
      // 이미 다른 층 검색 중이면 해당 층에서 제거
      const cleaned: Record<string, FloorSearchRecord> = {};
      for (const [fid, rec] of Object.entries(prev)) {
        if (rec.units.some(u => u.tokenId === tokenId)) {
          const filtered = rec.units.filter(u => u.tokenId !== tokenId);
          cleaned[fid] = { ...rec, units: filtered };
        } else {
          cleaned[fid] = rec;
        }
      }

      const existing = cleaned[floorId];

      if (existing) {
        if (existing.units.some(u => u.tokenId === tokenId)) return cleaned;
        const updated = { ...existing, units: [...existing.units, { tokenId, decrementRate }] };

        // 1차 동결 + 2차 미시작 → 2차 검색 개시
        if (existing.primaryFrozen && !existing.secondaryActive) {
          const victims    = victimsRef.current;
          const discovered = discoveredVictimIdsRef.current;
          const undiscovered = undiscoveredVictimIds(victims, floorId, discovered);
          updated.secondaryActive   = true;
          updated.secondaryScore    = existing.secondaryInitial;
          updated.secondarySchedule = buildSearchSchedule(undiscovered, existing.secondaryInitial);
        }

        return { ...cleaned, [floorId]: updated };
      }

      // 새 레코드 생성
      const victims   = victimsRef.current;
      const discovered = discoveredVictimIdsRef.current;
      const undiscovered = undiscoveredVictimIds(victims, floorId, discovered);

      const primarySchedule   = startInSecondary ? [] : buildSearchSchedule(undiscovered, primaryInitial);
      const secondarySchedule = startInSecondary ? buildSearchSchedule(undiscovered, secondaryInitial) : [];

      const record: FloorSearchRecord = {
        units: [{ tokenId, decrementRate }],
        primaryInitial,
        primaryScore:   primaryInitial,
        primaryFrozen:  startInSecondary,
        primarySchedule,
        secondaryInitial,
        secondaryScore:   secondaryInitial,
        secondaryActive:  startInSecondary,
        secondarySchedule,
      };

      return { ...cleaned, [floorId]: record };
    });

    // 기존 frozen 레코드에 합류 → 2차 점수 표시, 아니면 인자 기반
    const existingRec = activeSearchesRef.current[floorId];
    const isFrozenJoin = existingRec?.primaryFrozen && !existingRec.secondaryActive;
    const initialDisplay = (startInSecondary || isFrozenJoin)
      ? secondaryInitial
      : primaryInitial;

    setSearchScores(prev => ({
      ...prev,
      [tokenId]: initialDisplay,
    }));
  }, []);

  // ── 유닛 제거 (점수 유지) ─────────────────────────────────────────
  const removeUnitFromSearch = useCallback((tokenId: string) => {
    setActiveSearches(prev => {
      const next: Record<string, FloorSearchRecord> = {};
      for (const [fid, rec] of Object.entries(prev)) {
        next[fid] = { ...rec, units: rec.units.filter(u => u.tokenId !== tokenId) };
      }
      return next;
    });
    setSearchScores(prev => {
      const next = { ...prev };
      delete next[tokenId];
      return next;
    });
  }, []);

  // ── 직접 발견 상태 변경 (체크리스트 등) ────────────────────────────
  const setVictimDiscovered = useCallback((victimTokenId: string, visible: boolean) => {
    setDiscoveredVictimIds(prev => {
      const next = new Set(prev);
      if (visible) next.add(victimTokenId);
      else next.delete(victimTokenId);
      return next;
    });
  }, []);

  // ── 초진 도달 시 해당 층 인명검색 중단 (1차 점수 유지, 유닛 제거) ──
  const transitionToSecondarySearch = useCallback((floorIds: string[]) => {
    const removedTokenIds: string[] = [];
    setActiveSearches(prev => {
      const next = { ...prev };
      for (const floorId of floorIds) {
        const rec = next[floorId];
        if (!rec || rec.primaryFrozen) continue;
        rec.units.forEach(u => removedTokenIds.push(u.tokenId));
        next[floorId] = {
          ...rec,
          primaryFrozen: true,
          units:         [],
        };
      }
      return next;
    });
    if (removedTokenIds.length > 0) {
      setSearchScores(prev => {
        const next = { ...prev };
        removedTokenIds.forEach(id => delete next[id]);
        return next;
      });
    }
  }, []);

  return (
    <VictimContext.Provider value={{
      victims, victimPositions,
      discoveredVictimIds, activeSearches, searchScores,
      createVictim, createRandom, moveVictim, updateVictim,
      addUnitToSearch, removeUnitFromSearch, transitionToSecondarySearch,
      setVictimDiscovered,
    }}>
      {children}
    </VictimContext.Provider>
  );
}
