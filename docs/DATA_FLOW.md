# DATA_FLOW.md — 저장소와 데이터 흐름

> 최종 갱신: 2026-09-15 · **코드를 읽어 맞춘 것이다**(2026-08-26 판에서 저장 키 13→15종, Provider 5종 추가, 저장 실패 경고, 이벤트 로그 절을 반영)
> 여기 적힌 목록·순서·개수는 전부 실측이다. 코드를 바꾸면 여기도 바꾼다.

---

## 1. 두 저장소

```
        설정모드 /settings                    훈련모드 /play
  ┌──────────────────────────┐        ┌──────────────────────────┐
  │  localStorage            │        │  sessionStorage          │
  │  키 6종                  │        │  키 15종                 │
  │  영구 · 자유 편집        │        │  탭 생명주기 · 읽기 전용 │
  └───────────┬──────────────┘        └──────────▲───────────────┘
              │                                  │
              └────────── [훈련 세팅] ───────────┘
                 sessionStorage 를 비우고 설정을 적용한다
```

**두 저장소가 만나는 곳은 `훈련 세팅` 버튼 하나뿐이다.** 설정모드에서 값을 바꿔도 훈련 화면에 자동으로 반영되지 않는다 — 이 점이 자주 오해된다.

각 저장소에는 **단일 창구 모듈**이 있다. 다른 곳에서 `localStorage`/`sessionStorage`를 직접 만지지 않는다.

| 저장소 | 창구 |
|---|---|
| localStorage | `src/utils/settingsStorage.ts` |
| sessionStorage | `src/utils/runtimeSession.ts` |

---

## 2. localStorage — 설정모드

| 키 | 내용 |
|---|---|
| `tacticalBoardSettingsList` | 시나리오 세트 목록 (건물·출동대·구조대상자·현장요소·체크리스트) |
| `tacticalBoardWorkingPresets` | 작업 중 프리셋 |
| `tacticalBoardCommandProcedure` | 지휘절차 (등급별) |
| `tacticalBoardActiveCommandProcedureLevel` | 선택된 훈련 표시 레벨 — **시나리오 값이다** |
| `tacticalBoardUnitStatus` | 출동대 상태 메시지 |
| `tacticalBoardTagPresets` | 임무·상태 배지 프리셋 |

### 내보내기 형식

`SettingsExport` 인터페이스가 전체 번들 형식이다.

```
version · exportedAt · settingsList · workingPresets
commandProcedureConfigs · activeCommandProcedureLevel
unitStatusConfig · unitTagPresetConfig
```

시나리오 하나만 내보내는 형식은 따로 있다 — `kind: 'tactical-board.scenario'`. 전체 번들은 **백업**, 단일 시나리오는 **공유**용이다.

---

## 3. sessionStorage — 훈련모드 (15종)

| 키 | 쓰는 Context |
|---|---|
| `…runtime.tokens` | `TokenContext` |
| `…runtime.victims` | `VictimContext` (구조대상자 · 추락 방면 `fellToFace` 포함) |
| `…runtime.victim-search` | `VictimContext` |
| `…runtime.training` | `TrainingContext` |
| `…runtime.events` | `EventContext` |
| `…runtime.building` | `BuildingStateContext` |
| `…runtime.waterconn` | `WaterConnectionContext` |
| `…runtime.hydrant` | `HydrantStateContext` |
| `…runtime.equip-msg` | `HydrantStateContext` |
| `…runtime.waterlevels` | `WaterLevelContext` |
| `…runtime.checklist` | `ChecklistProgressContext` |
| `…runtime.logs` | `LogContext` |
| `…runtime.posts` | `MedicalPostContext` 가 쓴다(읽기: `ResourceStatusContext`) — 임시의료소 설치·소장, 자원대기소 지정, **대기1단계 운영·잠금** |
| `…runtime.unit-commander` | `UnitCommanderContext` — 층별 단위지휘관과 소속대 |
| `…runtime.hydrant-circulation` | `HydrantCirculationContext` — 소화전 순환보수 줄 |

**새 런타임 상태를 영속화할 때는 반드시 `runtimeSession.ts`에 `save*`/`load*` 쌍을 추가하고 `clearRuntimeSession()` 에도 넣는다.**
빠뜨리면 지난 훈련의 상태가 새 훈련까지 살아남는다(`equip-msg` 가 그랬다, 2026-09-09 해소).

> ⚠ 하이픈이 든 키가 넷 있다(`equip-msg` · `victim-search` · `unit-commander` · `hydrant-circulation`). 키를 정규식으로 세는 스크립트가 `[a-z]+`만 쓰면 이들을 빠뜨린다 — 오래도록 "11종"으로 잘못 적혀 있었다.

### 저장 실패는 경고로 올라온다

모든 `save*` 는 `runtimeSession.ts` 의 `setSession()` 한 곳으로 쓴다. 저장 공간이 넘치거나 사생활 보호 모드라 `setItem` 이 던지면
`utils/saveFailure.ts` 가 `tactical-board:save-failed` 이벤트를 쏘고, 훈련창의 `SaveFailureBanner` 가 받아 붉은 경고를 띄운다(10초에 한 번).
예전에는 `save*` 마다 catch 로 삼켜 새로고침하면 기록이 사라지는데도 훈련 중에는 아무도 몰랐다(2026-09-15).

로그 한 줄은 약 530자라 저장 공간(약 5MB)을 채우려면 약 5,000줄이 필요하다 — 한 시간 훈련은 수백 줄이다.

### 저장은 디바운스된다

`LogContext` · `TokenContext` 를 비롯한 여러 Context가 **500ms 디바운스**로 쓴다. 조작 직후에 sessionStorage를 읽으면 이전 값이 나온다. 브라우저에서 상태를 확인할 때는 충분히 기다리거나 DOM을 직접 본다.

---

## 4. Provider 중첩 순서 ★

**순서에 의미가 있다.** 잘못 배치하면 훅이 throw 한다.

### App.tsx — 모드 공통

```
SettingsProvider
└ TrainingProvider
  └ UIOverlayProvider
    └ NavSlotProvider
```

### PlayPage.tsx — 훈련모드

```
 1 FireLineProvider
 2 DisplayOptionsContext.Provider
 3 LogProvider                 ← runKey Provider 중 가장 바깥. 안쪽 어디서든 useLog()
     · TrainingLogBridge
 4 EventProvider               ← TokenProvider 바깥이다
 5 ChecklistProgressProvider
 6 ResourceStatusProvider      ← TokenProvider 가 읽는다(자원대기소 지정 · 대기1단계 운영)
 7 MedicalPostProvider
 8 RoleReleaseProvider         ← TokenProvider 바깥이어야 한다 — moveToken 이 해제 함수를 부른다
 9 UnitCommanderProvider
10 TokenProvider
     · UnitCommanderBridge
11 VictimProvider
12 ActionModeProvider
13 DrawingProvider
14 WaterConnectionProvider
15 WaterLinePeekProvider
16 FireCommandProvider
17 ChecklistCommandProvider
18 HydrantStateProvider        ← WaterLevelProvider 바깥이어야 한다 — 고장난 소화전을 유량이 봐야 한다
19 HydrantCirculationProvider
     · WaterMissionBridge
20 WaterLevelProvider
     └ StageRoot → play-layout(OperationPanel · LogColumn · TacticalArea · 지휘절차 · 오버레이 · 배너)
```

`· ○○Bridge` 는 Provider 가 아니라 그 자리에 놓인 컴포넌트다 — 두 Context 를 함께 봐야 하는 일을 맡는다.

**함정: `EventProvider`가 `TokenProvider` 바깥이라 `EventContext` 안에서 `useTokens()`를 쓸 수 없다.** 이벤트 로그를 `EventLayer` 컴포넌트에서 처리하는 이유가 이것이다.
같은 이유로 `TokenContext` 는 구조대상자(`VictimProvider`, 안쪽)를 모른다 — 필요하면 아래 §6 의 register/call 로 받는다.

새 Provider나 컴포넌트를 넣을 때 어떤 Context가 필요한지 먼저 확인한다.

---

## 5. runKey — 재마운트로 상태를 초기화한다

`TrainingContext`의 `runKey`가 바뀌면 `PlayPage`의 Provider 다수가 `key={runKey}`로 **재마운트**되어 런타임 상태가 통째로 리셋된다.

상태 초기화 로직을 각 Context에 따로 쓰지 않는 것이 이 코드베이스의 방식이다. 초기화가 필요하면 `runKey`를 바꾼다.

---

## 6. Context 경계를 넘는 호출 — register/call

Context 바깥에서 안쪽 동작을 불러야 할 때 쓴다(`FireCommandContext`, `ChecklistCommandContext`).

같은 모양으로 쓰는 곳:

| 등록 | 누가 등록 · 누가 부름 |
|---|---|
| `RoleReleaseContext.registerReleaser` | 소장 · 단위지휘관 · 바스켓 탑승이 등록, `moveToken` 이 이동마다 불러 역할을 놓게 한다 |
| `TokenContext.registerCarryCheck` | `VictimContext` 가 「구조대상자를 데리고 있는가」를 등록, `moveToken` 이 불러 데리고 임시의료소로 들어가는 이동 줄을 거른다 |

```
컴포넌트가 마운트되며 자신의 처리기를 register
        ↓
바깥에서 call* 로 호출
```

기존 분기 로직을 건드리지 않고 외부 진입점을 만들 때 유용하다.

---

## 7. 좌표는 전부 0~1 정규화

| 대상 | 기준 |
|---|---|
| 출동대 · 구조대상자 | **구역** 대비 |
| 이벤트 토큰 | **보드** 대비 |

렌더는 `left`/`top` 퍼센트로 넘긴다. 해상도가 바뀌어도 CSS가 따라가므로 재계산 코드가 없다.

- 생산: `utils/dragDrop.ts`의 `computeDropCenter`, `utils/victimPlacement.ts`의 `computeVictimOffsets`
- 세션에 `posFormat: 'norm'` 필드가 있다. 없으면 구버전 px 저장분으로 보고 좌표를 폐기한다(로드 시점엔 구역 크기를 몰라 환산이 불가능하다).

**새로 좌표를 저장하는 코드를 px로 쓰면 안 된다.**

---

## 8. 출동대 로스터 — 파생 데이터

`dispatchRoster`는 `dispatchSetup`에서 **파생된다**. 수량이 바뀌면 `buildRoster(setup, prevRoster)`가 다시 돈다(`settingsStore.tsx` — `dispatchSetup` 을 보는 효과).

```
dispatchSetup  ──buildRoster(setup, prev)──▶  dispatchRoster
 (수량·추가항목)                              (개별 대 + 착대 + 부대명)
```

이전 값을 **이름으로** 찾아 지킨다(`prevByName`). 그래서 수량을 늘려도 기존 대의 착대·부대명이 보존된다. 유관기관·직접입력만 **id로** 찾는다.

### 착대 규칙

| 상황 | 결과 |
|---|---|
| 새 대 생성 | 같은 종류의 최대 착대 + 1 |
| 연동 펌프 | **부대의 착대를 물려받는다** (2026-08-26 수정, P-13) |
| 드래그로 이동 | `linkedTo` 항목에 전파 |
| 이동 후 빈 착대 | `compactArrivalOrders`가 번호를 당겨 붙인다 |

**압축은 드래그 경로에만 걸려 있다.** 수량을 줄여 착대가 비면 구멍이 남는다. 체크리스트 도착 항목은 착대 **번호**를 저장하므로 그런 항목은 `(편성없음)`으로 표시된다 — 데이터는 자동으로 고치지 않는다.

---

## 9. 진행상황 관리 — 표시와 효과의 분리

| 컴포넌트 | 역할 |
|---|---|
| `ChecklistView` | **표시 전용.** 설정만 읽고 런타임 Context에 의존하지 않는다 |
| `ChecklistPanel` | **부수효과.** 항목 타입별 분기와 하위 항목 연쇄를 실행 |

`applyItemToggle(item, checking)`이 로컬 클릭과 원격 명령의 공통 진입점이며 멱등하다.

> **현재 `/play`에는 둘 다 렌더되지 않는다.** D-5로 무플 화면에서 빠졌고(`PlayPage.tsx:455`), 지휘절차 항목은 우측 `CommandProcedureTrainingBox`가 대신한다. `ChecklistDrawer`도 호출부가 없지만 **의도적으로 남긴 것**이다 — 향후 훈련모드(지휘) 화면용이다.
>
> 설정모드에서는 `ChecklistSetupPanel`(편집용)이 우측 상주 레일에 있다. 이쪽은 살아 있다.

---

## 10. 화면 배율

훈련창은 `src/components/stage/StageRoot.tsx`가 **유일한 배율 지점**이다. 고정 논리 캔버스에 그리고 뷰포트에 맞춰 `transform: scale()`을 한 번 건다.

- 캔버스 치수는 `stage/canvas.ts`가 단일 출처. 높이 `CANVAS_H = 1440` 고정, 가로 폭은 훈련영역 종횡비에서 역산해 가변
- 패널 폭은 `StageRoot`가 `--op-panel-w`/`--proc-panel-w`로 심고 `PlayPage.css`가 읽는다. **CSS에 숫자를 다시 적으면 안 된다**
- 가로/세로 전환에 히스테리시스가 있다 (`ASPECT_TO_LANDSCAPE 1.15` / `ASPECT_TO_PORTRAIT 0.87`)
- `--ui-scale`·`--font-scale`·`useUiScale`은 **제거됐다.** 훈련모드 CSS에 남아 있던 `var(--ui-scale)` 참조 100건도 2026-08-26 에 전부 지웠다(값은 폴백이 늘 1이라 바뀐 것이 없다). 새 코드에 쓰지 않는다

설정모드는 스테이지를 쓰지 않는다 — 리플로우 3단. 근거는 [SCREEN_STAGE_PLAN.md](SCREEN_STAGE_PLAN.md) §2.1 · §5.

---

## 11. 이벤트 로그

```
조작(moveToken · rescueUnit · 송수 연결 …)
   │  문장은 utils/logPhrase.ts 한 곳에서 만든다
   ▼
LogContext.addLog  ──  한 줄 = { note, parts, payload }
   │     · note     사람이 읽는 완성 문장 — CSV · PDF 가 쓴다
   │     · parts    조각. 출동대는 칩(unit), 나머지는 글자 — 로그판이 칩을 그린다
   │     · payload  분석용 구조 데이터(kind 로 가른다) — 문장을 고쳐도 분석이 안 깨진다
   ▼
logs 상태 → 500ms 디바운스 → sessionStorage(…runtime.logs)
```

- **동시 도착은 한 줄로 묶는다** — `addArrivalLog` 가 같은 태스크 안의 도착을 모아 「대기1단계 도착: [진압1대], [펌프1]」로 적는다.
  대기 박스로 되돌리면 방금 한 도착을 거둔다(`retractArrival`).
- **누가 결정했는가(actor)는 적지 않는다** — 결정은 모두 지휘관이 한 것이다(2026-09-15 사용자 결정, MASTER_PLAN A-1).
- 문장 형식은 사용자가 한 줄씩 정했다 — [EVENT_LOG_PHRASING_PLAN.md](EVENT_LOG_PHRASING_PLAN.md). 바꾸면 `npm test` 의 기대값도 함께 고친다.
