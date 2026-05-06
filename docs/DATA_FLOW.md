# DATA_FLOW.md — 데이터 흐름

> 최종 업데이트: 2026-05-05

---

## 1. 전체 데이터 계층

```
설정 데이터 (localStorage, 영구)
  └── SettingsProvider (settingsStore.tsx)
        └── 설정창에서 편집
              └── 훈련 세팅 시 → 런타임 초기화에 사용

런타임 데이터 (sessionStorage, 탭 생명주기)
  ├── TokenContext     → KEY_TOKENS
  ├── VictimContext    → KEY_VICTIMS
  ├── TrainingContext  → KEY_TRAINING
  └── EventContext     → KEY_EVENTS
```

---

## 2. 설정창 → 훈련창 데이터 흐름

```
[설정창] BuildingConfigPanel
  → settingsStore.updateBuilding()
    → localStorage 'tacticalBoardWorkingPresets'

[훈련 세팅 버튼 클릭]
  → TrainingContext.loadSettings()
    → clearRuntimeSession()          // sessionStorage 초기화
    → 설정값을 훈련창 컨텍스트에 주입:
        building.config   → BuildingBoard (층 구조)
        building.fireFloor → BuildingBoard (화점층)
        building.fireStatus → BuildingStateContext (초기 화재상태)
        dispatchRoster    → TokenContext (출동대 토큰 생성)
        victimSetup       → VictimContext (구조대상자 초기 배치)
        hydrantSetup      → TacticalArea (소화전 아이콘 렌더)
        eventSetup        → EventContext (이벤트 토큰 활성화)
    → runKey 증가 (EventProvider, TokenProvider, VictimProvider 재마운트)
```

---

## 3. localStorage 구조

```
Key: 'tacticalBoardSettingsList'
Value: SettingsSet[] (JSON)
  SettingsSet {
    id:               string       // generateId()
    name:             string       // 설정 세트 이름
    updatedAt:        string       // ISO 날짜
    building: {
      config:         BuildingConfig  // aboveGroundFloors, basementFloors
      fireFloor:      number
      fireStatus:     FireStatus | null
      targetName:     string
    }
    timing:           TimingSettings
    dispatchSetup:    DispatchSetup
    dispatchRoster:   DispatchRosterItem[]
    arrivalMode:      ArrivalMode     // 'time' | 'order'
    victimSetup:      VictimSetupItem[]
    hydrantSetup:     HydrantSetupItem[]
    eventSetup:       EventSetupItem[]
    medicalPostChief: string
    stagingAreaChief: string
  }

Key: 'tacticalBoardWorkingPresets'
Value: WorkingPresets (JSON) — 자동 저장 (설정 변경마다)
  {
    timing, dispatchSetup, dispatchRoster, arrivalMode,
    victimSetup, hydrantSetup, eventSetup,
    medicalPostChief, stagingAreaChief,
    sharedBadgePresets: SharedBadgePreset[]
    unitBadgePresets:   UnitSpecificBadgePreset[]
  }
```

---

## 4. sessionStorage 구조

```
Key: 'tactical-board.runtime.tokens'
Value: TokenSessionState {
  tokens:           UnitToken[]
  logs:             LogEntry[]
  positions:        Record<tokenId, Pos>
  arrivalTargetAt:  Record<tokenId, number>  // 절대 ms 타임스탬프
  moveTargetAt:     Record<tokenId, number>
  counters:         Record<baseKey, number>  // 수동 생성 번호 중복 방지
}

Key: 'tactical-board.runtime.victims'
Value: VictimSessionState {
  victims:         VictimToken[]
  victimPositions: Record<victimId, Pos>
}

Key: 'tactical-board.runtime.training'
Value: TrainingSessionState {
  status:    'idle' | 'running' | 'ended'
  startedAt: number | null   // Date.now()
  endedAt:   number | null
}

Key: 'tactical-board.runtime.events'
Value: EventSessionState {
  positions: Record<eventId, {x, y}>
  statuses:  Record<eventId, EventStatus>
}
```

---

## 5. 출동대 토큰 생성 흐름

```
[설정창] DispatchSetupPanel
  → 수량 설정 (suppression: 3, rescue: 2 ...)
  → dispatchRoster: DispatchRosterItem[] 자동 생성 (buildRoster())
      DispatchRosterItem {
        id, name, unitType, linkedTo(차량 연결),
        arrivalSec, arrivalOrder
      }

[훈련 세팅] TrainingContext.loadSettings()
  → TokenContext: rosterItemToToken(item) 으로 UnitToken 생성
      UnitToken {
        id, label, type, color, unitType,
        zoneKey: null (pool에서 시작),
        source: 'roster'
      }
  → 도착 카운트다운 등록 (arrivalTargetAt = Date.now() + arrivalSec*1000)

[훈련 시작] status: 'idle' → 'running'
  → 1초 인터벌 시작
  → 매 틱: arrivalTargetAt 초과 토큰 → standby-standby1으로 자동 이동

[수동 추가] UnitAddDrawer
  → TokenContext.createToken()
      source: 'manual', zoneKey: null
```

---

## 6. 토큰 이동 흐름

```
[드래그 앤 드롭]
  사용자 → ZoneCell.onDrop / ExteriorZone.onDrop
    → TokenContext.moveToken(tokenId, toZoneKey, pos?)
        1. 이동 카운트다운 시작 (30초)
        2. token.zoneKey 업데이트
        3. token.lastMovedAt = Date.now()
        4. addLog({ logType: 'move', fromZoneId, toZoneId })
        5. sessionStorage 저장 (500ms 디바운스)

[자동 도착]
  TrainingContext 틱 → moveToken(id, 'standby-standby1', undefined, { suppressMoveCountdown: true })
    → 이동 카운트다운 없이 즉시 이동
```

---

## 7. 구조 처리 흐름

```
[1단계] 구조대 우클릭 → '구조 시작' 선택
  → ActionModeContext.enterMode({ type: 'rescue', sourceId: tokenId })

[2단계] 피해자 클릭
  → TokenContext.rescueUnit(tokenId, victimLabel)
      → victim.zoneKey = 'medical-post'
      → 구조중 배지 추가 (line1: '구조중')
      → 의료 카운트다운 시작 (30초)
      → addLog({ logType: 'rescue', note: '구조: [victim]' })

[3단계] 30초 경과
  → 구조중 배지 제거
  → victim.zoneKey = 'standby-imminent' (직전대기)
  → rescueLocation 스냅샷 저장
```

---

## 8. 건물 상태 (화재·연기·문) 흐름

```
BuildingStateContext 내부 상태:
  doorStates:         Record<floorId, 'open'|'closed'>
  fireStates:         Record<floorId, FireStatus|null>
  stairSmokeFloor:    number | null   // 연기 유입 최저 층번호
  smokeConcentration: number          // 0/50/100

연기 계산 규칙:
  화재층 문 열림 + 활성 화재상태 → smokeConcentration = RF열림?50:100
  RF 열림 + 유입경로 있음 → smokeConcentration = 50 (배연 중)
  RF 열림 + 유입경로 없음 → smokeConcentration = 0, stairSmokeFloor = null
  RF 닫힘 + 연기 있음 → smokeConcentration = 100

SmokeLevel 파생:
  stairSmokeFloor === null → 'none'
  concentration === 0      → 'none'
  concentration < 67       → 'weak'
  concentration >= 67      → 'full'

로그 발생 시점:
  setDoorState()   → onDoorChange() → BuildingBoard.handleDoorChange() → addLog('door')
  setFireStatus()  → onFireChange() → BuildingBoard.handleFireChange() → addLog('fire-status')
  globalSmokeLevel 변경 감지 → onSmokeChange() → addLog('smoke')
  (초기화 시 prevSmokeLevelRef로 중복 로그 방지)
```

---

## 9. 이벤트 토큰 흐름

```
[설정창] EventSetupPanel
  → settingsStore.addEventSetupItem / updateEventSetupItem
    → localStorage 저장

[훈련세팅]
  → EventProvider 재마운트 (runKey 증가)
    → enabledEvents = eventSetup.filter(e.enabled)
    → sessionStorage에서 positions/statuses 복원 (없으면 빈 객체)
    → 위치 미지정 항목 → EventLayer 초기 배치 (좌하단 격자)

[우클릭] 상태 변경
  → EventLayer.handleStatusChange(id, status)
    → addLog({ logType: 'event-status', tokenName: label, note: statusLabel })
    → EventContext.setEventStatus(id, status)
      → sessionStorage 저장
```

---

## 10. 송수 연결 흐름

```
[소화전/펌프 우클릭] → '송수' 버튼
  → ActionModeContext.enterMode({
      type: 'water-connect',
      sourceId: id,
      sourceType: 'hydrant' | 'pump' | 'water_tank',
      sourceName: name  // 소화전은 이름 직접 전달 (토큰 아님)
    })

[대상 토큰 클릭] TokenCard.handleClick
  → WaterConnectionContext.addConnection(
      fromId, toId, fromType, toType, fromNameOverride?
    )
      1. 중복 연결 방지 (fromId+toId 조합 확인)
      2. fromName = fromNameOverride ?? tokens.find(fromId)?.label ?? fromId
      3. toName   = tokens.find(toId)?.label ?? toId
      4. addLog({ logType: 'water-relay', note: 'fromName → toName' })
      5. connections 배열에 추가

[SVG 렌더링]
  WaterConnectionOverlay
    → connections 배열 순회
    → 각 fromId·toId의 DOM 요소 위치를 getBoundingClientRect()로 계산
    → SVG polyline 그리기

[연결 해제]
  → WaterConnectionContext.removeConnection(id)
    → addLog({ note: 'fromName → toName 해제' })
    → connections에서 제거
```

---

## 11. 로그 생성 → 표시 → 내보내기 흐름

```
[생성] TokenContext.addLog(entry)
  → id = generateId()
  → timestamp = nowHHMM() (HH:MM 형식)
  → logs 배열 앞에 추가 (최신순)
  → sessionStorage 저장

[표시] LogPanel.tsx
  → logs.map(entry => <LogEntryRow key={entry.id} entry={entry} />)
  → logType별 렌더링 분기
  → 최신 항목이 상단에 표시

[CSV 내보내기]
  → exportLogsAsCsv(logs, targetName)
    → logs.reverse() (시간순)
    → 각 항목: timestamp, LOG_TYPE_LABELS[logType], entryContent(entry)
    → UTF-8 BOM + CSV 문자열
    → 파일명: 이벤트로그_{targetName}_{YYYYMMDD}.csv
```

---

## 12. Provider 중첩 순서 (PlayPage)

```
EventProvider (key={runKey})
  └── TokenProvider (key={runKey})
        └── VictimProvider (key={runKey})
              └── ActionModeProvider
                    └── WaterConnectionProvider
                          └── HydrantStateProvider
                                └── [UI 컴포넌트들]
                                      └── TacticalArea
                                            └── BuildingBoard
                                                  └── BuildingStateProvider
```

**주의**: `EventProvider`가 `TokenProvider` 바깥에 있다.  
→ `EventContext` 내부에서 `useTokens()` 사용 불가.  
→ 이벤트 로그는 `EventLayer` 컴포넌트(TokenProvider 안쪽)에서 처리.
