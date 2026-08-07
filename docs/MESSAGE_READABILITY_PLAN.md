# 체크리스트/시나리오 메시지 가독성 향상 계획

> 문서 상태: 검토안 v1.0 (코드 구현 전, 방안 검토용)
> 작성 기준일: 2026-08-07
> 관련 문서: [`TECHNICAL_IMPROVEMENT_PLAN.md`](./TECHNICAL_IMPROVEMENT_PLAN.md)

## 1. 요청 배경

설정/시나리오 체크리스트의 항목 텍스트(메시지 내용)에서, 아래 세 종류의 단어가 등장하면 자동으로 굵게(강조) 표시하고 싶다.

1. 출동대명 — 예: "진압1", "구조1" (사용자가 언급한 "진압1대"는 구어적 표현이며, 실제 코드가 생성하는 문자열은 "대" 접미사 없이 "진압1", "구조1" 형태다 — 2절 참고)
2. 층 — 예: "1층", "2층", "B1층", "옥상"
3. 차량/부대 종류명 — 예: "펌프", "고가", "굴절" (번호 없이 종류만 언급되는 경우 포함)

추가로 다음 두 가지는 **향후 확장**으로 고려 중이며 이번 검토에 함께 반영한다.

- 강조 표시를 켜고 끌 수 있는 옵션(토글)
- 출동대별로 강조 색상을 다르게 하는 기능

**이 문서는 방안 검토 결과만 기록한다. 코드 구현은 하지 않았다.**

## 2. 현황 분석

### 2.1 체크리스트 항목 텍스트는 "생성 시점에 고정된 문자열"이다

`src/types/settings.ts`의 `ChecklistItem.text`는 항목 생성 시 **한 번만** 만들어지고, 이후 원본 데이터(출동대 로스터, 층 설정 등)가 바뀌어도 다시 계산되지 않는다. `src/components/settings/ChecklistSetupPanel.tsx::handleAddItem`(약 309~399행) 기준:

| 항목 유형(`itemType`) | 텍스트 생성 방식 |
|---|---|
| `unit` | `` `${출동대표시명} → ${상태}` `` — 로스터에서 1회 보간 |
| `fire` | `` `${층}층 → ${화재단계}` `` — 층 번호 1회 보간 |
| `arrival` | `` `${순서}착대 도착` `` |
| `procedure` / `event` / `message` / 지휘절차 가져오기 | **완전 자유 입력** — 담당자가 직접 타이핑, 구조화된 원본 데이터 없음 |

즉 항목 텍스트는 "구조화된 데이터 + 자유 입력 텍스트"가 섞여 있고, 렌더링 시점에는 **평문 문자열 하나**만 존재한다(`ChecklistPanel.tsx:344-347`에서 `{item.text}`를 그대로 출력, 파싱 로직 없음). 강조 표시를 구현하려면 **렌더링 시점에 문자열을 다시 분석**하는 방식이 유일한 선택지다 — 생성 시점에 구조를 유지해 렌더링하는 방식은 자유 입력 텍스트(가장 많이 쓰이는 유형)에는 애초에 적용할 수 없다.

### 2.2 실제 문자열 형태

- **출동대명**: `src/utils/dispatchRoster.ts::buildRoster`(78행)가 `` `${접두사}${번호}` `` 형태로 생성 — "진압1", "구조1", "펌프1", "고가1", "굴절1", "배연1", "지휘1", "물탱크1", "구조차1" 등. "대" 접미사는 붙지 않는다. `computeRosterDisplayName`이 별도 표시명(`unitPrefix` 지정 시 "거진진압"처럼 부대명+종류 조합)을 만들기도 한다.
- **층**: `src/utils/floorOptions.ts`, `victimPlacement.ts::floorNumberToLabel` 기준 `"1층"`, `"B1층"`, `"옥상"`(옥상=RF) 형태로 통일되어 있다.
- **차량/부대 종류명**: 로스터 접두사와 동일한 집합 — 진압/구조/구급/펌프/고가/굴절/배연/지휘(차)/물탱크/구조차. 설정 화면 드롭다운(`presets.ts::UNIT_TYPES`)은 "펌프차"/"고가차"처럼 "차"가 붙은 라벨을 쓰지만, 실제로 텍스트에 삽입되는 형태(로스터 접두사)는 "차"가 없는 경우가 대부분이다.

### 2.3 강조 표시 전례 없음

`dangerouslySetInnerHTML`, `<strong>`, 부분 강조용 텍스트 분할·래핑 패턴이 코드베이스 어디에도 없다. 이번이 최초 도입이다.

## 3. 구현 방안 비교

### 옵션 A — 정규식 패턴 기반 (구조 무관, 형태로만 판별)

출동대 접두사 목록(진압/구조/구급/펌프/고가/굴절/배연/지휘차/물탱크/구조차)과 층 패턴(`\d+층`, `B\d+층`, `옥상`)을 정규식으로 만들어 텍스트 어디에 나타나든 매칭.

- 장점: 로스터 상태와 무관하게 항상 동작. 자유 입력 텍스트(가장 흔한 케이스)에도 자연스럽게 적용. 구현이 단순하고 성능 부담이 거의 없음(정규식 1개, 항목당 1회 매칭).
- 단점: "구조"처럼 일반 어휘로도 쓰일 수 있는 단어까지 잡을 위험이 이론적으로 있음(다만 이 앱의 사용 맥락상 "구조"는 사실상 항상 구조대를 가리키므로 실질 위험은 낮음). 실제 로스터에 없는 번호(예: 오타로 "진압9")도 강조됨.

### 옵션 B — 로스터 기반 정밀 매칭

현재 `dispatchRoster`에 실제로 존재하는 출동대명만 사전으로 만들어 매칭.

- 장점: 오탐 없음. "출동대별 색상"(4.3절) 확장 시 매칭된 문자열이 어느 로스터 항목인지 바로 알 수 있어 자연스럽게 이어짐.
- 단점: 로스터에 없는 상태(예: 지휘절차 문서를 임포트했지만 아직 훈련을 시작하지 않아 로스터가 비어있는 시점, 또는 부대 종류만 언급하고 번호가 없는 문장)에서 매칭이 빠질 수 있음. 층/차량 종류 강조는 여전히 패턴이 필요해 결국 옵션 A와 일부 로직이 중복됨.

### 추천안 — 하이브리드

- **층 강조**: 옵션 A(정규식) 그대로 사용. 층은 숫자+"층" 구조가 명확해 오탐 위험이 사실상 없다.
- **출동대/차량명 강조**: 기본은 옵션 A(접두사 정규식)로 시작 — 자유 입력 텍스트까지 포괄하는 것이 이번 요청의 핵심(가독성 향상)이기 때문. 다만 강조 대상 문자열을 판별할 때 **현재 로스터에 존재하는 접두사 집합을 우선 사용하고, 없으면 기본 접두사 목록(위 10종)으로 폴백**한다. 이렇게 하면:
  - 실제 배치된 출동대 편성과 무관한 오탐 여지를 줄이고,
  - "출동대별 색상"(4.3절) 확장 시 매칭 문자열 → 로스터 항목 → 해당 항목의 실제 `TokenColor`로 자연스럽게 이어진다.

## 4. 상세 설계

### 4.1 매칭 유틸리티 — `src/utils/textHighlight.ts` (신규)

```ts
export type HighlightCategory = 'unit' | 'floor';

export interface TextSegment {
  text:     string;
  category: HighlightCategory | null;   // null = 강조 대상 아님
  unitType?: string;                    // category==='unit'일 때 매칭된 종류(진압/구조/펌프 등) — 4.3절 색상 확장용
}

// 접두사는 긴 것부터 매칭해야 "구조차"가 "구조"에 가려지지 않는다.
const DEFAULT_UNIT_PREFIXES = ['구조차','지휘차','진압','구조','구급','펌프','고가','굴절','배연','물탱크'];

export function buildHighlightPattern(activePrefixes?: string[]): RegExp {
  const prefixes = [...(activePrefixes?.length ? activePrefixes : DEFAULT_UNIT_PREFIXES)]
    .sort((a, b) => b.length - a.length);
  const unitAlt = prefixes.map(escapeRegExp).join('|');
  return new RegExp(`(${unitAlt})\\d*|B?\\d+층|옥상`, 'g');
}

export function splitHighlightSegments(text: string, pattern: RegExp): TextSegment[] {
  // pattern.exec 루프로 매칭/비매칭 구간을 번갈아 TextSegment[]로 반환
}
```

`activePrefixes`는 호출부에서 `dispatchRoster`로부터 "현재 존재하는 접두사 집합"을 뽑아 넘긴다(3절 하이브리드 방침). 로스터가 비어 있으면 `DEFAULT_UNIT_PREFIXES`로 폴백.

### 4.2 렌더링 컴포넌트 — `src/components/shared/HighlightedText.tsx` (신규)

```tsx
interface Props {
  text: string;
  enabled?: boolean;   // 4.4절 토글 옵션 — 기본 true
}

export function HighlightedText({ text, enabled = true }: Props) {
  const { dispatchRoster } = useSettings();
  const pattern = useMemo(() => buildHighlightPattern(activeUnitPrefixesFrom(dispatchRoster)), [dispatchRoster]);
  if (!enabled) return <>{text}</>;
  const segments = useMemo(() => splitHighlightSegments(text, pattern), [text, pattern]);
  return (
    <>
      {segments.map((seg, i) =>
        seg.category
          ? <strong key={i} className={`hl-text hl-text--${seg.category}`}>{seg.text}</strong>
          : <span key={i}>{seg.text}</span>
      )}
    </>
  );
}
```

### 4.3 적용 위치

| 위치 | 현재 렌더링 | 변경 |
|---|---|---|
| `ChecklistPanel.tsx:344-347` (실시간 훈련 화면 항목 텍스트) | `{item.text}` | `<HighlightedText text={item.text} />` |
| `ChecklistPanel.tsx:346` (착대 항목의 `(${arrivalUnits})` 접미사) | 이미 출동대명만 모아놓은 문자열이라 전체를 강조 대상으로 처리(개별 파싱 불필요) |
| `ChecklistPanel.tsx:382-389` (메시지 팝업 제목/본문) | `msg.messageTitle`/`msg.messageBody` 평문 | `<HighlightedText>`로 교체 |
| `ChecklistSetupPanel.tsx` 미리보기 목록(약 580행) | 설정 화면에서도 최종 표시를 미리 보고 싶다면 동일 적용(선택 사항, 필수는 아님) |

**1차 구현 범위는 실시간 훈련 화면(`ChecklistPanel.tsx`)만으로 제한**할 것을 권장 — 사용자가 실제로 "가독성이 필요하다"고 느끼는 지점은 훈련 진행 중 체크리스트를 빠르게 훑어볼 때이고, 설정 화면은 저자가 직접 입력하며 이미 내용을 알고 있어 우선순위가 낮다.

### 4.4 토글 옵션 (향후 확장, 설계만 선반영)

`src/context/DisplayOptionsContext.tsx`에 이미 `showWaterConn`/`showSpray`/`showWaterLevel`/`showAllVictims` 같은 표시 토글이 있다 — 동일 패턴으로 `highlightMessageText: boolean` 하나만 추가하면 된다. `HighlightedText`의 `enabled` prop에 이 값을 연결하면 끝. **`HighlightedText`를 처음부터 `enabled` prop을 받는 구조로 설계**해두면 토글 자체는 나중에 컨텍스트 배선 한 줄만 추가하는 일이 된다 — 이번 1차 구현 때 미리 반영해두는 것을 권장.

### 4.5 출동대별 색상 차별화 (향후 확장, 설계만 선반영)

앱에는 이미 `TokenColor`(`red`/`yellow`/`green`/`blue`/`white`/`vehicle`/`agency`) 기반 색상 체계와 `rosterItemColor()`(`src/utils/dispatchArrival.ts`)가 있어, 출동대 종류별 색상이 이미 정의되어 있다. `HighlightedText`가 매칭 시 `unitType`을 함께 반환하도록 설계해두면(4.1절 `TextSegment.unitType`), 나중에 `rosterItemColor(unitType)`을 그대로 재사용해 `<strong style={{color: ...}}>`을 적용할 수 있다 — 새 색상 체계를 따로 만들 필요 없이 기존 토큰 색상과 일관성을 유지할 수 있다.

## 5. 리스크 및 트레이드오프

- **오탐**: "구조" 등 일반 어휘와 겹치는 접두사가 자유 입력 문장 속 무관한 문맥에서도 강조될 수 있음. 하이브리드 방침(로스터 우선, 폴백은 기본 10종)으로 상당 부분 완화되지만 완전히 없앨 수는 없음 — 실사용 피드백을 보고 필요하면 접두사 뒤에 숫자나 조사(이/가/은/는/을/를 등)가 오는 경우로 조건을 좁히는 것도 고려 가능(2차 개선).
- **성능**: 항목 수가 많지 않은 체크리스트 특성상(보통 수십 개 이내) 항목별 정규식 1회 매칭은 무시할 수준. `useMemo`로 `text`가 바뀔 때만 재계산.
- **문자열 겹침 처리**: "구조차1" 같은 문자열에서 "구조"가 먼저 매칭되지 않도록 접두사를 길이 내림차순으로 정렬해 정규식 알터네이션 순서를 보장해야 함(4.1절에 반영됨) — 구현 시 반드시 지킬 것.
- **레이아웃 영향 없음**: `<strong>`은 인라인 요소라 기존 줄바꿈/말줄임(`ChecklistPanel.css`) 로직에 영향 없음. 다만 굵게 표시로 텍스트 폭이 약간 늘 수 있어 좁은 항목에서 줄바꿈이 한 줄 더 생길 가능성은 있음 — 구현 후 실제 화면에서 확인 필요.

## 6. 제안 구현 순서

1. `src/utils/textHighlight.ts` 유틸리티 작성 (패턴 생성 + 세그먼트 분할, `enabled`/`unitType` 필드까지 포함해 처음부터 확장 가능한 형태로)
2. `src/components/shared/HighlightedText.tsx` 컴포넌트 작성
3. `ChecklistPanel.tsx`의 항목 텍스트·메시지 팝업에 적용
4. 실제 훈련 화면에서 육안 확인(브라우저로 검증) — 오탐/줄바꿈 여부 포함
5. (동의 시) 설정 화면 미리보기에도 확장 적용
6. (향후) 토글 옵션 배선 — `DisplayOptionsContext`에 `highlightMessageText` 추가
7. (향후) 출동대별 색상 배선 — `rosterItemColor(unitType)` 연결

1~4번이 이번 요청의 핵심(가독성 향상)이며, 5~7번은 이미 구조적으로 준비만 해두고 실제 배선은 사용자가 원할 때 진행하는 것을 권장한다.
