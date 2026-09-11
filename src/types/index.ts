// ─────────────────────────────────────────────
// 공통 좌표 타입
// ─────────────────────────────────────────────

export interface Pos { x: number; y: number; }

// ─────────────────────────────────────────────
// 건물 설정 타입
// ─────────────────────────────────────────────

export interface BuildingConfig {
  aboveGroundFloors: number;
  basementFloors:    number;
}

// ─────────────────────────────────────────────
// 건물 내부 구역 타입
// ─────────────────────────────────────────────

export type FloorId = string;

export type ZoneId = 'center' | 'right' | 'stair';

export interface ZoneStatus {
  fire?:     boolean;
  smoke?:    boolean;
  fireDoor?: boolean;
  roofDoor?: boolean;
  tokenIds?: string[];
}

export interface Zone {
  id:           ZoneId;
  label:        string;
  status:       ZoneStatus;
  acceptsTokens: boolean;   // 출동대 토큰 배치 허용 여부
}

export interface Floor {
  id:         FloorId;
  label:      string;
  isBasement: boolean;
  zones:      Zone[];
}

/**
 * 화면 표시용 층 행
 *
 * 건물 층수가 많을 때 여러 층을 하나의 행으로 압축 표시하기 위해
 * 실제 층수(startFloor~endFloor)와 화면 레이블(label)을 분리함.
 *
 * isRange === true 이면 label은 "1~3F" 형식, false 이면 "4F" 형식.
 */
export interface DisplayFloor {
  id:         string;    // 고유 키 (예: "10F", "1F-3F", "B1")
  label:      string;    // 화면 표시 레이블 (예: "10F", "1~3F", "B1")
  startFloor: number;    // 이 행이 대표하는 실제 최하 층번호
  endFloor:   number;    // 이 행이 대표하는 실제 최상 층번호
  isRange:    boolean;   // 복수 층 압축 행 여부
  isBasement: boolean;
  zones:      Zone[];    // 렌더링에 사용할 구역 배열
}

// ─────────────────────────────────────────────
// 외곽 작전 면(A/B/C/D) 타입
// ─────────────────────────────────────────────

/** 건물 외부 4개 작전면 */
export type Face = 'A' | 'B' | 'C' | 'D';

/**
 * 코너(모서리) 작전 구역 — 두 방면이 만나는 지점
 * AB = A면·B면 코너, BC = B면·C면 코너, 등
 * 향후 차량 대기·진입로 설정 등에 활용
 */
export type CornerFace = 'AB' | 'BC' | 'CD' | 'AD';

/**
 * 방면 zone의 종류.
 *
 * 'face' 하나뿐이다 — 초기 설계에 있던 'assignment'(방면별 1선펌프·중요물탱크 부서칸)는
 * 드롭 존으로 렌더된 적이 없는 미구현 개념이라 제거했다(2026-08-20).
 * 부서·임무는 배지·임무태그로 표현하고 로그에서 구조화한다.
 */
export type FaceZoneCategory = 'face';

/** 외곽 작전면의 드롭 가능 zone 단위 */
export interface FaceZone {
  id:        string;           // e.g. "A-face"
  face:      Face;
  category:  FaceZoneCategory;
  label:     string;           // 화면 표시용 레이블
  tokenIds?: string[];         // 향후: 배치된 토큰 ID 목록
}

// ─────────────────────────────────────────────
// 드래그 가능 출동대 토큰
// ─────────────────────────────────────────────

export type TokenType  = 'activity' | 'vehicle' | 'agency' | 'custom';
export type TokenColor = 'red' | 'yellow' | 'green' | 'blue' | 'white' | 'vehicle' | 'agency';

/** 토큰에 직접 부착되는 상태 배지 (1~2줄 표시) */
export interface TokenBadge {
  id:     string;
  line1:  string;
  line2?: string;
  color?: TokenColor;
}

/** 재사용 가능한 배지 프리셋 (localStorage 유지) */
export interface BadgePreset {
  id:     string;
  line1:  string;
  line2?: string;
}

/** 사용자가 선택하는 단일 상태 태그 */
export interface StatusTag {
  label: string;
  color: string;   // 색상 키 (e.g. 'blue', 'yellow', 'red')
}

export interface UnitToken {
  id:       string;                    // 고유 ID
  label:    string;                    // 표시 이름 (진압1대, 펌프2호 등)
  type:     TokenType;                 // 토큰 종류
  color:    TokenColor;                // 색상 키
  unitType: string;                    // 출동대 종류 키 (e.g. 'suppression', 'pump', 'ladder')
  zoneKey:  string | null;             // 현재 위치 구역 키 (null = pool/출동대현황)
  badges:   TokenBadge[];              // 시스템 전용 상태 배지 (구조중 등)
  missionTags?: StatusTag[];            // 임무 태그 (토큰 좌측 표시, 복수 선택)
  statusTag?:  StatusTag;              // 상태 태그 (토큰 위 표시, 1개 토글)
  customNote?: string;                 // 메모 (말풍선 표시, X로 닫음)
  /**
   * 생성 경로
   * 'roster' : dispatchRoster 기반 자동 생성
   * 'manual' : 사용자가 실행 중 직접 생성
   */
  source:      'roster' | 'manual';
  /**
   * 함께 만들어진 짝의 그룹 ID. 진압대+펌프처럼 한 번에 생성된 토큰이 같은 값을 갖는다.
   * 하나를 지우면 같은 그룹이 함께 지워진다.
   */
  pairGroupId?: string;
  /**
   * 착대 덮어쓰기 — 훈련 중 바꾼 값.
   *
   * 값이 없으면 설정 로스터의 arrivalOrder 를 따른다. 훈련창에서 설정은 읽기
   * 전용이라 로스터를 고칠 수 없어, 여기에 얹어 두고 `훈련 세팅` 때 함께
   * 사라지게 한다. → utils/arrivalOrder.ts
   */
  arrivalOrder?: number;
  lastMovedAt?: number;    // 마지막 이동 시각 (Date.now()) — recently-moved 강조용
  sprayState?:  SprayState | null;                                       // 방수 상태 (진압대 전용)
  /**
   * 방수 지점 (전술보드 기준 상대 좌표).
   * `eventId`가 있으면 현장요소 토큰을 직접 겨눈 것이다 — `floorId`에는 그 토큰의 배치 구역이 들어간다.
   */
  sprayTarget?: { x: number; y: number; floorId?: string; label?: string; eventId?: string } | null;
  /**
   * 탑승한 고가·굴절차 토큰 id — **바스켓에 타고 있다는 뜻이다.**
   *
   * 국내(강원) 고가·굴절차는 운전원이 1명이라 바스켓을 운용하려면 활동대가
   * 따로 부서돼 올라타야 한다. 그것을 판에 옮긴 것이 이 값이다.
   *
   * `zoneKey` 는 **그대로 둔다**(차가 선 방면). 자리를 옮기는 것이 아니라
   * 그리는 데만 바뀌는 것이라, 방수 판정·대기 이동·로그가 보는 zoneKey 를
   * 건드리면 그 분기 전부에 새 경우가 생긴다. 단위지휘관이 같은 방식이다 —
   * 토큰은 구역에 있고 슬롯이 그린다.
   *
   * 그리는 곳은 AerialOverlay 의 탑승 층이고, 구역 렌더는 이 값이 있는 토큰을
   * 뺀다(ZoneCell·ExteriorZone). **그리는 쪽이 사라지면 반드시 내려야 한다** —
   * 전개가 풀린 차에 태운 채로 두면 아무도 안 그려 토큰이 사라진다.
   */
  ridingOn?: string;
  aerialTarget?: { floorId: string; x: number; y: number; deployLabel: string } | null;  // 고가차/굴절차 전개 지점
  aerialSprayTarget?: { floorId: string; x: number; y: number } | null;                  // 고가차/굴절차 방수 지점
}

// ─────────────────────────────────────────────
// 로그 타입 (향후 사용)
// ─────────────────────────────────────────────

/**
 * 로그 종류
 * 'move'        : 일반 이동 (A면으로 이동 등)
 * 'rescue'      : 구조 처리 (구조대상자 → 임시의료소 이동)
 * 'fire-status' : 화재상태 변화 (1층 최성기 등)
 * 'status-tag'  : 출동대 상태 변경 (진압1대 단위지휘관 등)
 * 'training'    : 훈련 진행 (시작·종료) — 모든 경과시간의 기준점
 * 'dispatch'    : 출동대 편성 (초기 출동 · 추가출동대 요청 · 회수)
 * 'search'      : 인명검색 진행 (시작 · 중단 · 2차 전환)
 * 'victim-found': 구조대상자 발견
 * 'post'        : 임시의료소·자원대기소 설치와 소장 지명
 * 'arrival'     : 도착·복귀 묶음 — 같은 태스크에 들어온 대를 한 줄로 (EVENT_LOG_PHRASING_PLAN §3)
 */
export type LogType = 'move' | 'rescue' | 'fire-status' | 'status-tag' | 'water-relay' | 'door' | 'smoke' | 'event-status' | 'checklist' | 'training' | 'dispatch' | 'search' | 'victim-found' | 'post' | 'arrival';

/**
 * 로그의 구조화 데이터.
 *
 * `note`(사람이 읽는 문장)와 **함께** 보관한다. 표시는 note를, 분석은 payload를 쓴다.
 * 문자열 비교로 분기하던 코드(`note === '해제'` 등)를 걷어내고, AI 분석이 집계·조인할 수
 * 있게 하는 것이 목적이다. docs/EVENT_LOG_PLAN.md L-5 / E-3
 *
 * 구버전 세션 저장분에는 없다 — 소비처는 없으면 note 경로로 폴백해야 한다.
 */
export type LogPayload =
  /** 훈련 진행 — 모든 경과시간의 기준점 */
  | { kind: 'training'; phase: 'start' | 'end' }
  /** 초기 출동 편성 (상황실이 화재신고 시점에 출동시킨 편성) */
  | { kind: 'dispatch-initial'; units: DispatchUnitRef[]; summary: DispatchSummaryItem[] }
  /** 추가출동대 요청 (훈련 중 생성) */
  | { kind: 'dispatch-add';     units: DispatchUnitRef[]; summary: DispatchSummaryItem[] }
  /** 추가출동대 회수 (훈련 중 삭제) */
  | { kind: 'dispatch-remove';  units: DispatchUnitRef[]; summary: DispatchSummaryItem[] }
  /** 인명검색 투입 */
  | { kind: 'search-start';     floorId: string; tokenId: string; tokenLabel: string; phase: SearchPhase }
  /** 인명검색 이탈 */
  | { kind: 'search-stop';      floorId: string; tokenId: string; tokenLabel: string; reason: SearchStopReason }
  /** 초진 도달 → 1차 동결(해당 층 검색 중단) */
  | { kind: 'search-primary-frozen'; floorId: string; tokenIds: string[] }
  /** 구조대상자 발견 */
  | { kind: 'victim-found';     victimId: string; victimLabel: string; zoneKey: string | null; via: VictimFoundVia }
  /**
   * 현장요소 상태 변경.
   * `resolved`가 발생↔해제를 확정적으로 가른다 — 문구를 바꿔도 지속시간 계산이 깨지지 않는다.
   */
  | { kind: 'event-status';     eventId: string; eventLabel: string; eventType: string;
      status: string; resolved: boolean;
      /** 배치 구역 키('face-A' · '3F-center' …). 보드 밖이면 null */
      zoneKey: string | null; floorId: string | null; face: string | null;
      firePercentage: number | null }
  /** 화재계 이벤트의 진행 % — 구간(EVENT_PCT_LOG_STEP)을 넘길 때만 남긴다 */
  | { kind: 'event-fire-pct';   eventId: string; eventLabel: string; zoneKey: string | null; percentage: number }
  /** 출동대 상태메시지(설정된 프리셋 선택) */
  | { kind: 'unit-status-message'; tokenId: string; tokenLabel: string; message: string | null }
  /** 설비 상태메시지 (소화전·연결송수구 등) */
  | { kind: 'equipment-message';   equipmentId: string; message: string | null }
  /**
   * 출동대 이동. 좌표는 담지 않는다 — 구역(면/층/계단실·내부)까지가 분석 단위다.
   * `from`/`to`는 `utils/logLabels.ts`의 `parseZoneKey()` 결과다.
   */
  | { kind: 'move';  tokenId: string; tokenLabel: string; unitType: string;
      fromZoneKey: string; toZoneKey: string; auto: boolean;
      /**
       * 문장의 성격 — 'mission' 은 RIT 임무지정이다(칸이 아니라 임무).
       * 이 값이 있으면 note 가 완성된 문장이다(EVENT_LOG_PHRASING_PLAN §4). 구버전 저장분엔 없다
       */
      intent?: 'move' | 'mission' }
  /**
   * 도착·복귀 한 묶음 — 같은 태스크에 들어온 대를 한 줄로 적는다.
   * `units` 로 대별 이동을 다시 펼칠 수 있다 — 출동대별 이동 기록(G-1)은 잃지 않는다.
   * 출동대현황·추가출동대로 되돌리면 이 줄에서 그 대가 빠진다(EVENT_LOG_PHRASING_PLAN §2.2)
   */
  | { kind: 'arrival'; mode: 'arrive' | 'return'; zoneKey: string; units: ArrivalUnitRef[] }
  /** 방수 개시·중단. `targetFloorId`는 층 id 또는 'face-X' */
  | { kind: 'spray'; tokenId: string; tokenLabel: string;
      state: string | null; fromZoneKey: string | null; targetFloorId: string | null;
      /** 현장요소 토큰을 직접 겨눴을 때 */
      targetEventId: string | null; targetLabel: string | null }
  /** 고가차·굴절차 전개·해제 */
  | { kind: 'aerial-deploy'; tokenId: string; tokenLabel: string;
      floorId: string | null; deployLabel: string | null }
  /**
   * 임시의료소·자원대기소 — 설치/해제와 소장 지명.
   * 소방 SOP상 지휘관의 명시적 결정이고 **"언제 세웠는가"가 평가 항목**이다.
   */
  | { kind: 'post-install'; post: PostKind; installed: boolean }
  | { kind: 'post-chief';   post: PostKind; chiefTokenId: string | null; chiefLabel: string | null }

  /**
   * 층별 단위지휘관 지정/해제. 거점(post)이 아니라 **층에 붙는 지정**이라
   * 따로 둔다 — 임시의료소·자원대기소는 하나씩뿐이지만 이쪽은 층마다 있다.
   */
  | { kind: 'unit-commander'; floorId: string; commanderTokenId: string | null; commanderLabel: string | null }

  /**
   * 급수 임무 자동 지정·해제 — 「중요」·「1선」·「순환급수」.
   *
   * 이 셋은 손으로 붙이지 않는다(connection 과 배치에서 파생된다 —
   * utils/waterMissions.ts). 그래서 **언제 무엇이 세워졌는지는 로그에만 남는다.**
   * 「몇 분에 중요물탱크를 지정했는가」가 평가 항목이다.
   */
  | { kind: 'water-mission'; tokenId: string; tokenLabel: string;
      missionLabel: string; assigned: boolean }

  /**
   * 순환보수 줄 — 배치·해제·교대.
   *
   * `position` 은 배치 시점의 줄 번호다(1번 소비 · 2번 대기 · 3번 보수·이동).
   * 교대 간격을 이어 붙이면 순환 주기가 나오고, 대수와 소화전 거리로
   * 필요 대수를 역산할 수 있다 — docs/WATER_SUPPLY_MISSION_PLAN.md §6.2.
   * 훈련 화면은 부족을 벌하지 않으므로(같은 문서 §6.4) **판정은 전부 여기서 나온다.**
   */
  | { kind: 'circulation'; action: 'assign' | 'release' | 'rotate';
      hydrantId: string; hydrantName: string | null;
      tokenId: string; tokenLabel: string | null; position: number | null }
  /**
   * 송수 연결·해제 한 건 — 무전 멘트 한 줄(「물탱크1 44호 소화전 점령 / 중요물탱크 지정」).
   * `missions` 는 이 연결로 물을 받는 차에 딸려 바뀐 급수 임무다. 연결로 설명되지 않는
   * 임무 변화는 따로 `water-mission` 으로 남는다(WaterMissionBridge).
   */
  | { kind: 'water-relay'; connected: boolean; connectionId: string;
      fromId: string; toId: string; fromType: string; toType: string;
      fromName: string; toName: string; missions: WaterMissionChange[] }
  /**
   * 거점 설치(지정)와 소장 지명을 한 번에 — 첫 지명이 곧 설치다.
   * 「자원대기소 지정, 소장: 지휘운전」(EVENT_LOG_PHRASING_PLAN §2.5)
   */
  | { kind: 'post-open'; post: PostKind; chiefTokenId: string | null; chiefLabel: string };

/** 도착·복귀 묶음에 든 출동대 1건 — 어디서 왔는지와 칩 색까지 담는다 */
export interface ArrivalUnitRef extends DispatchUnitRef {
  fromZoneKey: string;
  /** 기록 시점의 토큰 색 — 칩을 그린다. 차종으로 추정하면 수동 생성·색 변경 토큰이 틀린다 */
  color?:      TokenColor;
}

/**
 * 로그 문장의 한 조각 — 출동대는 칩으로, 나머지는 글자로 그린다.
 * `note` 는 조각의 text 를 이은 것과 같다(CSV·PDF 는 note 를 읽는다).
 * docs/EVENT_LOG_PHRASING_PLAN.md §12
 */
export type LogPart =
  | { kind: 'text'; text: string }
  | { kind: 'unit'; text: string; tokenId: string; color?: TokenColor };

/** 송수 연결에 딸려 바뀐 급수 임무 1건 */
export interface WaterMissionChange {
  tokenId:      string;
  tokenLabel:   string;
  missionLabel: string;
  assigned:     boolean;
}

/** 현장에 세우는 거점 */
export type PostKind = 'medical' | 'resource';

/** 인명검색 단계 — 초진 이전이 1차, 이후가 2차 */
export type SearchPhase = 'primary' | 'secondary';

/**
 * 검색에서 빠진 이유.
 * 'manual'     : 사용자가 직접 해제
 * 'moved-away' : 검색 중이던 층을 벗어나 자동 중단
 * 'primary-frozen' : 초진 도달로 1차가 동결되며 일괄 해제
 */
export type SearchStopReason = 'manual' | 'moved-away' | 'primary-frozen';

/**
 * 발견 경로.
 * 'search'    : 인명검색 점수가 공개 지점에 도달
 * 'stair'     : 계단실 구조대상자 — 출동대가 그 층 이상에 배치되어 자동 발견
 * 'checklist' : 진행상황관리·지휘절차에서 직접 발견 처리
 */
export type VictimFoundVia = 'search' | 'stair' | 'checklist';

/** 편성 요약 1항목 — "진압 2개대" */
export interface DispatchSummaryItem {
  unitType: string;
  label:    string;   // 사람이 읽는 이름 ("진압", "펌프차")
  count:    number;
}

/** 편성에 포함된 출동대 1건 */
export interface DispatchUnitRef {
  tokenId:  string;
  label:    string;
  unitType: string;
}

export interface LogEntry {
  id:              string;
  timestamp:       string;
  /**
   * 훈련 시작 기준 경과 초.
   * `null` = 훈련 시작 전에 기록됨(0과 구분해야 한다 — 0이면 시작 직후라는 뜻).
   * `undefined` = 구버전 세션 저장분.
   */
  elapsedSec?:     number | null;
  /**
   * 기록 시각(`Date.now()`). **무전 STT와 로그를 정렬하는 유일한 축이다.**
   * 구버전 세션 저장분에는 없다. docs/EVENT_LOG_PLAN.md L-10 / E-2
   */
  wallClockMs?:    number;
  logSource?:      'user' | 'system' | 'ai-event'; // 생성 주체 (미지정 = 사용자 액션)
  logType:         LogType;
  tokenId:         string;
  tokenName:       string;
  tokenColor?:     TokenColor;
  fromZoneId:      string;
  toZoneId:        string;
  face?:           Face;
  note?:           string;
  /** 구조화 데이터 — 있으면 표시·분석이 이걸 우선한다 (없으면 note 폴백) */
  payload?:        LogPayload;
  /**
   * 표시용 조각 — 있으면 출동대명을 칩으로 그린다. 조각의 text 를 이으면 note 와 같다.
   * 칩 도입(2026-09-11) 전 저장분과 조각을 만들지 않는 로그에는 없다 — note 를 그대로 보인다
   */
  parts?:          LogPart[];
}

// ─────────────────────────────────────────────
// 지휘정보 타입 (향후 사용)
// ─────────────────────────────────────────────

export type CommandStrategy = '공격' | '방어' | null;
export type CommandMethod   = '고정' | '전진' | '이동' | null;

// ─────────────────────────────────────────────
// 건물 상태 타입 (계단실 문/화재단계)
// ─────────────────────────────────────────────

export type DoorState  = 'open' | 'closed';
export type FireStatus = 'extension-peak' | 'peak' | 'seventy' | 'half' | 'initial' | 'complete';

// ─────────────────────────────────────────────
// 진압대 방수 상태
// ─────────────────────────────────────────────

/** 100% 정상방수 / 30% 방수압불량 / 0% 방수불가 */
export type SprayState = '100%' | '30%' | '0%';
