import {
  createContext, useContext, useCallback, useRef, type ReactNode,
} from 'react';

// ─────────────────────────────────────────────
// 역할 해제 알림 — register/call 패턴
//
// 역할(단위지휘관·자원대기소장·임시의료소장)은 **그 자리에 있는 사람**이다.
// 그래서 그 토큰이 움직이는 순간이 곧 해제다. ✕ 버튼은 없앴다 — 지우는
// 방법이 둘이면 어느 쪽이 정본인지 흐려진다(RoleSlot.tsx 주석).
//
// 해제 지점을 드롭 핸들러마다 두면 반드시 하나를 빠뜨린다. 토큰이 움직이는
// 길은 여럿이다 — 구역 셀 드롭, 자원대기소·임시의료소 박스 드롭, 체크리스트
// 원격 명령, 도착 배치, 동승 펌프 하차. 그 전부가 `moveToken` 을 지나가므로
// **거기 한 곳**에서 알린다.
//
// `TokenProvider` 는 이 Provider 안쪽에 있어야 한다(바깥 Context 는 안쪽에서
// 읽힌다). 반대로 역할을 들고 있는 쪽은 `register` 로 자기 해제 함수를 건다.
//
// Provider 가 없으면 조용히 아무 일도 하지 않는다 — `TokenProvider` 를 다른
// 화면에서 단독으로 쓰더라도 훅이 throw 하지 않게 한다.
// ─────────────────────────────────────────────

/**
 * 이 토큰이 움직였다 — 들고 있던 역할이 있으면 놓아라.
 *
 * 이름표(`tokenLabel`)를 함께 넘긴다. 해제 로그에 「단위지휘관 해제: 진압1」
 * 처럼 이름이 필요한데, 등록자가 `TokenProvider` 바깥에 있으면 id 로 토큰을
 * 되찾을 수 없기 때문이다.
 *
 * `toZoneKey` 는 **옮겨 간 구역**이다(삭제면 null). 역할마다 놓는 조건이
 * 다르기 때문에 필요하다 — 지휘관은 같은 구역 안에서 자리만 옮겨도 놓지만,
 * 소속대는 그 층에 있는 한 그대로다.
 */
type Releaser = (
  tokenId: string, tokenLabel: string, toZoneKey: string | null, reason?: ReleaseReason,
) => void;

/**
 * 왜 알리는가 — 역할마다 반응이 달라야 하는 경우가 있다.
 *
 *   'move'  — 자리를 옮겼다(기본). 지금까지의 유일한 경우다.
 *   'board' — 고가·굴절차 **바스켓에 탔다.** 자리를 뜬 것이 아니라 그 차에
 *             올라탄 것이라, 「그 자리에 있어야 성립하는 역할」(층 지휘관·
 *             소장)은 놓지만 **소속 관계는 그대로다** — 바스켓에 탔다고
 *             지휘 계선이 바뀌지는 않는다(2026-09-09 사용자 결정).
 *   'circulate' — **순환급수 칸에 들어갔다.** 순환칸은 건물 내부처럼 별도
 *             공간이라 들고 있던 자리와 소속을 전부 놓는다. 다만 순환 줄
 *             자신은 예외다 — 방금 그 줄에 세운 참이라 그것까지 놓으면
 *             배치가 곧바로 취소된다(HydrantCirculationContext).
 *
 * 등록자는 필요할 때만 본다. 안 보면 예전과 똑같이 동작한다.
 */
export type ReleaseReason = 'move' | 'board' | 'circulate';

interface RoleReleaseContextValue {
  /** 해제 함수를 등록한다. 반환값을 호출하면 등록이 풀린다(useEffect 정리용) */
  registerReleaser: (key: string, fn: Releaser) => () => void;
  /** 토큰이 움직였음을 모든 등록자에게 알린다 */
  releaseRolesFor:  (
    tokenId: string, tokenLabel: string, toZoneKey: string | null, reason?: ReleaseReason,
  ) => void;
}

const RoleReleaseContext = createContext<RoleReleaseContextValue | null>(null);

export function RoleReleaseProvider({ children }: { children: ReactNode }) {
  const releasersRef = useRef(new Map<string, Releaser>());

  const registerReleaser = useCallback((key: string, fn: Releaser) => {
    releasersRef.current.set(key, fn);
    return () => {
      // 이미 다른 등록으로 덮인 뒤라면 지우지 않는다(정리 순서가 뒤바뀔 수 있다)
      if (releasersRef.current.get(key) === fn) releasersRef.current.delete(key);
    };
  }, []);

  const releaseRolesFor = useCallback((
    tokenId: string, tokenLabel: string, toZoneKey: string | null, reason: ReleaseReason = 'move',
  ) => {
    for (const fn of releasersRef.current.values()) fn(tokenId, tokenLabel, toZoneKey, reason);
  }, []);

  return (
    <RoleReleaseContext.Provider value={{ registerReleaser, releaseRolesFor }}>
      {children}
    </RoleReleaseContext.Provider>
  );
}

const NOOP: RoleReleaseContextValue = {
  registerReleaser: () => () => {},
  releaseRolesFor:  () => {},
};

/** Provider 밖에서도 안전하다 — 그 경우 아무 일도 하지 않는다 */
export function useRoleRelease(): RoleReleaseContextValue {
  return useContext(RoleReleaseContext) ?? NOOP;
}
