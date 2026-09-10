# EVENT_LOG_PHRASING_PLAN.md — 이벤트 로그 문구 개편 계획서

> 작성일: 2026-09-10
> 기준 커밋: `e4ee33a`
> 상위 문서: **[EVENT_LOG_PLAN.md](EVENT_LOG_PLAN.md)** — 로그 처리 방법 전반. 이 문서는 그 하위의 **문구·묶음 규칙 계획서**다.
> 최상위: [MASTER_PLAN.md](MASTER_PLAN.md) — 작업 순서의 단일 출처
> 범위: **훈련모드(무플)** 하나

---

## 0. 목적

로그를 **실제 무전 멘트와 이동을 그대로 읽는 문장**으로 바꾼다.

지금 로그는 「누가 어디서 어디로」를 화살표로 적는다 — `펌프4 대기(풀) → 자원대기소`.
이건 데이터 구조를 그대로 문장에 옮긴 것이지 현장에서 오가는 말이 아니다.
무전 교신(STT)과 시간축으로 합칠 때([EVENT_LOG_PLAN.md](EVENT_LOG_PLAN.md) §0.3) 두 줄의 어휘가
서로 다르면 정렬은 되어도 대조가 안 된다.

그리고 **동시에 벌어진 일은 한 줄로 적는다.** 다섯 대가 같이 도착하면 다섯 줄이 아니라
`대기1단계 도착: 진압1대, 구급1대, 물탱크1` 한 줄이다. 무전도 그렇게 한 번 나간다.

`payload`(분석용 구조화 데이터)는 손실 없이 유지한다 — 묶음 줄도 `units[]` 로 대별 정보를
그대로 담으므로 분석에서 다시 펼칠 수 있다.

---

## 1. 현재 구조 — 코드로 확인한 값 (2026-09-10)

로그 창구는 [`context/LogContext.tsx`](../src/context/LogContext.tsx) 하나이고
**`addLog` 호출 1건 = 로그 1줄**이다. 묶는 장치가 없다.

`payload` 가 분석용 정본, `note` 가 표시용 문장인데 — **`move` 만은 note 가 아니라
`fromZoneId → toZoneId` 를 화면에서 조립한다**
([`LogPanel.tsx:157`](../src/components/right/LogPanel.tsx:157) ·
[`exportLog.ts:44`](../src/utils/exportLog.ts:44)). 화살표 표기의 출처가 여기다.

### 1.1 도착 경로가 4개다 ★

이번 작업의 본체다. 네 경로 전부 **토큰 단위로** `addLog` 한다.

| # | 경로 | 위치 | 성격 |
|---|---|---|---|
| 1 | 시간모드 타이머 | [`TokenContext.tsx:303`](../src/context/TokenContext.tsx:303) | **토큰마다 별도 `setTimeout`** — 서로 다른 태스크다 |
| 2 | 훈련 시작 즉시 배치(`arrivalSec<=0`) | [`TokenContext.tsx:372`](../src/context/TokenContext.tsx:372) | 루프 안에서 대당 1회 |
| 3 | 착대 라벨 더블클릭 | `UnitStatusPanel` · `UnitAddPanel` | `for (const t of items) moveToken(...)` |
| 4 | 동승 펌프 자동 하차 | [`TokenContext.tsx:637`](../src/context/TokenContext.tsx:637) | `moveToken` 이 **자기를 재귀 호출**한다 |

4번 때문에 「호출부에서 묶기」가 성립하지 않는다 — 호출부는 펌프가 함께 움직인 것을 모른다.
1번 때문에 「같은 동기 실행 단위로 묶기」만으로도 부족하다.

### 1.2 나머지 세 지점

| 요구 | 지금 | 원인 |
|---|---|---|
| RIT = 임무지정 | `직전대기 → RIT` + `임무: RIT` **2줄** | [`AFaceBottomZones.tsx:73`](../src/components/building/AFaceBottomZones.tsx:73) 가 `moveToken` 과 `toggleMissionTag` 를 잇달아 부른다 |
| 송수 무전 문구 | `물탱크1 → 소화전3` | [`WaterConnectionContext.tsx:98`](../src/context/WaterConnectionContext.tsx:98) 이 이름 둘을 화살표로 잇는 게 전부다. **`LogPayload` 에 송수 kind 가 없는 유일한 구멍** |
| 거점 한 줄 | 2줄 | [`PlayPage.tsx:329·337`](../src/pages/PlayPage.tsx:329) · [`StandbyColumn.tsx:64·73`](../src/components/building/StandbyColumn.tsx:64) 이 `addLog` 를 연달아 두 번 부른다 |

---

## 2. 확정 규칙 (사용자 결정 2026-09-10)

### 2.1 이동 문구

| 목적지 | 출발지 | 문구 | 묶음 |
|---|---|---|---|
| 대기1단계 · 자원대기소 | 출동대현황 · 추가출동대 | `대기1단계 도착: 진압1대, 구급1대, 물탱크1` | ○ |
| 대기1단계 · 자원대기소 | 그 밖 | `대기1단계 복귀: 진압1대` | ○ (도착과 **별도** 묶음) |
| RIT | — | `진압1대 RIT 임무지정` | ✕ |
| 그 밖(직전대기·임시의료소·면·층·현장지휘소) | — | `진압1대 대기1단계 → 직전대기 이동` | ✕ |
| 출동대현황 · 추가출동대 | — | **로그 없음 + 직전 도착 철회(§2.2)** | — |

**분류는 목적지 구역 키에서 파생한다 — 새 필드를 두지 않는다.**
`parseZoneKey()`([`logLabels.ts:85`](../src/utils/logLabels.ts:85)) 옆에 분류 함수만 더하면
기존 `move` payload 가 그대로 재해석된다.

**RIT 는 공간이 아니라 임무다.** 판 위에서는 RIT 칸에 토큰을 놓는 조작이지만
(`standby-rit` 구역), 문장은 임무지정으로 적는다. 뒤따르는 `toggleMissionTag` 의
`임무: RIT` 로그는 **RIT 태그일 때만 억제**한다 — 위치는 `move` payload 에 그대로 남으므로
분석 손실이 없다.

### 2.2 도착 철회 — append-only 전제가 깨지는 유일한 지점 ★

출동대현황·추가출동대로 되돌리는 조작은 **도착하지 않은 대를 도착으로 했다가 취소하는 경우**다.
실전에는 없는 일이므로 기록에서 지운다(사용자 확정).

```
대기1단계 도착: 진압1대, 구급1대, 물탱크1
  └ 진압1대를 출동대현황으로 되돌림
대기1단계 도착: 구급1대, 물탱크1        ← 줄을 다시 쓴다
  └ 마지막 한 대까지 빠지면 줄 자체를 삭제
```

**안전조건 — 그 도착 로그 이후에 그 대의 다른 로그가 없을 때만 철회한다.**
`도착 → 직전대기 이동 → 되돌리기` 라면 도착은 실제로 있었던 일이라 남긴다.
이 조건이 없으면 한참 활동한 대를 회수했을 때 앞뒤가 안 맞는 기록이 된다.

동승 펌프는 `moveToken` 재귀로 각자 철회되어 같은 줄에서 함께 빠진다.

> **로그가 사후 수정된다.** 지금까지 로그는 추가만 하는 배열이었다. 이번 변경에서
> 구조적으로 새로운 성질은 이것 하나뿐이므로 여기 명시해 둔다. 소비처(표시·CSV·PDF)는
> 전부 배열을 다시 읽으므로 영향이 없고, 세션 저장은 500ms 디바운스가 알아서 따라온다.

### 2.3 송수 문구

| from → to | 연결 | 해제 |
|---|---|---|
| 소화전 → 펌프·물탱크 | `물탱크1 44호 소화전 점령 / 중요물탱크 지정` | `물탱크1 44호 소화전 점령 해제 / 중요물탱크 해제` |
| 순환급수 → 펌프·물탱크 | `펌프1에 순환보수 실시` | `펌프1 순환보수 중단` |
| 펌프·물탱크 → 펌프·물탱크 | `물탱크1 펌프1에 급수 지원` | `물탱크1 펌프1 급수 중단` |
| 펌프·물탱크 → 고가·굴절 | `펌프1 고가차1 급수 펌프 지정` | `펌프1 고가차1 급수 중단` |
| 펌프·물탱크 → 연결송수구 | `펌프1 연결송수구 점령` | `펌프1 연결송수구 점령 해제` |
| 펌프·물탱크 → 진압대·구조대 | `진압1대 펌프1에서 수관전개` | **로그 없음** |
| 옥내소화전 → 진압대·구조대 | `진압1대 3층 옥내소화전에서 수관전개` | **로그 없음** |

**주어가 규칙마다 다르다 — 의도한 것이다(사용자 확정).**
「점령」·「수관전개」는 물을 **받는** 쪽이 주어이고, 「급수 지원」은 **주는** 쪽이 주어다.
현장에서 그렇게 말한다.

이름은 코드에 이미 있는 것을 그대로 쓴다 — 순환급수는 `"44호 소화전 순환급수"`
([`CirculationSlot.tsx:68`](../src/components/building/CirculationSlot.tsx:68)),
연결송수구는 `'연결송수구'`([`ControlLineToggles.tsx:298`](../src/components/building/ControlLineToggles.tsx:298)).

#### 「/ 중요물탱크 지정」을 같은 줄에 넣으려면 임무 로그의 주인을 옮겨야 한다 ★

지금은 [`WaterMissionBridge`](../src/components/shared/WaterMissionBridge.tsx) 가 연결 변경
**뒤의 이펙트**에서 따로 찍는다. 별도 태스크라 어떤 묶음 장치로도 같은 줄에 들어오지 않는다.

`deriveWaterMissions()`([`utils/waterMissions.ts`](../src/utils/waterMissions.ts))는 **순수 함수**다.
`addConnection` 이 연결이 더해진 상태로 미리 돌려 그 결과를 자기 로그 문장에 붙일 수 있다.
그러면 「중요」·「1선」은 연결 로그가 말하므로 브릿지의 중복 줄을 없앤다.
브릿지는 **태그를 붙이는 일**과 **「순환급수」 로그**(연결이 아니라 배치에서 파생)만 남긴다.

### 2.4 도착 줄 정렬

```
활동대   진압대 → 구조대 → 구급대
차량     펌프차 → 물탱크차 → 고가차 → 굴절차 → 구조차 → 화학차 → 배연차 → 산불진화차
기타     general   (설정모드 extraUnits — types/settings.ts:212)
유관기관 agency
```

**판 위 표시 순서(`typePriority`, [`arrivalOrder.ts:86`](../src/utils/arrivalOrder.ts:86) —
진압>물탱크>구조>구급)와 다르므로 재사용하지 않고 별도 비교자를 둔다.**
그걸 고치면 구역 안 토큰 정렬이 회귀한다.

### 2.5 거점 한 줄

```
자원대기소 지정, 소장: 지휘운전
임시의료소 설치, 소장: 진압1
```

`changeChief()` 두 곳에서 `addLog` 를 두 번 부르는 대신 한 줄로 만든다.
payload 는 `post-install` 에 소장을 끼우지 말고 **`post-open { post, chiefLabel }` 을 새로 둔다** —
끼워 넣으면 「설치만 한 경우」와 구분이 흐려진다.

층별 단위지휘관([`UnitCommanderContext.tsx:151`](../src/context/UnitCommanderContext.tsx:151))도
같은 모양인지 착수 시 함께 본다.

---

## 3. 묶음 방식 — 「같은 태스크 = 한 묶음」 + 타이머 그룹화 ★

`LogContext` 에 `addArrivalLog(unit, zoneKey, kind)` 를 둔다. 내부 버퍼에 쌓고
**`queueMicrotask` 로 flush** 한다. 시각은 **첫 push 시점**을 잡아 두고 쓴다(flush 시점이 아니라).

- §1.1의 경로 2·3·4는 전부 하나의 동기 태스크라 자동으로 묶인다.
  재귀 펌프 이동도 같은 태스크라 `대기1단계 도착: 진압1대, 펌프1` 로 함께 나온다.
- 경로 1(타이머)만 코드 변경이 필요하다 — `scheduleArrival` 을 **토큰별이 아니라
  `arrivalSec`(세션 복원 경로는 `targetAt`) 별로 한 타이머**로 묶는다.
  같은 착대는 같은 초라 한 콜백에서 처리된다.
- 「도착」과 「복귀」는 같은 버퍼를 쓰되 **따로 묶는다**(키에 kind 포함).

**시간창 방식을 쓰지 않는 이유.** [`arrivalGroup.ts`](../src/utils/arrivalGroup.ts) 의
표시용 10초 창을 그대로 쓰면 로그가 10초 늦게 찍히고, 짧게 잡으면 경계에서 갈라진다.
마이크로태스크는 지연이 없고 결과가 결정적이다.

**함정 둘.**
① `runKey` 재마운트로 Provider 가 내려갈 때 flush 가 남으면 언마운트 후 `setState` 가 된다
→ cleanup 에서 버리거나 즉시 flush 한다.
② StrictMode 이중 실행 — 도착 스케줄 이펙트에는 `timersStartedRef` 가드가 이미 있어
안전하지만, [EVENT_LOG_PLAN.md](EVENT_LOG_PLAN.md) E-0-1 과 같은 함정이라 검증 항목에 넣는다.

---

## 4. 문장 생성의 단일 출처 — `utils/logPhrase.ts` (신설)

`payload → 한 줄 문장` 함수 하나를 만들고 **`addLog` 시점에 `note` 에 박는다.**
화면·CSV·PDF 는 `note` 만 읽는다(`move` 의 화살표 조립을 걷어낸다).
payload 없는 구버전 세션은 기존 경로로 폴백한다.

이게 먼저여야 하는 이유 — 지금 문구 규칙이 `LogPanel` · `exportLog` · 각 `addLog` 호출부
셋에 흩어져 있어, 규칙을 고치면 세 곳이 어긋난다.
[EVENT_LOG_PLAN.md](EVENT_LOG_PLAN.md) L-6 이 같은 이유로 `logLabels.ts` 를 뽑아낸 전례가 있다.

목적지 분류(§2.1)와 정렬 비교자(§2.4)도 여기 둔다.

---

## 5. 변경 대상 파일

| 파일 | 내용 |
|---|---|
| `utils/logPhrase.ts` **(신설)** | payload → 문장. 목적지 분류 · 정렬 비교자 · 송수 문구 표 |
| `types/index.ts` | payload 3종 추가 — `arrival`(units[] 보유) · `water-relay` · `post-open` |
| `context/LogContext.tsx` | `addArrivalLog`(마이크로태스크 묶음) · `retractArrival` |
| `context/TokenContext.tsx` | `scheduleArrival` 을 도착초별 한 타이머로. 도착·복귀·RIT 분기 |
| `context/WaterConnectionContext.tsx` | 연결 로그에 payload + 파생 임무 동봉 |
| `components/shared/WaterMissionBridge.tsx` | 중요·1선 로그를 연결 로그에 넘기고 순환급수만 남김 |
| `components/building/AFaceBottomZones.tsx` | RIT 태그 로그 억제 |
| `pages/PlayPage.tsx` · `components/building/StandbyColumn.tsx` | 거점 한 줄 |
| `components/right/LogPanel.tsx` · `utils/exportLog.ts` | `move` 화살표 조립 제거 → `note` 표시 |

---

## 6. 작업 순서

| # | 단계 | 크기 | 비고 |
|---|---|---|---|
| 1 | `utils/logPhrase.ts` + payload 3종 | 0.5일 | 토대 |
| 2 | 거점 한 줄 (§2.5) | 0.3일 | 가장 작다 — 1번 검증용으로 먼저 |
| 3 | 목적지 분류 + RIT + 복귀 (§2.1) | 0.5일 | |
| 4 | 도착 묶음 + 타이머 그룹화 (§3) | 1일 | **위험 구간** |
| 5 | 도착 철회 (§2.2) | 0.5일 | |
| 6 | 송수 문구 + 임무 로그 주인 이동 (§2.3) | 1일 | |

---

## 7. 검증

### 7.1 기계 검증

```
npx tsc -b --force
npm run lint        # 기준선 오류 55 · 경고 9 — 새 오류만 회귀
npm run lint:css    # 기준선 0
```

`utils/logPhrase.ts` 는 **순수 헬퍼라 `.ts` 로 둔다** — `.tsx` 로 만들면
`react-refresh/only-export-components` 기준선이 조용히 불어난다(`CLAUDE.md`).

### 7.2 회귀 확인 4종 ★

로그를 고치면서 **이 넷이 흔들리지 않았음을 증명해야 한다.**
4번 단계에서 도착 타이머 구조를 바꾸므로 앞의 둘이 특히 중요하다.

| # | 대상 | 확인 방법 |
|---|---|---|
| 1 | 도착 타이머 시각 | 시간모드에서 착대별 도착 시각이 설정값과 일치 |
| 2 | 동승 펌프 하차 지점 | 진압대를 직전대기로 보내면 펌프가 대기1단계(또는 자원대기소)에 남는다 |
| 3 | RIT 태그 부여 | RIT 칸 드롭 시 임무 칩이 그대로 붙는다(로그만 바뀐다) |
| 4 | 판 위 토큰 정렬 | 구역 안 순서가 종전과 같다(`typePriority` 미변경) |

### 7.3 브라우저 검증 시나리오

- 시간모드 훈련 시작 → 같은 착대 여러 대가 **한 줄**로 도착
- 착대 라벨 더블클릭 → 한 줄
- 진압대 1대만 더블클릭 → 동승 펌프와 **함께 한 줄**
- 도착한 대를 출동대현황으로 되돌림 → 그 줄에서 이름이 빠진다 / 마지막이면 줄 삭제
- 직전대기 → 대기1단계 → `복귀`
- RIT 칸 드롭 → `임무지정` 한 줄
- 소화전 연결 → `점령 / 중요물탱크 지정` 한 줄, 해제 → `점령 해제 / 중요물탱크 해제`
- 자원대기소장 지명 → `자원대기소 지정, 소장: …` 한 줄

`CLAUDE.md` 의 브라우저 검증 주의를 따른다 — **sessionStorage 는 500ms 디바운스**라
조작 직후에 읽으면 이전 값이 나온다. DOM 을 직접 본다.

---

## 8. 남겨 둔 판단

| # | 항목 | 상태 |
|---|---|---|
| 1 | **수관전개 해제를 기록하지 않는다** | 사용자 확정. 관창을 언제 뺐는지가 로그에 없어지지만 방수 중단(`status-tag`)이 대신한다. 되살리려면 §2.3 표 한 줄이다 |
| 2 | 순환보수의 해제 문구 | 주신 세 형태(점령 해제·급수 중단) 중 딱 맞는 것이 없어 `순환보수 중단`으로 짝을 맞췄다 |
| 3 | 차량 내부 정렬 | `UNIT_TYPES` 배열 순서(펌프→굴절→고가→물탱크)가 아니라 **실무 호명 순서**(§2.4)를 쓴다 |

---

## 9. 범위 경계

전부 **훈련모드(무플)** 안이다. 설정모드·지휘모드·분석창은 건드리지 않는다 —
필요가 생기면 [DEFERRED_PROPAGATION.md](DEFERRED_PROPAGATION.md) §3 에 적는다.
CSV/PDF 는 훈련 산출물이라 §4 에서 함께 따라온다.

---

## 10. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-09-10 | 최초 작성. 현재 구조 실측(§1), 확정 규칙 §2.1~§2.5, 묶음 방식(§3), 단일 출처(§4), 작업 순서(§6), 회귀 확인 4종(§7.2) |
