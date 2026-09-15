# 전술상황판 (Tactical Board)

소방 지휘 훈련용 전자 상황판. 훈련 진행자가 화재 현장을 화면에 세워 놓고 출동대·차량·구조대상자·현장요소를 배치하며, 건물 상태(화재·연기·방화문)를 바꿔 가며 훈련을 운영한다. 모든 조작은 로그로 남아 훈련 후 복기에 쓴다.

종이·화이트보드로 하던 훈련을 대체하는 것이 목적이다.

React 19 + TypeScript + Vite 8 + react-router-dom v7.

---

## 시작하기

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

`build`는 `tsc -b && vite build`라 타입체크를 포함한다.

```bash
npm run lint
```

```bash
npm run lint:css
```

```bash
npm test
```

### 훈련장 PC 에서 돌리기

`npm run build` 로 만든 `dist/` 를 의존성 없는 서버로 띄운다. 훈련장 PC 에는 Node.js 만 있으면 된다.

```bash
npm run serve
```

옮길 파일은 `dist/` · `scripts/serve-dist.mjs` · `scripts/settings-store.mjs` 셋이다.

**설정(시나리오 · 공통 설정)은 이 PC 의 `data/settings.json` 에 저장된다.** 어느 브라우저 · 태블릿에서 열어도
같은 설정을 보고, 브라우저 기록을 지워도 남는다. 덮어쓰기 직전 판은 `data/backups/` 에 10분 간격으로 30개까지
남는다. 다른 PC 로 옮기거나 백업할 때는 **`data/` 폴더를 통째로 복사한다.** 위치를 바꾸려면 `--data <폴더>`.
설정 화면 저장 칩 옆에 「PC 파일에 저장」이 보이면 파일로 저장되고 있는 것이고, 「이 브라우저에만 저장」이면
서버에 연결되지 않은 것이다.

---

## 화면

라우트는 둘뿐이다.

| 경로 | 화면 | 저장소 |
|---|---|---|
| `/settings` | 설정모드 — 시나리오를 만든다 | `localStorage` (영구) |
| `/play` | 훈련모드 — 훈련을 운영한다 | `sessionStorage` (탭 생명주기) |

두 저장소는 **`훈련 세팅` 버튼**에서만 만난다. 설정을 고쳐도 훈련 화면에 자동으로 반영되지 않는다.

설계상 화면은 넷이다(설정 · 훈련(무플) · 훈련(지휘) · 분석). 지휘 화면은 미구현이고 분석 창은 스텁이다 — [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md).

---

## 개발 시 알아 둘 것

**앱에는 테스트가 없다.** 검증은 브라우저에서 직접 한다. `npm run test:chatgpt-summary`는 `scripts/` 아래 도구 전용이며 앱과 무관하다.

**린트에는 기준선이 있다.** `npm run lint`가 약 56건의 오류를 낸다 — 대부분 Provider와 훅을 한 파일에 두는 이 코드베이스의 관례에서 온다. 새로 생긴 오류만 회귀로 취급하고 파일 단위로 비교한다.

**`npm run dev`를 직접 띄우지 않는 환경이 있다.** `.claude/launch.json`의 `tactical-board-dev` 설정을 쓴다.

더 자세한 관례와 함정은 [CLAUDE.md](CLAUDE.md)에 있다.

---

## 문서

| 문서 | 내용 |
|---|---|
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | 프로그램 목적 · 화면 · 폴더 구조 |
| [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md) | ★ 작업 순서의 단일 출처. **다음에 이어서 할 일은 §7-A** |
| [docs/DATA_FLOW.md](docs/DATA_FLOW.md) | 저장소 · Provider 순서 · 데이터 흐름 |
| [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md) | 기능별 구현 상태 |
| [docs/DEFERRED_PROPAGATION.md](docs/DEFERRED_PROPAGATION.md) | 범위 밖 파급 기록부 |

`docs/`의 나머지는 개별 작업의 설계 근거와 실측 기록이다. 완료됐거나 대체된 것은 문서 머리에 그렇게 적혀 있다.
