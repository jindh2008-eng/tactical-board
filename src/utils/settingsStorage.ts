import type { BuildingSettings } from '../types/settings';
import type { SharedBadgePreset, UnitSpecificBadgePreset } from '../types/presets';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

/** 작업 중 프리셋 자동 저장 구조 */
export interface WorkingPresets {
  sharedBadgePresets: SharedBadgePreset[];
  unitBadgePresets:   UnitSpecificBadgePreset[];
}

/** 이름을 붙여 저장하는 설정 세트 */
export interface SettingsSet {
  id:                 string;
  name:               string;
  updatedAt:          string;
  building:           BuildingSettings;
  sharedBadgePresets: SharedBadgePreset[];
  unitBadgePresets:   UnitSpecificBadgePreset[];
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

const EMPTY_WORKING: WorkingPresets = { sharedBadgePresets: [], unitBadgePresets: [] };

export function loadWorkingPresets(): WorkingPresets {
  try {
    const raw = localStorage.getItem(WORKING_PRESETS_KEY);
    if (!raw) return EMPTY_WORKING;
    const parsed = JSON.parse(raw);
    // 이전 포맷(BadgePresetGroup[]) 마이그레이션 처리
    if (Array.isArray(parsed)) return EMPTY_WORKING;
    return {
      sharedBadgePresets: parsed.sharedBadgePresets ?? [],
      unitBadgePresets:   parsed.unitBadgePresets   ?? [],
    };
  } catch {
    return EMPTY_WORKING;
  }
}

export function saveWorkingPresets(presets: WorkingPresets): void {
  localStorage.setItem(WORKING_PRESETS_KEY, JSON.stringify(presets));
}
