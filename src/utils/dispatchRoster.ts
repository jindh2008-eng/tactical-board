import type { DispatchSetup, DispatchRosterItem } from '../types/settings';
import { generateId } from './settingsStorage';

/** 초 → MM:SS 문자열 */
export function secsToMmss(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** MM:SS 문자열 → 초 (파싱 실패 시 fallback 반환) */
export function mmssToSecs(raw: string, fallback = 0): number {
  const match = raw.trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!match) return fallback;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

// ─── 로스터 빌더 ─────────────────────────────────────────────────

interface RosterEntry {
  name:     string;
  unitType: string;
  linkedTo: string | null;
}

/**
 * dispatchSetup에서 로스터를 재생성한다.
 * 동일 이름 항목의 ID·도착시간은 prevRoster에서 이어받는다.
 */
export function buildRoster(
  setup: DispatchSetup,
  prevRoster: DispatchRosterItem[],
): DispatchRosterItem[] {
  const prevByName = new Map(prevRoster.map(r => [r.name, r]));

  // 활동대 + 자동 연동 차량
  const activityDefs = [
    { count: setup.units.suppression, unitLabel: '진압', unitType: 'suppression', vehLabel: '펌프', vehType: 'pump' },
    { count: setup.units.rescue,      unitLabel: '구조', unitType: 'rescue',      vehLabel: '구조차', vehType: 'rescue_vehicle' },
    { count: setup.units.ems,         unitLabel: '구급', unitType: 'ems',         vehLabel: '구급차', vehType: 'ambulance' },
  ] as const;

  // 두 패스로 처리: 먼저 활동대 ID 결정 후 차량 linkedTo 할당
  type PendingUnit = { unitEntry: RosterEntry; vehEntry: RosterEntry };
  const pendingUnits: PendingUnit[] = [];

  for (const def of activityDefs) {
    for (let i = 1; i <= def.count; i++) {
      pendingUnits.push({
        unitEntry: { name: `${def.unitLabel}${i}대`, unitType: def.unitType, linkedTo: null },
        vehEntry:  { name: `${def.vehLabel}${i}호`,  unitType: def.vehType,  linkedTo: null /* filled below */ },
      });
    }
  }

  const result: DispatchRosterItem[] = [];

  for (const { unitEntry, vehEntry } of pendingUnits) {
    const prevUnit = prevByName.get(unitEntry.name);
    const unitId   = prevUnit?.id ?? generateId();
    const unitSec  = prevUnit?.arrivalSec ?? 0;
    result.push({ id: unitId, name: unitEntry.name, unitType: unitEntry.unitType, linkedTo: null, arrivalSec: unitSec });

    const prevVeh  = prevByName.get(vehEntry.name);
    const vehId    = prevVeh?.id ?? generateId();
    const vehSec   = prevVeh?.arrivalSec ?? unitSec;
    result.push({ id: vehId, name: vehEntry.name, unitType: vehEntry.unitType, linkedTo: unitId, arrivalSec: vehSec });
  }

  // 별도 차량
  const vehicleDefs = [
    { key: 'aerial'       as const, prefix: '고가',  unitType: 'aerial' },
    { key: 'ladder'       as const, prefix: '굴절',  unitType: 'ladder' },
    { key: 'smokeExhaust' as const, prefix: '배연',  unitType: 'smokeExhaust' },
    { key: 'command'      as const, prefix: '지휘',  unitType: 'command' },
  ];

  for (const def of vehicleDefs) {
    for (let i = 1; i <= setup.vehicles[def.key]; i++) {
      const name    = `${def.prefix}${i}호`;
      const prev    = prevByName.get(name);
      result.push({
        id:         prev?.id ?? generateId(),
        name,
        unitType:   def.unitType,
        linkedTo:   null,
        arrivalSec: prev?.arrivalSec ?? 0,
      });
    }
  }

  return result;
}
