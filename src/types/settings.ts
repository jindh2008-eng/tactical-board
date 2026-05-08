import type { BuildingConfig, FireStatus } from './index';
import type { VictimGender, VictimAgeGroup, VictimCondition, VictimFace } from './victim';
export type { VictimFace };

/** 건물 및 화재 상황 설정 */
export interface BuildingSettings {
  config:      BuildingConfig;
  fireFloor:   number;
  fireStatus:  FireStatus | null;  // 초기 화재상태
  targetName:  string;             // 대상명 (훈련 건물명)
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
  name:         string;        // '진압1대', '펌프1호', …
  unitType:     string;        // 'suppression' | 'rescue' | 'ems' | 'pump' | 'rescue_vehicle' | 'aerial' | 'ladder' | 'smokeExhaust' | 'command'
  linkedTo:     string | null; // 연동 활동대 ID (자동 연동 차량일 때), 나머지는 null
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
