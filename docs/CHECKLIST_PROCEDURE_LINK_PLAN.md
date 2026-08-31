# CHECKLIST_PROCEDURE_LINK_PLAN.md — 시나리오 체크리스트 ⇄ 지휘절차 연동

> **상태: 검토만 끝났다. 구현하지 않았다 (2026-08-31).**
> 착수 전에 §5 의 결정 세 가지에 답이 나와야 한다.

---

## 1. 요구사항 (사용자, 2026-08-31)

1. 우측 패널에서 **시나리오 체크리스트 ⇄ 지휘절차**를 탭으로 전환할 수 있게 한다.
2. 어느 쪽에서 항목을 체크하든 **양쪽이 함께 체크**된다.
3. 지휘절차에는 있는데 체크리스트에는 없는 항목이 있을 수 있다.
   **새로 작성한 체크리스트 항목만 연동돼도 상관없다.**

---

## 2. 코드 실측 — 연동 열쇠가 이미 있다

### 2.1 `sourceCommandProcedureItemId`

`ChecklistItem` 에 원본 지휘절차 항목의 id 를 담는 필드가 **이미 있다**
([types/settings.ts:149](../src/types/settings.ts)). 「지휘절차에서 불러오기」가
항목을 만들 때 채운다 — [ChecklistSetupPanel.tsx:315](../src/components/settings/ChecklistSetupPanel.tsx).

**쓰기만 하고 아무도 읽지 않는다.** 저장소 전체에서 참조가 그 한 줄뿐이다.
이것이 그대로 연동 키이고, "가져오기로 만든 항목만 연동" 이라는 요구와 성격이 맞는다.

### 2.2 체크 상태는 이미 한 곳에 모인다

`ChecklistProgressContext` 의 `checked: Set<string>` 을 두 화면이 함께 쓴다
(sessionStorage `tactical-board.runtime.checklist`). 다만 넣는 키가 다르다.

| 화면 | `checked` 에 넣는 키 |
|---|---|
| `CommandProcedureTrainingBox` | `CommandProcedureItem.id` |
| `ChecklistPanel` | `ChecklistItem.id` |

같은 집합에 살면서 서로 스치지 않는다. **충돌하지 않으므로 두 키를 함께 넣어도 안전하다.**

### 2.3 부수효과를 부르는 통로도 있다

`ChecklistCommandContext` 의 register/call 패턴. `ChecklistPanel` 이 마운트되며
`applyItemToggle` 을 등록하고, 바깥에서 `callToggleItem(itemId, checking)` 으로 부른다.
지휘교수 태블릿용으로 만들어 뒀지만 **지휘절차 → 체크리스트 호출에 그대로 쓴다.**

### 2.4 Provider 배치는 이미 맞다

`.procedure-panel` 은 `EventProvider` → `ChecklistProgressProvider` →
`TokenProvider` → `VictimProvider` → `FireCommandProvider` →
`ChecklistCommandProvider` 안쪽이다([PlayPage.tsx:596](../src/pages/PlayPage.tsx)).
`ChecklistPanel` 이 쓰는 Context 가 **전부 닿는다** — Provider 순서를 바꿀 필요가 없다.

---

## 3. 설계

### T-1 · 탭 전환 — 둘 다 항상 마운트한다

`.procedure-panel__box` 위에 탭 두 개(시나리오 / 지휘절차). 비활성 쪽은 `hidden` 으로
감추되 **언마운트하지 않는다.** 이유가 둘이다.

- `ChecklistPanel` 이 언마운트되면 `register(null)` 이 걸려 지휘절차에서 부를
  처리기가 사라진다. (X-1 이 같은 함정이었다 — §3 X-1 참고)
- 메시지 팝업이 열린 채 탭을 바꾸면 팝업이 사라진다.

팝업은 `createPortal` 로 스테이지 루트에 그려지므로 조상의 `hidden` 에 영향받지 않는다.
탭 상태는 로컬 `useState` — sessionStorage 키를 하나 더 만들 값이 아니다.

### T-2 · 링크된 항목은 체크리스트가 유일한 기록자다 ★

**이것이 설계의 핵심이다.** 지휘절차 상자가 자기 id 를 직접 쓰면 안 된다.

근거는 **도착 항목 잠금**이다. 배치된 출동대가 있는 도착 항목은
`applyItemToggle` 이 해제를 거부한다([ChecklistPanel.tsx:258](../src/components/panels/ChecklistPanel.tsx)).
지휘절차 쪽이 먼저 자기 id 를 지우면 거부된 뒤에도 한쪽만 풀려 두 화면이 어긋난다.

```
지휘절차 클릭 → 링크된 체크리스트 항목이 있나?
    있음 → callToggleItem(체크리스트 id, checking) 만 호출한다. 직접 쓰지 않는다
    없음 → 지금 그대로 (자기 id 기록 + 로그)

applyItemToggle → 자기 id 와 sourceCommandProcedureItemId 를 **함께** 기록한다
```

거부되면 양쪽 다 안 바뀐다. 로그도 체크리스트 경로 한 곳에서만 남아 **중복이 생기지 않는다**
(지금 두 화면이 각자 `addLog` 를 부르고 있어, 그냥 이으면 한 동작에 두 줄이 쌓인다).

### T-3 · 링크 맵

`utils/procedureLink.ts` — `checklistConfig` 를 훑어 `Map<CP항목id, ChecklistItem[]>`.
지휘절차 상자가 `useMemo` 로 쓴다.

### 작업 순서

T-3 → T-2 → T-1. 탭이 없어도 지휘절차 상자만으로 T-2 를 검증할 수 있어 탭을 마지막에 둔다.

---

## 4. 충돌 — 착수 전에 반드시 읽을 것

### ⚠ 4.1 `ChecklistPanel` 이 `/play` 에 처음 들어온다

[CLAUDE.md](../CLAUDE.md) 가 「`/play` 에는 진행상황 관리가 렌더되지 않는다」고 명시해 둔
상태이고, 무플 UI 개편(**P-2 · P-7**, 2026-08-18)에서 **의도적으로 뺀 것**이다.
되살리면 부수효과가 전부 살아난다.

| 항목 타입 | 체크하면 실제로 일어나는 일 |
|---|---|
| 화재 | 지정 층의 화재상태가 목표값으로 바뀐다 |
| 도착 | 그 착대 출동대가 대기1단계로 이동한다 |
| 출동대 | 상태메시지 · 임무태그 · 상태태그가 붙는다 |
| 현장요소 | 이벤트 상태가 바뀐다 |
| 구조대상자 | 발견 상태가 전환된다 |
| 메세지 | 화면 가운데 팝업이 뜬다 |

지금 손으로 하는 조작과 겹칠 수 있다. → 결정 **D-1**

### ⚠ 4.2 예전에 가져온 항목도 자동으로 연동된다

`sourceCommandProcedureItemId` 는 새 필드가 아니라 예전부터 기록돼 왔다
(`a7022c6`, 2026-08). 사용자는 「새로 작성한 부분만」이라고 했지만 실제로는
**이미 가져와 둔 항목 전부**가 연동 대상이 된다. → 결정 **D-2**

### ⚠ 4.3 같은 카테고리를 두 번 가져왔으면 1:N 이다

`handleImport` 가 매번 새 섹션을 만들므로, 한 CP 항목에 체크리스트 항목이 여럿 붙을 수 있다.
한 번 체크에 N 개의 부수효과가 함께 실행된다. 막으려면 가져오기 시점에 중복을 걸러야 한다.

### 4.4 세션 복원이 반쪽이 된다

이 변경 **전에** 저장된 세션에는 쌍 중 한쪽 id 만 있다. 복원 직후 지휘절차는 체크,
체크리스트는 미체크로 보인다. 불러올 때 링크 맵으로 한 번 맞춰 주면 해소된다.

### 4.5 설정모드에서 무엇이 연동되는지 안 보인다

`ChecklistSetupPanel` 이 `sourceCommandProcedureItemId` 를 표시하지 않는다.
「지휘절차」 배지를 달면 예측 가능해진다. **설정모드 수정이라 D-4 경계를 넘는다**
→ DEFERRED_PROPAGATION **P-14**

---

## 5. 결정이 필요한 것

| # | 결정할 것 | 선택지 |
|---|---|---|
| **D-1** | 시나리오 탭의 **부수효과를 살릴 것인가** | A 살린다(§4.1 표가 전부 동작) · B 표시만 연동한다(시나리오 탭은 진척 표시판이 된다) — **작업 크기를 가장 크게 가른다** |
| **D-2** | **기존에 가져온 항목**도 연동할 것인가 | A 전부 연동 · B 기준 시점을 두고 새로 가져온 것부터 |
| **D-3** | 설정모드 **「지휘절차」 배지**를 함께 넣을 것인가 | A 넣는다(P-14 를 지금 소진) · B 미룬다 |

---

## 6. 곁다리

`src/components/right/RightPanel.tsx` 는 **호출부가 0건인 죽은 코드**다.
`PlayPage` 가 `.procedure-panel` 을 직접 그린다. 우측 패널을 손대는 김에 정리한다.

---

## 7. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-08-31 | 최초 작성 — 코드 실측 후 설계·충돌·결정 정리. 구현 없음 |
