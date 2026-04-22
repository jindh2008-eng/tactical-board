import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { BuildingConfig } from '../types';
import type {
  BuildingSettings, TimingSettings,
  DispatchSetup, DispatchRosterItem, VictimSetupItem, ArrivalMode,
} from '../types/settings';
import type { EventSetupItem } from '../types/events';
import { DEFAULT_TIMING, DEFAULT_DISPATCH_SETUP } from '../types/settings';
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
import { buildRoster } from '../utils/dispatchRoster';
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
  updateTargetName:     (name: string) => void;

  // ── 타이밍 설정 ───────────────────────────────
  timing:        TimingSettings;
  updateTiming:  (next: Partial<TimingSettings>) => void;

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

  // ── 출동대 생성 설정 ──────────────────────────
  dispatchSetup:           DispatchSetup;
  updateDispatchUnits:     (u: Partial<DispatchSetup['units']>)    => void;
  updateDispatchVehicles:  (v: Partial<DispatchSetup['vehicles']>) => void;

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
  addEventSetupItem:       (label: string) => void;
  updateEventSetupItem:    (id: string, patch: Partial<Omit<EventSetupItem, 'id'>>) => void;
  removeEventSetupItem:    (id: string) => void;

  // ── 출동대 로스터 ─────────────────────────────
  dispatchRoster:          DispatchRosterItem[];
  updateRosterArrival:     (id: string, secs: number, syncLinked?: boolean) => void;
  updateRosterOrder:       (id: string, order: number) => void;

  // ── 구조대상자 생성 설정 ──────────────────────
  victimSetup:             VictimSetupItem[];
  addVictimSetupItem:      () => void;
  updateVictimSetupItem:   (id: string, patch: Partial<Omit<VictimSetupItem, 'id'>>) => void;
  removeVictimSetupItem:   (id: string) => void;

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
  const [targetName,           setTargetName]           = useState<string>('');

  // ── 프리셋 + 타이밍 (자동 복원) ─────────────────
  const [sharedBadgePresets, setSharedBadgePresets] = useState<SharedBadgePreset[]>(
    () => loadWorkingPresets().sharedBadgePresets
  );
  const [unitBadgePresets, setUnitBadgePresets] = useState<UnitSpecificBadgePreset[]>(
    () => loadWorkingPresets().unitBadgePresets
  );
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

  // ── 설정 세트 ─────────────────────────────────
  const [settingsList,       setSettingsList]       = useState<SettingsSet[]>(loadSettingsList);
  const [activeSettingsId,   setActiveSettingsId]   = useState<string | null>(null);
  const [activeSettingsName, setActiveSettingsName] = useState<string>('새 설정');

  // dispatchSetup 변경 시 로스터 재생성 (기존 ID·도착시간 보존)
  useEffect(() => {
    setDispatchRoster(prev => buildRoster(dispatchSetup, prev));
  }, [dispatchSetup]);

  // 프리셋·타이밍·시나리오 설정 변경 시 자동 저장 (새로고침 대비)
  useEffect(() => {
    saveWorkingPresets({ sharedBadgePresets, unitBadgePresets, timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup });
  }, [sharedBadgePresets, unitBadgePresets, timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup]);

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
  const updateTargetName = useCallback((name: string)         => setTargetName(name),             []);

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

  const updateArrivalMode     = useCallback((mode: ArrivalMode) => setArrivalMode(mode),       []);
  const updateMedicalPostChief = useCallback((name: string) => setMedicalPostChief(name), []);
  const updateStagingAreaChief = useCallback((name: string) => setStagingAreaChief(name), []);

  const addEventSetupItem = useCallback((label: string) => {
    setEventSetup(prev => [...prev, { id: generateId(), label, enabled: true }]);
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
      id:             generateId(),
      gender:         '남',
      ageGroup:       '40대',
      condition:      '중상',
      face:           null,    // "없음" 기본값
      floor:          null,    // "없음" 기본값
      detailLocation: '',
    }]);
  }, []);

  const updateVictimSetupItem = useCallback((id: string, patch: Partial<Omit<VictimSetupItem, 'id'>>) => {
    setVictimSetup(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const removeVictimSetupItem = useCallback((id: string) => {
    setVictimSetup(prev => prev.filter(item => item.id !== id));
  }, []);

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
      building: { config, fireFloor, stairSmokeStartFloor, targetName },
      timing, sharedBadgePresets, unitBadgePresets,
      dispatchSetup, dispatchRoster, victimSetup, arrivalMode,
      medicalPostChief, stagingAreaChief, eventSetup,
    };
    setActiveSettingsId(id);
    setSettingsList(prev => upsertSettingsSet(prev, set));
  }, [activeSettingsId, activeSettingsName, config, fireFloor, stairSmokeStartFloor, targetName, timing, sharedBadgePresets, unitBadgePresets, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup]);

  const saveSettingsAs = useCallback((newName: string) => {
    const id = generateId();
    const set: SettingsSet = {
      id, name: newName, updatedAt: '',
      building: { config, fireFloor, stairSmokeStartFloor, targetName },
      timing, sharedBadgePresets, unitBadgePresets,
      dispatchSetup, dispatchRoster, victimSetup, arrivalMode,
      medicalPostChief, stagingAreaChief, eventSetup,
    };
    setActiveSettingsId(id);
    setActiveSettingsName(newName);
    setSettingsList(prev => upsertSettingsSet(prev, set));
  }, [config, fireFloor, stairSmokeStartFloor, targetName, timing, sharedBadgePresets, unitBadgePresets, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup]);

  const loadSettings = useCallback((id: string) => {
    const set = settingsList.find(s => s.id === id);
    if (!set) return;
    const b = JSON.parse(JSON.stringify(set.building)) as BuildingSettings;
    setConfig(b.config);
    setFireFloor(b.fireFloor);
    setStairSmokeStartFloor(b.stairSmokeStartFloor);
    setTargetName(b.targetName ?? '');
    setTiming(set.timing ? JSON.parse(JSON.stringify(set.timing)) : DEFAULT_TIMING);
    setSharedBadgePresets(JSON.parse(JSON.stringify(set.sharedBadgePresets ?? [])));
    setUnitBadgePresets(JSON.parse(JSON.stringify(set.unitBadgePresets ?? [])));
    // 구버전 저장 세트는 DEFAULT 값으로 채움
    const rawSetup = set.dispatchSetup ? JSON.parse(JSON.stringify(set.dispatchSetup)) as DispatchSetup : DEFAULT_DISPATCH_SETUP;
    // 구버전 저장 세트에 없는 vehicles 필드 보정
    const loadedSetup: DispatchSetup = {
      ...rawSetup,
      vehicles: { waterTank: 0, ...rawSetup.vehicles },
    };
    setDispatchSetup(loadedSetup);
    const loadedRoster = (set.dispatchRoster
      ? JSON.parse(JSON.stringify(set.dispatchRoster)) as DispatchRosterItem[]
      : buildRoster(loadedSetup, [])
    ).map((r: DispatchRosterItem) => ({ arrivalOrder: 1, ...r })); // arrivalOrder 마이그레이션
    setDispatchRoster(loadedRoster);
    // victimSetup 마이그레이션 (detailLocation, face/floor null 허용, 'RF' 지원)
    const loadedVictims = (set.victimSetup ?? []).map((v: VictimSetupItem) => ({
      ...v,
      detailLocation: v.detailLocation ?? '',
      face:  v.face  ?? null,
      floor: v.floor === 'RF'
        ? 'RF' as const
        : (v.floor != null && !isNaN(Number(v.floor))) ? Number(v.floor) : null,
    }));
    setVictimSetup(loadedVictims);
    setArrivalMode(set.arrivalMode ?? 'time');
    setMedicalPostChief(set.medicalPostChief ?? '');
    setStagingAreaChief(set.stagingAreaChief ?? '');
    setEventSetup(set.eventSetup ? JSON.parse(JSON.stringify(set.eventSetup)) : []);
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
    setTargetName('');
    setTiming(DEFAULT_TIMING);
    setSharedBadgePresets([]);
    setUnitBadgePresets([]);
    setDispatchSetup(DEFAULT_DISPATCH_SETUP);
    setDispatchRoster([]);
    setVictimSetup([]);
    setArrivalMode('time');
    setMedicalPostChief('');
    setStagingAreaChief('');
    setEventSetup([]);
    setActiveSettingsId(null);
    setActiveSettingsName('새 설정');
  }, []);

  return (
    <SettingsContext.Provider value={{
      building: { config, fireFloor, stairSmokeStartFloor, targetName },
      updateBuildingConfig, updateFireFloor, updateStairSmoke, updateTargetName,
      timing, updateTiming,
      sharedBadgePresets, addSharedPreset, updateSharedPreset, removeSharedPreset,
      unitBadgePresets, addUnitPreset, updateUnitPreset, removeUnitPreset,
      arrivalMode, updateArrivalMode,
      medicalPostChief, stagingAreaChief,
      updateMedicalPostChief, updateStagingAreaChief,
      eventSetup, addEventSetupItem, updateEventSetupItem, removeEventSetupItem,
      dispatchSetup, updateDispatchUnits, updateDispatchVehicles,
      dispatchRoster, updateRosterArrival, updateRosterOrder,
      victimSetup, addVictimSetupItem, updateVictimSetupItem, removeVictimSetupItem,
      settingsList, activeSettingsId, activeSettingsName, setActiveSettingsName,
      saveSettings, saveSettingsAs, loadSettings, deleteSettingsEntry, newSettings,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
