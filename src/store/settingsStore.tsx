import { createContext, useContext, useState, useCallback, useEffect } from 'react';
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
import { DEFAULT_TIMING, DEFAULT_DISPATCH_SETUP, DEFAULT_FIRE_SUPPRESSION_CONFIG, DEFAULT_AERIAL_SUPPRESSION_CONFIG } from '../types/settings';
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

interface SettingsContextValue {
  // ── 건물 설정 ────────────────────────────────
  building:             BuildingSettings;
  updateBuildingConfig:     (config: BuildingConfig) => void;
  updateFireFloor:          (floor: number) => void;
  updateFireStatus:         (status: FireStatus | null) => void;
  updateTargetName:         (name: string) => void;
  updateExtraFireFloors:    (floors: ExtraFireFloor[]) => void;
  updateSiamesePipe:        (v: boolean) => void;
  updateIndoorHydrant:      (has: boolean) => void;

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

  // dispatchSetup 변경 시 로스터 재생성 (기존 ID·도착시간 보존)
  useEffect(() => {
    setDispatchRoster(prev => buildRoster(dispatchSetup, prev));
  }, [dispatchSetup]);

  // 독립 항목 자동 저장 (메인 설정과 별도)
  useEffect(() => { saveCommandProcedureConfigs(commandProcedureConfigs); }, [commandProcedureConfigs]);
  useEffect(() => { saveActiveCommandProcedureLevel(activeCommandProcedureLevel); }, [activeCommandProcedureLevel]);
  useEffect(() => { saveUnitStatusConfig(unitStatusConfig); }, [unitStatusConfig]);
  useEffect(() => { saveUnitTagPresetConfig(unitTagPresetConfig); }, [unitTagPresetConfig]);

  // 설정 변경 시 자동 저장 (새로고침 대비)
  useEffect(() => {
    saveWorkingPresets({
      sharedBadgePresets: [], unitBadgePresets: [],
      building: { config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant },
      timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode,
      medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup,
      fireSuppressionConfig, aerialSuppressionConfig, checklistConfig, commandProcedureConfigs, unitStatusConfig,
      unitTagPresetConfig,
    });
  }, [config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup, fireSuppressionConfig, aerialSuppressionConfig, checklistConfig, commandProcedureConfigs, unitStatusConfig, unitTagPresetConfig]);

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
      building: { config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant },
      timing, sharedBadgePresets: [], unitBadgePresets: [],
      dispatchSetup, dispatchRoster, victimSetup, arrivalMode,
      medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup,
      fireSuppressionConfig, aerialSuppressionConfig, checklistConfig, commandProcedureConfigs, unitStatusConfig,
      unitTagPresetConfig,
    };
    setActiveSettingsId(id);
    setSettingsList(prev => upsertSettingsSet(prev, set));
  }, [activeSettingsId, activeSettingsName, config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup, fireSuppressionConfig, aerialSuppressionConfig, checklistConfig, commandProcedureConfigs, unitStatusConfig, unitTagPresetConfig]);

  const saveSettingsAs = useCallback((newName: string) => {
    const id = generateId();
    const set: SettingsSet = {
      id, name: newName, updatedAt: '',
      building: { config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant },
      timing, sharedBadgePresets: [], unitBadgePresets: [],
      dispatchSetup, dispatchRoster, victimSetup, arrivalMode,
      medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup,
      fireSuppressionConfig, aerialSuppressionConfig, checklistConfig, commandProcedureConfigs, unitStatusConfig,
      unitTagPresetConfig,
    };
    setActiveSettingsId(id);
    setActiveSettingsName(newName);
    setSettingsList(prev => upsertSettingsSet(prev, set));
  }, [config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant, timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup, fireSuppressionConfig, aerialSuppressionConfig, checklistConfig, commandProcedureConfigs, unitStatusConfig, unitTagPresetConfig]);

  const loadSettings = useCallback((id: string) => {
    const set = settingsList.find(s => s.id === id);
    if (!set) return;
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
    setActiveSettingsId(id);
    setActiveSettingsName(set.name);
  }, [settingsList]);

  const deleteSettingsEntry = useCallback((id: string) => {
    setSettingsList(prev => removeSettingsSet(prev, id));
    if (activeSettingsId === id) setActiveSettingsId(null);
  }, [activeSettingsId]);

  const newSettings = useCallback(() => {
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

  return (
    <SettingsContext.Provider value={{
      building: { config, fireFloor, fireStatus, targetName, extraFireFloors, hasSiamesePipe, hasIndoorHydrant },
      updateBuildingConfig, updateFireFloor, updateFireStatus, updateTargetName, updateExtraFireFloors,
      updateSiamesePipe, updateIndoorHydrant,
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
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
