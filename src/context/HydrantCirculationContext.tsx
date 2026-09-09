import {
  createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode,
} from 'react';
import { saveCirculationSession, loadCirculationSession } from '../utils/runtimeSession';
import type { CirculationMap } from '../utils/runtimeSession';
import { CIRCULATION_MAX_UNITS } from '../config/unitMissions';
import { useRoleRelease } from './RoleReleaseContext';
import { useLog } from './LogContext';

// ─────────────────────────────────────────────
// 순환보수 줄 — 소화전마다 하나
//
// 소화전 거리가 150m 를 넘으면 호스 연장만으로는 압력과 시간이 나오지 않아
// 차량이 물을 실어 나른다. 그 줄을 여기서 든다.
//
//   1번 소비      — 중요물탱크에 보수한다. 제 물이 줄어든다
//   2번 대기      — 만수로 바로 뒤에 선다. 1번이 비면 즉시 교대한다
//   3번 보수·이동 — 소화전에서 받고 중계 지점까지 온다
//
// **순서가 곧 자리다.** 그래서 집합이 아니라 배열이고, 재정렬 UI 는 두지 않는다
// (빼고 다시 넣으면 줄 끝으로 간다). → docs/WATER_SUPPLY_MISSION_PLAN.md §3.3
//
// ## 토큰은 구역을 떠나지 않는다
//
// 순환칸에 놓아도 `zoneKey` 는 그 면(`face-A`~`face-D`) 그대로다. 칸이 그 토큰을
// 그리고, 구역은 렌더에서 뺀다(ExteriorZone) — 층별 단위지휘관 슬롯과 같은 방식이다.
// 전용 zoneKey 를 새로 만들면 `isInCommandScope('exterior', …)` 가 `face-` 로
// 시작하는 키만 밖으로 치므로 **건물 밖 단위지휘관 소속이 그 순간 끊긴다.**
//
// ## 자리를 뜨면 즉시 빠진다
//
// 순환대가 어디로든 움직이면 줄에서 뺀다 — 같은 면 안에서 자리만 옮겨도 그렇다.
// 층 단위지휘관과 같은 「자리 하나」 규칙이다(RoleReleaseContext).
//
// `WaterConnectionProvider` **안**, `WaterLevelProvider` **밖**에 둔다. 유량 계산이
// 이 줄을 읽어 가상 연결을 만들기 때문이다(WaterLevelContext).
// ─────────────────────────────────────────────

interface HydrantCirculationContextValue {
  /** 소화전 id → 순환대 토큰 id 목록(순서 있음) */
  slots: CirculationMap;
  /** 순환칸에 든 모든 차량 — 임무 파생·렌더 제외에 쓴다 */
  circulationIds: ReadonlySet<string>;
  /** 그 차가 선 소화전. 없으면 undefined */
  hydrantOf: (tokenId: string) => string | undefined;
  /** 줄 끝에 세운다. 이미 있거나 5대가 찼으면 아무 일도 하지 않는다 */
  add: (hydrantId: string, hydrantName: string, tokenId: string, tokenLabel: string) => void;
  /** 줄에서 뺀다 */
  remove: (tokenId: string, tokenLabel: string) => void;
  /**
   * 선두를 줄 끝으로 — 1번이 비었을 때 유량 계산이 부른다.
   *
   * `labelOf` 는 토큰 이름을 찾는 함수다. 이 Context 는 `TokenProvider` 밖이라
   * id 로 이름을 되찾을 수 없는데, 로그에는 「펌프2 → 펌프3」이 있어야 누가
   * 언제 교대했는지 읽힌다(단위지휘관 해제 알림이 이름표를 함께 넘기는 것과 같은 사정).
   */
  rotate: (hydrantId: string, hydrantName: string, labelOf?: (tokenId: string) => string) => void;
}

const HydrantCirculationContext = createContext<HydrantCirculationContextValue | null>(null);

export function useHydrantCirculation(): HydrantCirculationContextValue {
  const ctx = useContext(HydrantCirculationContext);
  if (!ctx) throw new Error('useHydrantCirculation must be used within HydrantCirculationProvider');
  return ctx;
}

/** 그 토큰을 모든 줄에서 뺀 새 지도. 빈 줄은 지운다 */
function stripToken(slots: CirculationMap, tokenId: string): CirculationMap {
  const next: CirculationMap = {};
  for (const [hydrantId, ids] of Object.entries(slots)) {
    const kept = ids.filter(id => id !== tokenId);
    if (kept.length > 0) next[hydrantId] = kept;
  }
  return next;
}

export function HydrantCirculationProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<CirculationMap>(() => loadCirculationSession() ?? {});
  const { registerReleaser } = useRoleRelease();
  const { addLog }           = useLog();

  /*
   * 읽기는 ref, 쓰기는 ref+state 를 함께 갱신한다. 해제 알림이 `moveToken` 안에서
   * 들어오는데 거기서 「이 차가 줄에 있었는가」를 먼저 알아야 로그를 남길지
   * 정할 수 있고, setState 갱신 함수 안에서 로그를 부르면 StrictMode 이중 호출로
   * 로그가 두 번 쌓인다(UnitCommanderContext 와 같은 이유).
   */
  const slotsRef = useRef(slots);
  const write = useCallback((next: CirculationMap) => {
    slotsRef.current = next;
    setSlots(next);
  }, []);

  useEffect(() => { saveCirculationSession(slots); }, [slots]);

  const circulationIds = useMemo(
    () => new Set(Object.values(slots).flat()),
    [slots],
  );

  const hydrantOf = useCallback((tokenId: string) => {
    for (const [hydrantId, ids] of Object.entries(slots)) {
      if (ids.includes(tokenId)) return hydrantId;
    }
    return undefined;
  }, [slots]);

  const add = useCallback((
    hydrantId: string, hydrantName: string, tokenId: string, tokenLabel: string,
  ) => {
    const prev = slotsRef.current;
    if (prev[hydrantId]?.includes(tokenId)) return;                 // 이미 그 줄에 있다
    if ((prev[hydrantId]?.length ?? 0) >= CIRCULATION_MAX_UNITS) return;

    // 다른 소화전 줄에 있었다면 그쪽에서 뺀다 — 한 차는 한 줄에만 선다
    const next = stripToken(prev, tokenId);
    next[hydrantId] = [...(next[hydrantId] ?? []), tokenId];
    write(next);

    addLog({
      logType: 'post', tokenId, tokenName: tokenLabel, fromZoneId: '', toZoneId: '',
      note:    `순환급수 배치: ${hydrantName} · ${tokenLabel} (${next[hydrantId].length}번)`,
      payload: {
        kind: 'circulation', action: 'assign',
        hydrantId, hydrantName, tokenId, tokenLabel,
        position: next[hydrantId].length,
      },
    });
  }, [write, addLog]);

  const remove = useCallback((tokenId: string, tokenLabel: string) => {
    const prev      = slotsRef.current;
    const hydrantId = Object.keys(prev).find(id => prev[id].includes(tokenId));
    if (!hydrantId) return;

    write(stripToken(prev, tokenId));
    addLog({
      logType: 'post', tokenId, tokenName: tokenLabel, fromZoneId: '', toZoneId: '',
      note:    `순환급수 해제: ${tokenLabel}`,
      payload: {
        kind: 'circulation', action: 'release',
        hydrantId, hydrantName: null, tokenId, tokenLabel, position: null,
      },
    });
  }, [write, addLog]);

  /**
   * 선두를 줄 끝으로 보낸다 — 1번이 물을 다 쓴 순간이다.
   *
   * 2번이 앞으로 나와 소비를 잇고, 3번이 그 뒤에 붙고, 방금 빈 차가 소화전으로 간다.
   * **목록 회전이 곧 순환이다.**
   */
  const rotate = useCallback((
    hydrantId: string, hydrantName: string, labelOf?: (tokenId: string) => string,
  ) => {
    const prev = slotsRef.current;
    const line = prev[hydrantId];
    if (!line || line.length < 2) return;                           // 돌릴 줄이 없다

    const [head, ...rest] = line;
    write({ ...prev, [hydrantId]: [...rest, head] });

    const headLabel = labelOf?.(head)    ?? head;
    const nextLabel = labelOf?.(rest[0]) ?? rest[0];
    addLog({
      logType: 'post', tokenId: head, tokenName: headLabel, fromZoneId: '', toZoneId: '',
      note:    `순환급수 교대: ${hydrantName} · ${headLabel} 소진 → ${nextLabel}`,
      payload: {
        kind: 'circulation', action: 'rotate',
        hydrantId, hydrantName, tokenId: head, tokenLabel: headLabel, position: line.length,
      },
    });
  }, [write, addLog]);

  /*
   * 순환대가 움직이면 줄에서 뺀다 — 같은 면 안에서 자리만 옮겨도 마찬가지다.
   * 순환칸에 세우는 것은 **자리**이므로, 그 자리를 떠나는 동작이 곧 해제다.
   */
  useEffect(() => registerReleaser('hydrant-circulation', (tokenId, tokenLabel, _to, reason) => {
    // 방금 이 줄에 세우면서 보낸 알림이다 — 여기서 빼면 배치가 곧바로 취소된다
    if (reason === 'circulate') return;
    remove(tokenId, tokenLabel);
  }), [registerReleaser, remove]);

  return (
    <HydrantCirculationContext.Provider
      value={{ slots, circulationIds, hydrantOf, add, remove, rotate }}
    >
      {children}
    </HydrantCirculationContext.Provider>
  );
}
