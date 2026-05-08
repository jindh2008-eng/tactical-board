import type { BuildingSettings, TimingSettings, DispatchSetup, VictimSetupItem, DispatchRosterItem, ArrivalMode, HydrantSetupItem, FireSuppressionConfig } from '../types/settings';
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
  timing?:                 TimingSettings;          // 구버전 역호환을 위해 optional
  dispatchSetup?:          DispatchSetup;           // 구버전 역호환을 위해 optional
  dispatchRoster?:         DispatchRosterItem[];    // 구버전 역호환을 위해 optional
  victimSetup?:            VictimSetupItem[];       // 구버전 역호환을 위해 optional
  arrivalMode?:            ArrivalMode;             // 도착설정 방식
  medicalPostChief?:       string;                  // 임시의료소장
  stagingAreaChief?:       string;                  // 자원대기소장
  eventSetup?:             EventSetupItem[];        // 이벤트 토큰 설정
  hydrantSetup?:           HydrantSetupItem[];      // 소화전 사전 설정
  fireSuppressionConfig?:  FireSuppressionConfig;   // 화재 소화 설정
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
}

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const SETTINGS_LIST_KEY   = 'tacticalBoardSettingsList';
const WORKING_PRESETS_KEY = 'tacticalBoardWorkingPresets';

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

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
  localStorage.setItem(SETTINGS_LIST_KEY, JSON.stringify(next));
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
      detailLocation: v.detailLocation ?? '',
      // face/floor: null 허용 (구버전은 항상 값이 있었음)
      face:  v.face  ?? null,
      // floor 마이그레이션: 'RF' 문자열 → 그대로 유지, 숫자 문자열 → 숫자, 그 외 → null
      floor: v.floor === 'RF'
        ? 'RF' as const
        : (v.floor != null && !isNaN(Number(v.floor))) ? Number(v.floor) : null,
    }));
    // 구버전 dispatchSetup에 waterTank 필드가 없을 수 있으므로 기본값으로 보정
    const rawSetup = parsed.dispatchSetup ?? DEFAULT_DISPATCH_SETUP;
    const dispatchSetup: typeof rawSetup = {
      ...rawSetup,
      vehicles: { waterTank: 0, ...rawSetup.vehicles },
    };
    return {
      sharedBadgePresets: parsed.sharedBadgePresets ?? [],
      unitBadgePresets:   parsed.unitBadgePresets   ?? [],
      timing:             parsed.timing         ?? DEFAULT_TIMING,
      dispatchSetup,
      dispatchRoster:     parsed.dispatchRoster ?? [],
      victimSetup,
      arrivalMode:        parsed.arrivalMode    ?? 'time',
      medicalPostChief:   parsed.medicalPostChief  ?? '',
      stagingAreaChief:   parsed.stagingAreaChief  ?? '',
      eventSetup:         parsed.eventSetup        ?? [],
      hydrantSetup:       parsed.hydrantSetup      ?? [],
    };
  } catch {
    return EMPTY_WORKING;
  }
}

export function saveWorkingPresets(presets: WorkingPresets): void {
  localStorage.setItem(WORKING_PRESETS_KEY, JSON.stringify(presets));
}
