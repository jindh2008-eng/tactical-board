# 전체 코드 안정성 점검 — 실전 배포 전 오류 위험 지점 리포트

> 문서 상태: 점검 완료 + 1차 수정 반영 v1.1
> 작성 기준일: 2026-08-07 (점검) / 2026-08-07 (1차 수정)
> **1차 수정 결과는 5장 참조** — 1장의 4개 항목 전부 수정 및 브라우저 실증 완료
> 관련 문서: [`TECHNICAL_IMPROVEMENT_PLAN.md`](./TECHNICAL_IMPROVEMENT_PLAN.md)
> 점검 범위: `src/` 전체 — 저장소 계층, Context 상태 계층, 컴포넌트 계층, 설정 화면
> 방법: 4개 영역 병렬 조사 후 최상위 발견은 코드 직접 재확인(✅ 표시)

## 0. 가장 중요한 구조적 사실

**앱 전체에 React Error Boundary가 하나도 없다.** (`componentDidCatch`/`getDerivedStateFromError`/`ErrorBoundary` 검색 결과 0건, 직접 확인 완료)

이게 왜 중요하냐면 — 아래 나열된 개별 버그들은 각각 발생 빈도가 낮거나 조건이 특수하지만, Error Boundary가 없으면 **그중 어느 하나라도 렌더링 중 예외를 던지는 순간 훈련창 전체가 흰 화면으로 날아간다.** 다른 부분은 멀쩡한데 화면 전체가 죽는다. 개별 버그 수정 못지않게, **Error Boundary 도입 자체가 "치명적 오류"의 파급 범위를 훈련창 전체에서 해당 위젯 하나로 줄여주는 가장 효율 높은 조치**다.

## 1. 확인된 실제 크래시 지점 (코드 직접 검증 완료)

### 1.1 건물 상태 세션 복원 시 무가드 역참조 — 최우선

**파일**: `src/context/BuildingStateContext.tsx:163-173`, `src/utils/runtimeSession.ts:203-209`, `src/components/building/ZoneCell.tsx:200-202`

```ts
// runtimeSession.ts — 형태 검증 없이 그대로 캐스팅
export function loadBuildingSession(): BuildingSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY_BUILDING);
    if (!raw) return null;
    return JSON.parse(raw) as BuildingSessionState;   // ← 형태 검증 없음
  } catch { return null; }
}

// BuildingStateContext.tsx — 필드별 폴백 없이 그대로 대입
const [init] = useState(() => {
  const saved = loadBuildingSession();
  if (saved) {
    return {
      doorStates:      saved.doorStates,      // ← undefined일 수 있음
      fireStates:      saved.fireStates,
      firePercentages: saved.firePercentages,
      ...
    };
  }
  ...
});

// ZoneCell.tsx — 렌더링 중 바로 인덱싱
const doorState = doorStates[floorId] ?? (...);   // doorStates가 undefined면 여기서 TypeError
```

**발생 조건**: `sessionStorage`에 `KEY_BUILDING` 항목은 있지만 `doorStates`/`fireStates`/`firePercentages` 중 하나라도 빠진 채로 저장돼 있는 경우. 다른 `load*Session()` 함수들(`loadTokenSession`, `loadVictimSession`, `loadWaterConnSession`, `loadHydrantSession`)은 핵심 필드 타입을 검증(`Array.isArray` 등)하고 실패 시 `null`을 반환하는데, **`loadBuildingSession`만 이 검증이 빠져 있음**을 확인했다. 실전에서 가장 현실적인 트리거는 **버전 업데이트 후 훈련 중 새로고침** — 이 앱은 "새로고침 후 복구"를 의도된 기능으로 갖고 있어서(같은 탭에서 훈련 중 새로고침하는 것 자체가 정상 사용 시나리오), 배포 버전이 바뀌어 `BuildingSessionState`의 필드가 하나라도 추가/변경되면 이전 세션의 `sessionStorage` 데이터가 새 코드 기준으로 "형태가 안 맞는" 상태가 되어 마운트 즉시 크래시로 이어진다.

### 1.2 구조대상자 인명검색 세션 복원도 동일 패턴

**파일**: `src/context/VictimContext.tsx:230-239`

```ts
const [activeSearches, setActiveSearches] = useState(() => {
  const session = loadVictimSearchSession();
  if (!session) return {};
  const restored = {};
  for (const [fid, rec] of Object.entries(session.activeSearches as Record<string, FloorSearchRecord>)) {
    // session은 truthy인데 session.activeSearches가 없으면
    // Object.entries(undefined) → TypeError, 마운트 즉시 크래시
    restored[fid] = { ...rec, units: [] };
  }
  return restored;
});
```

1.1과 같은 근본 원인(`loadVictimSearchSession`도 형태 검증 없이 캐스팅)의 자매 버그.

### 1.3 설정 불러오기 시 `building` 필드 누락으로 즉시 크래시

**파일**: `src/store/settingsStore.tsx:530-538`

```ts
const loadSettings = useCallback((id: string) => {
  const set = settingsList.find(s => s.id === id);
  if (!set) return;
  const b = JSON.parse(JSON.stringify(set.building)) as BuildingSettings;   // ← 가드 없음
  setConfig(b.config);
  ...
  setTiming(set.timing ? JSON.parse(JSON.stringify(set.timing)) : DEFAULT_TIMING);        // timing은 가드 있음
  const rawSetup = set.dispatchSetup ? JSON.parse(...) : DEFAULT_DISPATCH_SETUP;           // dispatchSetup도 가드 있음
```

**바로 옆 형제 필드들(`timing`, `dispatchSetup`, `dispatchRoster`)은 전부 `set.xxx ? ... : 기본값` 삼항 가드가 있는데 `building`만 빠져 있다** — 일관성이 깨진 지점이라 실수로 보인다. `set.building`이 `undefined`면 `JSON.stringify(undefined)`가 문자열 `"undefined"`가 아니라 **진짜 `undefined` 값**을 반환하고, `JSON.parse(undefined)`는 `SyntaxError: Unexpected token 'u', "undefined" is not valid JSON`을 던진다.

**발생 조건**: 설정 내보내기/가져오기(`SettingsLibraryPanel`)로 만든 `.json` 파일을 손으로 편집했거나, 구버전에서 내보낸 파일을 새 버전에서 가져왔는데 그 파일의 특정 저장 항목에 `building` 키가 없는 경우. `importSettings()`(`settingsStorage.ts`)는 파일 전체의 `version`/`settingsList` 배열 여부만 확인하고 **개별 저장 항목의 내부 구조는 검증하지 않으므로**, 손상된 파일이 `localStorage`까지는 무사히 들어갔다가 사용자가 그 항목을 "불러오기" 클릭하는 순간 터진다.

### 1.4 토큰 ID 충돌 위험 (이전 세션에서도 별도 플래그됨)

**파일**: `src/context/TokenContext.tsx:481`

```ts
id: `${baseKey}-${Date.now()}`,   // 랜덤 접미사 없음
```

`Date.now()`는 1ms 해상도라, 출동대 생성 버튼을 빠르게 연타하거나 프로그램적으로 연속 생성하면 **동일 밀리초에 같은 ID가 생성될 수 있다.** 이후 `moveToken`/`rescueUnit`/`removeToken`/`addBadge` 등 모든 조회가 `tokens.find(t => t.id === tokenId)` 기반이라, 두 토큰이 같은 ID를 공유하면 하나를 옮기거나 지울 때 **둘 다 같이 움직이거나 같이 삭제되는** 조용한 데이터 오염이 발생한다(즉시 크래시는 아니지만 훈련 중 눈에 보이는 상태 불일치). 로그 ID(`log-${Date.now()}-${Math.random()...}`)나 다른 컨텍스트의 ID 생성은 전부 랜덤 접미사가 있는데 이 지점만 빠져 있다.

## 2. 낮은 우선순위 — 확인은 됐지만 즉시 크래시는 아님

| 위치 | 내용 | 심각도 |
|---|---|---|
| `src/context/UIOverlayContext.tsx:11` | `useUIOverlay()`가 다른 모든 컨텍스트 훅과 달리 `if (!ctx) throw` 가드 없이 `null!`로 타입만 속임. 현재는 모든 소비 컴포넌트가 Provider 안에 있어 안 터지지만, 향후 포털/신규 라우트로 Provider 밖에서 쓰이면 즉시 크래시 | 낮음(현재 미발생, 구조적 지뢰) |
| `src/context/TokenContext.tsx:864-871` | `removeToken`이 이동/도착 카운트다운 타이머는 정리 안 함(구조 완료 타이머만 정리). 삭제된 토큰에 걸린 타이머가 나중에 발화해도 크래시는 안 나지만 메모리·타이머 누수 | 낮음(누수, 크래시 아님) |
| `src/store/settingsStore.tsx:547-551` | 로스터 마이그레이션이 `arrivalOrder`만 보정하고 `arrivalSec` 등은 안 함 — 누락 시 `NaN` 카운트다운으로 표시(크래시 아니라 데이터 오류) | 낮음(UI 이상, 크래시 아님) |
| `src/utils/settingsStorage.ts::importSettings` | 파일 전체 구조만 얕게 검증, 개별 저장 항목 내부는 검증 안 함 — 1.3의 근본 원인 | 위 1.3과 연결 |
| `src/components/building/ExteriorZone.tsx:160`, `BFaceWithStandby.tsx:30` | `zones.find(z => z.category==='face')!` — 정적 설정 데이터 기반이라 현재는 안전하지만, 해당 설정 파일이 바뀌면 터질 수 있는 잠재 지뢰 | 매우 낮음 |

## 3. 점검했지만 안전하다고 확인된 영역 (참고용)

아래는 이번 점검에서 특별히 의심했지만 **실제로는 방어적으로 잘 짜여 있음**을 확인한 부분들이다. 전체적인 코드 품질 신뢰도 참고용으로 남긴다.

- **드래그앤드롭 좌표 파싱**(`dragDrop.ts`, `ZoneCell`/`ExteriorZone`/`BFaceWithStandby`/`ImminentStandby`/`StandbyColumn`) — `parseFloat(...) || 기본값` 폴백, 빈 문자열 명시적 체크. NaN 전파 없음.
- **DOM 조회 결과**(`document.getElementById`/`querySelector` — `SprayTargetOverlay` 등 `PlayPage.tsx`의 오버레이들, `EventTokenCard`, `ZoneCell`) — 전부 옵셔널 체이닝 + null 체크 후 조기 반환.
- **컨텍스트 배열에서 `.find()`한 결과 사용**(`TokenCard`, `VictimCard`, `EventTokenCard`, `UnitStatusBarMenu`, `VictimContextBarMenu`, `HydrantBarMenu` 등) — 전부 null 체크 있음.
- **바/컨텍스트 메뉴가 참조하는 토큰/피해자** — ID로 다시 조회하는 방식이 아니라 부모로부터 prop으로 받는 방식이라, 원본이 삭제되면 메뉴도 같이 언마운트됨(stale ID 재조회로 인한 크래시 경로 없음).
- **타이머 콜백의 지연 조회**(`TokenContext.tsx`의 착대 자동이동, 구조 완료 타이머) — 발화 시점에 `tokensRef.current.find(...)`로 다시 조회하고 없으면 조기 반환. 댕글링 레퍼런스 크래시 없음.
- **나눗셈/퍼센트 계산**(`WaterLevelContext`, `VictimContext`의 인명검색 점수 배분, `EventTokenCard`의 폰트 크기 계산) — 분모 0 여부를 먼저 체크하는 가드가 일관되게 있음.
- **설정 화면 숫자 입력**(`BuildingConfigPanel`, `HydrantSetupPanel`, `DispatchSetupPanel`, 타이밍 입력 등) — 거의 전부 `Math.max(최소값, parseInt(...) || 기본값)` 패턴이라 트레이너가 숫자 필드를 지우거나 이상한 값을 입력해도 크래시 없이 클램프됨.
- **`npx tsc --noEmit -p tsconfig.app.json`** — 현재 워킹 트리 기준 **에러 0건, 클린 통과**. 타입 레벨의 잠재 위험은 없음.

## 4. 권장 우선순위 (수정은 나중에 진행 — 참고용 순서 제안)

실전 배포 전 손대야 할 것을 임팩트·확실성 기준으로 줄 세우면:

1. **전역 Error Boundary 도입** — 개별 버그 하나하나보다 파급 범위 축소 효과가 가장 큼. `TECHNICAL_IMPROVEMENT_PLAN.md` 5장 백로그에 이미 있는 항목("전역 Error Boundary와 사용자 오류 안내 추가")과 동일 — 이번 점검으로 우선순위를 다시 확인한 셈.
2. **1.1 / 1.2 세션 복원 무가드 역참조** — 다른 `load*Session()` 함수들이 이미 쓰고 있는 "핵심 필드 타입 검증 후 불일치 시 `null` 반환" 패턴을 `loadBuildingSession`/`loadVictimSearchSession`에도 동일 적용하면 해결. 기존 코드에 이미 있는 패턴을 두 곳에 마저 적용하는 수준이라 리스크 낮은 수정.
3. **1.3 `loadSettings()`의 `building` 가드 누락** — 바로 옆 줄의 `timing`/`dispatchSetup`과 동일한 삼항 가드 패턴을 추가하면 됨. 한 줄 수준의 수정.
4. **1.4 토큰 ID 랜덤 접미사 추가** — 로그 ID 생성 방식과 동일하게 맞추면 됨.
5. 나머지 2절 항목들은 급하지 않으나, Error Boundary 도입과 별개로 언젠가 정리하면 좋음.

## 5. 1차 수정 완료 기록 (2026-08-07)

"현재 구현된 기능을 변경하지 않는 범위"라는 조건에 맞춰, **정상 데이터일 때는 동작이 전혀 바뀌지 않고 비정상 상황에서만 개입하는 방어 코드**만 적용했다. 4장 권장 순서 1~4번을 모두 반영했다.

### 5.1 전역 Error Boundary 도입 ✅

**신규**: `src/components/shared/ErrorBoundary.tsx`, `ErrorBoundary.css`
**변경**: `src/App.tsx`

- `<Routes>`만 감싸고 **상단 nav는 경계 밖에 남겼다** — 오류 발생 후에도 메뉴로 화면 이동이 가능해 복구 경로가 살아있다.
- 폴백 UI: `다시 시도` / `새로고침` / `오류 내용 복사` + 접이식 오류 상세(스택 포함) + 최후 수단 `훈련 세션 초기화 후 새로고침`(confirm 확인 후 실행).
- **라우트 변경 시 오류 상태 자동 해제** — 검증 중 "오류 화면에서 메뉴로 이동해도 오류 화면이 그대로 남는" 문제를 발견해 `resetKey`(현재 경로) 방식으로 보완했다. `useLocation` 구독은 별도 래퍼 컴포넌트(`RouteErrorBoundary`)로 분리해 기존 `AppShell`의 `memo` 최적화에 영향을 주지 않도록 했다.

**실증**: 손상된 토큰(`badges: null`)을 세션에 주입해 실제 렌더 예외를 발생시킨 결과 — 수정 전이라면 흰 화면이었을 상황에서 폴백 UI가 표시되고(`TypeError: Cannot read properties of null (reading 'length')` 메시지 노출), **nav가 생존**했으며, 메뉴로 설정 화면 이동 시 오류 상태가 자동 해제되고 정상 렌더됨을 확인.

### 5.2 세션 복원 형태 검증 추가 ✅

**변경**: `src/utils/runtimeSession.ts`

- 공용 헬퍼 `isPlainRecord()` 추가.
- `loadBuildingSession()` — `doorStates`/`fireStates`/`firePercentages`가 객체가 아니면 `null` 반환 → 설정값 기반 초기화로 폴백.
- `loadVictimSearchSession()` — `activeSearches`가 객체가 아니면 `null` 반환, `discoveredVictimIds`가 배열이 아니면 빈 배열로 보정.
- 기존 `loadTokenSession`/`loadVictimSession`이 이미 쓰던 "핵심 필드 타입 검증 후 불일치 시 `null`" 패턴과 동일하게 맞췄다.

**실증**: `doorStates`를 제거한 건물 세션, `activeSearches`를 제거한 인명검색 세션을 각각 주입 후 `/play` 진입 → 두 경우 모두 크래시 없이 정상 렌더(구역 셀 20개) 확인.

### 5.3 `loadSettings()`의 `building` 가드 추가 ✅

**변경**: `src/store/settingsStore.tsx`

- 바로 옆 형제 필드(`timing`, `dispatchSetup`)와 동일한 존재 확인 패턴을 적용해 `JSON.parse(undefined)` 예외를 차단.
- `building`이 없으면 현재 값을 유지하고, 있으면 내부 필드도 각각 기본값으로 폴백(`config ?? DEFAULT_BUILDING_CONFIG` 등 — 151행의 기존 폴백 패턴과 동일).

### 5.4 토큰 ID 충돌 방지 ✅

**변경**: `src/context/TokenContext.tsx`

- `${baseKey}-${Date.now()}` → `${baseKey}-${Date.now()}-${랜덤4자}` (로그 ID 생성 방식과 동일).
- **사전 확인**: 토큰 ID를 파싱하는 코드가 전무하고(전체 검색), 카운터 복원은 `token.label` 기반(`computeCountersFromTokens`)이라 ID 형식 변경이 기존 세션 데이터와 무관함을 검증한 뒤 적용.

**실증**: 같은 tick에 토큰 3개 연속 생성 → 2·3번째가 **동일 밀리초**(`...697030`)에 생성됐음에도 랜덤 접미사로 ID가 구분됨(`-baco`, `-15gg`)을 확인. 수정 전이라면 충돌했을 상황.

### 5.5 검증 요약

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | 통과 (에러 0) |
| `npm run build` (프로덕션 빌드) | **성공** — 청크 크기 권고 경고만 있고 오류 없음 |
| 정상 상태 `/play` 렌더 | 정상 (전술판·우측 패널·체크리스트 모두 렌더, 콘솔 오류 0) |
| 손상 세션 3종 주입 테스트 | 전부 크래시 없이 폴백 또는 경계 처리 |
| 기존 기능 동작 변화 | 없음 (정상 데이터 경로는 코드 변경 없음) |

### 5.6 수정 중 새로 발견된 잔여 위험

**`loadTokenSession()`은 `tokens`가 배열인지만 검증하고 개별 토큰의 내부 형태는 검증하지 않는다.** (5.1의 크래시 테스트에 이 경로를 이용했다.) 즉 `badges`/`missionTags` 등이 `null`인 토큰이 세션에 들어가면 `TokenCard` 렌더에서 예외가 난다. 동일한 한계가 `loadVictimSession`(victims 내부 형태), `loadEventSession` 등에도 있다.

현재는 **Error Boundary가 이 경우를 잡아 흰 화면은 막아주지만**, 근본 해결(항목별 형태 검증 또는 렌더 측 방어)은 하지 않았다. 실제로 이런 데이터가 만들어지려면 앱 자체의 저장 로직이 깨지거나 외부에서 세션을 조작해야 하므로 정상 사용 중 발생 가능성은 낮다고 판단해 이번 범위에서 제외했다 — 2장의 나머지 항목들과 함께 후속 과제로 남긴다.

### 5.7 이번에 손대지 않은 항목 (후속 과제)

2장의 낮은 우선순위 항목은 그대로 남아 있다: `UIOverlayContext`의 `null!` 가드, `removeToken`의 이동·도착 타이머 미정리(누수), 로스터 마이그레이션의 `arrivalSec` 등 미보정, `importSettings`의 얕은 검증, `ExteriorZone`/`BFaceWithStandby`의 `find()!`. 모두 정상 사용 중 크래시로 이어지지 않음을 확인했고, Error Boundary 도입으로 최악의 경우에도 화면 전체가 날아가지는 않는다.
