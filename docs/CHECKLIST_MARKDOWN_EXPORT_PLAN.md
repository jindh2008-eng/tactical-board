# 시나리오/체크리스트 마크다운 내보내기 계획

> 문서 상태: 검토안 v1.0 (코드 구현 전, 방안 검토용)
> 작성 기준일: 2026-08-07
> 관련 문서: [`MESSAGE_READABILITY_PLAN.md`](./MESSAGE_READABILITY_PLAN.md)(보류 중)

## 1. 요청 배경

현재 시나리오/체크리스트 설정 화면(`ChecklistSetupPanel.tsx`)에는 섹션별로 절차/이벤트/도착/메세지/화재/출동대/돌발상황/구조대상자 항목이 순서대로 들어가 있다. 이 전체 내용을 **마크다운 문서로 내보내는 기능**을 새로 추가한다.

- 목적: 시나리오의 전체 흐름을 한눈에 요약하고, **AI를 통한 검토**에 활용
- 요구사항: 작성한 메세지 내용을 포함해 항목의 내용을 **누락 없이 전체** 포함, 섹션·항목 **순서 그대로** 저장
- UI 위치: 화면 상단 "지휘절차에서 불러오기" 버튼 **바로 오른쪽**에 새 버튼 추가

**이 문서는 방안 검토 결과만 기록한다. 코드 구현은 하지 않았다.**

## 2. 현황 분석

### 2.1 데이터 구조 — `src/types/settings.ts`

`ChecklistConfig { level, sections: ChecklistSection[] }` → `ChecklistSection { id, title, items: ChecklistItem[] }`. 섹션·항목 모두 **배열 순서 = 화면 표시 순서**이며, 드래그 정렬(`reorderChecklistSections`/`reorderChecklistItems`)이 그 배열 자체를 바꾼다 — 별도 순번 필드는 없으므로 내보낼 때도 배열을 그대로 순회하면 된다.

`ChecklistItem`은 공통 필드(`id`, `text`, `itemType`) 외에 유형별로 다른 선택 필드를 쓴다:

| `itemType` | 라벨(`TYPE_LABELS`) | 핵심 필드 | 비고 |
|---|---|---|---|
| `procedure` | 절차 | `text` | 자유 입력 |
| `event` | 이벤트 | `text` | 자유 입력 |
| `arrival` | 도착 | `arrivalOrder` | 실제 출동대 목록은 `dispatchRoster`에서 `arrivalOrder` 일치·`linkedTo===null`인 항목을 조회해야 함(항목 자체엔 이름이 없음) |
| `message` | 메세지 | `messageTitle`, `messageLocation`, `messageBody` | **`text`는 요약용이고 실제 본문은 `messageBody`** — 요청하신 "메세지 내용 전체"는 반드시 `messageBody`를 써야 함 |
| `fire` | 화재 | `fireFloor`, `fireTargetStatus` | 상태는 `FIRE_STATUS_LABELS`로 한글 변환 필요 |
| `xvr` | XVR | `text` | |
| `unit` | 출동대 | `unitRosterId`, `unitEffectType`, `unitStatusText`/`unitMissionLabel`/`unitStatusTagLabel` | `unitRosterId`를 `dispatchRoster`에서 찾아 `computeRosterDisplayName()`으로 이름 변환 필요 |
| `incident` | 돌발상황 | `eventId`, `eventTargetStatus` | `eventId`를 `eventSetup`에서 조회 |
| `victim` | 구조대상자 | `victimSetupId`, `victimVisibility` | `victimSetupId`를 `victimSetup`에서 조회 — 설정 화면에 이미 `formatVictimLabel()` 변환 함수가 있음(재사용 가능) |

공통 부가 필드:
- `linkedParentId` — "바로 위 항목과 연동"으로 생성된 하위 항목. 항상 자신의 **직전 항목 또는 그 상위 체인**을 가리킴(`resolveRootId` 로직, 패널 607~625행). 내보낼 때 들여쓰기로 부모-자식 관계를 표현 가능.
- `sourceCommandProcedureItemId` — 지휘절차에서 가져온 항목의 원본 id만 저장(카테고리·레벨 정보는 없음). 필요하면 `commandProcedureConfigs`를 순회해 id로 역추적 가능하지만, 못 찾아도 치명적이지 않음(선택 사항으로 둔다).

### 2.2 버튼 위치 — `ChecklistSetupPanel.tsx` 452~463행

`지휘절차에서 불러오기` 버튼은 `showImport===false`일 때만 보이는 `<div className="checklist-setup__import-bar">`의 유일한 자식이다. `showImport===true`가 되면 이 div 전체가 지휘절차 가져오기 패널로 치환된다.

**설계 시 주의할 점**: 새 "마크다운으로 내보내기" 버튼을 그냥 이 조건부 블록 안에 넣으면, 지휘절차 가져오기 패널이 열려있는 동안 내보내기 버튼이 사라진다. 내보내기는 가져오기 상태와 무관하게 항상 눌릴 수 있어야 자연스러우므로, **`import-bar`를 감싸는 상위 행(row)을 하나 더 만들어 그 행 안에 "지휘절차에서 불러오기"(또는 가져오기 패널)와 "마크다운으로 내보내기" 버튼을 나란히 배치**하는 구조 변경을 권장한다(레이아웃만 바뀌고 기존 가져오기 로직은 그대로 유지).

### 2.3 파일 다운로드 방식 — 기존 코드에 이미 확립된 패턴 있음

`src/utils/settingsStorage.ts::exportSettings()`(257~276행)가 정확히 이 용도에 맞는 패턴을 이미 쓰고 있다: `Blob` → `URL.createObjectURL` → 숨긴 `<a download>` 생성·클릭·제거 → `URL.revokeObjectURL`. `src/utils/exportLog.ts::exportLogsAsCsv`도 동일 패턴. **새 기능도 이 패턴을 그대로 재사용**하면 된다(새로운 다운로드 방식을 고안할 필요 없음). MIME 타입만 `text/markdown;charset=utf-8;`로, 파일명은 `tactical-board-scenario-${날짜}.md` 형태로.

## 3. 구현 방안

### 3.1 마크다운 생성 유틸리티 — `src/utils/exportChecklistMarkdown.ts` (신규)

```ts
export function buildChecklistMarkdown(ctx: {
  checklistConfig:  ChecklistConfig;
  dispatchRoster:   DispatchRosterItem[];
  eventSetup:       EventSetupItem[];
  victimSetup:      VictimSetupItem[];
  building:         BuildingSettings;          // 개요용
  commandProcedureConfigs?: CommandProcedureConfigs; // 출처 역추적용(선택)
}): string
```

항목 하나를 마크다운 한 줄로 바꾸는 내부 함수(`renderItemLine`)를 유형별로 분기해서 만들고, 섹션 루프 안에서 `linkedParentId` 유무에 따라 들여쓰기(하위 항목은 `  - ` 한 단계 더)를 적용한다.

### 3.2 마크다운 구조(초안)

```markdown
# 시나리오/체크리스트 — 2026-08-07

## 시나리오 개요
- 대상 시설: ○○아파트 3동
- 화재 발생층: 3층
- 착대 방식: 시간순
- 총 섹션: 4개 / 총 항목: 32개

## 초기대응

- [ ] **절차** 현장 도착, 지휘차 전개
- [ ] **도착** 1착대 도착 (진압1, 펌프1)
- [ ] **화재** 3층 → 최성기
- [ ] **메세지** 관제센터 → 신고자 추가 진술
  > 3층에 사람이 갇혀있다는 추가 신고 접수. 정확한 위치는 확인 안 됨.
  - [ ] **돌발상황** (연동) 가스누출 경보 발생
- [ ] **출동대** 진압1 → 임무: 내부진입
- [ ] **구조대상자** #1 남/30대/중상/3층/거실

## 인명구조
...
```

- 체크박스 문법(`- [ ]`)을 써서 실제 체크리스트 UI와 시각적으로 대응시키고, AI가 읽기에도 구조가 명확하도록 함
- 메세지 항목은 제목을 항목 줄에, **본문 전체는 인용구(`>`)로 별도 줄에** — 아무리 길어도 자르지 않음(요청사항)
- `linkedParentId`가 있는 항목은 "(연동)" 표시 + 한 단계 들여쓰기
- 최상단에 "시나리오 개요" 섹션을 둬서 AI가 세부 항목을 보기 전에 전체 맥락(대상 시설, 화재층, 착대 방식, 규모)을 먼저 파악하도록 함

### 3.3 다운로드 트리거 — `src/utils/exportChecklistMarkdown.ts`에 래퍼 함수 포함

```ts
export function downloadChecklistMarkdown(ctx: /* 위와 동일 */): void {
  const md = buildChecklistMarkdown(ctx);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
  // 이하 settingsStorage.ts::exportSettings()와 동일한 Blob→<a download> 패턴
}
```

### 3.4 UI 변경 — `ChecklistSetupPanel.tsx`

- 452~463행의 `checklist-setup__import-bar` 블록을 감싸는 `checklist-setup__toolbar` 행 신설(2.2절 설계)
- 새 버튼 "마크다운으로 내보내기" 추가, 클릭 시 `downloadChecklistMarkdown({ checklistConfig, dispatchRoster, eventSetup, victimSetup, building, commandProcedureConfigs })` 호출(이미 패널이 `useSettings()`로 이 값들을 대부분 구독 중이라 새로 끌어올 값이 거의 없음)
- 항목이 하나도 없을 때(빈 체크리스트) 버튼을 비활성화하거나, 누르면 "항목이 없습니다" 안내만 표시

## 4. 리스크 및 트레이드오프

- **`arrivalOrder` 항목의 실제 출동대 이름**은 항목 자체에 저장돼 있지 않고 매번 `dispatchRoster`에서 다시 계산해야 한다(패널의 기존 555행 로직과 동일) — 내보내는 시점의 로스터 상태를 기준으로 하므로, 로스터를 바꾼 뒤 예전에 만든 도착 항목을 내보내면 그 시점 로스터가 반영된다(이는 실시간 훈련 화면과 동일한 동작이라 일관적임).
- **지휘절차 출처 역추적**은 `sourceCommandProcedureItemId`만으로 카테고리·레벨을 찾으려면 `commandProcedureConfigs`의 모든 레벨·카테고리를 순회해야 하는데, 원본이 삭제된 경우 못 찾을 수 있다 — 필수 정보가 아니므로 찾으면 표시, 못 찾으면 생략하는 정도로 가볍게 처리.
- **매우 긴 메세지 본문**이 여러 개 있으면 문서가 상당히 길어질 수 있으나, 이는 요청사항(전체 포함)의 직접적인 결과이므로 트레이드오프가 아니라 의도된 동작.
- **파일명 충돌**: 같은 날 여러 번 내보내면 동일 파일명(`...-YYYY-MM-DD.md`)이 반복 저장될 수 있음 — 필요시 시:분까지 포함하는 것도 고려 가능(`settingsStorage.ts`의 기존 파일명 규칙은 날짜까지만 사용하므로, 일관성을 위해 동일하게 날짜까지만 쓰는 것을 1차안으로 제안).

## 5. 제안 구현 순서

1. `src/utils/exportChecklistMarkdown.ts` — `buildChecklistMarkdown()` 순수 함수 작성(유형별 렌더 분기, 부모-자식 들여쓰기 포함)
2. 같은 파일에 `downloadChecklistMarkdown()` 래퍼 작성(기존 `exportSettings()` 패턴 재사용)
3. `ChecklistSetupPanel.tsx` 상단 툴바 구조 변경 + 새 버튼 배선
4. 실제 체크리스트로 내보내기 실행 → 생성된 `.md` 파일을 열어 섹션/순서/메세지 전문·화재층·도착 출동대명이 실제 화면과 일치하는지 확인
5. (선택) 지휘절차 출처 역추적 표시 추가
