import type { BuildingConfig } from './index';

/** 건물 및 화재 상황 설정 */
export interface BuildingSettings {
  config:               BuildingConfig;
  fireFloor:            number;
  stairSmokeStartFloor: number | null;
}

/**
 * 전체 설정 상태
 *
 * 향후 확장:
 *   unitConfig:   UnitConfig    — 출동대 기본 생성 옵션
 *   victimConfig: VictimConfig  — 구조대상자 랜덤 생성 옵션
 */
export interface SettingsState {
  building: BuildingSettings;
}
