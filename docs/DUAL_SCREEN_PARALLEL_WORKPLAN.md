# DUAL_SCREEN_PARALLEL_WORKPLAN.md — Phase M 병렬 작업 분담 계획

> 작성일: 2026-08-14
> 대상: [DUAL_SCREEN_SYNC_PLAN.md](DUAL_SCREEN_SYNC_PLAN.md) §7 Phase M(최소 구현)을 **Claude Code + Codex 2개 에이전트로 동시 진행**
> 전제: 파일 소유권을 배타적으로 나눠 머지 충돌을 원천 차단한다

---

## 1. 결론 — 병렬화 효과는 5.25일 → 4일

솔직하게 먼저 적는다. **2배가 되지 않는다.**

| 방식 | 소요 | 비고 |
|------|------|------|
| 단독 순차 | 5.25일 | |
| 2개 에이전트 병렬 | **4일** | 절약 1.25일 |

이유는 두 가지다.

1. **선행 단계(Step 0)를 쪼갤 수 없다.** 체크리스트 명령 브릿지와 메시지 타입은 나머지 전부가 의존하는 계약이라, 이것이 확정되기 전에는 어느 트랙도 시작할 수 없다.
2. **크리티컬 패스가 Track B 하나다.** 나머지 트랙이 아무리 빨리 끝나도 B가 끝나야 통합이 된다.

그래도 병렬로 할 가치는 있다 — 절약되는 1.25일이 대부분 **서버 코드와 태블릿 CSS**처럼 본류와 무관하면서 손이 많이 가는 부분이기 때문이다. 두 도구를 어차피 쓸 예정이라면 아래 분담대로 하면 충돌 없이 굴러간다.

---

## 2. 작업 순서 개요

```
 Step 0 (단독, 1.25일)  ← 반드시 혼자. 계약 확정 + 커밋 + push
   │
   ├──────────────┬──────────────┐
   ▼              ▼              ▼
 Track A        Track B        Track C      (동시 진행, 1~1.75일)
 릴레이 서버    동기화 계층    교수 화면
 (Codex)        (Claude)       (Codex)
   │              │              │
   └──────────────┴──────────────┘
                  ▼
      Step F (단독, 1일) 통합 + 현장 리허설
```

---

## 3. Step 0 — 계약 확정 (단독 수행, 1.25일)

**이 단계는 절대 병렬화하지 않는다.** 나머지 세 트랙이 전부 여기 산출물에 의존한다.

| # | 작업 | 파일 |
|---|------|------|
| 0-1 | `handleClick`을 JSX 맵 밖으로 호이스팅 → `handleItemToggle(item: ChecklistItem)` | `src/components/panels/ChecklistPanel.tsx` |
| 0-2 | `FireCommandContext` 패턴을 복제한 `ChecklistCommandContext` 신설 (`register` / `callToggleItem`) | `src/context/ChecklistCommandContext.tsx` (신규) |
| 0-3 | `ChecklistPanel`에 `variant?: 'desktop' \| 'tablet'`, `readOnlyChecked?: Set<string>`, `onExternalToggle?` props 추가 (**동작은 기존과 동일하게 유지**) | `src/components/panels/ChecklistPanel.tsx` |
| 0-4 | `checked` 세션 영속화 | `src/context/ChecklistProgressContext.tsx`, `src/utils/runtimeSession.ts` |
| 0-5 | **메시지 타입 확정** — 아래 §3.1 그대로 작성 | `src/sync/protocol.ts` (신규) |

### 3.1 `src/sync/protocol.ts` — 세 트랙의 공통 계약

이 파일을 **Step 0에서 확정하고 커밋한 뒤에는 아무도 수정하지 않는다.** 변경이 필요하면 전체 정지 후 합의.

```ts
export const SYNC_PORT = 8787;
export const PROTOCOL_V = 1;

export type Role = 'player' | 'instructor';

/** 교수 → 무플 */
export interface ToggleCommand {
  type: 'checklist.toggle';
  itemId:   string;
  checking: boolean;
}

/** 무플 → 교수 : 체크 현황 (무상태 미러) */
export interface CheckedState {
  type: 'state.checked';
  checkedIds: string[];
}

/** 무플 → 교수 : 접속 시 설정 번들 1회 */
export interface SettingsPayload {
  type: 'settings.bundle';
  bundle: unknown;        // utils/settingsStorage.ts 의 SettingsExport
}

/** 접속 신고 */
export interface Hello { type: 'hello'; role: Role; }

export type SyncMessage = ToggleCommand | CheckedState | SettingsPayload | Hello;

export interface Envelope { v: number; ts: number; msg: SyncMessage; }
```

**완료 기준**: `npm run build` 통과 + [DUAL_SCREEN_SYNC_PLAN.md](DUAL_SCREEN_SYNC_PLAN.md) §11-3 회귀 시나리오 9종 수동 통과 + `main`에 커밋·push.

---

## 4. 파일 소유권 표 ★충돌 방지의 핵심

**자기 트랙에 배정되지 않은 파일은 읽기만 하고 절대 수정하지 않는다.** 이 규칙 하나가 머지 충돌의 99%를 없앤다.

| 파일 | 소유 | 비고 |
|------|------|------|
| `server/server.mjs` | **A** | 신규 |
| `server/start-server.bat` | **A** | 신규 |
| `server/README.md` | **A** | 신규 |
| `package.json` | **A** | `ws` 의존성 + `serve` 스크립트 추가. **A만 건드린다** |
| `src/sync/SyncProvider.tsx` | **B** | 신규 |
| `src/sync/CommandExecutor.tsx` | **B** | 신규 |
| `src/sync/StatePublisher.tsx` | **B** | 신규 |
| `src/pages/PlayPage.tsx` | **B** | 수정 |
| `src/pages/PlayPage.css` | **B** | 수정 |
| `src/App.tsx` | **B** | 라우트 2개 추가 (`/player`, `/instructor`) |
| `src/pages/InstructorPage.tsx` | **C** | 신규 |
| `src/pages/InstructorPage.css` | **C** | 신규 |
| `src/components/panels/ChecklistPanel.css` | **C** | 터치 variant 추가 |
| `src/sync/protocol.ts` | **없음(동결)** | Step 0 산출물. 전원 읽기 전용 |
| `src/components/panels/ChecklistPanel.tsx` | **없음(동결)** | Step 0 산출물. 전원 읽기 전용 |
| 그 외 모든 파일 | **없음** | 수정 금지 |

`App.tsx`가 유일한 교차 지점이다. **B가 소유**하고, `InstructorPage`를 C가 만들 경로(`src/pages/InstructorPage.tsx`)로 미리 import해 둔다. C는 그 경로에 파일을 만들기만 하면 된다.

---

## 5. 트랙별 작업 지시서

아래 프롬프트는 각 에이전트에 **그대로 붙여넣을 수 있도록** 작성했다.

### 5.1 Track A — 릴레이 서버 (Codex 권장, 1일)

> 프로젝트 루트에 `server/` 디렉터리를 만들고 Node 릴레이 서버를 구현해줘.
>
> **읽을 것**: `src/sync/protocol.ts` (메시지 타입 계약, 수정 금지), `docs/DUAL_SCREEN_SYNC_PLAN.md` §4~5
>
> **만들 것**
> 1. `server/server.mjs` — 의존성은 `ws` 하나만 사용
>    - `dist/` 를 정적 서빙 (SPA fallback: 알 수 없는 경로는 `index.html` 반환)
>    - `index.html` 은 `Cache-Control: no-store`, `assets/*` 는 `max-age=31536000, immutable`
>    - 같은 포트(8787)에서 `/ws` WebSocket 업그레이드 처리
>    - 릴레이 규칙: **받은 메시지를 보낸 클라이언트를 제외한 전원에게 그대로 브로드캐스트**. 역할 관리·시퀀스·ack 없음
>    - `hello` 수신 시 해당 소켓에 role 기록. `player` 가 보낸 `settings.bundle` 은 서버가 마지막 1건을 메모리에 보관했다가, 이후 접속하는 `instructor` 에게 즉시 1회 전송
>    - 30초 무응답 소켓은 `ws.ping()` 후 정리
>    - 기동 시 콘솔에 LAN IP 기반 접속 URL 2개 출력 (`/player`, `/instructor`)
> 2. `server/start-server.bat` — `npm run build` 후 `node server/server.mjs` 실행
> 3. `server/README.md` — 실행법 + Windows 방화벽 인바운드(TCP 8787) 허용 명령
> 4. `package.json` 에 `ws` 의존성과 `"serve": "node server/server.mjs"` 스크립트 추가
>
> **금지**: `src/` 아래 어떤 파일도 수정하지 말 것 (읽기만)
>
> **완료 기준**: `npm run build && npm run serve` 후 브라우저 2개로 `/player`, `/instructor` 접속 시 콘솔에 양쪽 연결 로그가 찍히고, 한쪽에서 보낸 테스트 메시지가 다른 쪽에 도착할 것

### 5.2 Track B — 동기화 계층 (Claude Code, 1.75일) ★크리티컬 패스

> `src/sync/` 에 WebSocket 연결 계층을 만들고 `PlayPage` 를 무플 모드로 분기해줘.
>
> **읽을 것**: `src/sync/protocol.ts`(수정 금지), `src/components/panels/ChecklistPanel.tsx`(수정 금지), `src/context/ChecklistCommandContext.tsx`, `docs/DUAL_SCREEN_SYNC_PLAN.md` §4~7
>
> **만들 것**
> 1. `src/sync/SyncProvider.tsx`
>    - `role: Role` prop. 마운트 시 `ws://<현재 host>:8787/ws` 접속 후 `hello` 송신
>    - 지수 백오프 재연결 (1s → 2s → 4s → 최대 10s), 언마운트 시 정리
>    - React 19 StrictMode 이중 마운트에서 소켓이 새지 않도록 주의
>    - `useSync()` 로 `{ status: 'connected'|'connecting'|'offline', send, subscribe }` 노출
> 2. `src/sync/CommandExecutor.tsx` (무플 전용)
>    - `checklist.toggle` 수신 → `useChecklistCommand().callToggleItem(itemId, checking)` 호출
>    - 수신 시 화면 우상단에 3초 토스트 표시 (어떤 항목이 체크됐는지)
> 3. `src/sync/StatePublisher.tsx` (무플 전용)
>    - `useChecklistProgress().checked` 변경 시 `state.checked` 브로드캐스트
>    - 마운트 시 + `instructor` 접속 감지 시 `settings.bundle` 1회 송신 (`exportSettings()` 가 만드는 번들을 파일 저장 없이 객체로 얻는 헬퍼가 필요하면 `utils/settingsStorage.ts` 에 **추가만** 할 것)
> 4. `src/pages/PlayPage.tsx` 수정
>    - `mode?: 'standalone' | 'player'` prop 추가 (기본 `'standalone'`)
>    - `'player'` 일 때: `.right-panel` 을 **제거하지 말고** `display:none` 처리하고, `tactical-board-wrap` 의 `marginLeft`/`width` 계산에서 `checklistWidth` 를 0으로 취급
>    - `'player'` 일 때만 `<SyncProvider role="player">` + `CommandExecutor` + `StatePublisher` 를 `play-layout` **안쪽**에 배치 (Token/Victim/Event/FireCommand Provider 내부여야 함 — 바깥이면 훅이 터진다)
>    - 우상단 연결 상태 인디케이터
> 5. `src/App.tsx` — 라우트 추가
>    - `/player` → `<PlayPage mode="player" />`
>    - `/instructor` → `<InstructorPage />` (`src/pages/InstructorPage.tsx` 에서 import. **이 파일은 Track C가 만든다. 없으면 최소 스텁만 만들고 내용은 채우지 말 것**)
>    - `/play` 는 **절대 변경하지 말 것** (폴백 경로)
>
> **금지**: `ChecklistPanel.tsx`, `protocol.ts`, `InstructorPage.*`, `server/`, `package.json` 수정
>
> **완료 기준**: `/player` 진입 시 상황판이 넓어지고 진행상황 관리가 보이지 않으며, 기존 `/play` 동작은 완전히 동일할 것

### 5.3 Track C — 교수 태블릿 화면 (Codex, 1일)

> 태블릿용 교수 화면을 만들어줘. 체크리스트 하나만 있는 화면이다.
>
> **읽을 것**: `src/components/panels/ChecklistPanel.tsx`(수정 금지 — props 계약만 확인), `src/sync/protocol.ts`(수정 금지), `docs/DUAL_SCREEN_SYNC_PLAN.md` §6.2
>
> **만들 것**
> 1. `src/pages/InstructorPage.tsx`
>    - `<SyncProvider role="instructor">` 로 감싼다 (**Track B가 만드는 중이므로, 없으면 동일 시그니처의 임시 스텁을 로컬에 두고 작업한 뒤 통합 시 교체**)
>    - `settings.bundle` 수신 → `SettingsProvider` 초기값으로 주입
>    - `state.checked` 수신 → `ChecklistPanel` 에 `readOnlyChecked` 로 전달
>    - 항목 탭 → `checklist.toggle` 송신만 한다. **로컬 상태를 직접 바꾸지 않는다** (무상태 미러 — SYNC_PLAN §5.6)
>    - 연결 끊김 시 목록 전체를 흐리게 + `무플 화면에서 진행하세요` 배너
>    - 상단에 `n/m 완료` 진행률만 표시. 타이머·훈련제어 버튼·상황요약은 **만들지 않는다**
> 2. `src/pages/InstructorPage.css`
> 3. `src/components/panels/ChecklistPanel.css` 에 `--tablet` variant 추가
>    - 항목 높이 ≥ 56px, 터치 타깃 ≥ 44×44px
>    - 1024×768(4:3) ~ 2560×1600(16:10), 세로·가로 모두 대응
>    - 기존 desktop 스타일은 **한 줄도 바꾸지 말 것**
>
> **금지**: `ChecklistPanel.tsx`, `PlayPage.*`, `App.tsx`, `protocol.ts`, `server/` 수정
>
> **완료 기준**: 브라우저를 1024×768로 줄였을 때 체크리스트가 터치용 크기로 표시되고, 데스크톱 `/play` 화면의 체크리스트 모양은 전혀 변하지 않을 것

---

## 6. 브랜치 전략

현재 작업 트리에 `DrawingBoard` 관련 미커밋 변경 3건이 있다. **병렬 착수 전에 커밋하거나 stash 해야 한다.** 안 그러면 worktree 생성 시 따라다니며 꼬인다.

```bash
git add -A && git commit -m "wip: drawing board" && git checkout -b feat/dual-screen-step0
```

Step 0 완료·머지 후, 트랙별로 worktree를 나누면 세 에이전트가 서로의 파일을 물리적으로 볼 수 없어 가장 안전하다.

```bash
git worktree add ../tb-track-a -b feat/dual-screen-server
```

```bash
git worktree add ../tb-track-c -b feat/dual-screen-instructor
```

Track B는 원본 작업 트리(`D:\claude\tactical-board`)에서 `feat/dual-screen-sync` 브랜치로 진행한다.

### 통합 순서

파일 소유권이 배타적이므로 순서는 크게 상관없지만, `App.tsx`를 가진 B를 먼저 넣는 편이 검증이 쉽다.

```bash
git checkout main && git merge feat/dual-screen-sync && git merge feat/dual-screen-server && git merge feat/dual-screen-instructor
```

충돌이 난다면 소유권 규칙이 깨진 것이므로, **머지를 강행하지 말고 어느 트랙이 남의 파일을 건드렸는지부터 확인**한다.

---

## 7. Step F — 통합 및 현장 리허설 (단독, 1일)

| # | 확인 항목 |
|---|-----------|
| F-1 | `npm run build` 통과, TypeScript 오류 0 |
| F-2 | `/play` 회귀 시나리오 9종 ([SYNC_PLAN §11-3](DUAL_SCREEN_SYNC_PLAN.md)) 통과 — **이게 깨지면 배포 불가** |
| F-3 | PC 브라우저 2개(`/player`, `/instructor`)로 체크 → 반영 확인 |
| F-4 | 실제 태블릿에서 훈련장 Wi-Fi 접속 (AP 클라이언트 격리 검증) |
| F-5 | Wi-Fi 껐다 켜기 → 자동 재연결 |
| F-6 | 태블릿 화면잠금 → 해제 → 상태 일치 |
| F-7 | 무플 화면 F5 → 체크 현황 유지 (Step 0-4 동작) |
| F-8 | 서버 종료 → `/play` 로 즉시 복귀 가능 |
| F-9 | 실제 시나리오 1회 완주 |

---

## 8. 병렬 진행 시 실패하기 쉬운 지점

| # | 위험 | 예방 |
|---|------|------|
| 1 | 두 에이전트가 같은 파일을 고쳐 머지 충돌 | §4 소유권 표를 **각 프롬프트에 그대로 포함**. "금지" 항목을 명시 |
| 2 | `protocol.ts` 를 각자 "개선"해서 계약이 갈라짐 | Step 0에서 동결 선언. 변경 필요 시 전체 정지 후 합의 |
| 3 | Track C가 낙관적 UI를 자발적으로 구현 | 프롬프트에 **"로컬 상태를 직접 바꾸지 않는다"** 명시 (무상태 미러가 이 설계의 핵심) |
| 4 | Track B가 `SyncProvider`를 Provider 중첩 바깥에 배치 | 프롬프트에 위치 제약 명시. `useTokens()` 등이 터지면 이 문제 |
| 5 | 에이전트가 `/play` 를 "정리"하다가 기존 훈련 기능 파손 | F-2 회귀 검증을 통합 게이트로 강제 |
| 6 | `package.json` 을 두 트랙이 동시 수정 | A 전용으로 못박음 |

---

## 9. 부록 — 모델 선택

| 단계 | 권장 | 근거 |
|------|------|------|
| Step 0 | **Opus 5** | 체크리스트 부수효과 8종과 재귀 연동(`triggerLinkedChildren`)을 건드린다. 여기서 조용히 깨지면 훈련 중에야 발견된다 |
| Track A | Sonnet 5 | 정형적인 WS 서버 보일러플레이트 |
| Track B | Sonnet 5 (막히면 Opus) | 재연결·Provider 배치에 함정이 있으나 계획서에 명시됨 |
| Track C | Sonnet 5 | CSS·레이아웃 작업 |
| Step F | Opus 5 | 통합 디버깅은 여러 파일에 걸친 원인 추적 |

설계가 문서로 확정된 뒤의 실행 작업은 대부분 기계적이라 **Sonnet 5로 충분하다.** 판단이 필요한 곳은 Step 0과 Step F 두 군데다.
