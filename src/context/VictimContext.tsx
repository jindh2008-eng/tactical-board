import { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { VictimToken, CreateVictimInput, VictimCondition, VictimTriage } from '../types/victim';
import { classifyTriage } from '../types/victim';
import type { VictimSetupItem } from '../types/settings';
import type { BuildingConfig, Pos, SearchPhase } from '../types';
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
import { floorIdLabel, zoneLabel, victimDisplayName } from '../utils/logLabels';
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
  /**
   * 구조대상자 이동.
   * opts.keepCarrier — 연결(carriedBy)을 유지한 채 옮긴다. 연결된 출동대를 따라
   * 움직이는 내부 호출에서만 쓴다. 사용자가 직접 옮기면(기본값) 연결이 끊긴다.
   */
  moveVictim:          (victimId: string, toZoneKey: string | null, pos?: VictimPos, opts?: { keepCarrier?: boolean }) => void;
  /** 구조대상자를 출동대에 연결(이송 시작). 같은 구역으로 옮기며 붙인다. */
  attachVictimToUnit:  (victimId: string, tokenId: string) => void;
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
  const { addLog, tokens, rescueUnit } = useTokens();

  const validZoneKeysRef = useRef<Set<string>>(
    buildingConfig !== undefined
      ? buildValidVictimZoneKeys(buildingConfig, fireFloor ?? 1)
      : new Set<string>()
  );

  function sanitizeVictim(v: VictimToken): VictimToken {
    // 중증도 분류 도입 이전 세션 복원분 — 이미 임시의료소에 있는데 분류가 없으면
    // 여기서 채운다. 없으면 구조활동통계에서 통째로 빠져 빈 표로 보인다.
    const withTriage: VictimToken =
      v.zoneKey === 'medical-post' && !v.triage && v.condition
        ? { ...v, triage: classifyTriage(v.condition) }
        : v;

    if (!buildingConfig) return withTriage;
    if (withTriage.zoneKey === null) return withTriage;
    if (validZoneKeysRef.current.has(withTriage.zoneKey)) return withTriage;
    return { ...withTriage, zoneKey: null };
  }

  const victimsRef = useRef<VictimToken[]>([]);

  // 로그에 출동대 이름을 넣을 때 쓴다 — useCallback 안에서 최신 목록이 필요하다
  const tokensRef = useRef(tokens);
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);

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
          const el = document.querySelector<HTMLElement>(`[data-zone-key="${zoneKey}"]`);
          /*
           * offsetWidth/Height 로 잰다 — getBoundingClientRect 가 아니다.
           *
           * 훈련창은 스테이지가 `transform: scale()` 을 한 번 걸어 배율을
           * 만든다. rect 는 그 **변환 뒤** 화면 px 라, 창이 작으면 구역이
           * 절반 크기로 잡힌다. 그런데 아래 간격 상수(MARGIN·STEP)는 카드
           * 실측을 적어 둔 **캔버스 px** 이라 둘의 단위가 어긋났다.
           *   실측: 창이 0.475배일 때 A면 높이가 225 대신 103 으로 잡혀
           *   카드가 아래(또는 위) 여백 22px 자리가 아니라 47px 안쪽에 섰다.
           * offset* 은 변환을 무시한 레이아웃 크기 — 곧 캔버스 px 다.
           * → docs/SCREEN_STAGE_PLAN.md §4.1
           */
          const zoneW = el && el.offsetWidth  > 0 ? el.offsetWidth  : 120;
          const zoneH = el && el.offsetHeight > 0 ? el.offsetHeight : 80;
          // A면은 가운데 상단부터 — 우측 하단은 하단 밴드에 가린다
          const anchor = zoneKey === 'face-A' ? 'top-center' : 'bottom-right';
          const offsets = computeVictimOffsets(ids.length, zoneW, zoneH, anchor);
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
  // 다음 상태와 로그를 **업데이터 밖에서** 계산한다. 업데이터 콜백 안에서 addLog를
  // 호출하면 StrictMode가 콜백을 이중 호출해 로그가 두 번 쌓인다(EVENT_LOG_PLAN L-8).
  useEffect(() => {
    const prev = activeSearchesRef.current;
    let changed = false;
    const next: Record<string, FloorSearchRecord> = {};
    const dropped: Array<{ floorId: string; tokenId: string }> = [];

    for (const [floorId, rec] of Object.entries(prev)) {
      const stillHere = rec.units.filter(u => {
        const token = tokens.find(t => t.id === u.tokenId);
        if (!token?.zoneKey || token.zoneKey.startsWith('face-')) return false;
        return token.zoneKey.split('-')[0] === floorId;
      });
      if (stillHere.length !== rec.units.length) {
        changed = true;
        for (const u of rec.units) {
          if (!stillHere.some(k => k.tokenId === u.tokenId)) dropped.push({ floorId, tokenId: u.tokenId });
        }
      }
      next[floorId] = { ...rec, units: stillHere };
    }
    if (!changed) return;

    setActiveSearches(next);

    // 의도한 철수인지 실수인지 사후에 가리려면 '언제 빠졌는가'가 남아야 한다
    for (const { floorId, tokenId } of dropped) {
      const label = tokens.find(t => t.id === tokenId)?.label ?? tokenId;
      addLog({
        logSource: 'system',
        logType:   'search',
        tokenId, tokenName: label, fromZoneId: floorId, toZoneId: '',
        note:      `${floorIdLabel(floorId)} 인명검색 이탈 (층 이동)`,
        payload:   { kind: 'search-stop', floorId, tokenId, tokenLabel: label, reason: 'moved-away' },
      });
    }
  }, [tokens, addLog]);

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
    for (const id of toDiscover) {
      const v = victimsRef.current.find(x => x.id === id);
      if (!v) continue;
      addLog({
        logSource: 'system',
        logType:   'victim-found',
        tokenId:   id,
        tokenName: victimDisplayName(v),
        fromZoneId: v.zoneKey ?? '', toZoneId: '',
        note:      `${zoneLabel(v.zoneKey ?? '')} 구조대상자 발견 (계단실)`,
        payload:   { kind: 'victim-found', victimId: id, victimLabel: victimDisplayName(v), zoneKey: v.zoneKey ?? null, via: 'stair' },
      });
    }
  }, [tokens, addLog]);

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
        // 훈련 성과의 핵심 지표 — "몇 분에 몇 명을 찾았는가"
        for (const id of newlyDiscovered) {
          const v = victimsRef.current.find(x => x.id === id);
          if (!v) continue;
          addLog({
            logSource: 'system',
            logType:   'victim-found',
            tokenId:   id,
            tokenName: victimDisplayName(v),
            fromZoneId: v.zoneKey ?? '', toZoneId: '',
            note:      `${zoneLabel(v.zoneKey ?? '')} 구조대상자 발견 (인명검색)`,
            payload:   { kind: 'victim-found', victimId: id, victimLabel: victimDisplayName(v), zoneKey: v.zoneKey ?? null, via: 'search' },
          });
        }
      }

      setActiveSearches(updatedSearches);
      setSearchScores(newScores);
    }, 1000);

    return () => clearInterval(interval);
  }, [addLog]);

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
    opts?:     { keepCarrier?: boolean },
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

      // 중증도 분류 — 임시의료소 진입 시 1회만 배정하고 이후 유지한다.
      // (구역을 나갔다 다시 들어와도 재분류하지 않는다 — 진입 시점의 판정이라)
      // custom 종류는 condition 이 없어 분류 대상이 아니다.
      const triage: VictimTriage | undefined =
        toZoneKey === 'medical-post' && !v.triage && v.condition
          ? classifyTriage(v.condition)
          : v.triage;

      const isSpecialZone =
        toZoneKey === null ||
        toZoneKey === 'medical-post' ||
        toZoneKey.startsWith('standby-');
      const originDisplayBottom =
        v.originDisplayBottom ??
        (isSpecialZone ? undefined : buildVictimDisplayLine({ ...v, zoneKey: toZoneKey }));

      // 최초 배치 구역 — 한 번 잡히면 끝까지 유지한다(구조 현황 집계 기준).
      // 로스터 배치분은 생성 시점에 이미 있고(victimSetupToToken), 훈련 중
      // 손으로 만든 구조대상자는 처음 상황판에 놓이는 이 순간이 최초 배치다.
      // 대기·임시의료소 같은 특수 구역은 「있던 자리」가 아니라 제외한다.
      const originZoneKey = v.originZoneKey ?? (isSpecialZone ? undefined : toZoneKey ?? undefined);

      // 사용자가 직접 옮기면 이송 연결이 끊긴다(연결 해제 수단).
      // 연결된 출동대를 따라가는 이동만 keepCarrier 로 연결을 유지한다.
      const carriedBy = opts?.keepCarrier ? v.carriedBy : undefined;

      return { ...v, zoneKey: toZoneKey, rescueLocation, triage, carriedBy, originDisplayBottom, originZoneKey };
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

  // ── 이송 연결 (구조대상자 → 출동대) ───────────────────────────────
  const attachVictimToUnit = useCallback((victimId: string, tokenId: string) => {
    const token  = tokens.find(t => t.id === tokenId);
    const victim = victimsRef.current.find(v => v.id === victimId);
    if (!token || !victim) return;

    addLog({
      logType:    'move',
      tokenId:    victimId,
      tokenName:  victimDisplayName(victim),
      fromZoneId: victim.zoneKey ?? 'pool',
      toZoneId:   token.zoneKey ?? 'pool',
      note:       `${token.label} 이송 연결`,
    });

    // 출동대와 같은 구역으로 옮기고 연결한다. 위치는 출동대 옆에 두기 위해
    // 좌표를 지우고 흐름 배치에 맡긴다(구역 좌표계가 서로 달라 그대로 쓰면 어긋남).
    setVictims(prev => prev.map(v =>
      v.id === victimId
        ? { ...v, zoneKey: token.zoneKey, carriedBy: tokenId }
        : v
    ));
    setVictimPositions(prev => {
      const next = { ...prev };
      delete next[victimId];
      return next;
    });
  }, [tokens, addLog]);

  // ── 연결된 구조대상자 동반 이동 ───────────────────────────────────
  //
  // TokenContext 는 VictimContext 를 알 수 없다(Provider 가 바깥에 있음).
  // 그래서 "출동대가 움직이면 따라간다"를 여기서 토큰 변화를 관찰해 처리한다.
  // 임시의료소에 도착하면 자동으로 구조 처리하고 연결을 끊는다.
  const prevTokenZonesRef = useRef<Map<string, string | null> | null>(null);
  useEffect(() => {
    const nextZones = new Map(tokens.map(t => [t.id, t.zoneKey]));
    const prevZones = prevTokenZonesRef.current;
    prevTokenZonesRef.current = nextZones;
    if (prevZones === null) return; // 최초 마운트 — 기준만 잡고 끝

    for (const [tokenId, zoneKey] of nextZones) {
      if (!prevZones.has(tokenId)) continue;      // 새로 생긴 토큰
      if (prevZones.get(tokenId) === zoneKey) continue; // 구역 그대로

      const carried = victimsRef.current.filter(v => v.carriedBy === tokenId);
      if (carried.length === 0) continue;

      if (zoneKey === 'medical-post') {
        // 도착 — 연결된 전원을 구조 처리한다. rescueUnit 은 출동대에 구조중 배지와
        // rescue 로그(누가 구조했는지)를 남기고 처치 카운트다운을 시작한다.
        const token = tokens.find(t => t.id === tokenId);
        const names = carried.map(victimDisplayName).join(', ');
        if (token) rescueUnit(tokenId, names);
        for (const v of carried) moveVictim(v.id, 'medical-post');  // keepCarrier 없음 → 연결 해제
      } else {
        for (const v of carried) moveVictim(v.id, zoneKey, undefined, { keepCarrier: true });
      }
    }
  }, [tokens, moveVictim, rescueUnit]);

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

    // 어느 층에 누구를 언제 투입했는가 — SOP 평가 대상
    const phase: SearchPhase = (startInSecondary || isFrozenJoin) ? 'secondary' : 'primary';
    const label = tokensRef.current.find(t => t.id === tokenId)?.label ?? tokenId;
    addLog({
      logType:    'search',
      tokenId, tokenName: label, fromZoneId: '', toZoneId: floorId,
      note:       `${floorIdLabel(floorId)} 인명검색 투입 (${phase === 'secondary' ? '2차' : '1차'})`,
      payload:    { kind: 'search-start', floorId, tokenId, tokenLabel: label, phase },
    });
  }, [addLog]);

  // ── 유닛 제거 (점수 유지) ─────────────────────────────────────────
  const removeUnitFromSearch = useCallback((tokenId: string) => {
    // 어느 층에서 빠졌는지는 상태를 고치기 전에 읽어야 한다
    const fromFloorId = Object.entries(activeSearchesRef.current)
      .find(([, rec]) => rec.units.some(u => u.tokenId === tokenId))?.[0];

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

    if (fromFloorId) {
      const label = tokensRef.current.find(t => t.id === tokenId)?.label ?? tokenId;
      addLog({
        logType:   'search',
        tokenId, tokenName: label, fromZoneId: fromFloorId, toZoneId: '',
        note:      `${floorIdLabel(fromFloorId)} 인명검색 해제`,
        payload:   { kind: 'search-stop', floorId: fromFloorId, tokenId, tokenLabel: label, reason: 'manual' },
      });
    }
  }, [addLog]);

  // ── 직접 발견 상태 변경 (체크리스트 등) ────────────────────────────
  const setVictimDiscovered = useCallback((victimTokenId: string, visible: boolean) => {
    const wasDiscovered = discoveredVictimIdsRef.current.has(victimTokenId);
    setDiscoveredVictimIds(prev => {
      const next = new Set(prev);
      if (visible) next.add(victimTokenId);
      else next.delete(victimTokenId);
      return next;
    });
    // 발견 해제는 기록하지 않는다 — 되돌리기(오조작 정정)이지 훈련 사건이 아니다
    if (visible && !wasDiscovered) {
      const v = victimsRef.current.find(x => x.id === victimTokenId);
      if (v) {
        addLog({
          logType:    'victim-found',
          tokenId:    victimTokenId,
          tokenName:  victimDisplayName(v),
          fromZoneId: v.zoneKey ?? '', toZoneId: '',
          note:       `${zoneLabel(v.zoneKey ?? '')} 구조대상자 발견 (진행상황관리)`,
          payload:    { kind: 'victim-found', victimId: victimTokenId, victimLabel: victimDisplayName(v), zoneKey: v.zoneKey ?? null, via: 'checklist' },
        });
      }
    }
  }, [addLog]);

  // ── 초진 도달 시 해당 층 인명검색 중단 (1차 점수 유지, 유닛 제거) ──
  const transitionToSecondarySearch = useCallback((floorIds: string[]) => {
    // 로그용 집계는 상태를 고치기 전에 — 업데이터 안에서 계산하면 StrictMode에 두 번 돈다
    const frozen = floorIds
      .map(floorId => ({ floorId, rec: activeSearchesRef.current[floorId] }))
      .filter(({ rec }) => rec && !rec.primaryFrozen)
      .map(({ floorId, rec }) => ({ floorId, tokenIds: rec!.units.map(u => u.tokenId) }));

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

    for (const { floorId, tokenIds } of frozen) {
      const names = tokenIds
        .map(id => tokensRef.current.find(t => t.id === id)?.label ?? id)
        .join(', ');
      addLog({
        logSource: 'system',
        logType:   'search',
        tokenId: '', tokenName: '', fromZoneId: floorId, toZoneId: '',
        note:      `${floorIdLabel(floorId)} 초진 도달 → 1차 인명검색 종료${names ? ` (${names})` : ''}`,
        payload:   { kind: 'search-primary-frozen', floorId, tokenIds },
      });
    }
  }, [addLog]);

  return (
    <VictimContext.Provider value={{
      victims, victimPositions,
      discoveredVictimIds, activeSearches, searchScores,
      createVictim, createRandom, moveVictim, updateVictim, attachVictimToUnit,
      addUnitToSearch, removeUnitFromSearch, transitionToSecondarySearch,
      setVictimDiscovered,
    }}>
      {children}
    </VictimContext.Provider>
  );
}
