import {
  createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode,
} from 'react';
import { saveUnitCommanderSession, loadUnitCommanderSession } from '../utils/runtimeSession';
import type { UnitCommandGroupMap } from '../utils/runtimeSession';
import {
  EXTERIOR_SCOPE, commandScopeOf, isInCommandScope, groupOfMember, unitCommanderZoneLabel,
} from '../utils/unitCommandScope';
import { useRoleRelease } from './RoleReleaseContext';
import { useLog } from './LogContext';

// ─────────────────────────────────────────────
// 단위지휘관과 그 소속대
//
// ## 지정하는 길이 둘이다
//
//   ① 층 안 「단위지휘관」 슬롯에 끌어다 놓기 (UnitCommanderSlot)
//   ② 우클릭 → 임무 → 「단위」 (UnitStatusBarMenu)
//
// 둘은 같은 것을 만든다. ①로 앉히면 「단위」 임무도 함께 붙고, ②로 임무를
// 붙이면 그 자리의 지휘관으로 등록된다. 화면에 보이는 표시(보라 「단위」 칩)와
// 저장된 관계가 어긋나지 않게 하려는 것이다.
//
// ## 무리는 **지휘관을 열쇠로** 담는다
//
// 예전에는 자리(구역 키)를 열쇠로 삼았다. 그러면 방면 사이를 옮길 때마다
// 열쇠가 바뀌어 무리가 흩어진다. 지금은 지휘관 토큰 id 가 열쇠이고, 자리는
// `scope` 로 들고 있다.
//
//   scope = `'3F-center'` 같은 구역 키 — **건물 안.** 층마다 지휘관은 하나다.
//   scope = `'exterior'`             — **건물 밖(A~D면 전체).** 임무 단위로
//                                      여럿 설 수 있다.
//
// ## 놓는 조건 — 안과 밖이 다르다
//
//   건물 안 지휘관 — **움직이면 곧바로 놓는다.** 같은 층 안에서 자리만 옮겨도
//                    마찬가지다. 지휘관 자리는 그 층 슬롯이고, 슬롯을 떠나는
//                    것이 곧 물러나는 것이다. 계단실도 다른 구역이라 떠난 것이다.
//   건물 밖 지휘관 — 면을 옮겨도 **그대로다.** A~D면 경계는 실제 경계가 아니라
//                    판 위의 칸이라, 그 경계로 지휘 관계를 끊을 이유가 없다.
//                    건물 안으로 들어가면 그때 놓는다.
//   소속대         — 제 무리의 범위를 벗어날 때 놓는다. 층 무리는 그 층을
//                    벗어날 때, 밖 무리는 건물 안으로 들어갈 때다.
//
// `TokenProvider` 바깥에 둔다. 그래야 `moveToken` 이 이 Context 의 해제
// 등록부를 볼 수 있다(바깥 Context 는 안쪽에서 읽힌다).
// 그 대신 여기서는 `useTokens()` 를 쓸 수 없다 — 토큰 이름표가 필요한 곳은
// 해제 알림이 함께 넘겨 준다. 지휘관 해제는 「단위」 임무까지 떼야 해서
// `UnitCommanderBridge`(TokenProvider 안)가 맡는다.
// ─────────────────────────────────────────────

interface UnitCommanderContextValue {
  groups: UnitCommandGroupMap;
  /** 지명. 그 토큰이 다른 자리를 맡고 있었다면 그쪽은 자동으로 비운다 */
  assign:    (zoneKey: string, tokenId: string) => void;
  /** 그 지휘관을 물린다 — 무리도 함께 풀린다 */
  release:   (commanderId: string) => void;
  /** 소속대 편입. 지휘관 본인이거나 이미 소속이면 아무 일도 하지 않는다 */
  addMember: (commanderId: string, tokenId: string) => void;
  /**
   * 소속 해제 — 우클릭 「기능」에서 떼는 길(UnitStatusBarMenu).
   *
   * 대는 그 자리에 그대로 선다. 「이 대는 이제 내가 직접 부른다」는 뜻이라
   * 자리를 옮기는 것과 다르다.
   */
  removeMember: (commanderId: string, tokenId: string, tokenLabel: string) => void;
}

const UnitCommanderContext = createContext<UnitCommanderContextValue | null>(null);

/** 그 토큰을 모든 무리의 소속에서 뺀 새 지도 */
function stripMember(groups: UnitCommandGroupMap, tokenId: string): UnitCommandGroupMap {
  const next: UnitCommandGroupMap = {};
  for (const [cmdId, g] of Object.entries(groups)) {
    next[cmdId] = { ...g, members: g.members.filter(id => id !== tokenId) };
  }
  return next;
}

export function UnitCommanderProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<UnitCommandGroupMap>(
    () => loadUnitCommanderSession()?.groups ?? {},
  );
  const { registerReleaser } = useRoleRelease();
  const { addLog }           = useLog();

  /*
   * 현재 값을 ref 가 함께 들고 있는다.
   *
   * 해제 알림은 `moveToken` 안에서 들어오는데, 거기서 「이 토큰이 무엇을
   * 맡고 있는가」를 먼저 알아야 로그를 남길지 정할 수 있다. setState 갱신
   * 함수 안에서 로그를 부르면 StrictMode 이중 호출 때 로그가 두 번 남는다.
   * 그래서 읽기는 ref, 쓰기는 ref+state 를 함께 갱신하는 방식으로 둔다.
   */
  const groupsRef = useRef(groups);

  const write = useCallback((next: UnitCommandGroupMap) => {
    groupsRef.current = next;
    setGroups(next);
  }, []);

  // 새로고침에도 유지된다 — 지명 시각이 평가 대상이라 로그와 상태가 어긋나면 안 된다
  useEffect(() => { saveUnitCommanderSession({ groups }); }, [groups]);

  const assign = useCallback((zoneKey: string, tokenId: string) => {
    const prev  = groupsRef.current;
    const scope = commandScopeOf(zoneKey);
    if (prev[tokenId]?.scope === scope) return;

    // 소속대였던 사람이 지휘관이 되면 소속에서는 빠진다
    const next = stripMember(prev, tokenId);
    // 한 사람이 두 자리를 동시에 맡지 않는다
    delete next[tokenId];
    // 건물 안은 한 층에 지휘관 하나 — 있던 사람은 물러난다(밖은 여럿 가능)
    if (scope !== EXTERIOR_SCOPE) {
      for (const [cmdId, g] of Object.entries(next)) {
        if (g.scope === scope) delete next[cmdId];
      }
    }
    next[tokenId] = { scope, members: [] };
    write(next);
  }, [write]);

  const release = useCallback((commanderId: string) => {
    const prev = groupsRef.current;
    if (!prev[commanderId]) return;
    const next = { ...prev };
    delete next[commanderId];
    write(next);
  }, [write]);

  const addMember = useCallback((commanderId: string, tokenId: string) => {
    const prev = groupsRef.current;
    if (commanderId === tokenId) return;                       // 지휘관 본인
    if (!prev[commanderId]) return;                            // 지휘관이 아니다
    if (prev[commanderId].members.includes(tokenId)) return;   // 이미 소속

    // 다른 무리에 있었다면 그쪽에서 뺀다 — 한 사람은 한 지휘관 밑에만 있다
    const next = stripMember(prev, tokenId);
    next[commanderId] = { ...next[commanderId], members: [...next[commanderId].members, tokenId] };
    write(next);
  }, [write]);

  const removeMember = useCallback((commanderId: string, tokenId: string, tokenLabel: string) => {
    const prev = groupsRef.current;
    if (!prev[commanderId]?.members.includes(tokenId)) return;

    const scope = prev[commanderId].scope;
    write(stripMember(prev, tokenId));
    addLog({
      logType: 'post', tokenId, tokenName: tokenLabel, fromZoneId: '', toZoneId: '',
      note:    `단위지휘관 소속 해제: ${unitCommanderZoneLabel(scope)} · ${tokenLabel}`,
      payload: {
        kind: 'unit-commander', floorId: scope,
        commanderTokenId: null, commanderLabel: null,
      },
    });
  }, [write, addLog]);

  /*
   * 여기서는 **소속대만** 본다. 지휘관이 움직였을 때의 처리는
   * `UnitCommanderBridge` 가 맡는다 — 「단위」 임무 표시를 함께 떼야 하는데
   * `toggleMissionTag` 가 `TokenProvider` 안에 있어 여기서는 닿지 않는다.
   */
  useEffect(() => registerReleaser('unit-commander', (tokenId, tokenLabel, toZoneKey, reason) => {
    const prev = groupsRef.current;
    if (prev[tokenId]) return;                              // 지휘관 — 다리가 맡는다

    const found = groupOfMember(prev, tokenId);
    if (!found) return;
    /*
     * **바스켓에 타는 것은 자리를 뜨는 것이 아니다.** 그 대는 여전히 같은
     * 지휘관 밑에 있고, 다만 공중에 있을 뿐이다. 탑승으로 소속이 풀리면
     * 내려온 뒤 다시 붙여야 하는데, 그건 판에서 아무 일도 일어나지 않은
     * 것을 손으로 되돌리는 셈이다(2026-09-09 사용자 지적).
     */
    if (reason === 'board') return;
    if (isInCommandScope(found.scope, toZoneKey)) return;   // 아직 제 무리 범위 안

    write(stripMember(prev, tokenId));
    addLog({
      logType: 'post', tokenId, tokenName: tokenLabel, fromZoneId: '', toZoneId: '',
      note:    `단위지휘관 소속 해제: ${unitCommanderZoneLabel(found.scope)} · ${tokenLabel}`,
      payload: {
        kind: 'unit-commander', floorId: found.scope,
        commanderTokenId: null, commanderLabel: null,
      },
    });
  }), [registerReleaser, addLog, write]);

  return (
    <UnitCommanderContext.Provider
      value={{ groups, assign, release, addMember, removeMember }}
    >
      {children}
    </UnitCommanderContext.Provider>
  );
}

export function useUnitCommander(): UnitCommanderContextValue {
  const ctx = useContext(UnitCommanderContext);
  if (!ctx) throw new Error('useUnitCommander must be used within UnitCommanderProvider');
  return ctx;
}
