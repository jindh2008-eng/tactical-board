import type { BuildingSettings, TimingSettings, DispatchSetup, VictimSetupItem, DispatchRosterItem, ArrivalMode, HydrantSetupItem, FireSuppressionConfig, AerialSuppressionConfig, ChecklistConfig, CommandProcedureConfigs, CommandProcedureLevel, UnitStatusConfig, UnitTagPresetConfig } from '../types/settings';
import { DEFAULT_TIMING, DEFAULT_DISPATCH_SETUP } from '../types/settings';
import type { SharedBadgePreset, UnitSpecificBadgePreset } from '../types/presets';
import type { EventSetupItem } from '../types/events';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

/** 작업 중 프리셋 + 타이밍 자동 저장 구조 */
export interface WorkingPresets {
  sharedBadgePresets:      SharedBadgePreset[];
  unitBadgePresets:        UnitSpecificBadgePreset[];
  building?:               BuildingSettings;        // 건물 설정
  timing?:                 TimingSettings;          // 구버전 역호환을 위해 optional
  dispatchSetup?:          DispatchSetup;           // 구버전 역호환을 위해 optional
  dispatchRoster?:         DispatchRosterItem[];    // 구버전 역호환을 위해 optional
  victimSetup?:            VictimSetupItem[];       // 구버전 역호환을 위해 optional
  arrivalMode?:            ArrivalMode;             // 도착설정 방식
  medicalPostChief?:       string;                  // 임시의료소장
  stagingAreaChief?:       string;                  // 자원대기소장
  eventSetup?:             EventSetupItem[];        // 이벤트 토큰 설정
  hydrantSetup?:           HydrantSetupItem[];      // 소화전 사전 설정
  fireSuppressionConfig?:   FireSuppressionConfig;   // 화재 소화 설정
  aerialSuppressionConfig?: AerialSuppressionConfig; // 고가차/굴절차 소화 설정
  checklistConfig?:         ChecklistConfig;          // 훈련 진행 체크리스트
  commandProcedureConfigs?: CommandProcedureConfigs;  // 지휘절차 (초급/중급/고급)
  unitStatusConfig?:        UnitStatusConfig;          // 출동대 상태메세지
  unitTagPresetConfig?:     UnitTagPresetConfig;       // 임무/상태 태그 프리셋
}

/** 이름을 붙여 저장하는 설정 세트 */
export interface SettingsSet {
  id:                 string;
  name:               string;
  updatedAt:          string;
  building:           BuildingSettings;
  timing?:            TimingSettings;          // 구버전 역호환을 위해 optional
  sharedBadgePresets: SharedBadgePreset[];
  unitBadgePresets:   UnitSpecificBadgePreset[];
  dispatchSetup?:     DispatchSetup;           // 구버전 역호환을 위해 optional
  dispatchRoster?:    DispatchRosterItem[];    // 구버전 역호환을 위해 optional
  victimSetup?:       VictimSetupItem[];       // 구버전 역호환을 위해 optional
  arrivalMode?:       ArrivalMode;             // 도착설정 방식
  medicalPostChief?:  string;                  // 임시의료소장
  stagingAreaChief?:  string;                  // 자원대기소장
  eventSetup?:        EventSetupItem[];        // 이벤트 토큰 설정
  hydrantSetup?:      HydrantSetupItem[];      // 소화전 사전 설정
  fireSuppressionConfig?:   FireSuppressionConfig;   // 화재 소화 설정
  aerialSuppressionConfig?: AerialSuppressionConfig; // 고가차/굴절차 소화 설정
  checklistConfig?:         ChecklistConfig;          // 훈련 진행 체크리스트
  commandProcedureConfigs?: CommandProcedureConfigs;  // 지휘절차 (초급/중급/고급)
  unitStatusConfig?:        UnitStatusConfig;          // 출동대 상태메세지
  unitTagPresetConfig?:     UnitTagPresetConfig;       // 임무/상태 태그 프리셋
}

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const SETTINGS_LIST_KEY   = 'tacticalBoardSettingsList';
const WORKING_PRESETS_KEY = 'tacticalBoardWorkingPresets';

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

/** waterTank → water_tank 키 마이그레이션 (구버전 호환) */
export function migrateUnitStatusConfig(cfg: Record<string, string[]>): Record<string, string[]> {
  if (!cfg.waterTank && !cfg['water_tank']) return cfg;
  const { waterTank, ...rest } = cfg;
  const merged = waterTank ? [...(rest['water_tank'] ?? []), ...waterTank] : (rest['water_tank'] ?? []);
  return { ...rest, 'water_tank': [...new Set(merged)] };
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isoNow(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

// ─────────────────────────────────────────────
// Named Settings Sets
// ─────────────────────────────────────────────

export function loadSettingsList(): SettingsSet[] {
  try {
    const raw = localStorage.getItem(SETTINGS_LIST_KEY);
    return raw ? (JSON.parse(raw) as SettingsSet[]) : [];
  } catch {
    return [];
  }
}

export function upsertSettingsSet(list: SettingsSet[], set: SettingsSet): SettingsSet[] {
  const entry: SettingsSet = { ...set, updatedAt: isoNow() };
  const idx = list.findIndex(s => s.id === entry.id);
  const next = [...list];
  if (idx >= 0) { next[idx] = entry; } else { next.push(entry); }
  try {
    localStorage.setItem(SETTINGS_LIST_KEY, JSON.stringify(next));
  } catch (e) {
    console.error('[settingsStorage] 설정 목록 저장 실패:', e);
  }
  return next;
}

export function removeSettingsSet(list: SettingsSet[], id: string): SettingsSet[] {
  const next = list.filter(s => s.id !== id);
  localStorage.setItem(SETTINGS_LIST_KEY, JSON.stringify(next));
  return next;
}

// ─────────────────────────────────────────────
// Working Presets (자동 저장 — 새로고침 대비)
// ─────────────────────────────────────────────

const EMPTY_WORKING: WorkingPresets = {
  sharedBadgePresets: [],
  unitBadgePresets:   [],
  timing:             DEFAULT_TIMING,
  dispatchSetup:      DEFAULT_DISPATCH_SETUP,
  dispatchRoster:     [],
  victimSetup:        [],
  medicalPostChief:   '',
  stagingAreaChief:   '',
  eventSetup:         [],
};

/**
 * 연결송수구 표시 여부. 구버전(`siamesePipeFaces: Face[]`)은 면이 하나라도
 * 선택돼 있었으면 표시로 본다.
 */
export function resolveHasSiamesePipe(
  building?: { hasSiamesePipe?: boolean; siamesePipeFaces?: unknown[] } | null,
): boolean {
  if (building?.hasSiamesePipe !== undefined) return building.hasSiamesePipe;
  return (building?.siamesePipeFaces?.length ?? 0) > 0;
}

export function loadWorkingPresets(): WorkingPresets {
  try {
    const raw = localStorage.getItem(WORKING_PRESETS_KEY);
    if (!raw) return EMPTY_WORKING;
    const parsed = JSON.parse(raw);
    // 이전 포맷(BadgePresetGroup[]) 마이그레이션 처리
    if (Array.isArray(parsed)) return EMPTY_WORKING;
    // victimSetup 항목 마이그레이션
    // - detailLocation: 구버전에 없을 수 있음 → ''
    // - face:  구버전은 항상 string이었음 → null 허용
    // - floor: 구버전은 항상 number였음 → null 허용
    const victimSetup = (parsed.victimSetup ?? []).map((v: VictimSetupItem) => ({
      ...v,
      detailLocation:     v.detailLocation ?? '',
      // face/floor: null 허용 (구버전은 항상 값이 있었음)
      face:               v.face  ?? null,
      // floor 마이그레이션: 'RF' 문자열 → 그대로 유지, 숫자 문자열 → 숫자, 그 외 → null
      floor:              v.floor === 'RF'
        ? 'RF' as const
        : (v.floor != null && !isNaN(Number(v.floor))) ? Number(v.floor) : null,
      immediatelyVisible: v.immediatelyVisible ?? false,
    }));
    // 구버전 dispatchSetup에 waterTank·rescueVehicle 필드가 없을 수 있으므로 기본값으로 보정
    const rawSetup = parsed.dispatchSetup ?? DEFAULT_DISPATCH_SETUP;
    const dispatchSetup: typeof rawSetup = {
      ...rawSetup,
      vehicles: { waterTank: 0, rescueVehicle: 0, ...rawSetup.vehicles },
    };
    return {
      sharedBadgePresets: parsed.sharedBadgePresets ?? [],
      unitBadgePresets:   parsed.unitBadgePresets   ?? [],
      building:           parsed.building,
      timing:             parsed.timing         ?? DEFAULT_TIMING,
      dispatchSetup,
      dispatchRoster:     parsed.dispatchRoster ?? [],
      victimSetup,
      arrivalMode:        parsed.arrivalMode    ?? 'time',
      medicalPostChief:   parsed.medicalPostChief  ?? '',
      stagingAreaChief:   parsed.stagingAreaChief  ?? '',
      eventSetup:         parsed.eventSetup        ?? [],
      hydrantSetup:            parsed.hydrantSetup            ?? [],
      fireSuppressionConfig:   parsed.fireSuppressionConfig,
      aerialSuppressionConfig: parsed.aerialSuppressionConfig,
      checklistConfig: parsed.checklistConfig
        ? {
            ...parsed.checklistConfig,
            sections: (parsed.checklistConfig.sections ?? []).map((s: { id: string; title: string; items: { id: string; text: string; itemType?: string; arrivalOrder?: number }[] }) => ({
              ...s,
              items: (s.items ?? []).map(it => ({
                ...it,
                itemType: it.itemType ?? 'procedure',
              })),
            })),
          }
        : undefined,
      commandProcedureConfigs: parsed.commandProcedureConfigs ?? {},
      unitStatusConfig:        migrateUnitStatusConfig(parsed.unitStatusConfig ?? {}),
      unitTagPresetConfig:     parsed.unitTagPresetConfig ?? {},
    };
  } catch {
    return EMPTY_WORKING;
  }
}

export function saveWorkingPresets(presets: WorkingPresets): void {
  localStorage.setItem(WORKING_PRESETS_KEY, JSON.stringify(presets));
}

// ─────────────────────────────────────────────
// 독립 저장 — 지휘절차 / 출동대 상태메세지 / 태그 프리셋
// 메인 설정 불러오기·초기화에 영향받지 않는 전역 데이터
// ─────────────────────────────────────────────

const COMMAND_PROCEDURE_KEY = 'tacticalBoardCommandProcedure';
const UNIT_STATUS_KEY       = 'tacticalBoardUnitStatus';
const TAG_PRESET_KEY        = 'tacticalBoardTagPresets';

export function loadCommandProcedureConfigs(): CommandProcedureConfigs {
  try {
    const raw = localStorage.getItem(COMMAND_PROCEDURE_KEY);
    if (raw) return JSON.parse(raw) as CommandProcedureConfigs;
    // 최초 실행: WorkingPresets에서 마이그레이션
    return loadWorkingPresets().commandProcedureConfigs ?? {};
  } catch { return {}; }
}
export function saveCommandProcedureConfigs(cfg: CommandProcedureConfigs): void {
  localStorage.setItem(COMMAND_PROCEDURE_KEY, JSON.stringify(cfg));
}

export function loadUnitStatusConfig(): UnitStatusConfig {
  try {
    const raw = localStorage.getItem(UNIT_STATUS_KEY);
    if (raw) return migrateUnitStatusConfig(JSON.parse(raw) as Record<string, string[]>);
    return migrateUnitStatusConfig(loadWorkingPresets().unitStatusConfig ?? {});
  } catch { return {}; }
}
export function saveUnitStatusConfig(cfg: UnitStatusConfig): void {
  localStorage.setItem(UNIT_STATUS_KEY, JSON.stringify(cfg));
}

export function loadUnitTagPresetConfig(): UnitTagPresetConfig {
  try {
    const raw = localStorage.getItem(TAG_PRESET_KEY);
    if (raw) return JSON.parse(raw) as UnitTagPresetConfig;
    return loadWorkingPresets().unitTagPresetConfig ?? {};
  } catch { return {}; }
}
export function saveUnitTagPresetConfig(cfg: UnitTagPresetConfig): void {
  localStorage.setItem(TAG_PRESET_KEY, JSON.stringify(cfg));
}

/**
 * 훈련 중 표시할 지휘절차 레벨 — 시나리오(설정 세트)에 속하지 않는 전역값.
 * commandProcedureConfigs 와 마찬가지로 메인 설정 불러오기·초기화에 영향받지 않는다.
 */
const ACTIVE_COMMAND_PROCEDURE_LEVEL_KEY = 'tacticalBoardActiveCommandProcedureLevel';

export function loadActiveCommandProcedureLevel(): CommandProcedureLevel {
  const raw = localStorage.getItem(ACTIVE_COMMAND_PROCEDURE_LEVEL_KEY);
  return raw === 'beginner' || raw === 'intermediate' || raw === 'advanced' ? raw : 'beginner';
}
export function saveActiveCommandProcedureLevel(level: CommandProcedureLevel): void {
  localStorage.setItem(ACTIVE_COMMAND_PROCEDURE_LEVEL_KEY, level);
}

// ─────────────────────────────────────────────
// 내보내기 / 불러오기
// ─────────────────────────────────────────────

export interface SettingsExport {
  version: 1;
  exportedAt: string;
  settingsList: SettingsSet[];
  workingPresets: WorkingPresets;
  commandProcedureConfigs?: CommandProcedureConfigs;
  activeCommandProcedureLevel?: CommandProcedureLevel;
  unitStatusConfig?: UnitStatusConfig;
  unitTagPresetConfig?: UnitTagPresetConfig;
}

export function exportSettings(): void {
  const data: SettingsExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settingsList: loadSettingsList(),
    workingPresets: loadWorkingPresets(),
    commandProcedureConfigs: loadCommandProcedureConfigs(),
    activeCommandProcedureLevel: loadActiveCommandProcedureLevel(),
    unitStatusConfig: loadUnitStatusConfig(),
    unitTagPresetConfig: loadUnitTagPresetConfig(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tactical-board-settings-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importSettings(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw = e.target?.result as string;
        const data = JSON.parse(raw) as SettingsExport;
        if (data.version !== 1 || !Array.isArray(data.settingsList) || !data.workingPresets) {
          reject(new Error('올바른 설정 파일이 아닙니다.'));
          return;
        }
        localStorage.setItem(SETTINGS_LIST_KEY, JSON.stringify(data.settingsList));
        localStorage.setItem(WORKING_PRESETS_KEY, JSON.stringify(data.workingPresets));
        if (data.commandProcedureConfigs)
          localStorage.setItem(COMMAND_PROCEDURE_KEY, JSON.stringify(data.commandProcedureConfigs));
        if (data.activeCommandProcedureLevel)
          localStorage.setItem(ACTIVE_COMMAND_PROCEDURE_LEVEL_KEY, data.activeCommandProcedureLevel);
        if (data.unitStatusConfig)
          localStorage.setItem(UNIT_STATUS_KEY, JSON.stringify(data.unitStatusConfig));
        if (data.unitTagPresetConfig)
          localStorage.setItem(TAG_PRESET_KEY, JSON.stringify(data.unitTagPresetConfig));
        resolve();
      } catch {
        reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsText(file);
  });
}
