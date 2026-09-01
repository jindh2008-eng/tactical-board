import type { BuildingConfig, FireStatus, Face } from './index';
import type { VictimGender, VictimAgeGroup, VictimCondition, VictimFace } from './victim';
export type { VictimFace };

/** 추가 화재 층 (화점층 외 초기 화재 설정) */
export interface ExtraFireFloor {
  floor:  number;
  status: FireStatus;
}

/** 건물 및 화재 상황 설정 */
export interface BuildingSettings {
  config:              BuildingConfig;
  fireFloor:           number;
  fireStatus:          FireStatus | null;  // 초기 화재상태
  targetName:          string;             // 대상명 (훈련 건물명)
  extraFireFloors?:    ExtraFireFloor[];   // 화점층 외 추가 화재 층
  /**
   * 연결송수구 표시 여부. 위치는 1층 좌측 하단(지면)에 고정이라 방면을 고르지 않는다.
   * 구버전은 `siamesePipeFaces: Face[]` 였다 — resolveHasSiamesePipe() 가 변환한다.
   */
  hasSiamesePipe?:     boolean;
  /** @deprecated 구버전 호환용. 읽기만 하고 새로 쓰지 않는다. */
  siamesePipeFaces?:   Face[];
  hasIndoorHydrant?:   boolean;           // 옥내소화전 표시 여부
  /**
   * 상황판 B면 : 건물 : D면 열 비율의 가운데 값 (`1 : N : 1`).
   * 보드가 정사각으로 고정되면서 이 값이 화면 크기와 무관한 순수
   * 시나리오 변수가 되어 설정으로 뺐다. 없으면 1.744(기존 상수).
   * → docs/SCREEN_STAGE_PLAN.md §3.7
   */
  boardColumnRatio?:   number;
}

/** B:건물:D 비율의 허용 범위 — 하한은 B/D면이 건물보다 넓어지지 않게,
 *  상한은 B/D면에 출동대 토큰 1열이 들어가는 폭으로 정했다. */
export const BOARD_COL_RATIO_MIN     = 1.0;
export const BOARD_COL_RATIO_MAX     = 3.0;
export const BOARD_COL_RATIO_DEFAULT = 1.744;

/** 출동대 행동 타이밍 설정 */
export interface TimingSettings {
  rescueTimeSec: number;   // 구조 처리 시간(초) — 기본 30
  moveTimeSec:   number;   // 이동 시간(초)       — 기본 30
}

export const DEFAULT_TIMING: TimingSettings = {
  rescueTimeSec: 30,
  moveTimeSec:   30,
};

/** 화재 소화 설정 */
/**
 * 실시간 계산 스위치 — 화재진화율과 수량 변경을 **함께** 켜고 끈다.
 *
 * 「시작」을 누르면 1초 타이머 넷이 돌며 화재 단계를 낮추고 물탱크를 비운다.
 * 그 계산 없이 지휘 절차만 훈련하고 싶을 때가 있어 스위치를 뒀다.
 *
 * 두 계산을 하나로 묶은 것은 서로 맞물려 있기 때문이다 — 수량이 0 이 되면
 * 방수가 끊기고(WaterLevelContext), 방수가 끊기면 화재가 더 안 꺼진다.
 * 한쪽만 끄면 「물은 주는데 불은 안 꺼진다」 같은 상태가 되어 훈련이 흐려진다.
 *
 * 값이 없으면 켠 것으로 본다 — 기존 저장분의 동작을 그대로 지킨다.
 */
export const DEFAULT_REALTIME_CALC_ENABLED = true;

export interface FireSuppressionConfig {
  ptsPerSec: number;   // 100% 방수 기준 초당 소화포인트
  thresholds: {
    'extension-peak': number;  // 연소확대 → 최성기 전환 임계치
    'peak':           number;  // 최성기 → 70% 전환 임계치
    'seventy':        number;  // 70% → 50% 전환 임계치
    'half':           number;  // 50% → 초진 전환 임계치
  };
}

export const DEFAULT_FIRE_SUPPRESSION_CONFIG: FireSuppressionConfig = {
  ptsPerSec: 1,
  thresholds: {
    'extension-peak': 60,
    'peak':           120,
    'seventy':        90,
    'half':           60,
  },
};

export interface AerialSuppressionConfig {
  multipliers: {
    'extension-peak': number;
    'peak':           number;
    'seventy':        number;
    'half':           number;
  };
}

export const DEFAULT_AERIAL_SUPPRESSION_CONFIG: AerialSuppressionConfig = {
  multipliers: {
    'extension-peak': 5,
    'peak':           2,
    'seventy':        0.2,
    'half':           0.1,
  },
};

/**
 * 전체 설정 상태
 *
 * 향후 확장:
 *   unitConfig:   UnitConfig    — 출동대 기본 생성 옵션
 *   victimConfig: VictimConfig  — 구조대상자 랜덤 생성 옵션
 */
export interface SettingsState {
  building: BuildingSettings;
  timing:   TimingSettings;
}

// ─────────────────────────────────────────────
// 훈련 진행 체크리스트
// ─────────────────────────────────────────────

export type ChecklistItemType = 'procedure' | 'event' | 'arrival' | 'message' | 'fire' | 'xvr' | 'unit' | 'incident' | 'victim';

/** 출동대 유형별 사전 정의 상태메세지 목록 */
export type UnitStatusConfig = Record<string, string[]>;

/** 임무/상태 태그 프리셋 항목 */
export interface TagPreset {
  label: string;
  color: string;  // 'blue' | 'yellow' | 'red' | 'green' | 'white'
}

/** 유닛타입별 임무/상태 프리셋 묶음 */
export interface UnitTagPresets {
  missions: TagPreset[];
  statuses: TagPreset[];
}

/** 전체 임무/상태 프리셋 설정 (unitType → presets) */
export type UnitTagPresetConfig = Record<string, UnitTagPresets>;

export interface ChecklistItem {
  id:                string;
  text:              string;
  itemType:          ChecklistItemType;
  arrivalOrder?:     number;     // 출동대 도착 타입일 때 착대 순서
  fireFloor?:        number;     // 화재 타입일 때 대상 층
  fireTargetStatus?: FireStatus; // 화재 타입일 때 목표 화재상태
  messageTitle?:     string;     // 메세지 타입일 때 제목
  messageLocation?:  string;     // 메세지 타입일 때 층/구역 위치
  messageBody?:      string;     // 메세지 타입일 때 본문 (줄바꿈 포함)
  eventId?:          string;     // 현장요소 타입일 때 대상 현장요소 ID
  eventTargetStatus?: string;    // 이벤트 타입일 때 목표 상태
  linkedParentId?:    string;     // 연동할 상위 항목 ID (체크 시 하위 항목 자동 트리거)
  unitRosterId?:      string;     // 출동대 타입일 때 대상 로스터 ID
  unitEffectType?:    'statusMsg' | 'mission' | 'status'; // 출동대 효과 종류
  unitStatusText?:    string;     // statusMsg — 상태메세지 내용
  unitMissionLabel?:  string;     // mission — 임무 라벨
  unitMissionColor?:  string;     // mission — 임무 색상
  unitStatusTagLabel?: string;    // status — 상태 태그 라벨
  unitStatusTagColor?: string;    // status — 상태 태그 색상
  victimSetupId?:     string;     // victim 타입일 때 대상 VictimSetupItem ID
  victimVisibility?:  'show' | 'hide';  // victim 타입일 때 보임/안보임
  sourceCommandProcedureItemId?: string; // 지휘절차에서 가져온 항목일 때 원본 CommandProcedureItem ID
}

export interface ChecklistSection {
  id:    string;
  title: string;
  items: ChecklistItem[];
}

/** 체크리스트 레벨 — 현재 초급만 사용, 추후 'mid' | 'senior' 추가 가능 */
export type ChecklistLevel = 'junior';

export interface ChecklistConfig {
  level:    ChecklistLevel;
  sections: ChecklistSection[];
}

// ─────────────────────────────────────────────
// 지휘절차
// ─────────────────────────────────────────────

export type CommandProcedureItemType = 'procedure' | 'event' | 'message' | 'dispatch' | 'fire';

export interface CommandProcedureItem {
  id:   string;
  type: CommandProcedureItemType;
  text: string;
}

export interface CommandProcedureCategory {
  id:            string;
  categoryTitle: string;
  items:         CommandProcedureItem[];
}

export type CommandProcedureLevel = 'beginner' | 'intermediate' | 'advanced';

export type CommandProcedureConfigs = Partial<Record<CommandProcedureLevel, CommandProcedureCategory[]>>;

// ─────────────────────────────────────────────
// 출동대 사전 생성 설정 (설정창 전용)
// ─────────────────────────────────────────────

export interface DispatchExtraUnit {
  id:       string;
  name:     string;
  unitType: 'agency' | 'general';
}

export interface DispatchSetup {
  units: {
    suppression: number;  // 진압대
    rescue:      number;  // 구조대
    ems:         number;  // 구급대
  };
  vehicles: {
    aerial:         number;  // 고가차
    ladder:         number;  // 굴절차
    smokeExhaust:   number;  // 배연차
    command:        number;  // 지휘차
    waterTank:      number;  // 물탱크
    rescueVehicle:  number;  // 구조차 (구조대 자동 연동을 없애면서 별도 항목이 됐다)
  };
  extraUnits?: DispatchExtraUnit[];
}

export const DEFAULT_DISPATCH_SETUP: DispatchSetup = {
  units:    { suppression: 0, rescue: 0, ems: 0 },
  vehicles: { aerial: 0, ladder: 0, smokeExhaust: 0, command: 0, waterTank: 0, rescueVehicle: 0 },
  extraUnits: [],
};

/** 도착설정 방식 — 훈련 전체에 하나만 적용 */
export type ArrivalMode = 'time' | 'order';

/** 출동대 사전설정 로스터 항목 */
export interface DispatchRosterItem {
  id:           string;
  name:         string;        // '진압1', '펌프1', … (내부 키 — 매칭용)
  unitType:     string;        // 'suppression' | 'rescue' | 'ems' | 'pump' | 'rescue_vehicle' | 'aerial' | 'ladder' | 'smokeExhaust' | 'command'
  linkedTo:     string | null; // 연동 활동대 ID (자동 연동 차량일 때), 나머지는 null
  unitPrefix?:  string;        // 부대명 접두사 — 입력 시 '00진압대'처럼 표시
  arrivalSec:   number;        // [시간설정 모드] 도착 예정 시간(초)
  arrivalOrder: number;        // [착대설정 모드] 착대 순서 (1~10, 기본 1)
}

// ─────────────────────────────────────────────
// 구조대상자 사전 설정 항목 (설정창 전용)
// ─────────────────────────────────────────────

export { VICTIM_FACES } from './victim';

// ─────────────────────────────────────────────
// 소화전 사전 설정 항목 (설정창 전용)
// ─────────────────────────────────────────────

export type HydrantSide = 'A' | 'B' | 'C' | 'D';

/** 시나리오 설정용 소화전 항목. 실행 시 토큰으로 생성됨. */
export interface HydrantSetupItem {
  id:        string;
  name:      string;       // 예: "59호"
  side:      HydrantSide;  // 방면
  distanceM: number;       // 거리(m)
}

/** 시나리오 설정용 구조대상자 항목. 실행 중 VictimToken과 별개. */
export interface VictimSetupItem {
  id:               string;
  gender:           VictimGender;
  ageGroup:         VictimAgeGroup;
  condition:        VictimCondition;
  /** 방면 — null: 없음(미지정) */
  face:             VictimFace | null;
  /**
   * 층 — null: 없음(미지정).
   * 양수 = 지상층, 음수 = 지하층, 'RF' = 옥상.
   * 단, 화면에서 요약 행으로 묶인 층 번호는 유효하지 않음.
   */
  floor:            number | 'RF' | null;
  isStair?:         boolean;          // true: 해당 층 계단실에 배치
  detailLocation:   string;           // 상세위치 (예: '203호', '엘리베이터 앞')
  immediatelyVisible?: boolean;       // true: 인명검색 없이 처음부터 화면에 표시
}
