# MASTER_PLAN.md — 전술상황판 통합 마스터 계획서

> 작성일: 2026-08-18
> 기준 브랜치: `feat/dual-screen-step0` (기준 커밋 `36dc927`)
> **이 문서가 "지금 무엇을 하는가"의 단일 출처다.** 다른 문서와 우선순위가 어긋나면 이 문서를 따른다.

---

> **다음에 이어서 할 일은 [§7-A](#7-a-다음에-확인하고-착수할-것--열린-항목-전수-2026-08-26) 에 모아 두었다.**
> 결정이 필요한 것(A) · 구현이 남은 것(B) · 기록만 해 둔 것(C) · 지표 결함(D) 순이다.

## 0. 이 문서를 만든 이유

2026년 3월부터 필요한 기능을 그때그때 추가해 오면서 계획 문서가 13개로 늘었고, 서로 다른 우선순위를 제시하게 됐다. 코드 자체는 건강하다 — 어긋난 것은 **계획 층**이다. 특히 다음 세 가지가 문제였다.

1. 세 개의 문서(`PROJECT_PLAN`, `TECHNICAL_IMPROVEMENT_PLAN`, `DUAL_SCREEN_SYNC_PLAN`)가 각자 "다음에 할 일"을 제시하는데 서로 교집합이 거의 없다.
2. 두 계획(반응형 · 화면분리)이 같은 파일의 같은 줄을 다른 방향으로 고쳤고, 그 결과 실제 결함이 생겼다(§3 X-1).
3. 작업트리에 문서에 없는 기능이 들어와 있다(터치 드래그).

### 0.1 기존 문서의 역할 재정의

| 문서 | 최종수정 | 이 문서 확정 이후의 역할 |
|---|---|---|
| **MASTER_PLAN.md** (이 문서) | 08-18 | ★ **작업 순서의 단일 출처** |
| **[DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md)** ★ | 08-18 | **파급 기록부.** 무플 작업 중 다른 모드에 필요해진 수정을 적어 두고 나중에 반영한다 (D-4) |
| [EVENT_LOG_PLAN.md](EVENT_LOG_PLAN.md) ★ | 08-20 | **이벤트 로그 처리 방법 개편** 단일 기능 계획서. 로그의 목적을 **AI 분석 파이프라인의 입력**으로 확정했다(그 문서 §0.3). **§7.5 C안의 `snapshots` 배열을 채우는 주체가 이 계획의 E-5다.** 선반영 대기 항목은 그 문서 §6, 미결 2건은 §8 |
| [DUAL_SCREEN_SYNC_PLAN.md](DUAL_SCREEN_SYNC_PLAN.md) | 08-14 | 3단계 **설계 근거** 참조서 (§4.1 권한모델, §5 프로토콜, §5.6 무상태 미러) |
| [RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md](RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md) | 08-14 | 반응형 **설계 근거 + 실측 기록** 참조서 (§0 실측값, §3 설계, §6 검증기준) |
| [DUAL_SCREEN_PARALLEL_WORKPLAN.md](DUAL_SCREEN_PARALLEL_WORKPLAN.md) | 08-14 | W-5 착수 시점의 **파일 소유권 표** (§4) |
| [CRASH_RISK_AUDIT.md](CRASH_RISK_AUDIT.md) | 08-07 | 잔여 위험 참조 (§5.6, §5.7) |
| [TECHNICAL_IMPROVEMENT_PLAN.md](TECHNICAL_IMPROVEMENT_PLAN.md) | 08-07 | 장애 대응 **기록 보관소**. 새 우선순위는 여기서 정하지 않는다 |
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | 08-06 | **장기 제품 비전**(단계 3~6: 규칙엔진·AAR·AI). §13 "바로 이어서 할 작업"은 **폐기** — 이 문서 §4로 대체 |
| [DRAWING_FEATURE_IMPLEMENTATION.md](DRAWING_FEATURE_IMPLEMENTATION.md) | 08-12 | 구현 보고서. §7의 미해결 위험 8건은 W-4에서 회수 |
| [MESSAGE_READABILITY_PLAN.md](MESSAGE_READABILITY_PLAN.md) | 08-07 | 단건 기능. **보류** — §6 백로그 |
| [CHECKLIST_MARKDOWN_EXPORT_PLAN.md](CHECKLIST_MARKDOWN_EXPORT_PLAN.md) | 08-07 | 단건 기능. **보류** — §6 백로그 |
| [DATA_FLOW.md](DATA_FLOW.md) | **05-06** | ⚠ 3개월 낙후. `CLAUDE.md`가 참조하는 문서 — W-6에서 갱신 |
| [FEATURE_STATUS.md](FEATURE_STATUS.md) | **05-06** | ⚠ 낙후 — W-6에서 갱신 |
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | **05-06** | ⚠ 낙후 — W-6에서 갱신 |
| [TODO_ROADMAP.md](TODO_ROADMAP.md) | **05-06** | ⚠ 낙후. 우선순위 목록은 무효(에러 바운더리는 이미 구현됨). §3 "개발 시 주의사항"만 유효 |

---

## 1. 확정된 결정 (2026-08-18)

이 세 결정이 이후 모든 작업의 전제다. 바꾸려면 이 절을 먼저 고치고 영향 범위를 다시 계산한다.

### D-1. 터치·S펜 드래그는 **보조 수단**이다

작업트리의 `src/hooks/useTouchDrag.ts`는 **무전플레이어 PC**가 터치 지원 모니터나 S펜을 쓸 때의 편의 기능이다. 지휘교수 태블릿은 여전히 **체크만** 한다.

따라서:

- [반응형 계획 §0.3](RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md)의 "Phase 5 범위 제외"는 **유효하다.** 드래그 전면 재작성은 하지 않는다.
- `src/sync/protocol.ts`의 계약(`checklist.toggle` 단일 명령)과 **무상태 미러 설계는 그대로 간다.** ack·멱등·seq 생략 근거가 유지된다.
- 3단계 견적 변동 없음.

### D-2. D면 지휘절차는 **C안** — 최소 변경 (⚠ **D-5로 대체됨**)

~~훈련 중 D면이 표시할 지휘절차 레벨 문제([반응형 계획 §0.4](RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md)의 미결 항목)는 **C안**으로 확정한다.~~

~~설정창에서 가져온 항목을 그대로 쓰되, 체크 주체만 D면으로 옮긴다.~~

같은 날 사용자가 무플 화면 전체 레이아웃 재배치를 지시하면서 이 결정은 **D-5로 대체됐다.** 표시 위치가 D면이 아니라 우측 고정 패널로 바뀌었고, 레벨 선택도 C안이 아니라 설정관리의 전용 필드(A안에 해당)로 바뀌었다. 아래 D-5 참고.

### D-3. 계획 문서는 이 문서가 단일 출처다

다른 문서는 설계 근거·기록으로 남기고, "다음에 무엇을 하는가"는 여기서만 정한다.

### D-4. 프로그램을 **네 모드**로 구분하고, **훈련모드(무플)만** 먼저 완성한다 ★

기존의 "설정창 / 훈련창 / 분석창" 3분할을 네 모드로 다시 나눈다.

| 모드 | 정의 | 현재 구현 |
|---|---|---|
| **설정모드** | 시나리오 정의. 자유 편집, 영구 저장 | `/settings` |
| **훈련모드(무플)** | 무전플레이어가 PC 마우스로 상황판을 운용 | `/play` |
| **훈련모드(지휘)** | 지휘교수가 태블릿으로 진행상황을 체크 | **미구현** |
| **분석(창)** | 훈련 결과 열람 | `AnalysisModal`(스텁 17행) |

**이번 작업 범위는 훈련모드(무플) 하나다.** 나머지 세 모드는 손대지 않는다.

**작업 중 다른 모드 수정이 필요해지면 고치지 말고 [DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md)에 기록한다.** 훈련모드(무플)의 UI·기능이 완성된 뒤 그 문서를 펼쳐 한 번에 반영한다.

**이 순서를 택한 이유**

1. **무플이 나머지 셋의 기준이 된다.** 지휘모드는 무플의 체크 구조를 미러링하고, 분석창은 무플의 우측 패널을 재사용하며, 설정모드는 무플에서 확립한 배율 규약을 이식받는다. 기준이 흔들리는 동안 파생물을 만들면 두 번 만들게 된다.
2. **경계가 이미 깨끗하다.** 실측 결과 `/settings`는 `/play`와 컴포넌트를 **하나도 공유하지 않는다**([DEFERRED_PROPAGATION.md §1.1](DEFERRED_PROPAGATION.md)). 무플만 고쳐도 설정모드가 깨질 일이 없다.
3. **가장 위험한 것이 뒤로 간다.** 훈련장 Wi-Fi의 AP 클라이언트 격리가 막혀 지휘모드가 무산되더라도, 무플 작업 결과는 그대로 남는다.

**범위에서 빠지는 것** — 지휘모드 신설(서버·동기화·`/instructor`), 설정모드 반응형, 분석창 재설계. 전부 §7 향후 단계로 옮겼다.

### D-5. 무플 화면 레이아웃 재배치 — 진행상황관리 제거, 좌우 반전, 지휘절차 우측 패널화 (구현 완료 2026-08-18)

D-4 직후 같은 날, 사용자가 무플 화면의 구체적 레이아웃을 지시했다. **D-2를 대체**하며, 아래는 계획이 아니라 이미 구현·검증된 내용이다.

**변경 내용**

1. **진행상황관리(`ChecklistPanel`)를 무플 화면에서 완전히 제거.** 표시옵션의 켜고 끄는 토글이 아니라 — 진입점 자체를 없앴다. `showChecklist` 상태·`tacticalBoardShowChecklistPanel` 로컬 저장·나비게이션 체크박스를 모두 삭제했다.
2. **운영 패널(임시의료소·대기1단계·자원대기소·출동대현황)을 우측 → 좌측으로 이동.** 컴포넌트를 `RightFixedPanel`에서 `OperationPanel`로 개명하고, CSS 클래스도 `.right-fixed-panel*` → `.op-panel*`로 함께 옮겼다(경계 반전에 맞춰 `border-left` ↔ `border-right`도 교체).
3. **진행상황관리가 있던 자리(그리드 좌측 좁은 열)를 우측으로 옮기고, 그 자리에 지휘절차 항목을 표시.** 새 컴포넌트 [`CommandProcedureTrainingBox`](../src/components/right/CommandProcedureTrainingBox.tsx)가 `checklistConfig`(진행상황관리)를 전혀 거치지 않고 `commandProcedureConfigs[activeCommandProcedureLevel]`을 **직접** 읽어 카테고리·항목을 표시하고 체크한다.
4. **레벨(초급/중급/고급) 선택을 설정관리로 이동** — D-2의 C안(가져오기 시점의 로컬 선택)이 아니라, 새 영속 필드 `activeCommandProcedureLevel`을 추가했다(A안에 해당). [`CommandProcedurePanel.tsx`](../src/components/settings/CommandProcedurePanel.tsx)에 "훈련 중 무플 화면에 표시할 레벨" 드롭다운을 별도로 뒀다 — 기존 "편집할 레벨" 탭과 시각적으로 다른 형태(드롭다운 vs 버튼탭)를 택해 두 개념이 혼동되지 않게 했다.

**결과 레이아웃**

```
[좌측: 임시의료소/대기1단계/자원대기소/출동대현황]  [중앙: 전술상황판]  [우측: 지휘절차(레벨별)]
```

`--op-panel-w`(21.5%)와 `--procedure-panel-w`(구 `--checklist-w`, 12%)는 항상 3열로 고정 — 더 이상 조건부 열이 아니다.

**설계 판단**

- `activeCommandProcedureLevel`은 `commandProcedureConfigs`와 마찬가지로 **시나리오에 속하지 않는 독립 저장값**으로 뒀다(`tacticalBoardActiveCommandProcedureLevel` 키). 설정 세트를 불러오거나 초기화해도 유지된다 — 지휘절차 자체가 이미 그렇게 설계돼 있어 따라간 것이다.
- 체크 상태는 새 Context를 만들지 않고 **기존 `ChecklistProgressContext`(`checked: Set<string>`)를 재사용**한다. `CommandProcedureItem.id`가 설정관리에서 고정 발급되는 안정적 ID라 진행상황관리를 거치지 않고 바로 키로 써도 안전하다.
- D면의 `CommandProcedureStatusBox`(읽기 전용, `sourceCommandProcedureItemId` 기반)는 이 패널로 완전히 대체되어 **삭제했다.** 두 표시가 동시에 남으면 서로 다른 데이터 소스(체크리스트 임포트 vs 설정 직접 참조)를 가리켜 혼동을 부르기 때문이다.
- 구현 중 실제 버그 하나를 잡았다 — `setChecked(prev => {...; addLog(...); return next})`처럼 상태 업데이터 콜백 안에서 부수효과를 실행하면 React StrictMode가 업데이터를 이중 호출해 로그가 두 번 쌓인다(브라우저 검증으로 재현·확인). `addLog`를 업데이터 밖으로 뺀 단일 호출로 고쳤다. **같은 패턴이 `ChecklistPanel.tsx`의 `toggleItem`에도 있다** — 이번 범위 밖이라 손대지 않았지만, 진행상황관리를 다시 손볼 일이 생기면 같이 고친다.

**파급** — 아래는 [DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md)에 반영했다.
- P-2(지휘모드가 `ChecklistView`의 절차 항목 참조)는 **이제 무의미** — 지휘절차가 애초에 `checklistConfig`를 거치지 않으므로 향후 지휘모드는 이 새 패널과 별개 경로를 설계해야 한다.
- X-1(패널 조건부 언마운트가 브릿지를 무력화하는 문제)은 **원인 자체가 사라졌다** — 진행상황관리를 아예 렌더하지 않으므로 W-0-2는 더 이상 필요 없다.

---

### D-6. 모드 전환의 기본원칙 — 세팅·시작·종료·기록 (2026-08-20) ★

설정모드와 훈련모드 사이의 전환 규칙을 확정한다. 아래 다섯 항목이 이후 모든 모드 전환 코드의 전제다.

**M-1. 설정모드의 변경은 `훈련 세팅`을 눌러야만 훈련모드에 반영된다.**
훈련 중 설정을 건드려도 진행 중인 상황판은 흔들리지 않아야 한다. 반영 시점은 오직 `훈련 세팅` 하나다.

**M-2. 훈련이 시작되면(`status === 'running'`) 설정모드로 진입할 수 없다.**
메뉴의 `설정모드` 항목을 비활성화한다. 훈련 중 시나리오 정의가 바뀌는 경로를 아예 차단하는 것이 M-1의 물리적 뒷받침이다. `ended` 이후에는 다시 열린다.

**M-3. `종료`는 확인 후 종료하고, 이어서 이벤트 로그 저장 여부를 묻는다.**
2단 확인이다 — ① "훈련을 종료하시겠습니까?" ② "이벤트 로그를 저장하시겠습니까?". ①을 취소하면 아무 일도 일어나지 않고, ②를 취소해도 훈련은 종료된다(로그는 세션에 남아 있어 로그 창에서 다시 저장할 수 있다).

**M-4. 이벤트 로그 저장의 기본 형식은 CSV, 파일명은 `yymmdd-hhmm`이다.**
현재 `이벤트로그_{대상명}_YYYYMMDD.csv` 형식을 이 규칙으로 교체한다. 시각은 **훈련 종료 시각** 기준(다시 저장할 때도 같은 이름이 나오도록 종료 시각을 세션에 남긴다 — `TrainingSessionState.endedAt`이 이미 있다). PDF 저장은 보조 수단으로 남긴다.

**M-5. 상황판 재현은 CSV가 아니라 별도 스냅샷 파일로 한다 — `C안`(§7.5).**
CSV는 사람이 읽는 산출물이라 재현의 근거가 될 수 없다(§7.5 참고). 재현이 필요해지면 설정 번들 + 런타임 스냅샷 + 로그 전문을 담은 JSON을 따로 내보낸다. **이번 범위에서는 파일 포맷만 확장 가능한 형태로 정하고, 구현은 §7.5으로 미룬다.**

#### 코드 현황 — 원칙 대비 격차

| 원칙 | 현재 상태 | 필요한 작업 |
|---|---|---|
| M-1 | **부분 위반.** `loadSettings()`가 지우는 것은 sessionStorage(런타임)뿐이다. `SettingsProvider`는 App 최상위(`src/App.tsx`)에 있어 두 라우트가 **같은 React 상태를 공유**한다 → `/settings`에서 건물 설정·대상명을 바꾸면 `PlayPage`가 `useSettings()`로 직접 읽는 값(`building.config` → `TacticalArea`, 대상명, 지휘절차)이 **즉시** 훈련 화면에 반영된다. 반대로 `timing`·`dispatchRoster`·`victimSetup`은 `initial*` prop이라 재마운트 전까지는 새지 않는다 | 훈련모드가 쓰는 설정을 `훈련 세팅` 시점에 **동결(스냅샷)** 해 세션에 담고, `/play`는 그 스냅샷만 읽게 한다 |
| M-2 | **미구현.** `MenuButton`(`src/App.tsx`)이 훈련 상태를 보지 않는다 | `useTraining().status`를 읽어 `running`이면 `설정모드` 항목 `disabled` |
| M-3 | **미구현.** `stop()`이 즉시 `ended`로 전환한다(`src/context/TrainingContext.tsx`) | 확인 모달 2단 + 저장 호출 |
| M-4 | **불일치.** `exportLogsAsCsv`가 `이벤트로그_{대상명}_YYYYMMDD.csv`로 저장한다(`src/utils/exportLog.ts`) | 파일명 규칙 교체 |
| M-5 | 미착수 | §7.5 |

#### 함께 잡을 결함

- **`clearRuntimeSession()`이 `tactical-board.runtime.equip-msg`를 지우지 않는다**(`src/utils/runtimeSession.ts`). 다른 10개 키는 지운다. `HydrantStateProvider`는 `key={runKey}`가 걸린 조상(`DrawingProvider`) 아래라 재마운트되면서 `loadEquipMsgSession()`을 다시 읽으므로, **이전 훈련의 장비 메시지가 새 훈련으로 넘어온다.** M-1 위반이며 한 줄로 고칠 수 있다.

---

### D-7. 설정모드 UI 재설계를 **무플과 병행**한다 (2026-08-24) ★

사용자 지시로 D-4의 "훈련모드(무플) 하나만"을 **명시적으로 확장한다.** [DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md) §4 반영 순서 2번(설정모드)을 앞당겨 착수하며, 작업은 별도 브랜치 `feat/settings-ui-redesign`에서 진행한다.

**병행이 안전한 근거**는 실측이다 — 설정모드는 `/play`와 컴포넌트를 **하나도 공유하지 않는다**(DEFERRED §1.1). 단 하나의 접점인 상단 `app-nav`(P-4)는 [SETTINGS_MODE_UI_PLAN.md](SETTINGS_MODE_UI_PLAN.md) §10에서 범위 밖으로 뺐다.

다만 **전역 CSS 토큰은 공유한다**([DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md) **P-8**). `--color-border` 등 `:root` 토큰(`src/App.css:12~`)을 설정모드가 103건, 훈련모드가 11건 쓴다. 따라서:

> **`:root` 토큰의 값을 바꾸지 않는다.** 설정모드는 `.settings-page` 스코프에 `--set-*`를 세우고 그쪽으로 갈아끼운다. 이 격리가 끝나야 D-4를 깰 방법이 없어진다.

**미결 질문의 답**(SETTINGS_MODE_UI_PLAN §11):

| ID | 답 | 근거 |
|---|---|---|
| **Q-1** | **브레이크포인트 3단.** `--ui-scale` 이식은 하지 않는다 | `--ui-scale`은 이미 제거됐고(정의 0건, 죽은 참조 94건), 후속인 스테이지는 [SCREEN_STAGE_PLAN.md](SCREEN_STAGE_PLAN.md) §5가 이미 "설정모드는 쓰지 않는다"로 답했다. 결정적으로 **배율은 F-5(공백 46%)를 못 고친다** — 균일 확대는 열을 늘리지 못한다. 이것이 **DEFERRED P-5의 답**이다 |
| **Q-3** | 미결 — S-3 착수 시점에 정한다 | |
| **Q-4** | **B(지금 착수).** 이 결정(D-7)이 그 기록이다 | |

**추가 결정**: 토큰 강제 장치로 `stylelint`을 devDependency에 도입한다. 기존 위반은 baseline으로 무시하고 새 위반만 오류로 본다 — CLAUDE.md의 eslint 기준선 운영과 같은 방식이다. 근거는 §1 재측정에서 **계획서 작성 후 이틀 만에 수치가 악화**된 것이다(hex 121→128, padding 51→59, useState 20→28).

---

## 2. 현재 진행 상태 — 코드로 검증한 값

전체 로드맵([DUAL_SCREEN_SYNC_PLAN.md §7.0](DUAL_SCREEN_SYNC_PLAN.md)) 기준 **약 35% 지점**이다.

> D-4에 따라 아래 "3단계 교수 연동"은 §7.1로 이동했다. **이번 범위는 2단계(무플 UI 완성)까지다.**

### 2.1 단계별

| 단계 | 상태 | 코드 근거 |
|---|---|---|
| Step 0 계약 확정 | ✅ 완료 | `src/sync/protocol.ts`(90행) · `context/ChecklistCommandContext.tsx` · `components/panels/ChecklistView.tsx` · `runtime.checklist` 세션 키 — 4종 모두 존재 |
| 1단계 UI 분리 | 🔄 50% | 무플쪽 완료. **`/instructor` 라우트 없음** — `App.tsx`의 라우트는 `/settings`·`/play` 뿐 |
| 2단계 무플 UI 완성 | 🔄 약 40% | §2.2 |
| 3단계 교수 연동 | ❌ 0% | `server/` 디렉터리 없음. `src/sync/`에 `protocol.ts` 하나뿐 |

### 2.2 2단계 내부

| Phase | 상태 | 근거 |
|---|---|---|
| Phase 4 좌표 정규화 | ✅ 완료 | 커밋 `cecbc07`·`ebec5a9`. 구역 폭 4.4배 변화에 상대위치 오차 0.11% 실측 |
| **무플 레이아웃 재배치·지휘절차 우측 패널화** | ✅ 완료 | D-5. 진행상황관리 제거, 운영 패널 좌측 이동, `CommandProcedureTrainingBox` 신설. 브라우저 검증 완료 |
| Phase 3 공통 배율 | ⛔ **대체됨** | `useUiScale.ts` **삭제**. 고정 스테이지가 배율을 전담한다 → [SCREEN_STAGE_PLAN.md](SCREEN_STAGE_PLAN.md). "잔여 px 토큰화"는 **전제가 사라졌다** — 캔버스 안은 px 로 두는 것이 맞다 |
| Phase 2 B/D면 재배분 | ✅ **완료** | `aspect-ratio: 4/3` 제거·정사각 보드, B:건물:D 비율 설정값화(`boardColumnRatio`), 건물높이 비율 저장. 가변 캔버스로 좌우 여백이 구조적으로 0 |
| Phase 6 오버레이 회귀 | 🔄 **대부분 완료** | W-4 좌표계 회귀 검증 완료([SCREEN_STAGE_PLAN.md §6.4](SCREEN_STAGE_PLAN.md)) — 드롭 좌표 오차 0.1%, 좌표계 버그 3건 발견·수정. 남은 것은 §6.4.3 |
| ~~D면 지휘절차 직접 체크~~ | **D-5로 대체 완료** | D면이 아니라 우측 고정 패널로 구현됐다. `CommandProcedureStatusBox.tsx`(D면 읽기전용 박스)는 삭제 |
| ~~Phase 5 Pointer Events~~ | 범위 제외 | D-1 |

### 2.3 품질 기준선 (2026-08-26 실측)

| 항목 | 값 | 판정 |
|---|---|---|
| `npx tsc -b --force` | 통과 (exit 0) | ✅ |
| `npx eslint .` | 56 errors / 10 warnings | ✅ 기준선 유지 |
| `npm run lint:css` | 통과 · 억제 잔여 **14건** | ✅ 388 → 14. 실제 결함은 `ZoneCell.css` 2건(P-9)뿐 |
| 설정모드 UI 감사 | 설정 7화면 §9 목표 달성 | 남은 결함 19건은 전부 `ScenarioModal`(§10 범위 밖) |
| 코드 규모 | **145 파일 / 28,792행** | 2026-08-18 대비 +28파일 / +6,430행 |
| 앱 자동화 테스트 | 없음 | 검증은 브라우저 수동 |

### 2.4 설정모드 UI 재설계 (D-7) — ✅ 완료 (2026-08-26)

[SETTINGS_MODE_UI_PLAN.md](SETTINGS_MODE_UI_PLAN.md) S-0~S-6 종료. 요지:

- 화면 8개 재설계 · 시나리오/전체 설정 분리 · 체크리스트 우측 상주 레일
- 토큰 96종을 `.settings-page` 스코프에 정의, hex 152 → 0
- 공용 컴포넌트 `Set*` 계열 + `SetSortableHead`
- 착대 자동 배정 · 드래그 이동 · 빈 착대 압축(드래그 경로)

측정 결과는 §9-A, 마감 근거는 §9-B.

---

## 3. 발견된 결함과 설계 이탈

### X-1. `ChecklistPanel` 조건부 언마운트가 명령 브릿지를 무력화한다 (⚠ **원인 자체가 사라짐 — D-5로 해소**)

~~[PlayPage.tsx:601]이 `{showChecklist && (<ChecklistPanel />)}`로 패널을 조건부 언마운트해, 기본 설정에서 `ChecklistCommandContext`의 원격 토글 브릿지가 죽어 있었다.~~

D-5로 `ChecklistPanel`을 무플 화면에서 **아예 렌더하지 않게 됐다** — 표시옵션 토글이 아니라 진입점 자체를 제거했다. 조건부 언마운트라는 원인 자체가 사라졌으므로 W-0-2("상시 마운트 + CSS 숨김")는 더 이상 필요 없다.

**남는 것** — 지휘절차는 이제 `checklistConfig`를 거치지 않고 `commandProcedureConfigs`를 직접 읽으므로, `ChecklistCommandContext`/`ChecklistPanel` 브릿지가 필요한 대상은 (향후 지휘모드에서) **진행상황관리의 나머지 항목 타입(화재·이벤트·출동대·도착·메시지·구조대상자)뿐**이다. §7.1 착수 시 이 축소된 범위를 반영해야 한다.

### X-2. `useTouchDrag`가 ~~미커밋·~~미검증 상태다 (⚠ **커밋은 해소, 검증은 남음**)

~~작업트리에만 있다.~~ 커밋 `8136178`(2026-08-20)에 포함됐다. **다만 아래 검증은 여전히 기록이 없다.**

D-1에 따라 **보조 수단으로 확정**됐으므로, 문서화하고 커밋한다(W-0-1). 다만 아래는 검증이 필요하다.

- 합성 `DragEvent`로 기존 `drop` 핸들러를 호출하는 방식 — `isDropTarget` 게이트를 통과하는지 (`CLAUDE.md` "브라우저 검증 시 주의" 참조)
- `DROP_TARGET_SELECTOR = '[data-touch-drop-target], [data-zone-key]'` — 현재 `data-zone-key`를 가진 요소가 실제 드롭 존과 일치하는지. `PlayPage.tsx`의 `resource-panel__body`에만 속성이 추가돼 있어 **누락된 드롭 존이 있을 가능성이 높다**
- S펜 측면 버튼(`button !== 0`) 분기와 기존 우클릭 컨텍스트 메뉴의 간섭
- 마우스 경로가 기존과 동일한지 (`pointerType === 'mouse'`면 즉시 반환하므로 이론상 안전하나 확인 필요)

### X-3. ~~`TacticalArea`의 0 높이 측정 고착~~ (✅ **해소** — 측정 자체가 사라짐)

> 스테이지 도입으로 `TacticalArea` 가 컨테이너를 재지 않고 캔버스 상수를 쓴다. 잴 일이 없으므로 0 으로 굳을 경로가 없다. 아래는 기록으로 남긴다.

[반응형 계획 §0.5](RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md)에 기록된 알려진 취약점이다. [TacticalArea.tsx:68](../src/components/building/TacticalArea.tsx:68)의 `useLayoutEffect`가 **마운트 시 1회만** 측정하고, 그 시점 `clientHeight`가 0이면 `140px 0px 0px minmax(200px,1fr)`로 굳어 건물 층이 전부 무너진다. 새로고침 전까지 복구되지 않는다.

W-2에서 함께 해결한다(비율 저장 + `ResizeObserver` + 0 측정값 무시).

### X-4. 참조 문서 4종이 3개월 낙후

`DATA_FLOW`·`FEATURE_STATUS`·`PROJECT_OVERVIEW`·`TODO_ROADMAP`이 05-06 기준이다. 특히 `DATA_FLOW.md`는 `CLAUDE.md`가 "Provider 순서는 여기 §12 참고"로 지목하는 문서다. W-6에서 갱신한다.

---

## 4. 작업 순서 — 훈련모드(무플)

> **범위: 훈련모드(무플) 하나뿐이다** (D-4). 설정모드·지휘모드·분석창은 §7로 미뤘다.
> 작업 중 다른 모드 수정이 필요해지면 [DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md) §3에 한 줄 적고 **그냥 지나간다.**

```
W-0 정리 (0.5일)  ← 반드시 먼저. X-1이 이후 전부를 막고 있다
  │
W-1 D면 지휘절차 직접 체크 (1일)
  │
W-2 전술상황판 확대·B/D면 재배분 (2.5일)
  │
W-3 잔여 px 토큰화 (2일)
  │
W-4 오버레이·팝업 회귀 (1.5일)
  │
W-5 문서 정합 (0.5일)
```

합계 **약 8일.** 각 W가 끝날 때마다 훈련 가능한 상태를 유지한다.

W-5가 끝나면 훈련모드(무플)가 완성 상태가 되고, 그 시점에 [DEFERRED_PROPAGATION.md §4](DEFERRED_PROPAGATION.md)의 반영 순서로 넘어간다.

---

### W-0 — 정리 (0.5일)

이후 모든 작업의 전제를 맞춘다.

#### W-0-1. 터치 드래그 커밋 (0.25일)

| 항목 | 내용 |
|---|---|
| 파일 | `src/hooks/useTouchDrag.ts`(신규) · `shared/TokenCard.tsx`·`.css` · `shared/VictimCard.tsx`·`.css` · `events/EventTokenCard.tsx`·`.css` · `building/TacticalArea.tsx`·`.css` · `building/BFaceWithStandby.tsx` · `building/ImminentStandby.tsx` · `building/StandbyColumn.tsx` · `center/StandbyColumn.tsx` · `left/StandbyZone.tsx` · `left/UnitStatusPanel.tsx` · `left/VictimPanel.tsx` · `pages/PlayPage.tsx` |
| 작업 | 1. `data-touch-drop-target` 또는 `data-zone-key` **누락 드롭 존 전수 확인** — `onDrop` 핸들러를 가진 요소를 모두 찾아 대조<br>2. 훅 주석에 D-1(보조 수단) 근거 명시<br>3. 단일 커밋으로 분리 |
| 완료 기준 | 마우스 조작 회귀 0건 · 터치 환경에서 출동대/구조대상자/이벤트 토큰 이동 성공 · `tsc` 통과 · lint 신규 오류 0 |
| 주의 | 실기기(터치 모니터 또는 S펜) 검증이 필요하다. 개발용 브라우저 패널의 합성 이벤트만으로는 판정할 수 없다 |

#### W-0-2. ~~`ChecklistPanel` 상시 마운트 복원~~ → 불필요 (D-5로 해소, ✅ 완료)

D-5가 진행상황관리를 무플 화면에서 완전히 제거하면서 이 항목의 전제(패널을 조건부로 숨겨야 한다는 것) 자체가 사라졌다. `ChecklistPanel`을 아예 렌더하지 않으므로 상시 마운트 여부를 고민할 필요가 없다. X-1 참고.

---

### W-1 — 지휘절차 훈련 패널 (✅ 완료, D-5로 대체 구현)

당초 "D면 지휘절차 직접 체크(C안)"으로 설계했으나, 같은 날 사용자가 레이아웃 전체 재배치를 지시하면서 **표시 위치(D면 → 우측 고정 패널)와 레벨 선택 방식(C안 → 설정관리 전용 필드)이 모두 바뀌었다.** 상세 설계·판단 근거는 D-5 참고. 아래는 실제 구현 결과 기록이다.

#### 구현 결과

| # | 내용 | 파일 |
|---|---|---|
| 1 | 신규 컴포넌트 — `checklistConfig`를 거치지 않고 `commandProcedureConfigs[activeCommandProcedureLevel]`을 직접 읽어 표시·체크 | [`components/right/CommandProcedureTrainingBox.tsx`](../src/components/right/CommandProcedureTrainingBox.tsx)(신규)·`.css`(신규) |
| 2 | 영속 설정 필드 `activeCommandProcedureLevel` 추가 (독립 저장, `commandProcedureConfigs`와 동일 패턴) | [`utils/settingsStorage.ts`](../src/utils/settingsStorage.ts) · [`store/settingsStore.tsx`](../src/store/settingsStore.tsx) |
| 3 | 설정관리에 "훈련 중 무플 화면에 표시할 레벨" 드롭다운 추가 (편집 탭과 형태를 다르게 해 혼동 방지) | [`components/settings/CommandProcedurePanel.tsx`](../src/components/settings/CommandProcedurePanel.tsx)·`.css` |
| 4 | D면 읽기 전용 박스 삭제, `ExteriorZone.tsx`에서 참조 제거 | `components/building/CommandProcedureStatusBox.tsx`·`.css` (삭제) |
| 5 | 체크 상태는 새 Context 없이 기존 `ChecklistProgressContext` 재사용 — `CommandProcedureItem.id`를 직접 키로 사용 | 변경 없음 (재사용) |

#### 완료 기준 — 브라우저 검증 결과 (2026-08-18)

- ✅ 설정관리에서 지휘절차 항목 추가 → 무플 우측 패널에 즉시 반영
- ✅ 항목 클릭 → 체크 표시 전환 + 로그 1건 생성 (최초 구현에서 StrictMode 이중 호출로 로그가 2건 쌓이는 버그 발견 → `addLog`를 상태 업데이터 밖으로 분리해 수정)
- ✅ 새로고침 후 체크 상태 유지 (`tactical-board.runtime.checklist` 세션 키 재사용 확인)
- ✅ 레벨 변경(설정관리) → 우측 패널이 해당 레벨 항목만 표시
- ✅ `tsc`/`eslint` 신규 오류 0

#### 남은 것

레벨 전환은 여전히 **훈련 중 불가**(설정관리에서만 변경) — 이번에도 유지했다. 현장에서 훈련 중 전환 필요성이 관측되면 D면 박스처럼 우측 패널에도 레벨 드롭다운을 얹는 방안(구 B안)을 검토한다.

---

### W-2 — Phase 2: 전술상황판 확대와 B/D면 재배분 ✅ **완료 (2026-08-23)**

> 스테이지 작업이 2-1~2-4 를 전부 처리했다. 아래 표는 원래 계획이며, 실제 구현은 [SCREEN_STAGE_PLAN.md](SCREEN_STAGE_PLAN.md) §3.4·§3.7·§3.10 을 따랐다.

Phase 1이 회수한 폭이 현재 좌측 여백으로 버려지고 있다. 이걸 B/D면에 배정한다.

| # | 작업 | 파일 |
|---|---|---|
| 2-1 | `.tactical-board-inner`의 `aspect-ratio: 4/3` 제거. 우측 패널을 뺀 폭·높이를 모두 사용 | `pages/PlayPage.css:245` |
| 2-2 | B/건물/D 열 비율을 `1fr 1.34fr 1fr`로 시작해 시각 검증 | `building/TacticalArea.css` |
| 2-3 | **건물/A면 높이를 px → 비율 저장으로 전환.** `localStorage`의 `tacticalBoardBuildingHeight`에 비율 저장 + 구버전 px 마이그레이션 | `building/TacticalArea.tsx` |
| 2-4 | **X-3 해결** — `useLayoutEffect` 1회 측정을 `ResizeObserver` 기반 재계산으로 교체하고, `clientHeight === 0`이면 측정을 **무시**한다 | 동일 |
| 2-5 | C/A면 전폭 영역, 1층 슬래브, 소방통제선, 직전대기 코너 정렬 재검증 | `building/*` |

**완료 기준** — 기준 화면(2560×1440 CSS px)에서 건물 폭을 늘리지 않으면서 B/D면 실배치 폭이 현행보다 유의미하게 넓어진다. 숨겨진 탭에서 로드해도 층이 무너지지 않는다.

**위험** — 2-1은 상황판 전체 형상을 바꾼다. 좌표는 정규화(Phase 4 완료)되어 있으므로 토큰 위치는 자동으로 따라오지만, **고가차 전개점·방수 목표·수관 경로**는 별도 확인이 필요하다.

---

### W-3 — Phase 3: 잔여 px 토큰화 ⛔ **무효 (2026-08-23)**

> **이 작업은 더 이상 필요 없다.** 고정 스테이지가 배율을 한 번만 걸므로 캔버스 안의 px 는 서로 어긋날 수 없다. `--ui-scale` 로 환산할 대상 자체가 사라졌고, `useUiScale.ts` 는 삭제됐다. 아래는 기록이다.

`--ui-scale` / `--font-scale` 기반은 완료됐다. 아래가 아직 px 고정이다([반응형 계획 §0.7](RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md)).

> D-5로 좌우 패널이 뒤바뀌었다 — 아래 "운영 패널"은 이제 **좌측**(`.op-panel`), "지휘절차 패널"은 **우측**(`.procedure-panel`)이다.

| # | 대상 | 우선순위 |
|---|---|---|
| 3-1 | 좌측 운영 패널(`.op-panel`) 내부 4개 섹션 | 높음 — 화면 점유 비중이 큼 |
| 3-1b | 우측 지휘절차 패널(`.procedure-panel`, `CommandProcedureTrainingBox`) | 높음 — W-1에서 신설된 패널이라 처음부터 반영 |
| 3-2 | 전술상황판 내부 고정 치수(`140px`, `200px`, `110px`, `88px` 등) | 높음 — W-2와 같은 파일이므로 함께 처리 검토 |
| 3-3 | 상단 내비게이션 + 좁을 때 `더보기` 접기 | 중간 |
| 3-4 | 배지·카운트다운·상태 메시지의 잔여 px | 중간 |
| 3-5 | 원형 메뉴·컨텍스트 메뉴·드로어·모달 | 낮음 — W-4와 겹침 |
| 3-6 | 수관·방수·고가차·그림판 오버레이 | 낮음 — W-4와 겹침 |

**방법** — 새 규칙을 만들지 않는다. px 값을 `calc(... * var(--ui-scale, 1))`로 바꾸거나 `rem`으로 전환하면 루트 글꼴 조정이 알아서 따라온다.

**완료 기준** — 대표 해상도(2560/1920/1280 가로) 사이에서 패널·텍스트·토큰의 상대 비율이 ±1% 이내로 유지되고 텍스트 잘림 0건.

---

### W-4 — Phase 6: 오버레이·팝업 전체 회귀 🔄 **대부분 완료 (2026-08-23)**

> 4-1~4-3 은 [SCREEN_STAGE_PLAN.md §6.4](SCREEN_STAGE_PLAN.md) 에서 실측 완료. 좌표계 버그 3건을 발견·수정했다. 남은 것은 §6.4.3 세 항목.

| # | 작업 |
|---|---|
| 4-1 | 원형 메뉴·컨텍스트 메뉴가 화면 밖으로 잘리지 않도록 뷰포트 경계 보정 |
| 4-2 | 수관·방수·고가차·연결송수구·화재/연기·그림판 좌표 검증 |
| 4-3 | 모달·드로어·분석창의 크기와 z-index 검증 |
| 4-4 | [DRAWING_FEATURE_IMPLEMENTATION.md §7](DRAWING_FEATURE_IMPLEMENTATION.md)의 미해결 위험 8건 중 좌표계 관련 항목("전술상황판 크기 변경에 따른 그림 변형") 회수 |
| 4-5 | 빌드·lint·주요 흐름 수동 회귀 |

**완료 기준** — [반응형 계획 §6.3](RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md)의 시각 회귀 허용치 충족: 비율 오차 ±1%, 텍스트 겹침 0, 의도치 않은 가로 스크롤 0.

---

### W-5 — 문서 정합 (0.5일)

| # | 작업 |
|---|---|
| 5-1 | ✅ **완료 (08-26)** `DATA_FLOW.md` 갱신 — Provider 순서(§12), `runtime.*` 키 13종, 좌표 정규화 반영 — ✅ **2026-08-26 완료** |
| 5-2 | ✅ **완료 (08-26)** `FEATURE_STATUS.md` 갱신 — 현재 구현 상태를 **네 모드 구분**(D-4)에 맞춰 재작성 |
| 5-3 | ✅ **완료 (08-26)** `PROJECT_OVERVIEW.md` 갱신 — 폴더 구조·화면 구성. "설정창/훈련창/분석창" 3분할 서술을 네 모드로 교체 |
| 5-4 | ✅ **완료 (08-26)** `TODO_ROADMAP.md`에 낙후 경고 배너 + 무효 항목 표시(에러 바운더리 등) |
| 5-5 | ✅ **완료 (08-26)** `PROJECT_PLAN.md` §13을 "이 문서 §4로 대체됨"으로 표시 |
| 5-6 | ✅ **완료 (08-26)** `README.md` — Vite 기본 안내문이었다. 제품 설명으로 교체 |
| 5-7 | **[DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md) 정리** — 작업 중 쌓인 P-n 항목을 판정별로 분류하고 §4 반영 순서를 확정한다. 이것이 다음 단계의 착수 문서가 된다 |

---

## 5. 검증 절차

앱에 자동화 테스트가 없으므로 매 W 완료 시 아래를 수동으로 수행한다.

### 5.1 매 작업 공통

```bash
npx tsc -b --force
```

```bash
npx eslint .
```

- `tsc` exit 0
- lint는 **파일 단위로 비교**한다. 전체 건수(56 errors / 12 warnings)가 아니라 손댄 파일에 새 오류가 생겼는지만 본다

### 5.2 해상도 검증 매트릭스

W-2·W-3·W-4 완료 시 [반응형 계획 §6.1](RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md)의 6개 뷰포트에서 확인한다.

| 뷰포트(CSS px) | 확인 목적 |
|---|---|
| 2560×1440 가로 | 기준. `--ui-scale`이 1.0000인지 |
| 1920×1080 가로 | 일반 모니터 축소 |
| 1280×800 가로 | 실사용 가독성 하한 |
| 1600×2560 세로 / 800×1280 세로 | 우측 패널 하단 이동 · 세로 스크롤 |

### 5.3 검증 시 주의 (`CLAUDE.md` 재확인)

- **sessionStorage 저장은 약 500ms 디바운스**된다. 동작 직후 읽으면 이전 값이 나온다
- **개발용 브라우저 패널이 프레임을 합성하지 않을 때가 있다.** 이 상태에서는 `ResizeObserver`·`window resize` 콜백이 오지 않고 뷰포트가 0×0으로 측정된다. **리사이즈·회전·터치 검증은 실기기에서 해야 한다** — W-0-1과 W-2-4가 여기 해당한다
- **드롭 존은 `isDropTarget` 게이트**가 있다. 합성 이벤트로 드래그를 테스트할 때 실제 카드에 `dragstart`를 먼저 보내지 않으면 드롭이 조용히 거부된다

---

## 6. 백로그 — 이번 순서에 넣지 않은 것

의도적으로 뒤로 미룬다. 필요해지면 §4에 편입한다.

| 항목 | 출처 | 미루는 이유 |
|---|---|---|
| 체크리스트 메시지 가독성 강조 | [MESSAGE_READABILITY_PLAN.md](MESSAGE_READABILITY_PLAN.md) | 단건 기능. 현재 축과 무관 |
| 시나리오/체크리스트 마크다운 내보내기 | [CHECKLIST_MARKDOWN_EXPORT_PLAN.md](CHECKLIST_MARKDOWN_EXPORT_PLAN.md) | 단건 기능 |
| 훈련 분석 통계 구현(`AnalysisModal`) | TODO_ROADMAP | **§7.4로 이관** — 분석(창) 모드의 본체. D-4에 따라 무플 완성 후 |
| 린트 오류 56건 분류·정리 | PROJECT_PLAN §13 | 대부분 이 코드베이스의 의도된 관례(Provider+훅 동일 파일) |
| 다중 화점층 연기 계산 | TODO_ROADMAP | `stairSmokeFloor = Math.min(...)` 한계. 현장 요구 확인 후 |
| 규칙 이벤트 엔진 · AAR 재생 · AI 분석 | [PROJECT_PLAN.md](PROJECT_PLAN.md) 단계 3~6 | 장기 비전. 네 모드가 모두 자리를 잡은 뒤 |
| `TokenContextMenu.tsx` 제거 | TODO_ROADMAP | 사용처 확인 필요 |
| 태블릿에서 토큰 직접 조작(Phase 5 전면 재작성) | 반응형 §0.3 | **D-1로 범위 제외 확정.** 되살릴 조건: 교수가 태블릿으로 상황판을 직접 조작해야 할 때 |

---

## 7. 향후 단계 — 훈련모드(무플) 완성 이후

D-4에 따라 아래는 이번 범위 밖이다. W-5가 끝나면 [DEFERRED_PROPAGATION.md §4](DEFERRED_PROPAGATION.md)의 반영 순서에 따라 착수한다.

### 7.1 훈련모드(지휘) 신설 (3.75일 병렬 / 5.25일 단독)

`src/sync/protocol.ts`가 이미 확정돼 있고 **D-1에 따라 변경 없이 간다.** 착수 시 [DUAL_SCREEN_PARALLEL_WORKPLAN.md](DUAL_SCREEN_PARALLEL_WORKPLAN.md)를 그대로 따르며, 특히 §4 **파일 소유권 표**가 충돌 방지의 핵심이다.

| 트랙 | 내용 | 산출물 |
|---|---|---|
| A | 릴레이 서버 | `server/server.mjs` · `start-server.bat` · `package.json` |
| B ★크리티컬 패스 | 동기화 계층 | `src/sync/SyncProvider.tsx` · `CommandExecutor.tsx` · `StatePublisher.tsx` · `App.tsx` 라우트 2개 |
| C | 교수 태블릿 화면 | `src/pages/InstructorPage.tsx`·`.css` · `ChecklistPanel.css` 터치 variant |
| F | 통합·현장 리허설 | |

**착수 전 확인**

1. **W-0-2 완료** — 명령 브릿지가 살아 있지 않으면 Track B의 배선이 전부 무효다(X-1)
2. **W-1의 결과로 명령 대상이 줄어든다** — 지휘절차가 D면으로 넘어가면 교수 → 무플 명령 중 화면에 영향을 주는 항목이 6종으로 축소된다. Track B·C의 검증 범위가 그만큼 줄어든다
3. **P-2 · P-7 판정** ([DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md)) — 교수 화면이 `ChecklistPanel`(부수효과)이 아니라 `ChecklistView`(표시 전용)를 써야 한다
4. **훈련장 Wi-Fi의 AP 클라이언트 격리 여부** ([DUAL_SCREEN_SYNC_PLAN.md §10-2](DUAL_SCREEN_SYNC_PLAN.md)) — 막혀 있으면 태블릿↔PC 직접 통신이 불가하다. **현장에서 미리 확인해야 한다.** 막혀 있어도 W-0~W-5 결과물은 그대로 남는다

**이미 있는 자산 — `ChecklistDrawer` 를 지우지 말 것 (2026-08-23 확인)**

[`components/overlays/ChecklistDrawer.tsx`](../src/components/overlays/ChecklistDrawer.tsx)(75행) + `.css`(128행)는 **현재 아무도 import 하지 않는다.** 정적 분석으로는 죽은 코드로 잡히지만 **의도적 보존이다** — Track C(교수 태블릿 화면)에서 쓸 예정이다.

`UIOverlayContext` 의 `OverlayType` 에 남아 있는 `'checklist'` 값도 같은 이유로 유지한다. 같은 시기에 용도가 사라진 `'log'`/`LogDrawer` 는 삭제했으므로, **둘을 같은 것으로 보고 함께 정리하면 안 된다.**

되살릴 때 고칠 점 — 체크 상태를 로컬 `useState` 로 들고 있어 `ChecklistProgressContext` 로 옮겨야 하고, 표시 전용이어야 하므로 `ChecklistPanel`(부수효과)이 아니라 `ChecklistView` 를 따라야 한다(위 착수 전 확인 3번, P-2·P-7).

**과도기 운영** — 그때까지 교수는 태블릿 없이 구두로 무플에게 지시하고 무플이 상황판을 조작한다. 오늘과 같은 방식이며, 필요하면 상단 `표시옵션 → 진행상황 관리`로 패널을 되살릴 수 있다.

### 7.2 설정모드 정합

P-3(문구 정리, 가벼움) · P-5(반응형 이식, 별도 규모). 설정모드는 폼 위주라 무플의 배율 규약이 그대로 맞는지 재검토가 필요하다.

### 7.3 전역 내비게이션

P-4. 상단 nav는 `AppShell`에 있어 네 모드가 공유한다. **세 모드가 확정된 뒤에 손대야 한 번에 끝난다.**

### 7.4 분석창 재설계

P-1 · P-6. `AnalysisModal`은 현재 `CommandInfo` 하나만 띄우는 17행짜리 스텁이다. 훈련 통계(구조 인원, 부서 현황, 화재 진행 타임라인) 구현이 본체이며 가장 독립적이라 마지막에 둔다.

---

### 7.5 상황판 재현 — 훈련 기록 스냅샷 (M-5)

**질문**: 이벤트 기록 외에 무엇을 저장해야 나중에 상황판을 동일하게 재현할 수 있는가.

**결론부터**: 지금의 CSV로는 불가능하다. 그리고 로그만으로도 불가능하다. **최종 상태 스냅샷을 따로 저장해야 한다.**

#### 왜 CSV·로그로는 안 되는가

`exportLogsAsCsv`는 `시간,유형,내용` 3열로, `내용`은 `entryContent()`가 만든 **한국어 문장**이다(`"펌프1 3층 내부 → 3층 화재"`). 구역 이름은 있지만 구역 안 좌표가 없고, ID가 아니라 표시명이라 되돌릴 수 없다. `LogEntry` 원본에는 `tokenId`·`fromZoneId`·`elapsedSec`가 있으니 CSV 열을 늘리면 로그 자체의 정보량은 회복되지만, **로그에 애초에 기록되지 않는 상태**가 많다 — 구역 내 좌표, 소화전 파손, 수위, 송수 연결선, 그리기, 방수 방향.

#### 재현에 필요한 것 — 세 덩어리

| 덩어리 | 출처 | 비고 |
|---|---|---|
| **① 시나리오** | `SettingsExport`(`src/utils/settingsStorage.ts`) 또는 M-1의 동결 스냅샷 | 건물·화점·로스터·타이밍·구조대상자·이벤트·지휘절차. **훈련 시작 시점의 값**이어야 한다 |
| **② 런타임 상태** | `tactical-board.runtime.*` 11개 키 | 토큰·좌표(0~1 정규화)·구조대상자·건물상태·송수·소화전·장비메시지·수위·검색·이벤트·체크 |
| **③ 로그 + 메타** | `EventSessionState` / `TokenSessionState.logs` + `TrainingSessionState` | 로그 **원본 객체**(CSV 아님), `startedAt`/`endedAt`, 앱 버전 |

②는 이미 전부 JSON 직렬화 가능한 형태로 sessionStorage에 있다 — **모아서 파일로 쓰는 것 이상의 작업이 필요 없다.** 이것이 이 방식을 택하는 가장 큰 이유다.

**단, 세션에 없는 상태가 있다**: 그리기(`DrawingProvider`), 자원상태(`ResourceStatusProvider`), 임시의료소(`MedicalPostProvider`), 방수/굴절 오버레이. 이들은 `runKey` 재마운트로만 초기화되고 세션 저장이 없어 **새로고침에도 사라진다.** 재현 범위에 넣으려면 먼저 `runtimeSession.ts`에 `save*`/`load*` 쌍을 추가해야 한다(CLAUDE.md의 규약대로).

#### 세 가지 방식

- **A안 — 최종 스냅샷만.** 종료 시점의 ①②③을 한 파일로. 비용 최소. 한계: "그때 그 화면"은 되살아나지만 중간 과정은 로그 텍스트로만 남는다.
- **B안 — 로그 리플레이.** 로그를 명령 스트림으로 재설계해 처음부터 되감기. 완전한 재현이지만 `LogEntry` 스키마 전면 개편 + 모든 액션의 결정성 보장이 필요하다. **비용이 압도적으로 크다.**
- **C안 — A안 + 스냅샷 배열** ★ **채택**. 파일 최상위를 `snapshots: [...]` 배열로 두고 지금은 원소 하나(종료 시점)만 넣는다. 나중에 타임라인 스크럽이 필요해지면 저장 주기만 추가하면 되고, **파일 포맷은 그대로 간다.** 지금 드는 비용은 A안과 같다.

> **후속(2026-08-20)** — 그 "저장 주기"가 정해졌다. [EVENT_LOG_PLAN.md](EVENT_LOG_PLAN.md) §0.3에서 이벤트 로그의 목적을 **AI 분석 파이프라인의 입력**으로 확정하면서, "이벤트 발생 시점의 각 출동대 배치"가 분석의 핵심 질문이 됐다. 그 계획의 **E-5가 이벤트 발생·해제 시점마다 `snapshots` 원소를 만든다.** C안이 열어 둔 확장점에 그대로 들어가므로 이 절의 파일 포맷은 바뀌지 않는다. 다만 E-5는 원소 생성까지만 하고, `scenario`(①) 동봉과 파일 내보내기는 M-1 선행이라는 이 절의 조건을 그대로 따른다.

#### 파일 포맷 초안

```
tactical-board-run-{yymmdd-hhmm}.json
{
  "version": 1,
  "kind": "training-run",
  "meta":     { "targetName", "startedAt", "endedAt", "elapsedSec", "appVersion" },
  "scenario": { …SettingsExport 또는 동결 스냅샷… },
  "logs":     [ …LogEntry 원본… ],
  "snapshots":[ { "atElapsedSec": 1234, "runtime": { …runtime.* 11키… } } ]
}
```

- 확장자는 `.json`으로 둔다 — 전용 확장자는 파일 연결 문제만 만든다.
- **CSV와 별개의 파일이다.** M-4의 CSV는 사람이 읽고 보고서에 붙이는 산출물, 이 파일은 프로그램이 되읽는 기록이다. 종료 시 두 개를 같이 저장할지는 UI에서 정한다.
- 복원 진입점은 분석창(§7.4)이 맞다 — 훈련창에 "불러오기"를 두면 진행 중 훈련을 덮어쓸 위험이 생긴다.

**착수 시점**: M-1(설정 동결)이 먼저다. 동결 스냅샷이 곧 ①이라, 순서를 뒤집으면 같은 일을 두 번 한다.

---

## 7-A. 다음에 확인하고 착수할 것 — 열린 항목 전수 (2026-08-26)

> 이 절은 **문서 전체를 훑어 뽑은 목록**이다. 다음 세션이 여기서 시작하면 된다.
> 각 줄에 「무엇을 결정/구현해야 하는지」와 「근거 문서」를 함께 적었다.

### A. 사용자 결정이 먼저 필요한 것

착수 전에 답이 나와야 진행할 수 있다. 코드로 정할 수 없는 것들이다.

| # | 결정할 것 | 선택지 | 근거 |
|---|---|---|---|
| **A-1** | 로그에 **「누가 결정했는가」(actor)** 를 남길 것인가 | A 안 남긴다(현행) · **B 기본값+예외 표시(문서 권장)** · C 매번 선택 | [EVENT_LOG_PLAN.md](EVENT_LOG_PLAN.md) §8 미결 2 |
| **A-2** | 준비도 검사에서 **무엇을 `block`** 으로 할 것인가 | 지금은 전부 `warn`. 막으려면 `/play` 의 「훈련 세팅」을 손대야 해서 D-4 경계를 넘는다 | [SETTINGS_MODE_UI_PLAN.md](SETTINGS_MODE_UI_PLAN.md) §11 Q-2 |
| **A-3** | **시나리오 예측(`ScenarioModal`)** 범위를 열 것인가 | 사용자가 「향후 별도 작업」으로 정했다. 열면 §9 지표가 목표에 닿는다 | 아래 B-3 참고 |

**A-1 이 E-3 이후 로그 작업 전체를 막고 있다.** 스키마에 `actor` 자리는 열어 뒀다(E-3-8).

### B. 구현이 남은 것 — 규모순

| # | 작업 | 규모 | 상태·근거 |
|---|---|---|---|
| **B-1** | **훈련모드(지휘) 신설** | 3.75~5.25일 | 다음 큰 단계. `/instructor` 라우트가 없다 — §7.1 |
| **B-2** | 분석창 재설계 | 큼 | `AnalysisModal` 30행 스텁. 훈련 통계가 통째로 없다 — **P-6** |
| **B-3** | `ScenarioModal` 정비 | 중간 | 942행 tsx + 703행 css. 9px 글자 · 무명 버튼 19건. **토큰은 이미 닿는다**(P-10 전제 정정 참고) — 막는 것은 §10 의 범위 결정뿐 |
| **B-4** | 도착 항목 텍스트를 **파생값으로** | 중간 | 지금은 생성 시점 문자열이라 착대 번호가 밀리면 낡는다. 2026-08-26 에 **증상만** 가렸다(`(편성없음)` 표시) — [MESSAGE_READABILITY_PLAN.md](MESSAGE_READABILITY_PLAN.md) §2.1 |
| **B-5** | 전역 내비게이션 정비 | 중간 | 세 모드가 `app-nav` 를 공유한다. 모드가 확정된 뒤 한 번에 — **P-4** · **P-1** |
| **B-6** | 빈 착대 구멍 | 작음 | 압축이 **드래그 경로에만** 걸려 있다. 수량을 줄여 착대가 비면 구멍이 남는다. `(편성없음)` 으로 보이므로 급하지 않다 |
| **B-7** | `--ui-scale` 잔재 정리 | 작음 | ✅ **완료 (08-26)** — 8개 파일 100건 제거. 값 불변(폴백이 늘 1이었다) |
| **B-8** | `ZoneCell` 무효 CSS | **2줄** | ✅ **완료 (08-26)** — `box-shadow: inset 0 0 0 1px #7aaccc`로 교체. 파일이 이미 쓰던 안쪽 테두리 관례(279행)와 같은 형태 — **P-9 해소** |

### C. 기록만 해 둔 것 — 지금 할 일 없음

| # | 내용 |
|---|---|
| **P-12** | 구조대상자 면·층 배타 선택. 기존 저장분 110명을 실측하니 「면+층 동시」가 **0건** — 우려가 실현되지 않았다 |
| **P-13** | 훈련모드가 `arrivalOrder` 를 읽는 두 곳이 `linkedTo` 필터를 걸지 않는다. **데이터가 맞으면 옳게 동작**하므로 지금 고칠 것이 없다. 펌프 착대가 다시 갈라지면 여기서 증상이 난다 |
| **P-8** | `:root` 토큰 공유. 설정모드 작업 중 지켜야 할 조건으로 소진됐다 |
| 연동 펌프 옛 저장분 | 착대가 1로 남아 있을 수 있다. **사용자 결정으로 고치지 않는다** — 진압대를 자기 착대 줄에 다시 끌어다 놓으면 펌프가 따라온다 |

### D. 지표·도구에 남은 문제

측정 도구 자체의 결함이다. 고치지 않으면 **틀린 숫자를 근거로 판단하게 된다.**

| # | 내용 |
|---|---|
| **D-a** | 감사 스크립트가 **텍스트 없는 요소의 `font-size` 까지 센다.** 「서로 다른 글자 크기 15종」이 그래서 나온다 — 실제 텍스트는 12/14/16/18 뿐이다 |
| **D-b** | **행 채움률 목표 60% 는 잠정값**이다. §9 가 정한 것이 아니라 지표를 넣으며 임의로 적었다. 건물 화면에서 이 지표를 만족시키려다 미리보기를 절반으로 줄인 일이 있다 — 화면 성격에 따라 적정값이 다르다 |
| **D-c** | 「최소 경계 대비 1.55:1」은 장식용 경계까지 포함한 값이다. 3:1 이 필요한 것과 아닌 것을 가르지 않는다 |

### E. 이번 작업에서 얻은 교훈 — 다음에 반복하지 말 것

이번 세션에서 **처음 내린 진단 다섯 중 셋이 재보니 틀렸다.** 전부 같은 종류였다.

1. **문서를 믿고 코드를 안 봤다** — P-10 의 「전역 오버레이」는 도달 불가능한 죽은 분기였고, CLAUDE.md 는 없는 토글을 있다고 했고, 두 파일 주석의 「펌프는 진압대를 따라온다」가 틀려서 버그를 가리고 있었다
2. **눈으로 세고 종류를 집계했다** — 색 점·이미지 타일·패딩 버튼을 한 자루에 넣어 「높이 14~33px」이 나왔다
3. **지표를 목표로 삼았다** — 행 채움률을 올리려다 화면을 좁혔다

**착수 전에 재고, 무엇을 세는지 먼저 정의하고, 지표가 그 화면에 맞는 자인지 따진다.**

---

## 8. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-08-18 | 최초 작성. D-1·D-2·D-3 확정. X-1(브릿지 무력화) 발견 |
| 2026-08-18 | **D-4 추가** — 네 모드 구분 + 훈련모드(무플) 우선. 지휘 연동을 §4에서 §7.1로 이동(11.75일 → 8일). [DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md) 신설 |
| 2026-08-18 | **D-5 추가, W-1 구현 완료** — 무플 레이아웃 재배치(진행상황관리 제거·좌우 반전·지휘절차 우측 패널화). D-2를 대체. X-1·W-0-2 해소. 브라우저 검증 완료(StrictMode 이중 로그 버그 발견·수정 포함) |
| 2026-08-20 | **D-6 추가** — 모드 전환 기본원칙 M-1~M-5(설정 반영 시점·훈련 중 설정 차단·2단 종료 확인·CSV 파일명 `yymmdd-hhmm`·재현 스냅샷). §7.5 신설. `clearRuntimeSession()`의 equip-msg 누락 발견 |
| 2026-08-24 | **D-7 추가** — 설정모드 UI 재설계를 무플과 병행(D-4 확장). 브랜치 `feat/settings-ui-redesign`. Q-1을 브레이크포인트로 확정(= DEFERRED P-5의 답), stylelint 도입 확정. 전역 `:root` 토큰 공유(설정 103건/훈련 11건)를 격리 조건으로 명시. `--ui-scale` 제거 사실을 CLAUDE.md에 반영 |
| 2026-08-24 (9) | **S-6 완료 — SETTINGS_MODE_UI_PLAN S-0~S-6 전 단계 종료.** 저장·반영 상태 칩(F-3), 삭제 5초 되돌리기(F-4). `TrainingContext`에 `markApplied()` 호출 한 줄 추가 — 이 브랜치에서 훈련모드 파일을 건드린 유일한 지점. 남은 것은 §12 "다음 행동"의 after 재측정과 선택 항목뿐 |
| 2026-08-24 (8) | **S-5 완료** — 9개 화면의 원시 `font-size`·`border-radius`를 토큰으로 재지정(stylelint 억제 280→22), 클릭 타깃 446→0건(8개 화면), 빈 상태·키보드 접근성 보완. 남은 것은 드래그 재정렬의 키보드 대안뿐. 다음은 S-6(저장 상태 모델) |
| 2026-08-24 (7) | **S-4 완료** — 3단 브레이크포인트, sticky 헤더, 사이드바 단계 번호·완료 배지·준비도 요약, 보조 열(≥1800px). Q-6·Q-7 해소. 본문 사용률 @2560 43.6% → 74~88%. 다음은 S-5(가장 큰 단계 — 9개 화면 컴포넌트 이관) |
| 2026-08-24 (6) | **S-3 완료** — 설정모드 공용 컴포넌트 6종 + 아이콘 세트 신설, 상단 바에 적용. **F-4 해소** — 파괴적 동작(신규 작성)이 초록 버튼에서 danger + 메뉴 안 + 구분선 뒤로 분리됐고 CTA 가 저장 하나가 됐다. Q-3 해소. 이름 없는 아이콘 버튼 26 → 19(남은 건 `ScenarioModal`, DEFERRED **P-10**). 다음은 S-4 |
| 2026-08-24 (5) | **S-2 완료** — 하드코딩 hex 152 → 0, 구조 경계 전부 3:1 이상(F-2 해소). 색을 네 덩어리로 정리했다(보라 팔레트 흡수 · 타입색 7종 유지 · 분류색 3종 유지 · 상황판 웜 팔레트는 `--ctr-*` 읽기). 다음은 S-3 |
| 2026-08-24 (4) | **S-2a 완료** — 설정모드 CSS 의 전역 토큰 참조 406건을 `--set-*` 로 재지정(F-2). 경계 3:1 미달 95.9% → 45.2%. 시나리오 예측 화면은 `ScenarioModal` 이 `App.tsx` 와 공유라 손대지 못한다(§10). 다음은 S-2b(hex 128건) |
| 2026-08-24 (3) | **S-1 완료** — 설정모드 토큰(§5.1)을 `.settings-page` 스코프에 정의하고 stylelint 기준선(388건)을 깔았다. 감사 스크립트로 「화면 변화 0」을 확인. 새 린트가 훈련모드 무효 CSS 2건을 잡아 DEFERRED **P-9** 신설. 다음은 S-2 |
| 2026-08-24 (2) | **S-0 완료** — 감사 스크립트 측정 버그 5건을 고치고 실 시나리오를 주입해 기준선을 확정했다([SETTINGS_MODE_UI_PLAN.md](SETTINGS_MODE_UI_PLAN.md) §9). 전역 토큰 공유 항목의 번호를 **P-6 → P-8**로 정정(P-6은 이미 분석창 스텁이 쓰고 있었다). 다음은 S-1 |
