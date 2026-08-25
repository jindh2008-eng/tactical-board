import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { BuildingConfig, FireStatus } from '../types';
import type {
  BuildingSettings, TimingSettings,
  DispatchSetup, DispatchRosterItem, DispatchExtraUnit, VictimSetupItem, ArrivalMode, HydrantSetupItem,
  FireSuppressionConfig, AerialSuppressionConfig, ChecklistConfig, ChecklistSection, ChecklistItem, ChecklistItemType,
  ExtraFireFloor,
  CommandProcedureConfigs, CommandProcedureLevel, CommandProcedureCategory,
  UnitStatusConfig,
  UnitTagPresetConfig, UnitTagPresets,
} from '../types/settings';
import type { EventSetupItem, EventType } from '../types/events';
import { DEFAULT_TIMING, DEFAULT_DISPATCH_SETUP, DEFAULT_FIRE_SUPPRESSION_CONFIG, DEFAULT_AERIAL_SUPPRESSION_CONFIG,
         BOARD_COL_RATIO_MIN, BOARD_COL_RATIO_MAX, BOARD_COL_RATIO_DEFAULT } from '../types/settings';
import type { SettingsSet } from '../utils/settingsStorage';
import {
  generateId,
  loadSettingsList,
  loadWorkingPresets,
  saveWorkingPresets,
  upsertSettingsSet,
  removeSettingsSet,
  loadCommandProcedureConfigs,
  saveCommandProcedureConfigs,
  loadActiveCommandProcedureLevel,
  saveActiveCommandProcedureLevel,
  loadUnitStatusConfig,
  saveUnitStatusConfig,
  loadUnitTagPresetConfig,
  resolveHasSiamesePipe,
  saveUnitTagPresetConfig,
} from '../utils/settingsStorage';
import { buildRoster } from '../utils/dispatchRoster';
import { DEFAULT_BUILDING_CONFIG } from '../data/buildingData';

// ─────────────────────────────────────────────
// Context 타입
// ─────────────────────────────────────────────

export interface SettingsContextValue {
  // ── 건물 설정 ────────────────────────────────
  building:             BuildingSettings;
  updateBuildingConfig:     (config: BuildingConfig) => void;
  updateFireFloor:          (floor: number) => void;
  updateFireStatus:         (status: FireStatus | null) => void;
  updateTargetName:         (name: string) => void;
  updateExtraFireFloors:    (floors: ExtraFireFloor[]) => void;
  updateSiamesePipe:        (v: boolean) => void;
  updateIndoorHydrant:      (has: boolean) => void;
  boardColumnRatio:         number;
  updateBoardColumnRatio:   (ratio: number) => void;

  // ── 타이밍 설정 ───────────────────────────────
  timing:        TimingSettings;
  updateTiming:  (next: Partial<TimingSettings>) => void;

  // ── 출동대 생성 설정 ──────────────────────────
  dispatchSetup:              DispatchSetup;
  updateDispatchUnits:        (u: Partial<DispatchSetup['units']>)    => void;
  updateDispatchVehicles:     (v: Partial<DispatchSetup['vehicles']>) => void;
  addDispatchExtraUnit:       (name: string, unitType: DispatchExtraUnit['unitType']) => void;
  removeDispatchExtraUnit:    (id: string) => void;

  // ── 도착설정 방식 ─────────────────────────────
  arrivalMode:             ArrivalMode;
  updateArrivalMode:       (mode: ArrivalMode) => void;

  // ── 소장 지정 ────────────────────────────────
  medicalPostChief:        string;
  stagingAreaChief:        string;
  updateMedicalPostChief:  (name: string) => void;
  updateStagingAreaChief:  (name: string) => void;

  // ── 이벤트 토큰 설정 ─────────────────────────
  eventSetup:              EventSetupItem[];
  addEventSetupItem:       (label: string, icon?: string, eventType?: EventType) => void;
  updateEventSetupItem:    (id: string, patch: Partial<Omit<EventSetupItem, 'id'>>) => void;
  removeEventSetupItem:    (id: string) => void;

  // ── 출동대 로스터 ─────────────────────────────
  dispatchRoster:          DispatchRosterItem[];
  updateRosterArrival:     (id: string, secs: number, syncLinked?: boolean) => void;
  updateRosterOrder:       (id: string, order: number) => void;
  updateRosterPrefix:      (id: string, prefix: string) => void;

  // ── 구조대상자 생성 설정 ──────────────────────
  victimSetup:             VictimSetupItem[];
  addVictimSetupItem:      () => void;
  updateVictimSetupItem:   (id: string, patch: Partial<Omit<VictimSetupItem, 'id'>>) => void;
  removeVictimSetupItem:   (id: string) => void;

  // ── 소화전 사전 설정 ──────────────────────────
  hydrantSetup:            HydrantSetupItem[];
  addHydrantSetupItem:     () => void;
  updateHydrantSetupItem:  (id: string, patch: Partial<Omit<HydrantSetupItem, 'id'>>) => void;
  removeHydrantSetupItem:  (id: string) => void;

  // ── 화재 소화 설정 ────────────────────────────
  fireSuppressionConfig:        FireSuppressionConfig;
  updateFireSuppressionConfig:  (patch: Partial<FireSuppressionConfig>) => void;

  // ── 고가차/굴절차 소화 설정 ───────────────────
  aerialSuppressionConfig:       AerialSuppressionConfig;
  updateAerialSuppressionConfig: (patch: Partial<AerialSuppressionConfig>) => void;

  // ── 훈련 체크리스트 ───────────────────────────
  checklistConfig:              ChecklistConfig;
  addChecklistSection:          (title: string) => void;
  updateChecklistSection:       (id: string, title: string) => void;
  removeChecklistSection:       (id: string) => void;
  reorderChecklistSections:     (fromIndex: number, toIndex: number) => void;
  addChecklistItem:             (sectionId: string, text: string, itemType?: ChecklistItemType, options?: Partial<Omit<ChecklistItem, 'id' | 'text' | 'itemType'>>) => void;
  updateChecklistItem:          (sectionId: string, itemId: string, patch: Partial<Omit<ChecklistItem, 'id'>>) => void;
  removeChecklistItem:          (sectionId: string, itemId: string) => void;
  reorderChecklistItems:        (sectionId: string, fromIndex: number, toIndex: number) => void;
  appendChecklistSections:      (sections: ChecklistSection[]) => void;

  // ── 지휘절차 ──────────────────────────────────
  commandProcedureConfigs:     CommandProcedureConfigs;
  updateCommandProcedureLevel: (level: CommandProcedureLevel, categories: CommandProcedureCategory[]) => void;
  // 훈련 중 무플 화면에 표시할 레벨 — 시나리오와 무관한 전역값 (commandProcedureConfigs와 동일하게 독립 저장)
  activeCommandProcedureLevel:       CommandProcedureLevel;
  updateActiveCommandProcedureLevel: (level: CommandProcedureLevel) => void;

  // ── 출동대 상태메세지 ─────────────────────────
  unitStatusConfig:            UnitStatusConfig;
  updateUnitStatusMessages:    (unitType: string, messages: string[]) => void;

  // ── 임무/상태 태그 프리셋 ─────────────────────
  unitTagPresetConfig:         UnitTagPresetConfig;
  updateUnitTagPresets:        (unitType: string, presets: UnitTagPresets) => void;

  // ── 설정 세트 관리 ────────────────────────────
  settingsList:         SettingsSet[];
  activeSettingsId:     string | null;
  activeSettingsName:   string;
  setActiveSettingsName:(name: string) => void;
  saveSettings:         () => void;
  saveSettingsAs:       (newName: string) => void;
  loadSettings:         (id: string) => void;
  deleteSettingsEntry:  (id: string) => void;
  newSettings:          () => void;

  // ── 저장 · 반영 상태 (SETTINGS_MODE_UI_PLAN.md §7.1 F-3) ──
  /** 작업본이 activeSettingsId 로 저장된 세트와 다른가 — "저장 필요" */
  isDirty:       boolean;
  /** 작업본이 이 탭에서 마지막으로 훈련에 반영한 스냅샷과 같은가 */
  isApplied:     boolean;
  lastSavedAt:   number | null;
  lastAppliedAt: number | null;
  /**
   * 훈련모드가 "훈련 세팅"을 눌러 지금 작업본을 실제로 반영했다고 알리는 진입점.
   * TrainingContext.loadSettings() 에서만 호출한다 — 두 Provider 가 같은 트리에
   * 있어(App.tsx: SettingsProvider > TrainingProvider) Context 로 직접 부른다.
   * sessionStorage 왕복 없이 현재 상태를 그대로 스냅샷 뜬다.
   */
  markApplied:   () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // ── 건물 설정 (자동 복원) ──────────────────────
  const [config,      setConfig]      = useState<BuildingConfig>(
    () => loadWorkingPresets().building?.config ?? DEFAULT_BUILDING_CONFIG
  );
  const [fireFloor,   setFireFloor]   = useState<number>(
    () => loadWorkingPresets().building?.fireFloor ?? 1
  );
  const [fireStatus,  setFireStatus]  = useState<FireStatus | null>(
    () => loadWorkingPresets().building?.fireStatus ?? null
  );
  const [targetName,  setTargetName]  = useState<string>(
    () => loadWorkingPresets().building?.targetName ?? ''
  );
  const [extraFireFloors, setExtraFireFloors] = useState<ExtraFireFloor[]>(
    () => loadWorkingPresets().building?.extraFireFloors ?? []
  );
  const [hasSiamesePipe, setHasSiamesePipe] = useState<boolean>(
    () => resolveHasSiamesePipe(loadWorkingPresets().building)
  );
  const [hasIndoorHydrant, setHasIndoorHydrant] = useState<boolean>(
    () => loadWorkingPresets().building?.hasIndoorHydrant ?? false
  );
  const [boardColumnRatio, setBoardColumnRatio] = useState<number>(
    () => loadWorkingPresets().building?.boardColumnRatio ?? BOARD_COL_RATIO_DEFAULT
  );

  // ── 타이밍 (자동 복원) ──────────────────────────
  const [timing, setTiming] = useState<TimingSettings>(
    () => loadWorkingPresets().timing ?? DEFAULT_TIMING
  );
  const [dispatchSetup, setDispatchSetup] = useState<DispatchSetup>(
    () => loadWorkingPresets().dispatchSetup ?? DEFAULT_DISPATCH_SETUP
  );
  const [dispatchRoster, setDispatchRoster] = useState<DispatchRosterItem[]>(() => {
    const w = loadWorkingPresets();
    const saved = w.dispatchRoster ?? [];
    // 저장된 로스터가 있으면 그대로 사용, 없으면 dispatchSetup으로 신규 생성
    return saved.length > 0 ? saved : buildRoster(w.dispatchSetup ?? DEFAULT_DISPATCH_SETUP, []);
  });
  const [victimSetup, setVictimSetup] = useState<VictimSetupItem[]>(
    () => loadWorkingPresets().victimSetup ?? []
  );
  const [arrivalMode, setArrivalMode] = useState<ArrivalMode>(
    () => loadWorkingPresets().arrivalMode ?? 'time'
  );
  const [medicalPostChief, setMedicalPostChief] = useState<string>(
    () => loadWorkingPresets().medicalPostChief ?? ''
  );
  const [stagingAreaChief, setStagingAreaChief] = useState<string>(
    () => loadWorkingPresets().stagingAreaChief ?? ''
  );
  const [eventSetup, setEventSetup] = useState<EventSetupItem[]>(
    () => loadWorkingPresets().eventSetup ?? []
  );
  const [hydrantSetup, setHydrantSetup] = useState<HydrantSetupItem[]>(
    () => loadWorkingPresets().hydrantSetup ?? []
  );
  const [fireSuppressionConfig, setFireSuppressionConfig] = useState<FireSuppressionConfig>(
    () => loadWorkingPresets().fireSuppressionConfig ?? DEFAULT_FIRE_SUPPRESSION_CONFIG
  );
  const [aerialSuppressionConfig, setAerialSuppressionConfig] = useState<AerialSuppressionConfig>(
    () => loadWorkingPresets().aerialSuppressionConfig ?? DEFAULT_AERIAL_SUPPRESSION_CONFIG
  );
  const [checklistConfig, setChecklistConfig] = useState<ChecklistConfig>(
    () => loadWorkingPresets().checklistConfig ?? { level: 'junior', sections: [] }
  );
  const [commandProcedureConfigs, setCommandProcedureConfigs] = useState<CommandProcedureConfigs>(
    loadCommandProcedureConfigs
  );
  const [activeCommandProcedureLevel, setActiveCommandProcedureLevel] = useState<CommandProcedureLevel>(
    loadActiveCommandProcedureLevel
  );
  const [unitStatusConfig, setUnitStatusConfig] = useState<UnitStatusConfig>(
    loadUnitStatusConfig
  );
  const [unitTagPresetConfig, setUnitTagPresetConfig] = useState<UnitTagPresetConfig>(
    loadUnitTagPresetConfig
  );
  // ── 설정 세트 ─────────────────────────────────
  const [settingsList,       setSettingsList]       = useState<SettingsSet[]>(loadSettingsList);
  const [activeSettingsId,   setActiveSettingsId]   = useState<string | null>(null);
  const [activeSettingsName, setActiveSettingsName] = useState<string>('새 설정');

  // ── 저장 · 반영 상태 (§7.1 F-3) ──────────────────
  //
  // "얕은 비교"는 필드를 하나씩 비교하는 대신 저장 대상과 정확히 같은
  // 모양으로 직렬화해 문자열로 비교한다 — 이미 autosave 이펙트가 매번 하는
  // 일이라(아래) 별도 디바운스 없이 그 이펙트에 얹는다.
  //
  // 공통 설정(commandProcedureConfigs · unitStatusConfig · unitTagPresetConfig)은
  // **여기 들어가지 않는다.** 그 셋은 시나리오 파일에 저장되지 않으므로,
  // 넣으면 상태 메시지 하나 고쳤을 뿐인데 시나리오가 "미저장 변경"으로 표시된다.
  // 각자 자기 키에 즉시 저장된다(아래 saveUnitStatusConfig 등).
  const buildSnapshot = useCallback(() => JSON.stringify({
    building: { config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, boardColumnRatio },
    timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode,
    medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup,
    fireSuppressionConfig, aerialSuppressionConfig, checklistConfig,
  }), [config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, boardColumnRatio, timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup, fireSuppressionConfig, aerialSuppressionConfig, checklistConfig]);

  /** "저장됨" 기준선. undefined = 아직 못 정함(마운트 직후) */
  const savedSnapshotRef = useRef<string | undefined>(undefined);
  /** "훈련에 반영됨" 기준선. null = 이 탭에서 아직 한 번도 반영 안 함 */
  const appliedSnapshotRef = useRef<string | null>(null);
  /** loadSettings/newSettings 직후 한 번, 다음 이펙트 실행을 "저장됨"으로 봉인한다 */
  const markCleanRef = useRef(false);

  const [isDirty,       setIsDirty]       = useState(false);
  const [isApplied,     setIsApplied]     = useState(false);
  const [lastSavedAt,   setLastSavedAt]   = useState<number | null>(null);
  const [lastAppliedAt, setLastAppliedAt] = useState<number | null>(null);

  // dispatchSetup 변경 시 로스터 재생성 (기존 ID·도착시간 보존)
  useEffect(() => {
    setDispatchRoster(prev => buildRoster(dispatchSetup, prev));
  }, [dispatchSetup]);

  // 독립 항목 자동 저장 (메인 설정과 별도)
  useEffect(() => { saveCommandProcedureConfigs(commandProcedureConfigs); }, [commandProcedureConfigs]);
  useEffect(() => { saveActiveCommandProcedureLevel(activeCommandProcedureLevel); }, [activeCommandProcedureLevel]);
  useEffect(() => { saveUnitStatusConfig(unitStatusConfig); }, [unitStatusConfig]);
  useEffect(() => { saveUnitTagPresetConfig(unitTagPresetConfig); }, [unitTagPresetConfig]);

  // 설정 변경 시 자동 저장 (새로고침 대비) — 같은 이펙트에서 dirty/applied 도 갱신한다.
  useEffect(() => {
    const snapshot = buildSnapshot();
    saveWorkingPresets({
      sharedBadgePresets: [], unitBadgePresets: [],
      building: { config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, boardColumnRatio },
      timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode,
      medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup,
      fireSuppressionConfig, aerialSuppressionConfig, checklistConfig,
    });

    // 마운트 직후 · loadSettings/newSettings 직후는 "저장됨" 상태로 봉인한다.
    // 그 외에는 사용자가 실제로 뭔가 바꿨다는 뜻이라 기준선과 비교만 한다.
    if (savedSnapshotRef.current === undefined || markCleanRef.current) {
      savedSnapshotRef.current = snapshot;
      markCleanRef.current = false;
    }
    setIsDirty(snapshot !== savedSnapshotRef.current);
    setIsApplied(appliedSnapshotRef.current !== null && snapshot === appliedSnapshotRef.current);
  }, [config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, boardColumnRatio, timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup, fireSuppressionConfig, aerialSuppressionConfig, checklistConfig, buildSnapshot]);

  // ── 건물 설정 ──────────────────────────────────

  const updateBuildingConfig = useCallback((next: BuildingConfig) => {
    setConfig(next);
  }, []);
  const updateFireFloor           = useCallback((floor: number)          => setFireFloor(floor),              []);
  const updateFireStatus          = useCallback((s: FireStatus | null)   => setFireStatus(s),                 []);
  const updateTargetName          = useCallback((name: string)           => setTargetName(name),              []);
  const updateExtraFireFloors     = useCallback((floors: ExtraFireFloor[]) => setExtraFireFloors(floors),     []);
  const updateSiamesePipe         = useCallback((v: boolean)              => setHasSiamesePipe(v),            []);
  const updateIndoorHydrant       = useCallback((has: boolean)            => setHasIndoorHydrant(has),          []);
  // 범위 밖 값이 저장 파일에서 들어와도 상황판이 깨지지 않도록 여기서 한 번 자른다.
  const updateBoardColumnRatio    = useCallback((ratio: number) => {
    if (!Number.isFinite(ratio)) return;
    setBoardColumnRatio(Math.min(BOARD_COL_RATIO_MAX, Math.max(BOARD_COL_RATIO_MIN, ratio)));
  }, []);

  // ── 타이밍 설정 ──────────────────────────────
  const updateTiming = useCallback((next: Partial<TimingSettings>) => {
    setTiming(prev => ({ ...prev, ...next }));
  }, []);

  // ── 출동대 생성 설정 ──────────────────────────
  const updateDispatchUnits = useCallback((u: Partial<DispatchSetup['units']>) => {
    setDispatchSetup(prev => ({ ...prev, units: { ...prev.units, ...u } }));
  }, []);

  const updateDispatchVehicles = useCallback((v: Partial<DispatchSetup['vehicles']>) => {
    setDispatchSetup(prev => ({ ...prev, vehicles: { ...prev.vehicles, ...v } }));
  }, []);

  const addDispatchExtraUnit = useCallback((name: string, unitType: DispatchExtraUnit['unitType']) => {
    setDispatchSetup(prev => ({
      ...prev,
      extraUnits: [...(prev.extraUnits ?? []), { id: generateId(), name, unitType }],
    }));
  }, []);

  const removeDispatchExtraUnit = useCallback((id: string) => {
    setDispatchSetup(prev => ({
      ...prev,
      extraUnits: (prev.extraUnits ?? []).filter(u => u.id !== id),
    }));
  }, []);

  const updateRosterArrival = useCallback((id: string, secs: number, syncLinked = false) => {
    setDispatchRoster(prev => prev.map(item => {
      if (item.id === id) return { ...item, arrivalSec: secs };
      if (syncLinked && item.linkedTo === id) return { ...item, arrivalSec: secs };
      return item;
    }));
  }, []);

  const updateRosterOrder = useCallback((id: string, order: number) => {
    setDispatchRoster(prev => prev.map(item => {
      if (item.id === id)         return { ...item, arrivalOrder: order };
      if (item.linkedTo === id)   return { ...item, arrivalOrder: order }; // 연동 차량 자동 동기화
      return item;
    }));
  }, []);

  const updateRosterPrefix = useCallback((id: string, prefix: string) => {
    setDispatchRoster(prev => prev.map(item => {
      if (item.id === id)         return { ...item, unitPrefix: prefix || undefined };
      if (item.linkedTo === id)   return { ...item, unitPrefix: prefix || undefined }; // 연동 차량 동기화
      return item;
    }));
  }, []);

  const updateArrivalMode     = useCallback((mode: ArrivalMode) => setArrivalMode(mode),       []);
  const updateMedicalPostChief = useCallback((name: string) => setMedicalPostChief(name), []);
  const updateStagingAreaChief = useCallback((name: string) => setStagingAreaChief(name), []);

  const addEventSetupItem = useCallback((label: string, icon?: string, eventType?: EventType) => {
    setEventSetup(prev => [...prev, { id: generateId(), label, enabled: true, icon: icon ?? '', eventType: eventType ?? 'fire' }]);
  }, []);
  const updateEventSetupItem = useCallback((id: string, patch: Partial<Omit<EventSetupItem, 'id'>>) => {
    setEventSetup(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }, []);
  const removeEventSetupItem = useCallback((id: string) => {
    setEventSetup(prev => prev.filter(item => item.id !== id));
  }, []);

  // ── 구조대상자 생성 설정 ──────────────────────
  const addVictimSetupItem = useCallback(() => {
    setVictimSetup(prev => [...prev, {
      id:                 generateId(),
      gender:             '남',
      ageGroup:           '40대',
      condition:          '중상',
      face:               null,
      floor:              null,
      isStair:            false,
      detailLocation:     '',
      immediatelyVisible: false,
    }]);
  }, []);

  const updateVictimSetupItem = useCallback((id: string, patch: Partial<Omit<VictimSetupItem, 'id'>>) => {
    setVictimSetup(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const removeVictimSetupItem = useCallback((id: string) => {
    setVictimSetup(prev => prev.filter(item => item.id !== id));
  }, []);

  // ── 소화전 사전 설정 ──────────────────────────
  const addHydrantSetupItem = useCallback(() => {
    setHydrantSetup(prev => [...prev, {
      id:        generateId(),
      name:      '',
      side:      'A' as const,
      distanceM: 100,
    }]);
  }, []);

  const updateHydrantSetupItem = useCallback((id: string, patch: Partial<Omit<HydrantSetupItem, 'id'>>) => {
    setHydrantSetup(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const removeHydrantSetupItem = useCallback((id: string) => {
    setHydrantSetup(prev => prev.filter(item => item.id !== id));
  }, []);

  const updateFireSuppressionConfig = useCallback((patch: Partial<FireSuppressionConfig>) => {
    setFireSuppressionConfig(prev => ({
      ...prev,
      ...patch,
      thresholds: { ...prev.thresholds, ...(patch.thresholds ?? {}) },
    }));
  }, []);

  const updateAerialSuppressionConfig = useCallback((patch: Partial<AerialSuppressionConfig>) => {
    setAerialSuppressionConfig(prev => ({
      ...prev,
      ...patch,
      multipliers: { ...prev.multipliers, ...(patch.multipliers ?? {}) },
    }));
  }, []);

  // ── 훈련 체크리스트 ──────────────────────────
  const addChecklistSection = useCallback((title: string) => {
    setChecklistConfig(prev => ({
      ...prev,
      sections: [...prev.sections, { id: generateId(), title, items: [] }],
    }));
  }, []);

  const updateChecklistSection = useCallback((id: string, title: string) => {
    setChecklistConfig(prev => ({
      ...prev,
      sections: prev.sections.map((s: ChecklistSection) => s.id === id ? { ...s, title } : s),
    }));
  }, []);

  const removeChecklistSection = useCallback((id: string) => {
    setChecklistConfig(prev => ({
      ...prev,
      sections: prev.sections.filter((s: ChecklistSection) => s.id !== id),
    }));
  }, []);

  const addChecklistItem = useCallback((
    sectionId: string,
    text: string,
    itemType: ChecklistItemType = 'procedure',
    options?: Partial<Omit<ChecklistItem, 'id' | 'text' | 'itemType'>>
  ) => {
    setChecklistConfig(prev => ({
      ...prev,
      sections: prev.sections.map((s: ChecklistSection) =>
        s.id === sectionId
          ? { ...s, items: [...s.items, { id: generateId(), text, itemType, ...options }] }
          : s
      ),
    }));
  }, []);

  const updateChecklistItem = useCallback((sectionId: string, itemId: string, patch: Partial<Omit<ChecklistItem, 'id'>>) => {
    setChecklistConfig(prev => ({
      ...prev,
      sections: prev.sections.map((s: ChecklistSection) =>
        s.id === sectionId
          ? { ...s, items: s.items.map((it: ChecklistItem) => it.id === itemId ? { ...it, ...patch } : it) }
          : s
      ),
    }));
  }, []);

  const removeChecklistItem = useCallback((sectionId: string, itemId: string) => {
    setChecklistConfig(prev => ({
      ...prev,
      sections: prev.sections.map((s: ChecklistSection) =>
        s.id === sectionId
          ? { ...s, items: s.items.filter((it: ChecklistItem) => it.id !== itemId) }
          : s
      ),
    }));
  }, []);

  const reorderChecklistSections = useCallback((fromIndex: number, toIndex: number) => {
    setChecklistConfig(prev => {
      const sections = [...prev.sections];
      const [moved] = sections.splice(fromIndex, 1);
      sections.splice(toIndex, 0, moved);
      return { ...prev, sections };
    });
  }, []);

  const appendChecklistSections = useCallback((newSections: ChecklistSection[]) => {
    setChecklistConfig(prev => ({ ...prev, sections: [...prev.sections, ...newSections] }));
  }, []);

  const reorderChecklistItems = useCallback((sectionId: string, fromIndex: number, toIndex: number) => {
    setChecklistConfig(prev => ({
      ...prev,
      sections: prev.sections.map((s: ChecklistSection) => {
        if (s.id !== sectionId) return s;
        const items = [...s.items];
        const [rawMoved] = items.splice(fromIndex, 1);
        // 이동 시 연동 해제 (위치 변경으로 부모-자식 관계 무효화)
        const moved: ChecklistItem = rawMoved.linkedParentId
          ? { ...rawMoved, linkedParentId: undefined }
          : rawMoved;
        items.splice(toIndex, 0, moved);
        // 이동된 항목을 부모로 가리키던 항목 중 이제 그 항목보다 위에 있는 것도 연동 해제
        const movedNewIdx = items.findIndex(i => i.id === moved.id);
        return {
          ...s,
          items: items.map((it, idx) =>
            it.linkedParentId === moved.id && idx < movedNewIdx
              ? { ...it, linkedParentId: undefined }
              : it
          ),
        };
      }),
    }));
  }, []);

  // ── 지휘절차 ──────────────────────────────────
  const updateCommandProcedureLevel = useCallback((level: CommandProcedureLevel, categories: CommandProcedureCategory[]) => {
    setCommandProcedureConfigs(prev => ({ ...prev, [level]: categories }));
  }, []);
  const updateActiveCommandProcedureLevel = useCallback((level: CommandProcedureLevel) => {
    setActiveCommandProcedureLevel(level);
  }, []);

  // ── 출동대 상태메세지 ─────────────────────────
  const updateUnitStatusMessages = useCallback((unitType: string, messages: string[]) => {
    setUnitStatusConfig(prev => ({ ...prev, [unitType]: messages }));
  }, []);

  // ── 임무/상태 태그 프리셋 ─────────────────────
  const updateUnitTagPresets = useCallback((unitType: string, presets: UnitTagPresets) => {
    setUnitTagPresetConfig(prev => ({ ...prev, [unitType]: presets }));
  }, []);

  // ── 설정 세트 저장/불러오기 ─────────────────────

  const saveSettings = useCallback(() => {
    const id = activeSettingsId ?? generateId();
    const set: SettingsSet = {
      id, name: activeSettingsName, updatedAt: '',
      building: { config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, boardColumnRatio },
      timing, sharedBadgePresets: [], unitBadgePresets: [],
      dispatchSetup, dispatchRoster, victimSetup, arrivalMode,
      medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup,
      fireSuppressionConfig, aerialSuppressionConfig, checklistConfig,
    };
    setActiveSettingsId(id);
    setSettingsList(prev => upsertSettingsSet(prev, set));
    // saveSettings 는 지금 상태를 그대로 저장하는 것이라(다른 필드를 안 바꾼다)
    // 이펙트를 기다릴 필요 없이 여기서 바로 기준선을 옮긴다.
    savedSnapshotRef.current = buildSnapshot();
    setIsDirty(false);
    setLastSavedAt(Date.now());
  }, [activeSettingsId, activeSettingsName, config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, boardColumnRatio, timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup, fireSuppressionConfig, aerialSuppressionConfig, checklistConfig, buildSnapshot]);

  const saveSettingsAs = useCallback((newName: string) => {
    const id = generateId();
    const set: SettingsSet = {
      id, name: newName, updatedAt: '',
      building: { config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, boardColumnRatio },
      timing, sharedBadgePresets: [], unitBadgePresets: [],
      dispatchSetup, dispatchRoster, victimSetup, arrivalMode,
      medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup,
      fireSuppressionConfig, aerialSuppressionConfig, checklistConfig,
    };
    setActiveSettingsId(id);
    setActiveSettingsName(newName);
    setSettingsList(prev => upsertSettingsSet(prev, set));
    savedSnapshotRef.current = buildSnapshot();
    setIsDirty(false);
    setLastSavedAt(Date.now());
  }, [config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, boardColumnRatio, timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup, fireSuppressionConfig, aerialSuppressionConfig, checklistConfig, buildSnapshot]);

  const loadSettings = useCallback((id: string) => {
    const set = settingsList.find(s => s.id === id);
    if (!set) return;
    // 아래 setter 들이 필드를 바꾸면 autosave 이펙트가 다시 돈다 — 그때 새
    // 상태를 "저장됨" 기준선으로 봉인하라는 표시다(사용자가 고친 게 아니라
    // 불러온 것이므로 dirty 가 아니다).
    markCleanRef.current = true;
    // 구버전·손상된 저장 세트에 building이 없을 수 있음 —
    // JSON.parse(undefined)는 SyntaxError를 던지므로 형제 필드(timing/dispatchSetup)와
    // 동일하게 존재 여부를 먼저 확인하고, 없으면 현재 값을 유지한다.
    const b = set.building
      ? JSON.parse(JSON.stringify(set.building)) as BuildingSettings
      : null;
    if (b) {
      setConfig(b.config ?? DEFAULT_BUILDING_CONFIG);
      setFireFloor(b.fireFloor ?? 1);
      setFireStatus(b.fireStatus ?? null);
      setTargetName(b.targetName ?? '');
    }
    setTiming(set.timing ? JSON.parse(JSON.stringify(set.timing)) : DEFAULT_TIMING);
    // 구버전 저장 세트는 DEFAULT 값으로 채움
    const rawSetup = set.dispatchSetup ? JSON.parse(JSON.stringify(set.dispatchSetup)) as DispatchSetup : DEFAULT_DISPATCH_SETUP;
    // 구버전 저장 세트에 없는 vehicles 필드 보정
    const loadedSetup: DispatchSetup = {
      ...rawSetup,
      vehicles: { ...rawSetup.vehicles, waterTank: rawSetup.vehicles?.waterTank ?? 0 },
    };
    setDispatchSetup(loadedSetup);
    const loadedRoster = (set.dispatchRoster
      ? JSON.parse(JSON.stringify(set.dispatchRoster)) as DispatchRosterItem[]
      : buildRoster(loadedSetup, [])
    ).map((r: DispatchRosterItem) => ({ ...r, arrivalOrder: r.arrivalOrder ?? 1 })); // arrivalOrder 마이그레이션
    setDispatchRoster(loadedRoster);
    // victimSetup 마이그레이션 (detailLocation, face/floor null 허용, 'RF' 지원)
    const loadedVictims = (set.victimSetup ?? []).map((v: VictimSetupItem) => ({
      ...v,
      detailLocation:     v.detailLocation ?? '',
      face:               v.face  ?? null,
      floor:              v.floor === 'RF'
        ? 'RF' as const
        : (v.floor != null && !isNaN(Number(v.floor))) ? Number(v.floor) : null,
      immediatelyVisible: v.immediatelyVisible ?? false,
    }));
    setVictimSetup(loadedVictims);
    setArrivalMode(set.arrivalMode ?? 'time');
    setMedicalPostChief(set.medicalPostChief ?? '');
    setStagingAreaChief(set.stagingAreaChief ?? '');
    setEventSetup(set.eventSetup ? JSON.parse(JSON.stringify(set.eventSetup)) : []);
    setHydrantSetup(set.hydrantSetup ? JSON.parse(JSON.stringify(set.hydrantSetup)) : []);
    if (set.fireSuppressionConfig)  setFireSuppressionConfig(JSON.parse(JSON.stringify(set.fireSuppressionConfig)));
    if (set.aerialSuppressionConfig) setAerialSuppressionConfig(JSON.parse(JSON.stringify(set.aerialSuppressionConfig)));
    if (set.checklistConfig) setChecklistConfig(JSON.parse(JSON.stringify(set.checklistConfig)));
    else setChecklistConfig({ level: 'junior', sections: [] });
    // 지휘절차 / 출동대 상태메세지 / 태그 프리셋은 메인 설정 불러오기 시 변경하지 않음
    setExtraFireFloors(set.building?.extraFireFloors ? JSON.parse(JSON.stringify(set.building.extraFireFloors)) : []);
    setHasSiamesePipe(resolveHasSiamesePipe(set.building));
    setHasIndoorHydrant(set.building?.hasIndoorHydrant ?? false);
    setBoardColumnRatio(set.building?.boardColumnRatio ?? BOARD_COL_RATIO_DEFAULT);
    setActiveSettingsId(id);
    setActiveSettingsName(set.name);
  }, [settingsList]);

  const deleteSettingsEntry = useCallback((id: string) => {
    setSettingsList(prev => removeSettingsSet(prev, id));
    if (activeSettingsId === id) setActiveSettingsId(null);
  }, [activeSettingsId]);

  const newSettings = useCallback(() => {
    markCleanRef.current = true;
    setConfig(DEFAULT_BUILDING_CONFIG);
    setFireFloor(1);
    setFireStatus(null);
    setTargetName('');
    setTiming(DEFAULT_TIMING);
    setDispatchSetup(DEFAULT_DISPATCH_SETUP);
    setDispatchRoster([]);
    setVictimSetup([]);
    setArrivalMode('time');
    setMedicalPostChief('');
    setStagingAreaChief('');
    setEventSetup([]);
    setHydrantSetup([]);
    setChecklistConfig({ level: 'junior', sections: [] });
    // 지휘절차 / 출동대 상태메세지 / 태그 프리셋은 신규 작성 시에도 유지
    setExtraFireFloors([]);
    setHasSiamesePipe(false);
    setHasIndoorHydrant(false);
    setActiveSettingsId(null);
    setActiveSettingsName('새 설정');
  }, []);

  const markApplied = useCallback(() => {
    appliedSnapshotRef.current = buildSnapshot();
    setLastAppliedAt(Date.now());
    setIsApplied(true);
  }, [buildSnapshot]);

  return (
    <SettingsContext.Provider value={{
      building: { config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, boardColumnRatio },
      updateBuildingConfig, updateFireFloor, updateFireStatus, updateTargetName, updateExtraFireFloors,
      updateSiamesePipe, updateIndoorHydrant,
      boardColumnRatio, updateBoardColumnRatio,
      timing, updateTiming,
      arrivalMode, updateArrivalMode,
      medicalPostChief, stagingAreaChief,
      updateMedicalPostChief, updateStagingAreaChief,
      eventSetup, addEventSetupItem, updateEventSetupItem, removeEventSetupItem,
      dispatchSetup, updateDispatchUnits, updateDispatchVehicles,
      addDispatchExtraUnit, removeDispatchExtraUnit,
      dispatchRoster, updateRosterArrival, updateRosterOrder, updateRosterPrefix,
      victimSetup, addVictimSetupItem, updateVictimSetupItem, removeVictimSetupItem,
      hydrantSetup, addHydrantSetupItem, updateHydrantSetupItem, removeHydrantSetupItem,
      fireSuppressionConfig, updateFireSuppressionConfig,
      aerialSuppressionConfig, updateAerialSuppressionConfig,
      checklistConfig,
      addChecklistSection, updateChecklistSection, removeChecklistSection, reorderChecklistSections,
      addChecklistItem, updateChecklistItem, removeChecklistItem, reorderChecklistItems, appendChecklistSections,
      commandProcedureConfigs, updateCommandProcedureLevel,
      activeCommandProcedureLevel, updateActiveCommandProcedureLevel,
      unitStatusConfig, updateUnitStatusMessages,
      unitTagPresetConfig, updateUnitTagPresets,
      settingsList, activeSettingsId, activeSettingsName, setActiveSettingsName,
      saveSettings, saveSettingsAs, loadSettings, deleteSettingsEntry, newSettings,
      isDirty, isApplied, lastSavedAt, lastAppliedAt, markApplied,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
