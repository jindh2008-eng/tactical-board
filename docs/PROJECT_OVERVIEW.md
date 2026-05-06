# PROJECT_OVERVIEW.md — 전술상황판 프로젝트 개요

> 최종 업데이트: 2026-05-05  
> 기술 스택: React 19 + TypeScript + Vite + react-router-dom v7

---

## 1. 프로그램 목적

**소방 훈련용 전술 상황판**. 화재 현장 지휘관이 훈련 중 출동대·차량·구조대상자·위험물 등을 시각적으로 배치하고, 건물 상태(화재·연기·방화문)를 실시간으로 표시하며, 전체 이벤트를 로그로 기록하는 웹 애플리케이션.

종이/화이트보드 기반 훈련을 디지털로 대체하고, 훈련 후 CSV 로그로 복기할 수 있도록 설계됐다.

---

## 2. 주요 화면 구성

### 설정창 (`/settings`)
훈련 시작 전 시나리오를 구성하는 곳. 실행 중에는 이 값을 수정하지 않는다.

| 패널 | 역할 |
|------|------|
| 설정 라이브러리 | 설정 세트 저장·불러오기·삭제 |
| 건물 정보 | 지상/지하 층수, 화점층, 화재상태, 건물명 |
| 소화전 | 소화전 이름·방면·거리 사전 등록 |
| 출동대 편성 | 진압대·구조대·구급대·차량 수량 + 도착 시간/순서 |
| 도착 설정 | 시간 기반(자동) or 순서 기반(수동) 도착 |
| 구조대상자 | 피해자 성별·연령·상태·위치 사전 등록 |
| 이벤트 | 위험물 토큰(LPG통, 지게차 등) 이름·아이콘·종류 등록 |
| 배지 프리셋 | 출동대별 상태 배지 프리셋 관리 |

### 훈련창 (`/play`)
훈련 진행 중 실제로 사용하는 화면. 3패널 레이아웃.

```
┌─────────────────────────────────────────────────────┐
│ 상단 Navbar: 건물명 / 훈련 타이머 / 훈련세팅·시작·종료 │
├──────────────┬───────────────────────────┬──────────┤
│ 왼쪽 패널    │  중앙 TacticalArea         │ 오른쪽   │
│ • 자원대기소 │  • A~D면 외곽 작전구역    │ 패널     │
│ • 출동대현황 │  • 건물 층별 구역          │ • 이벤트 │
│ • 구조대상자 │  • 계단실/화점/내부        │   로그   │
│             │  • 소화전 아이콘           │          │
│             │  • 이벤트 토큰 레이어      │          │
│             │  • 송수연결 오버레이(SVG)  │          │
└──────────────┴───────────────────────────┴──────────┘
```

---

## 3. 설정창 vs 훈련창 역할 구분

| 구분 | 설정창 | 훈련창 |
|------|--------|--------|
| 데이터 저장 위치 | localStorage | sessionStorage |
| 변경 가능 여부 | 자유롭게 편집 | 읽기 전용 (설정 변경 없음) |
| 유지 기간 | 영구 (명시 삭제 전) | 브라우저 탭 생명주기 |
| 역할 | 시나리오 정의 | 훈련 실행 |

**훈련 세팅** 버튼을 누르면 sessionStorage를 초기화하고 설정창 값을 훈련창에 적용한다.  
**훈련 시작** 버튼을 누르면 도착 타이머가 시작되고, 자동 도착 모드에서 출동대가 순서대로 이동한다.

---

## 4. 폴더 구조

```
src/
├── types/               # 전체 도메인 타입 정의
│   ├── index.ts         # 핵심 타입 (UnitToken, LogEntry, Pos 등)
│   ├── victim.ts        # 구조대상자 관련 타입
│   ├── events.ts        # 이벤트 토큰 타입 + 상태 목록
│   ├── settings.ts      # 설정 관련 타입 (BuildingSettings 등)
│   └── presets.ts       # 배지 프리셋 타입
│
├── context/             # React Context (런타임 상태 관리)
│   ├── TokenContext.tsx        # ★ 핵심: 출동대 토큰 전체 라이프사이클
│   ├── VictimContext.tsx       # 구조대상자 토큰
│   ├── EventContext.tsx        # 이벤트 토큰 (위치·상태)
│   ├── BuildingStateContext.tsx # 건물 상태 (화재·문·연기)
│   ├── TrainingContext.tsx     # 훈련 세션 (idle/running/ended)
│   ├── ActionModeContext.tsx   # 단일 액션 모드 관리
│   ├── WaterConnectionContext.tsx # 송수 연결
│   ├── HydrantStateContext.tsx # 소화전 고장 상태
│   └── UIOverlayContext.tsx    # 오버레이 표시 상태
│
├── store/               # 설정 스토어 (영구 저장)
│   ├── settingsStore.tsx # ★ 핵심: 모든 설정값 localStorage 관리
│   └── playStore.ts      # TokenContext·VictimContext re-export
│
├── utils/               # 유틸리티 함수
│   ├── settingsStorage.ts  # localStorage 읽기·쓰기 (하위호환 마이그레이션)
│   ├── runtimeSession.ts   # sessionStorage 읽기·쓰기
│   ├── dispatchRoster.ts   # 출동대 로스터 생성
│   ├── dispatchArrival.ts  # 로스터→토큰 변환, 도착 타이머
│   ├── victimUtils.ts      # 구조대상자 생성·변환
│   ├── victimPlacement.ts  # 구조대상자 초기 위치 계산
│   ├── exportLog.ts        # CSV 내보내기
│   └── floorOptions.ts     # 층 표시 레이블 유틸
│
├── data/                # 정적 데이터·레이아웃 생성
│   ├── buildingData.ts   # 건물 구조 생성 (층·구역 레이아웃)
│   └── faceZoneData.ts   # 외곽 작전면 구역 정의
│
├── config/              # UI 설정 데이터
│   ├── radialActions.ts  # 우클릭 원형 메뉴 액션 정의
│   └── unitStatusPresets.ts # 출동대별 상태 태그 프리셋
│
├── pages/
│   ├── PlayPage.tsx      # ★ 훈련창 (Provider 중첩 + 레이아웃)
│   └── SettingsPage.tsx  # 설정창
│
├── components/
│   ├── building/         # 건물 렌더링 (층·구역·계단·외곽면)
│   ├── events/           # 이벤트 토큰 카드·레이어
│   ├── shared/           # 공통 컴포넌트 (TokenCard, VictimCard, 메뉴들)
│   ├── left/             # 왼쪽 패널 (출동대 현황, 구조대상자)
│   ├── right/            # 오른쪽 패널 (이벤트 로그)
│   ├── overlay/          # 송수 연결 SVG 오버레이
│   ├── overlays/         # 모달 오버레이 (UnitAdd, Log, Analysis)
│   └── settings/         # 설정창 각 패널 컴포넌트
│
└── App.tsx              # 라우터 + 최상위 Provider 중첩
```

---

## 5. 핵심 파일 → 기능 영향 매핑

| 수정 파일 | 영향 기능 |
|-----------|-----------|
| `types/index.ts` | 전체 타입 체계 (변경 시 파급 범위 큼) |
| `context/TokenContext.tsx` | 출동대 생성·이동·상태·로그·카운트다운 전체 |
| `context/BuildingStateContext.tsx` | 계단실 연기·방화문·화재상태 로직 |
| `data/buildingData.ts` | 건물 층 레이아웃 압축 표시 방식 |
| `store/settingsStore.tsx` | 설정 저장·불러오기 전체 |
| `utils/settingsStorage.ts` | localStorage 구조 변경 시 마이그레이션 필요 |
| `utils/dispatchRoster.ts` | 출동대 로스터 생성 방식 |
| `config/radialActions.ts` | 우클릭 메뉴 항목 |
| `components/shared/TokenCard.tsx` | 토큰 표시·우클릭 메뉴 전체 |
| `components/right/LogPanel.tsx` | 로그 항목 렌더링 |
| `utils/exportLog.ts` | CSV 내보내기 내용 |
