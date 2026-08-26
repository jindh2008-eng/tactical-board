# PROJECT_OVERVIEW.md — 전술상황판 프로젝트 개요

> 최종 갱신: 2026-08-26 · **코드를 읽어 다시 쓴 것이다**(이전 판은 2026-05-05 기준이라 화면 구성부터 달랐다)
> 스택: React 19 + TypeScript + Vite 8 + react-router-dom v7 · 소스 145파일 / 약 28,800행

---

## 1. 무엇을 하는 프로그램인가

**소방 지휘 훈련용 전자 상황판**이다. 훈련 진행자가 화재 현장을 화면에 세워 놓고, 출동대·차량·구조대상자·현장요소를 배치하며, 건물 상태(화재·연기·방화문)를 바꿔 가며 훈련을 운영한다. 모든 조작은 로그로 남아 훈련 후 복기에 쓴다.

종이·화이트보드로 하던 것을 대체하는 것이 목적이다.

---

## 2. 네 모드 — 이 프로젝트를 이해하는 축

라우트는 **둘뿐**이지만(`src/App.tsx`), 설계상 화면은 **넷**이다. 라우트 수와 모드 수가 다르다는 점이 이 코드베이스에서 가장 자주 오해받는 부분이다.

| 모드 | 실체 | 상태 |
|---|---|---|
| **설정모드** | `/settings` | 운영 중 |
| **훈련모드(무플)** | `/play` | 운영 중 — **현재 작업 범위** |
| **훈련모드(지휘)** | 미구현 (지휘교수 태블릿) | [MASTER_PLAN.md](MASTER_PLAN.md) §7.1 |
| **분석(창)** | `/play` 안의 모달 | 사실상 스텁 (P-6) |

범위 경계는 [MASTER_PLAN.md](MASTER_PLAN.md) D-4가 정한다. **작업 중 범위 밖을 고쳐야 할 일이 생기면 고치지 말고 [DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md) §3에 적는다.**

---

## 3. 저장소 이원 구조

```
설정모드 /settings          훈련모드 /play
  localStorage      ──┐       sessionStorage
  영구                │         탭 생명주기
  자유 편집           │         설정은 읽기 전용
                      │
              [훈련 세팅] 버튼
       sessionStorage 를 비우고 설정값을 적용한다
```

두 저장소가 만나는 곳은 **`훈련 세팅` 버튼 하나뿐이다.** 설정을 고쳐도 훈련 화면에 자동으로 반영되지 않는다.

- `src/utils/settingsStorage.ts` — localStorage 단일 창구. 키 6종.
- `src/utils/runtimeSession.ts` — sessionStorage 단일 창구. `tactical-board.runtime.*` 키 13종.

자세한 것은 [DATA_FLOW.md](DATA_FLOW.md).

---

## 4. 설정모드 `/settings`

시나리오를 만드는 곳. **시나리오별 설정**과 **전체 설정**으로 나뉜다 — 전자는 파일로 저장·공유되고, 후자는 모든 훈련에 공통으로 걸린다.

| 구분 | 화면 | 하는 일 |
|---|---|---|
| 시나리오 | 건물 · 소방시설 | 층수 · 화점 · 화재상태 · 소방시설 · 구역 비율 + 미리보기 |
| 시나리오 | 현장요소 | 위험물·장애물 토큰 정의(종류별 세부 상태 포함) |
| 시나리오 | 구조대상자 | 성별 · 나이 · 상태 · 위치(면 **또는** 층, 배타) |
| 시나리오 | 출동대 | 부대·차량 편성, 착대 순서(드래그), 도착 방식 |
| 시나리오 | 시나리오 예측 | `ScenarioModal` — §10이 UI 재설계 범위 밖으로 뺀 화면 |
| 전체 | 지휘절차 | 등급별(초·중·고) 절차 카테고리·항목 |
| 전체 | 상태 메시지 | 출동대 상태 메시지 프리셋 |
| 전체 | 임무 · 상태 프리셋 | 배지 프리셋 |

**체크리스트(시나리오 작성)는 화면이 아니라 우측 상주 레일이다.** 어느 화면에 있든 계속 떠 있어서, 건물·출동대를 보면서 시나리오를 쓸 수 있다. 화면을 옮겨도 스크롤 위치가 유지된다.

설정모드는 **스테이지(고정 캔버스)를 쓰지 않는다.** 폼과 표라서 리플로우 3단으로 간다 — [SCREEN_STAGE_PLAN.md](SCREEN_STAGE_PLAN.md) §5.

---

## 5. 훈련모드(무플) `/play`

```
┌──────────────────────────────────────────────────────────┐
│ 상단 nav — 대상명 · 타이머 · 훈련 세팅 / 시작 / 종료      │
├───────────────┬──────────────────────────┬───────────────┤
│ OperationPanel│  TacticalArea            │ RightPanel    │
│ ResourcePanel │  · A~D면 외곽 작전구역   │ · CommandInfo │
│ UnitAddPanel  │  · 층별 구역 · 계단실    │ · 지휘절차    │
│ UnitInfoPanel │  · 소화전 · 이벤트 토큰  │ · 이벤트 로그 │
│               │  · 송수·방수 오버레이    │               │
└───────────────┴──────────────────────────┴───────────────┘
                    전체가 StageRoot 안에 있다
```

**배율은 `StageRoot` 한 곳에서만 건다.** 고정 논리 캔버스에 그리고 뷰포트에 맞춰 `transform: scale()`을 한 번 적용한다. 안쪽은 전부 px로 그려도 되고, 그 px들이 서로 어긋날 방법이 없다. `--ui-scale`은 제거됐다 — 근거는 [SCREEN_STAGE_PLAN.md](SCREEN_STAGE_PLAN.md) §2.1.

**진행상황 관리(체크리스트)는 이 화면에 렌더되지 않는다.** D-5로 빠졌고 지휘절차는 우측 `CommandProcedureTrainingBox`가 대신한다. `ChecklistPanel`·`ChecklistDrawer`는 지휘 화면용으로 남겨 둔 것이다.

---

## 6. 폴더 구조

```
src/
├── types/          도메인 타입 (index · victim · events · settings · presets)
├── context/        런타임 상태 20종 — TokenContext 가 핵심
├── store/          settingsStore.tsx — 설정모드 전역 상태
├── utils/          settingsStorage · runtimeSession · dispatchRoster · dragDrop …
├── hooks/          useTouchDrag 등
├── pages/          SettingsPage · PlayPage
└── components/
    ├── stage/      StageRoot · canvas.ts   ← 훈련창 배율의 단일 지점
    ├── building/   TacticalArea 계열 18
    ├── left/       좌측 패널 7
    ├── right/      우측 패널 4
    ├── center/     2
    ├── events/     이벤트 토큰 2
    ├── panels/     ChecklistView/Panel 계열 4 (현재 무플에 미렌더)
    ├── overlays/   모달 5
    ├── overlay/    보드 위 오버레이 3
    ├── settings/   설정 패널 9 + ui/ 공용 컴포넌트
    ├── shared/     토큰 카드 등 17
    ├── drawing/    1
    └── dev/        1
```

---

## 7. 코드베이스 관례 — 모르면 다치는 것들

**Provider 중첩 순서에 의미가 있다.** `EventProvider`가 `TokenProvider` 바깥이라 `EventContext` 안에서 `useTokens()`를 쓸 수 없다. 전체 순서는 [DATA_FLOW.md](DATA_FLOW.md) §4.

**`runKey`가 바뀌면 Provider가 재마운트되어 런타임 상태가 통째로 리셋된다.** 상태 초기화 로직을 따로 쓰지 않는 것이 이 코드베이스의 방식이다.

**좌표는 전부 0~1 정규화다.** 출동대·구조대상자는 구역 대비, 이벤트 토큰은 보드 대비. px로 저장하면 안 된다.

**Context 경계를 넘는 호출은 register/call 패턴을 쓴다** (`FireCommandContext`, `ChecklistCommandContext`).

**앱에는 테스트가 없다.** 검증은 브라우저에서 직접 한다. `npm run test:chatgpt-summary`는 스크립트 전용이고 앱과 무관하다.

---

## 8. 문서 지도

| 문서 | 성격 |
|---|---|
| [MASTER_PLAN.md](MASTER_PLAN.md) | ★ **작업 순서의 단일 출처.** 다른 문서와 어긋나면 이쪽. **다음에 할 일은 §7-A** |
| [DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md) | ★ 범위 밖 파급 기록부 (P-n) |
| [DATA_FLOW.md](DATA_FLOW.md) | 저장소·Provider·데이터 흐름 |
| [FEATURE_STATUS.md](FEATURE_STATUS.md) | 기능별 구현 상태 (네 모드 기준) |
| [SCREEN_STAGE_PLAN.md](SCREEN_STAGE_PLAN.md) | 화면 배율 설계 근거·실측 |
| [SETTINGS_MODE_UI_PLAN.md](SETTINGS_MODE_UI_PLAN.md) | 설정모드 UI 재설계 |
| [DUAL_SCREEN_SYNC_PLAN.md](DUAL_SCREEN_SYNC_PLAN.md) | 화면 분리 설계 근거 |

완료됐거나 대체된 계획서는 각 문서 머리에 그렇게 적어 두었다.
