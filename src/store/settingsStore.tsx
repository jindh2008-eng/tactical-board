import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { BuildingConfig, FireStatus } from '../types';
import type {
  BuildingSettings, TimingSettings,
  DispatchSetup, DispatchRosterItem, VictimSetupItem, ArrivalMode, HydrantSetupItem,
  FireSuppressionConfig,
} from '../types/settings';
import type { EventSetupItem, EventType } from '../types/events';
import { DEFAULT_TIMING, DEFAULT_DISPATCH_SETUP, DEFAULT_FIRE_SUPPRESSION_CONFIG } from '../types/settings';
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
  updateFireStatus:     (status: FireStatus | null) => void;
  updateTargetName:     (name: string) => void;

  // ── 타이밍 설정 ───────────────────────────────
  timing:        TimingSettings;
  updateTiming:  (next: Partial<TimingSettings>) => void;

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
  addEventSetupItem:       (label: string, icon?: string, eventType?: EventType) => void;
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

  // ── 소화전 사전 설정 ──────────────────────────
  hydrantSetup:            HydrantSetupItem[];
  addHydrantSetupItem:     () => void;
  updateHydrantSetupItem:  (id: string, patch: Partial<Omit<HydrantSetupItem, 'id'>>) => void;
  removeHydrantSetupItem:  (id: string) => void;

  // ── 화재 소화 설정 ────────────────────────────
  fireSuppressionConfig:        FireSuppressionConfig;
  updateFireSuppressionConfig:  (patch: Partial<FireSuppressionConfig>) => void;

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
  const [config,      setConfig]      = useState<BuildingConfig>(DEFAULT_BUILDING_CONFIG);
  const [fireFloor,   setFireFloor]   = useState<number>(1);
  const [fireStatus,  setFireStatus]  = useState<FireStatus | null>(null);
  const [targetName,  setTargetName]  = useState<string>('');

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

  // ── 설정 세트 ─────────────────────────────────
  const [settingsList,       setSettingsList]       = useState<SettingsSet[]>(loadSettingsList);
  const [activeSettingsId,   setActiveSettingsId]   = useState<string | null>(null);
  const [activeSettingsName, setActiveSettingsName] = useState<string>('새 설정');

  // dispatchSetup 변경 시 로스터 재생성 (기존 ID·도착시간 보존)
  useEffect(() => {
    setDispatchRoster(prev => buildRoster(dispatchSetup, prev));
  }, [dispatchSetup]);

  // 타이밍·시나리오 설정 변경 시 자동 저장 (새로고침 대비)
  useEffect(() => {
    saveWorkingPresets({ sharedBadgePresets: [], unitBadgePresets: [], timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup, fireSuppressionConfig });
  }, [timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup, fireSuppressionConfig]);

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
  const updateFireFloor  = useCallback((floor: number)            => setFireFloor(floor),   []);
  const updateFireStatus = useCallback((s: FireStatus | null)     => setFireStatus(s),      []);
  const updateTargetName = useCallback((name: string)             => setTargetName(name),   []);

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

  // ── 설정 세트 저장/불러오기 ─────────────────────

  const saveSettings = useCallback(() => {
    const id = activeSettingsId ?? generateId();
    const set: SettingsSet = {
      id, name: activeSettingsName, updatedAt: '',
      building: { config, fireFloor, fireStatus, targetName },
      timing, sharedBadgePresets: [], unitBadgePresets: [],
      dispatchSetup, dispatchRoster, victimSetup, arrivalMode,
      medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup,
    };
    setActiveSettingsId(id);
    setSettingsList(prev => upsertSettingsSet(prev, set));
  }, [activeSettingsId, activeSettingsName, config, fireFloor, fireStatus, targetName, timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup]);

  const saveSettingsAs = useCallback((newName: string) => {
    const id = generateId();
    const set: SettingsSet = {
      id, name: newName, updatedAt: '',
      building: { config, fireFloor, fireStatus, targetName },
      timing, sharedBadgePresets: [], unitBadgePresets: [],
      dispatchSetup, dispatchRoster, victimSetup, arrivalMode,
      medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup,
    };
    setActiveSettingsId(id);
    setActiveSettingsName(newName);
    setSettingsList(prev => upsertSettingsSet(prev, set));
  }, [config, fireFloor, fireStatus, targetName, timing, dispatchSetup, dispatchRoster, victimSetup, arrivalMode, medicalPostChief, stagingAreaChief, eventSetup, hydrantSetup]);

  const loadSettings = useCallback((id: string) => {
    const set = settingsList.find(s => s.id === id);
    if (!set) return;
    const b = JSON.parse(JSON.stringify(set.building)) as BuildingSettings;
    setConfig(b.config);
    setFireFloor(b.fireFloor);
    setFireStatus(b.fireStatus ?? null);
    setTargetName(b.targetName ?? '');
    setTiming(set.timing ? JSON.parse(JSON.stringify(set.timing)) : DEFAULT_TIMING);
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
    setHydrantSetup(set.hydrantSetup ? JSON.parse(JSON.stringify(set.hydrantSetup)) : []);
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
    setActiveSettingsId(null);
    setActiveSettingsName('새 설정');
  }, []);

  return (
    <SettingsContext.Provider value={{
      building: { config, fireFloor, fireStatus, targetName },
      updateBuildingConfig, updateFireFloor, updateFireStatus, updateTargetName,
      timing, updateTiming,
      arrivalMode, updateArrivalMode,
      medicalPostChief, stagingAreaChief,
      updateMedicalPostChief, updateStagingAreaChief,
      eventSetup, addEventSetupItem, updateEventSetupItem, removeEventSetupItem,
      dispatchSetup, updateDispatchUnits, updateDispatchVehicles,
      dispatchRoster, updateRosterArrival, updateRosterOrder,
      victimSetup, addVictimSetupItem, updateVictimSetupItem, removeVictimSetupItem,
      hydrantSetup, addHydrantSetupItem, updateHydrantSetupItem, removeHydrantSetupItem,
      fireSuppressionConfig, updateFireSuppressionConfig,
      settingsList, activeSettingsId, activeSettingsName, setActiveSettingsName,
      saveSettings, saveSettingsAs, loadSettings, deleteSettingsEntry, newSettings,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
