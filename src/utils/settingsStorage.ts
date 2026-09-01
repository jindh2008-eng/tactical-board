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
  realtimeCalcEnabled?:     boolean;                 // 실시간 화재·수량 계산 사용 여부(기본 true)
  aerialSuppressionConfig?: AerialSuppressionConfig; // 고가차/굴절차 소화 설정
  checklistConfig?:         ChecklistConfig;          // 훈련 진행 체크리스트
  /** 훈련 표시 레벨 — 시나리오 값. SettingsSet 쪽 주석 참고 */
  activeCommandProcedureLevel?: CommandProcedureLevel;
  /** @deprecated 공통 설정 — SettingsSet 쪽 주석 참고. 쓰기를 끊었다(2026-08-25) */
  commandProcedureConfigs?: CommandProcedureConfigs;
  /** @deprecated 위와 같음 */
  unitStatusConfig?:        UnitStatusConfig;
  /** @deprecated 위와 같음 */
  unitTagPresetConfig?:     UnitTagPresetConfig;
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
  realtimeCalcEnabled?:     boolean;                 // 실시간 화재·수량 계산 사용 여부(기본 true)
  aerialSuppressionConfig?: AerialSuppressionConfig; // 고가차/굴절차 소화 설정
  checklistConfig?:         ChecklistConfig;          // 훈련 진행 체크리스트

  /**
   * 훈련 중 무플 화면에 표시할 지휘절차 레벨.
   *
   * 지휘절차 **내용**(commandProcedureConfigs)은 공통 설정이지만 「어느 레벨로
   * 훈련하는가」는 시나리오마다 다르다 — 같은 절차집을 두고 초급 시나리오와
   * 고급 시나리오를 따로 만든다. 2026-08-25 에 공통에서 이쪽으로 옮겼다.
   */
  activeCommandProcedureLevel?: CommandProcedureLevel;

  /**
   * @deprecated 공통 설정이라 시나리오에 속하지 않는다. 새로 쓰지 않는다.
   *
   * 이 셋은 `tacticalBoardCommandProcedure` · `tacticalBoardUnitStatus` ·
   * `tacticalBoardTagPresets` 키에 따로 살아 있고 앱은 그쪽만 읽는다.
   * 여기 들어 있던 값은 **저장은 되는데 불러올 때 무시되는** 죽은 데이터였다
   * (`settingsStore.tsx` 의 `loadSettings` 가 건드리지 않는다).
   * 2026-08-25 에 쓰기를 끊었고, 구버전 파일을 읽을 때만 남아 있을 수 있어
   * 필드 자체는 남겨 둔다.
   */
  commandProcedureConfigs?: CommandProcedureConfigs;
  /** @deprecated 위와 같음 */
  unitStatusConfig?:        UnitStatusConfig;
  /** @deprecated 위와 같음 */
  unitTagPresetConfig?:     UnitTagPresetConfig;
}

/**
 * 시나리오에서 공통 설정 흔적을 걷어낸다.
 *
 * 구버전 저장분·구버전 파일에 남아 있는 죽은 필드를 저장·내보내기 시점에
 * 정리한다. 남겨 두면 파일이 커지고, 무엇보다 "시나리오 안에 지휘절차가
 * 들어 있다"는 잘못된 인상을 준다.
 */
export function stripGlobalConfigs(set: SettingsSet): SettingsSet {
  const next: SettingsSet = { ...set };
  delete next.commandProcedureConfigs;
  delete next.unitStatusConfig;
  delete next.unitTagPresetConfig;
  return next;
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
      realtimeCalcEnabled:     parsed.realtimeCalcEnabled,
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
// 파일 입출력
//
// 두 종류가 있고 담는 것이 다르다. 섞으면 안 된다.
//
//   백업(SettingsExport)   저장된 시나리오 **전부** + 공통 설정. 기기 이전·복구용.
//   시나리오(ScenarioFile) 시나리오 **하나만**. 남에게 건네주는 단위.
//
// 공통 설정(지휘절차·상태 메시지·임무/상태 프리셋)은 시나리오 파일에 넣지
// 않는다 — 받는 쪽이 이미 자기 것을 갖고 있고, 시나리오를 불러온다고
// 그것까지 덮이면 안 되기 때문이다. 앱 안에서도 `loadSettings` 가 이 셋을
// 건드리지 않는다(settingsStore.tsx).
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

/** 시나리오 한 건. `kind` 로 백업 파일과 구분한다 */
export interface ScenarioFile {
  kind: 'tactical-board.scenario';
  version: 1;
  exportedAt: string;
  scenario: SettingsSet;
}

/** 파일명에 쓸 수 없는 문자를 걷어낸다. 시나리오 이름이 그대로 파일명이 되기 때문 */
function toSafeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '').trim();
  return cleaned || '시나리오';
}

function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 백업 — 저장된 시나리오 전부 + 공통 설정 */
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
  downloadJson(data, `tactical-board-백업-${new Date().toISOString().slice(0, 10)}.json`);
}

/** 시나리오 한 건만 내보낸다 */
export function exportScenario(set: SettingsSet): void {
  const data: ScenarioFile = {
    kind: 'tactical-board.scenario',
    version: 1,
    exportedAt: new Date().toISOString(),
    scenario: stripGlobalConfigs(set),
  };
  downloadJson(data, `${toSafeFileName(set.name)}.json`);
}

/**
 * 시나리오 파일을 목록에 새 항목으로 추가하고 그 id 를 돌려준다.
 *
 * 덮어쓰지 않고 **항상 새로 만든다** — 같은 이름이 이미 있으면 "(2)" 를 붙인다.
 * 받은 파일이 기존 작업을 조용히 지우는 것이 가장 나쁜 실패라서 그렇다.
 */
export function importScenario(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target?.result as string) as Partial<ScenarioFile>;
        if (data.kind !== 'tactical-board.scenario' || !data.scenario?.building) {
          reject(new Error('시나리오 파일이 아닙니다. 백업 파일이라면 「백업에서 복원」을 쓰세요.'));
          return;
        }
        const list = loadSettingsList();
        const taken = new Set(list.map(s => s.name));
        let name = data.scenario.name || '가져온 시나리오';
        for (let n = 2; taken.has(name); n += 1) name = `${data.scenario.name} (${n})`;

        const added: SettingsSet = {
          ...stripGlobalConfigs(data.scenario),
          id: generateId(),
          name,
          updatedAt: '',   // upsertSettingsSet 이 현재 시각으로 채운다
        };
        upsertSettingsSet(list, added);
        resolve(added.id);
      } catch {
        reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsText(file);
  });
}

/** 복원된 시나리오 수를 돌려준다 — 호출부가 "몇 건이 돌아왔는지" 알릴 수 있게 */
export function importSettings(file: File): Promise<number> {
  return new Promise<number>((resolve, reject) => {
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
        resolve(data.settingsList.length);
      } catch {
        reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsText(file);
  });
}
