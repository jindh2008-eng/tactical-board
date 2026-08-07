# TODO_ROADMAP.md — 작업 목록 및 주의사항

> 최종 업데이트: 2026-05-05

> 문서 역할: 과거 작업 목록 보존용. 현재 제품 우선순위는 [`PROJECT_PLAN.md`](./PROJECT_PLAN.md), 기술 안정화와 반복 장애는 [`TECHNICAL_IMPROVEMENT_PLAN.md`](./TECHNICAL_IMPROVEMENT_PLAN.md)를 기준으로 관리한다.

---

## 1. 현재 불안정하거나 확인이 필요한 부분

### 구조적 주의사항

**EventProvider가 TokenProvider 바깥에 위치**  
→ `EventContext` 내부에서 `useTokens()` 직접 사용 불가.  
→ 이벤트 로그는 `EventLayer`(TokenProvider 안쪽)에서 우회 처리 중.  
→ 향후 이벤트 토큰에 더 복잡한 로그가 필요하면 Provider 순서 조정 필요.

**`replace_all` 편집 시 함수명 오염 주의**  
→ 과거에 `VictimPos → Pos` replace_all 작업 중 `computeInitialVictimPositions` 함수명이 `computeInitialPositions`으로 변경된 사례 있음.  
→ 타입명이 다른 식별자의 substring인 경우 replace_all 사용 금지.

### 버그 가능성

| 항목 | 내용 | 파일 |
|------|------|------|
| 연기 초기화 중복 로그 | `setupKey` 변경 시 `prevSmokeLevelRef`로 방지 중이나, StrictMode 이중 실행 시 엣지케이스 가능 | `BuildingStateContext.tsx` |
| 도착 타이머 이중 등록 | `timersStartedRef`로 방지 중이나, `started` 토글 반복 시 가능성 | `TokenContext.tsx` |
| 피해자 구역 검증 | 층수 변경 시 존재하지 않는 구역의 피해자는 pool로 이동. 타이밍 이슈 가능 | `VictimContext.tsx` |
| 다중 화점층 연기 | `stairSmokeFloor = Math.min(...)` 이므로 두 층 이상 화점이 되면 가장 낮은 층 기준으로만 연기 계산 | `BuildingStateContext.tsx` |
| 세션 저장 디바운스 | 500ms 디바운스 중 앱 강제 종료 시 마지막 상태 유실 가능 | `TokenContext.tsx`, `VictimContext.tsx` |

### 복잡해진 데이터 구조

| 항목 | 설명 |
|------|------|
| `DispatchRosterItem` | `arrivalSec`(시간 기반)과 `arrivalOrder`(순서 기반) 두 필드가 공존. 한 훈련에서는 하나만 유효 |
| `VictimToken.originDisplayBottom` | 최초 배치 위치의 스냅샷. 이동 후에도 유지되어 혼동 가능 |
| `BuildingSettings.fireStatus` | 설정창의 "초기 화재상태"와 훈련창의 실제 화재상태가 별도 관리됨 |
| `TokenSessionState.arrivalTargetAt` | 절대 ms 타임스탬프. 구버전 `arrivalCountdowns + savedAt` 마이그레이션 코드 공존 |

---

## 2. 우선순위별 작업 목록

### 🔴 우선순위 높음

- [ ] **훈련 분석 통계 구현** (`AnalysisModal.tsx`)  
  현재 UI 스텁만 존재. 구조대상자 구조 수, 부서 현황, 화재 진행 타임라인 등 실제 통계 계산 필요.

- [ ] **에러 바운더리 추가**  
  현재 어떤 컴포넌트에서도 에러 바운더리 없음. 런타임 에러 시 전체 화면 크래시. 최소한 PlayPage 수준에서 `<ErrorBoundary>` 추가 필요.

- [ ] **계단실 연기 농도 연속 변화 (타이머 기반)**  
  현재 0/50/100 세 단계. 설계상 `smokeConcentration`을 점진적으로 변화시키는 타이머를 추가하면 기존 렌더링 레이어 수정 없이 중간 단계 표현 가능.

### 🟡 우선순위 중간

- [ ] **지휘방침 UI**  
  `CommandStrategy` ('공격'|'방어'), `CommandMethod` ('고정'|'전진'|'이동') 타입이 정의돼 있으나 UI 없음. 상단 Navbar 또는 별도 패널에 표시.

- [ ] **다중 화점층 지원**  
  현재 화점층은 1개만 가정. 건물 내 여러 층에 화재상태를 설정하는 것은 가능하나, 연기 계산이 최저 화점층 기준으로만 동작.

- [ ] **이벤트 토큰 위치 정보**  
  현재 이벤트 토큰은 x/y 좌표만 있고 층/구역 정보가 없음. 토큰 배치 시 어느 층에 있는지 자동 감지하거나, 사용자가 층을 지정할 수 있게 개선.

- [ ] **로그 패널 자동 스크롤**  
  새 로그 항목 추가 시 최신 항목으로 자동 스크롤 (`scroll-behavior: smooth` 주석 처리된 상태).

- [ ] **TokenContextMenu.tsx 정리**  
  현재 `UnitStatusBarMenu`로 대체됐으나 파일이 남아있음. 실제 사용 여부 확인 후 제거.

### 🟢 우선순위 낮음 (나중에 해도 되는 작업)

- [ ] **모바일 반응형**  
  현재 데스크탑 전용. 태블릿 수준의 반응형 레이아웃 추가.

- [ ] **테스트 코드**  
  핵심 로직 단위 테스트: BuildingStateContext 연기 계산, dispatchRoster 생성, victimPlacement 좌표 계산.

- [ ] **코너 작전구역 (CornerFace)**  
  `CornerFace = 'AB'|'BC'|'CD'|'AD'` 타입만 정의됨. 두 방면이 만나는 코너에 차량 배치 표시 기능.

- [ ] **배지 프리셋 직접입력 저장**  
  임시 직접입력 배지는 token.badges에만 저장되고 프리셋으로 승격 불가. 저장 기능 추가.

- [ ] **훈련 재개 기능**  
  `ended` 상태에서 이어서 시작할 수 있는 UI. 현재 종료 후 재시작은 "훈련 세팅"으로만 가능 (전체 초기화).

---

## 3. 개발 시 주의사항

### 수정하면 안 되는 핵심 구조

| 구조 | 이유 |
|------|------|
| `runKey` 기반 Provider 재마운트 | 훈련 세팅 초기화의 핵심 메커니즘. `key={runKey}` 제거 시 세션 복원이 꼬임 |
| `arrivalTargetAt` 절대 타임스탬프 | 상대 초(`arrivalCountdowns`) 방식으로 돌아가면 페이지 새로고침 후 시간 계산 오류 |
| `prevSmokeLevelRef` 초기화 순서 | `setupKey` effect에서 `prevSmokeLevelRef.current`를 먼저 최신화 후 상태 세팅해야 초기화 로그 방지 |
| `sessionStorage` 키 이름 | 변경 시 기존 사용자 세션 데이터 유실. 변경 필요 시 마이그레이션 코드 추가 |
| `generateId()` 위치 | `settingsStorage.ts`에서 export. 다른 파일에서 재정의하지 말 것 |

### 새 기능 추가 전 확인 사항

**새 LogType 추가 시:**
1. `types/index.ts` → `LogType` 유니온에 추가
2. `LogPanel.tsx` → `LogEntryRow` 분기 추가
3. `LogPanel.css` → 스타일 추가
4. `exportLog.ts` → `LOG_TYPE_LABELS` + `entryContent()` 추가

**새 Context 추가 시:**
1. PlayPage Provider 중첩 순서 결정 (내부 Context가 외부 Context 사용 불가)
2. sessionStorage 키 추가 (`runtimeSession.ts`)
3. `clearRuntimeSession()` 초기화 대상에 추가

**새 설정 필드 추가 시:**
1. `types/settings.ts` 인터페이스 추가
2. `settingsStore.tsx` 상태 추가 (초기값 포함)
3. `settingsStorage.ts` `loadSettings()` 마이그레이션 처리 (optional로 선언하고 기본값 fallback)
4. `settingsStorage.ts` `saveSettings()` 포함 여부 확인

**BuildingStateContext 연기 로직 수정 시:**
- `setDoorState()`, `setFireStatus()`, `setupKey effect`, `computeSmokeFromStates()` 네 곳이 상호작용
- `prevSmokeLevelRef`와 `globalSmokeLevel` 파생 순서 유지 필수

### 기존 기능 충돌 방지

- **토큰 ID 충돌 방지**: `generateId()`는 `Date.now() + random` 방식. 동일 ms에 다수 생성 시 이론적 충돌 가능. 대량 생성 로직에서는 카운터 기반 ID 사용 권장.
- **드래그 이벤트 전파**: `ZoneCell`, `ExteriorZone`, `EventLayer`가 모두 드래그 이벤트를 처리. 새 드롭 영역 추가 시 `e.stopPropagation()` 누락 주의.
- **ActionMode 단일성**: 동시에 하나의 ActionMode만 활성. 새 모드 추가 시 `ActionModeState` 유니온에 추가하고, 기존 모드와 충돌하지 않게 ESC 처리 확인.
