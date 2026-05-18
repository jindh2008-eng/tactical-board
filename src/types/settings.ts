import type { BuildingConfig, FireStatus } from './index';
import type { VictimGender, VictimAgeGroup, VictimCondition, VictimFace } from './victim';
export type { VictimFace };

/** 추가 화재 층 (화점층 외 초기 화재 설정) */
export interface ExtraFireFloor {
  floor:  number;
  status: FireStatus;
}

/** 건물 및 화재 상황 설정 */
export interface BuildingSettings {
  config:            BuildingConfig;
  fireFloor:         number;
  fireStatus:        FireStatus | null;  // 초기 화재상태
  targetName:        string;             // 대상명 (훈련 건물명)
  extraFireFloors?:  ExtraFireFloor[];   // 화점층 외 추가 화재 층
}

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

export type ChecklistItemType = 'procedure' | 'event' | 'arrival' | 'message' | 'fire' | 'xvr' | 'unit';

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
  messageLocation?:  string;     // 메세지 타입일 때 층/구역 위치
  messageBody?:      string;     // 메세지 타입일 때 본문 (줄바꿈 포함)
  eventId?:          string;     // 이벤트 타입일 때 대상 돌발상황 ID
  eventTargetStatus?: string;    // 이벤트 타입일 때 목표 상태
  unitRosterId?:     string;     // 출동대 타입일 때 대상 로스터 ID
  unitStatusText?:   string;     // 출동대 타입일 때 상태 메세지
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

export interface DispatchSetup {
  units: {
    suppression: number;  // 진압대
    rescue:      number;  // 구조대
    ems:         number;  // 구급대
  };
  vehicles: {
    aerial:       number;  // 고가차
    ladder:       number;  // 굴절차
    smokeExhaust: number;  // 배연차
    command:      number;  // 지휘차
    waterTank:    number;  // 물탱크
  };
}

export const DEFAULT_DISPATCH_SETUP: DispatchSetup = {
  units:    { suppression: 0, rescue: 0, ems: 0 },
  vehicles: { aerial: 0, ladder: 0, smokeExhaust: 0, command: 0, waterTank: 0 },
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
  id:             string;
  gender:         VictimGender;
  ageGroup:       VictimAgeGroup;
  condition:      VictimCondition;
  /** 방면 — null: 없음(미지정) */
  face:           VictimFace | null;
  /**
   * 층 — null: 없음(미지정).
   * 양수 = 지상층, 음수 = 지하층, 'RF' = 옥상.
   * 단, 화면에서 요약 행으로 묶인 층 번호는 유효하지 않음.
   */
  floor:          number | 'RF' | null;
  detailLocation: string;  // 상세위치 (예: '203호', '엘리베이터 앞')
}
