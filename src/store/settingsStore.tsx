import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { BuildingConfig } from '../types';
import type { BuildingSettings } from '../types/settings';
import type { SharedBadgePreset, UnitSpecificBadgePreset } from '../types/presets';
import type { SettingsSet } from '../utils/settingsStorage';
import {
  generateId,
  loadSettingsList,
  loadWorkingPresets,
  saveWorkingPresets,
  upsertSettingsSet,
  removeSettingsSet,
} from '../utils/settingsStorage';
import { DEFAULT_BUILDING_CONFIG } from '../data/buildingData';

// ─────────────────────────────────────────────
// Context 타입
// ─────────────────────────────────────────────

interface SettingsContextValue {
  // ── 건물 설정 ────────────────────────────────
  building:             BuildingSettings;
  updateBuildingConfig: (config: BuildingConfig) => void;
  updateFireFloor:      (floor: number) => void;
  updateStairSmoke:     (floor: number | null) => void;

  // ── 공통 프리셋 CRUD ──────────────────────────
  sharedBadgePresets: SharedBadgePreset[];
  addSharedPreset:    (p: Omit<SharedBadgePreset, 'id'>) => void;
  updateSharedPreset: (id: string, p: Omit<SharedBadgePreset, 'id'>) => void;
  removeSharedPreset: (id: string) => void;

  // ── 출동대별 고유 프리셋 CRUD ──────────────────
  unitBadgePresets: UnitSpecificBadgePreset[];
  addUnitPreset:    (p: Omit<UnitSpecificBadgePreset, 'id'>) => void;
  updateUnitPreset: (id: string, p: Omit<UnitSpecificBadgePreset, 'id'>) => void;
  removeUnitPreset: (id: string) => void;

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
  // ── 건물 설정 ─────────────────────────────────
  const [config,               setConfig]               = useState<BuildingConfig>(DEFAULT_BUILDING_CONFIG);
  const [fireFloor,            setFireFloor]            = useState<number>(1);
  const [stairSmokeStartFloor, setStairSmokeStartFloor] = useState<number | null>(null);

  // ── 프리셋 (자동 복원) ────────────────────────
  const [sharedBadgePresets, setSharedBadgePresets] = useState<SharedBadgePreset[]>(
    () => loadWorkingPresets().sharedBadgePresets
  );
  const [unitBadgePresets, setUnitBadgePresets] = useState<UnitSpecificBadgePreset[]>(
    () => loadWorkingPresets().unitBadgePresets
  );

  // ── 설정 세트 ─────────────────────────────────
  const [settingsList,       setSettingsList]       = useState<SettingsSet[]>(loadSettingsList);
  const [activeSettingsId,   setActiveSettingsId]   = useState<string | null>(null);
  const [activeSettingsName, setActiveSettingsName] = useState<string>('새 설정');

  // 프리셋 변경 시 자동 저장 (새로고침 대비)
  useEffect(() => {
    saveWorkingPresets({ sharedBadgePresets, unitBadgePresets });
  }, [sharedBadgePresets, unitBadgePresets]);

  // ── 건물 설정 ──────────────────────────────────

  const updateBuildingConfig = useCallback((next: BuildingConfig) => {
    setStairSmokeStartFloor(prev => {
      if (prev === null) return null;
      if (prev > 0 && prev > next.aboveGroundFloors) return null;
      if (prev < 0 && -prev > next.basementFloors)   return null;
      return prev;
    });
    setConfig(next);
  }, []);
  const updateFireFloor  = useCallback((floor: number)        => setFireFloor(floor),            []);
  const updateStairSmoke = useCallback((floor: number | null) => setStairSmokeStartFloor(floor), []);

  // ── 공통 프리셋 CRUD ────────────────────────────

  const addSharedPreset = useCallback((p: Omit<SharedBadgePreset, 'id'>) => {
    setSharedBadgePresets(prev => [...prev, { ...p, id: generateId() }]);
  }, []);

  const updateSharedPreset = useCallback((id: string, p: Omit<SharedBadgePreset, 'id'>) => {
    setSharedBadgePresets(prev => prev.map(x => x.id === id ? { ...p, id } : x));
  }, []);

  const removeSharedPreset = useCallback((id: string) => {
    setSharedBadgePresets(prev => prev.filter(x => x.id !== id));
  }, []);

  // ── 출동대별 프리셋 CRUD ────────────────────────

  const addUnitPreset = useCallback((p: Omit<UnitSpecificBadgePreset, 'id'>) => {
    setUnitBadgePresets(prev => [...prev, { ...p, id: generateId() }]);
  }, []);

  const updateUnitPreset = useCallback((id: string, p: Omit<UnitSpecificBadgePreset, 'id'>) => {
    setUnitBadgePresets(prev => prev.map(x => x.id === id ? { ...p, id } : x));
  }, []);

  const removeUnitPreset = useCallback((id: string) => {
    setUnitBadgePresets(prev => prev.filter(x => x.id !== id));
  }, []);

  // ── 설정 세트 저장/불러오기 ─────────────────────

  const saveSettings = useCallback(() => {
    const id = activeSettingsId ?? generateId();
    const set: SettingsSet = {
      id, name: activeSettingsName, updatedAt: '',
      building: { config, fireFloor, stairSmokeStartFloor },
      sharedBadgePresets, unitBadgePresets,
    };
    setActiveSettingsId(id);
    setSettingsList(prev => upsertSettingsSet(prev, set));
  }, [activeSettingsId, activeSettingsName, config, fireFloor, stairSmokeStartFloor, sharedBadgePresets, unitBadgePresets]);

  const saveSettingsAs = useCallback((newName: string) => {
    const id = generateId();
    const set: SettingsSet = {
      id, name: newName, updatedAt: '',
      building: { config, fireFloor, stairSmokeStartFloor },
      sharedBadgePresets, unitBadgePresets,
    };
    setActiveSettingsId(id);
    setActiveSettingsName(newName);
    setSettingsList(prev => upsertSettingsSet(prev, set));
  }, [config, fireFloor, stairSmokeStartFloor, sharedBadgePresets, unitBadgePresets]);

  const loadSettings = useCallback((id: string) => {
    const set = settingsList.find(s => s.id === id);
    if (!set) return;
    const b = JSON.parse(JSON.stringify(set.building)) as BuildingSettings;
    setConfig(b.config);
    setFireFloor(b.fireFloor);
    setStairSmokeStartFloor(b.stairSmokeStartFloor);
    setSharedBadgePresets(JSON.parse(JSON.stringify(set.sharedBadgePresets ?? [])));
    setUnitBadgePresets(JSON.parse(JSON.stringify(set.unitBadgePresets ?? [])));
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
    setStairSmokeStartFloor(null);
    setSharedBadgePresets([]);
    setUnitBadgePresets([]);
    setActiveSettingsId(null);
    setActiveSettingsName('새 설정');
  }, []);

  return (
    <SettingsContext.Provider value={{
      building: { config, fireFloor, stairSmokeStartFloor },
      updateBuildingConfig, updateFireFloor, updateStairSmoke,
      sharedBadgePresets, addSharedPreset, updateSharedPreset, removeSharedPreset,
      unitBadgePresets, addUnitPreset, updateUnitPreset, removeUnitPreset,
      settingsList, activeSettingsId, activeSettingsName, setActiveSettingsName,
      saveSettings, saveSettingsAs, loadSettings, deleteSettingsEntry, newSettings,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
