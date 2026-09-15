# PROJECT_OVERVIEW.md — 전술상황판 프로젝트 개요

> 최종 갱신: 2026-09-15 · **코드를 읽어 맞춘 것이다**(2026-08-26 판 이후 바뀐 화면 구성·저장 키·시험을 반영)
> 스택: React 19 + TypeScript + Vite 8 + react-router-dom v7 · 소스 약 217파일 / 약 48,000행

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

- `src/utils/settingsStorage.ts` — localStorage 단일 창구. 키 6종(+ 수정 시각).
  **설정의 본거지는 PC 파일 `data/settings.json` 이다**(2026-09-16) — 서버가 `/api/settings` 로 열고,
  앱을 열 때 받아 사본에 깐다(`utils/settingsSync.ts`). 어느 브라우저 · 태블릿에서 열어도 같은 설정을 본다.
- `src/utils/runtimeSession.ts` — sessionStorage 단일 창구. `tactical-board.runtime.*` 키 15종.
  저장이 실패하면(저장 공간 초과 등) 훈련창에 붉은 경고가 뜬다 — 예전에는 조용히 넘어갔다.

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
┌──────────────────────────────────────────────────────────────────┐
│ 상단 nav — 메뉴 · 대상명 · 타이머 · 훈련 세팅 / 시작 / 종료       │
├──────────────────┬────────────────────────────┬──────────────────┤
│ OperationPanel   │  TacticalArea              │ procedure-panel  │
│ · 추가출동대     │  · 층별 구역 · 계단실       │ · 지휘절차 훈련  │
│ · 출동대현황     │  · B·C·D면 외곽 작전구역    │   (Command       │
│ · 자원대기소     │  · A면 + 하단 밴드          │    Procedure     │
│ · 대기1단계      │    직전대기 · RIT ·         │    TrainingBox)  │
│   [미운영]⇄운영  │    현장지휘소 · 임시의료소  │                  │
├──────────────────┤  · 소화전 · 현장요소 토큰   │                  │
│ LogColumn        │  · 송수 · 방수 · 고가 오버레이│                 │
│ · 이벤트 로그    │                            │                  │
└──────────────────┴────────────────────────────┴──────────────────┘
      전체가 StageRoot 안에 있다 (세로 화면이면 이벤트 로그가 독립 열이 된다)
```

- **대기구역 목록** — 출동대현황 · 추가출동대 · 자원대기소 · 대기1단계가 같은 종류별 목록(`PoolTokenGrid`)을 쓴다.
  열은 진압 · 구조/구급 · 펌프 · 물탱크 · 특수차 · 유관기관 · 직접입력. 맨 윗줄 「도착대」는 없앴다 — 도착은 이벤트 로그가 알려 준다.
- **대기1단계 운영** — 제목 옆 버튼. 기본은 미운영이고, 미운영이면 대기 박스의 출동대가 A면으로 나간다(의도한 동작).
  운영 중 출동대가 배치되면 잠기고 `훈련 세팅` 으로만 풀린다(`utils/dispatchTarget.ts`).
- **작업 모드 배너** — 구조 · 송수 연결 · 방수 지점 같은 모드가 켜지면 위쪽에 「○○ 모드 · 출동대 이동 잠김 · [해제 (Esc)]」가 뜬다.
  모드 중에는 모든 출동대 끌기가 꺼지므로, 켜 둔 채 잊으면 토큰이 안 움직이는 것으로 보인다.
- **이벤트 로그** — 무전 멘트 형식의 문장(「대기1단계 도착: [진압1대], [펌프1]」)이고 출동대는 칩으로 그린다.
  문장의 단일 출처는 `utils/logPhrase.ts` — [EVENT_LOG_PHRASING_PLAN.md](EVENT_LOG_PHRASING_PLAN.md).

**배율은 `StageRoot` 한 곳에서만 건다.** 고정 논리 캔버스에 그리고 뷰포트에 맞춰 `transform: scale()`을 한 번 적용한다. 안쪽은 전부 px로 그려도 되고, 그 px들이 서로 어긋날 방법이 없다. `--ui-scale`은 제거됐다 — 근거는 [SCREEN_STAGE_PLAN.md](SCREEN_STAGE_PLAN.md) §2.1.

**진행상황 관리(체크리스트)는 이 화면에 렌더되지 않는다.** D-5로 빠졌고 지휘절차는 우측 `CommandProcedureTrainingBox`가 대신한다. `ChecklistPanel`·`ChecklistDrawer`는 지휘 화면용으로 남겨 둔 것이다.

---

## 6. 폴더 구조

숫자는 `.ts`·`.tsx` 파일 수다(2026-09-15 실측).

```
src/
├── types/          도메인 타입 5 (index · victim · events · settings · presets)
├── context/        런타임 상태 25 — TokenContext 가 핵심
├── store/          settingsStore.tsx — 설정모드 전역 상태
├── config/         unitMissions.ts — 임무 칩 정의
├── utils/          순수 헬퍼 33 — logPhrase(로그 문장) · runtimeSession · settingsStorage ·
│                   dispatchTarget · actionModeLabel · saveFailure · dragDrop …
├── hooks/          useTouchDrag 등 3
├── sync/           protocol.ts — 화면 분리(지휘교수 태블릿) 메시지 계약, 아직 미사용
├── pages/          SettingsPage · PlayPage
└── components/
    ├── stage/      StageRoot · canvas.ts   ← 훈련창 배율의 단일 지점
    ├── building/   TacticalArea 계열 19
    ├── left/       좌측 운영 패널 3 (추가출동대 · 출동대현황 · 상태)
    ├── right/      로그 · 지휘절차 3
    ├── events/     현장요소 토큰 2
    ├── panels/     ChecklistView/Panel 2 (현재 무플에 미렌더 — 의도적으로 보존)
    ├── overlays/   모달 4
    ├── overlay/    보드 위 오버레이 3 (송수 · 방수 · 고가)
    ├── settings/   설정 패널 14 + ui/ 공용 컴포넌트
    ├── shared/     토큰 카드 · 목록 · 배너 등 19
    ├── drawing/    1
    └── dev/        1
tests/              logPhrase · dispatchTarget · actionModeLabel 시험 (npm test)
```

---

## 7. 코드베이스 관례 — 모르면 다치는 것들

**Provider 중첩 순서에 의미가 있다.** `EventProvider`가 `TokenProvider` 바깥이라 `EventContext` 안에서 `useTokens()`를 쓸 수 없다. 전체 순서는 [DATA_FLOW.md](DATA_FLOW.md) §4.

**`runKey`가 바뀌면 Provider가 재마운트되어 런타임 상태가 통째로 리셋된다.** 상태 초기화 로직을 따로 쓰지 않는 것이 이 코드베이스의 방식이다.

**좌표는 전부 0~1 정규화다.** 출동대·구조대상자는 구역 대비, 이벤트 토큰은 보드 대비. px로 저장하면 안 된다.

**Context 경계를 넘는 호출은 register/call 패턴을 쓴다** (`FireCommandContext`, `ChecklistCommandContext`).

**자동 시험은 순수 함수만 있다 — `npm test`.** 로그 문장(`logPhrase`) · 출동대 내보낼 자리(`dispatchTarget`) ·
작업 모드 문구(`actionModeLabel`). 추가 도구 없이 Node 24 가 `.ts` 를 바로 돌린다. **나머지 동작은 브라우저에서 직접 검증한다.**
`npm run test:chatgpt-summary`는 스크립트 전용이고 앱과 무관하다.

**sessionStorage 에 직접 쓰지 않는다.** `runtimeSession.ts` 의 `setSession()` 을 거쳐야 저장 실패가 경고로 올라온다.

---

## 8. 문서 지도

| 문서 | 성격 |
|---|---|
| [MASTER_PLAN.md](MASTER_PLAN.md) | ★ **작업 순서의 단일 출처.** 다른 문서와 어긋나면 이쪽. **다음에 할 일은 §7-A** |
| [DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md) | ★ 범위 밖 파급 기록부 (P-n) |
| [DATA_FLOW.md](DATA_FLOW.md) | 저장소·Provider·데이터 흐름 |
| [EVENT_LOG_PHRASING_PLAN.md](EVENT_LOG_PHRASING_PLAN.md) | 이벤트 로그 무전 멘트 형식 — 사용자가 정한 문장 전부와 변경 이력 |
| [WATER_SUPPLY_MISSION_PLAN.md](WATER_SUPPLY_MISSION_PLAN.md) | 송수 임무 자동지정 · 순환보수 칸 |
| [FEATURE_STATUS.md](FEATURE_STATUS.md) | 기능별 구현 상태 (네 모드 기준) |
| [SCREEN_STAGE_PLAN.md](SCREEN_STAGE_PLAN.md) | 화면 배율 설계 근거·실측 |
| [SETTINGS_MODE_UI_PLAN.md](SETTINGS_MODE_UI_PLAN.md) | 설정모드 UI 재설계 |
| [DUAL_SCREEN_SYNC_PLAN.md](DUAL_SCREEN_SYNC_PLAN.md) | 화면 분리 설계 근거 |

완료됐거나 대체된 계획서는 각 문서 머리에 그렇게 적어 두었다.
