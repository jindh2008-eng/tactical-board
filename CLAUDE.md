# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 작업 규칙

- **사용 한도가 초과되면 크레딧을 사용해 작업을 이어가지 않는다.** 한도에 도달하면 작업을 멈추고 사용자에게 알린다.
- 코드 주석·커밋 메시지·문서는 한국어로 작성한다. 기존 코드가 그렇게 돼 있다.

## 명령어

```bash
npm run build   # tsc -b && vite build — 타입체크 포함
```

```bash
npm run lint    # eslint .
```

```bash
npx tsc -b --force   # 타입체크만 (빠른 확인용)
```

`npm run test:chatgpt-summary`(`node --test`)는 `scripts/summarize-chatgpt-project.mjs` 전용이며 앱과 무관하다. **앱에는 테스트가 없다** — 검증은 브라우저에서 직접 한다.

### 개발 서버

`npm run dev`를 Bash로 실행하지 말고 `.claude/launch.json`의 `tactical-board-dev` 설정으로 preview 도구를 쓴다.

**린트 기준선**: 현재 약 56건의 오류가 이미 존재한다(대부분 `react-refresh/only-export-components` — Provider와 훅을 한 파일에 두는 이 코드베이스의 관례 — 와 `react-hooks/set-state-in-effect`). 새 오류만 회귀로 취급하고, 파일 단위로 비교한다.

```bash
npm run lint:css   # stylelint — 설정모드 토큰 강제
```

`stylelint-suppressions.json`이 도입 시점 위반 388건의 **기준선**이라 평상시엔 0건으로 통과한다. 이 파일은 줄 번호가 아니라 **파일×규칙별 건수**로 동작하므로, 건수를 넘기면 그 파일의 해당 규칙 위반이 전부 보고된다. 위반을 줄인 뒤에는 `npx stylelint "src/**/*.css" --suppress`로 건수를 다시 조인다 — 줄어드는 숫자가 [SETTINGS_MODE_UI_PLAN.md](docs/SETTINGS_MODE_UI_PLAN.md) S-2의 진척도다.

`stylelint-config-standard` 중 표기 취향 규칙 6종(`alpha-value-notation` 등)은 껐다. 저장소 전체에서 1,362건을 내는데 §9 목표와 무관해 신호를 덮었다.

**억제 잔여 14건**(2026-08-26). 이 중 실제 결함은 `ZoneCell.css` 무효 CSS 2건뿐이고(P-9, 훈련모드 경계라 여기서 안 고친다) 나머지 12건은 표기 취향이다.

`property-no-vendor-prefix`는 억제가 아니라 **규칙 설정**으로 통과시킨다 — `.stylelintrc.json`의 `ignoreProperties: ["/user-select$/", "/appearance$/"]`. `-webkit-user-select`는 짝으로 둔 `-ms-` 와 함께 남겨야 하고, `-moz-appearance: textfield`는 number 입력 스피너를 지우는 데 아직 필요하다. 억제로 덮으면 "언젠가 고칠 것"으로 보이지만 실제로는 의도한 것이다.

**이 옵션은 정규식 형식이어야 한다.** `["user-select", "appearance"]`처럼 이름만 적으면 조용히 무시된다 — 실측으로 확인했다.

`--suppress`는 **이미 고쳐진 항목을 지우지 않는다.** 위반을 없앤 뒤 건수가 그대로면 억제 파일에서 그 항목을 직접 지워야 한다. 그리고 `rules`에 실재하지 않는 키(주석 대용 등)를 넣으면 stylelint가 모든 파일에 위반으로 걸어 기준선이 통째로 부풀어 오른다.

## 아키텍처

### 설정창 / 훈련창 이원 구조 ★

이 앱을 이해하는 가장 중요한 축이다. 라우트는 `/settings`와 `/play` 둘뿐이다(`src/App.tsx`).

| | 설정창 `/settings` | 훈련창 `/play` |
|---|---|---|
| 저장소 | `localStorage` | `sessionStorage` |
| 성격 | 시나리오 정의, 자유 편집 | 훈련 실행, 설정은 읽기 전용 |
| 수명 | 영구 | 탭 생명주기 |

두 저장소는 **`훈련 세팅` 버튼**에서만 만난다. 이 버튼이 `sessionStorage`를 비우고 설정창 값을 훈련창에 적용한다.

**모드 구분은 라우트보다 넓다.** 저장소는 위 이원 구조가 맞지만, 화면은 네 모드로 나눈다 — 설정모드(`/settings`) · 훈련모드(무플)(`/play`) · 훈련모드(지휘)(미구현) · 분석(창)(`/play` 내부 모달). **현재 작업 범위는 훈련모드(무플) 하나다.** 근거와 경계는 [MASTER_PLAN.md](docs/MASTER_PLAN.md) D-4 참고.

- `src/utils/settingsStorage.ts` — localStorage 단일 창구. `SettingsExport` 인터페이스가 전체 설정 번들 형식이다.
- `src/utils/runtimeSession.ts` — sessionStorage 단일 창구. `tactical-board.runtime.*` 키 11종을 여기서만 읽고 쓴다. 새 런타임 상태를 영속화할 때는 반드시 여기에 `save*`/`load*` 쌍을 추가한다.

### runKey — Provider 재마운트로 상태 초기화

`TrainingContext`의 `runKey`가 바뀌면 `PlayPage`의 Provider 다수가 `key={runKey}`로 재마운트되어 런타임 상태가 통째로 리셋된다. 상태 초기화 로직을 따로 쓰지 않는 것이 이 코드베이스의 방식이다.

### Provider 중첩 순서에 함정이 있다

`PlayPage.tsx`의 Provider 중첩은 순서가 의미를 갖는다. 대표적으로 **`EventProvider`가 `TokenProvider` 바깥에 있어 `EventContext` 안에서는 `useTokens()`를 쓸 수 없다.** 이벤트 로그를 `EventLayer` 컴포넌트에서 처리하는 이유가 이것이다.

새 Provider나 컴포넌트를 넣을 때 어떤 Context가 필요한지 먼저 확인한다. 잘못 배치하면 훅이 throw한다. 전체 순서는 [docs/DATA_FLOW.md](docs/DATA_FLOW.md) §12 참고.

### Context 간 명령 전달 — register/call 패턴

Context 경계를 넘어 동작을 호출해야 할 때 이 패턴을 쓴다(`FireCommandContext`, `ChecklistCommandContext`). 컴포넌트가 마운트되며 자신의 처리기를 `register`하고, 바깥에서 `call*`로 호출한다. 기존 분기 로직을 건드리지 않고 외부 진입점을 만들 때 유용하다.

### 좌표는 전부 0~1 정규화

출동대·구조대상자는 **구역 대비**, 이벤트 토큰은 **보드 대비** 0~1로 저장하고 렌더는 `left/top` 퍼센트로 넘긴다. 해상도가 바뀌어도 CSS가 알아서 따라가므로 재계산 코드가 없다.

- 생산: `utils/dragDrop.ts`의 `computeDropCenter`, `utils/victimPlacement.ts`의 `computeVictimOffsets`
- 세션에 `posFormat: 'norm'` 필드가 있다. 값이 없으면 구버전 px 저장분으로 보고 좌표를 폐기한다(로드 시점엔 구역 크기를 몰라 환산이 불가능하다).

**새로 좌표를 저장하는 코드를 쓸 때 px로 저장하면 안 된다.**

### 화면 배율 — 스테이지(고정 캔버스 + `transform: scale()`)

`src/components/stage/StageRoot.tsx`가 **훈련창의 유일한 배율 지점**이다. 고정 논리 캔버스에 화면을 그리고 뷰포트에 맞춰 `transform: scale()`을 한 번만 건다. 캔버스가 변하지 않으므로 안쪽은 전부 px로 그려도 되고, 그 px들이 서로 다른 속도로 어긋날 방법이 없다.

- 캔버스 치수는 `src/components/stage/canvas.ts`가 단일 출처다. 높이 `CANVAS_H = 1440` 고정, 가로 폭은 훈련영역 종횡비에서 역산해 **가변**(레터박스가 구조적으로 0이 된다). 세로는 `CANVAS_PORTRAIT` 고정.
- 패널 폭을 CSS에 다시 적지 않는다 — `StageRoot`가 `--op-panel-w` / `--proc-panel-w`로 심고 `PlayPage.css`가 그걸 읽는다. 양쪽에 숫자를 박으면 어긋날 때 캔버스 폭 클램프가 틀어져 레터박스가 조용히 되살아난다.
- 가로/세로 전환에는 둔 구간(히스테리시스)이 있다 — `ASPECT_TO_LANDSCAPE 1.15` / `ASPECT_TO_PORTRAIT 0.87`.
- **`--ui-scale` / `--font-scale` / `useUiScale`은 제거됐다.** 배율을 CSS 선언 1,157곳이 각자 따라가야 했고 px·rem·변수·%가 서로 다른 하한으로 갈라졌기 때문이다. `var(--ui-scale)` 참조가 훈련모드 CSS에 94건 남아 있으나 **정의가 없어 전부 폴백 1로 죽어 있다**(정리 대상). 새 코드에 쓰지 않는다.
- 근거와 실측은 [docs/SCREEN_STAGE_PLAN.md](docs/SCREEN_STAGE_PLAN.md) §2.1 · §3.1 · §3.10 참고.

**설정모드(`/settings`)는 스테이지를 쓰지 않는다.** 폼과 표라서 고정 캔버스에 넣으면 넓은 화면을 레터박스로 버리고 표가 좁아진다. 리플로우(브레이크포인트) 3단으로 간다 — [SCREEN_STAGE_PLAN.md](docs/SCREEN_STAGE_PLAN.md) §5.

### 진행상황 관리 — 표시(View)와 효과(Panel) 분리

- `ChecklistView` — 표시 전용. 설정만 읽고 런타임 Context에 의존하지 않아 어디서든 렌더 가능.
- `ChecklistPanel` — 부수효과 담당. 항목 타입별 분기(화재·이벤트·출동대·도착·메시지·구조대상자)와 하위 항목 연쇄를 실행한다. `applyItemToggle(item, checking)`이 로컬 클릭과 원격 명령의 공통 진입점이며 멱등하다.

**`/play`에는 진행상황 관리가 렌더되지 않는다.** `<ChecklistPanel>` 을 그리는 곳이 저장소에 없고(`PlayPage.tsx:455` 가 그렇게 적어 뒀다), 지휘절차 항목은 우측 `CommandProcedureTrainingBox` 로 대체됐다(무플 UI 개편, 2026-08-18 · P-2·P-7).

`ChecklistDrawer` 도 호출부가 없지만 **의도적으로 남긴 것이다** — 향후 훈련모드(지휘) 화면용이다. `OverlayType` 의 `'checklist'` 가 남아 있는 것도 같은 이유다.

따라서 `ChecklistView`/`ChecklistPanel` 을 고쳐도 지금은 화면에서 확인할 수 없다. 설정모드 레일의 `ChecklistSetupPanel` 만 눈에 보인다.

## 문서

`docs/`에 아키텍처 문서와 진행 중인 작업 계획서가 있다. 코드를 크게 건드리기 전에 관련 문서를 먼저 본다.

| 문서 | 내용 |
|---|---|
| **[MASTER_PLAN.md](docs/MASTER_PLAN.md)** ★ | **작업 순서의 단일 출처.** 확정된 결정(§1), 코드로 검증한 진행 상태(§2), W-0~W-5 작업 순서(§4), 향후 단계(§7). 다른 문서와 우선순위가 어긋나면 이 문서를 따른다 |
| **[DEFERRED_PROPAGATION.md](docs/DEFERRED_PROPAGATION.md)** ★ | **파급 기록부.** 현재 범위는 훈련모드(무플) 하나뿐이다. 작업 중 설정모드·지휘모드·분석창 수정이 필요해지면 **고치지 말고 여기 §3에 적는다** |
| [PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | 프로그램 목적·화면 구성 (⚠ 2026-05-06 기준, 낙후) |
| [DATA_FLOW.md](docs/DATA_FLOW.md) | 저장소 구조, 각 기능의 데이터 흐름, Provider 순서 (⚠ 2026-05-06 기준, 낙후) |
| [RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md](docs/RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md) | 반응형 **설계 근거·실측 기록** — §0 실측값, §3 설계, §6 검증기준 |
| [DUAL_SCREEN_SYNC_PLAN.md](docs/DUAL_SCREEN_SYNC_PLAN.md) | 화면 분리 **설계 근거** — §4.1 권한모델, §5 프로토콜, §5.6 무상태 미러 |
| [DUAL_SCREEN_PARALLEL_WORKPLAN.md](docs/DUAL_SCREEN_PARALLEL_WORKPLAN.md) | 화면 분리를 다중 에이전트로 나눌 때의 파일 소유권 |

## 브라우저 검증 시 주의

- **sessionStorage 저장은 약 500ms 디바운스된다.** 동작 직후에 읽으면 이전 값이 나온다. 상태를 확인할 때는 충분히 기다리거나 DOM을 직접 본다.
- **`TacticalArea`가 `grid-template-rows`를 JS 측정값으로 인라인 계산한다.** 측정 시점 컨테이너 높이가 0이면(숨겨진 탭 등) `140px 0px 0px ...`로 굳어 건물 층이 전부 무너지고 새로고침 전까지 복구되지 않는다. 구역 높이가 0으로 보이면 이걸 먼저 의심한다.
- **드롭 존은 `isDropTarget` 게이트가 있다.** 합성 이벤트로 드래그를 테스트할 때 실제 카드에 `dragstart`를 먼저 보내지 않으면 드롭이 조용히 거부된다.
- 개발용 브라우저 패널이 프레임을 합성하지 않을 때가 있다. 이 상태에서는 `ResizeObserver`와 `window resize` 콜백이 전달되지 않고 뷰포트가 0×0으로 측정된다. 리사이즈 관련 검증은 실기기에서 해야 한다.
