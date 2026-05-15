import type { DispatchSetup, DispatchRosterItem } from '../types/settings';
import { generateId } from './settingsStorage';

// ─── 부대명 표시 ──────────────────────────────────────────────────────

const ROSTER_TYPE_SUFFIX: Record<string, string> = {
  suppression:    '진압대',
  pump:           '펌프',
  rescue:         '구조',
  rescue_vehicle: '구조차',
  ems:            '구급',
  aerial:         '고가',
  ladder:         '굴절',
  smokeExhaust:   '배연',
  command:        '지휘차',
  water_tank:     '물탱크',
};

/**
 * 부대명 접두사가 있으면 "00진압대" 형식으로 반환, 없으면 item.name 그대로.
 * unitPrefix는 부모·자식 모두에 복사되어 있으므로 allItems 불필요.
 */
export function computeRosterDisplayName(item: DispatchRosterItem): string {
  const prefix = item.unitPrefix?.trim();
  if (!prefix) return item.name;
  const suffix = ROSTER_TYPE_SUFFIX[item.unitType] ?? item.name;
  return `${prefix}${suffix}`;
}

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
  name:       string;
  unitType:   string;
  linkedTo:   string | null;
}

/**
 * dispatchSetup에서 로스터를 재생성한다.
 * 동일 이름 항목의 ID·도착시간·착대순서는 prevRoster에서 이어받는다.
 *
 * 구급대는 차량을 자동 연동하지 않는다.
 * (진압대 → 펌프, 구조대 → 구조차만 자동 연동)
 */
export function buildRoster(
  setup: DispatchSetup,
  prevRoster: DispatchRosterItem[],
): DispatchRosterItem[] {
  const prevByName = new Map(prevRoster.map(r => [r.name, r]));

  // 활동대 정의 — hasVehicle: true 인 경우만 차량 자동 연동
  const activityDefs = [
    { count: setup.units.suppression, unitLabel: '진압', unitType: 'suppression', vehLabel: '펌프',   vehType: 'pump',           hasVehicle: true  },
    { count: setup.units.rescue,      unitLabel: '구조', unitType: 'rescue',      vehLabel: '구조차', vehType: 'rescue_vehicle', hasVehicle: true  },
    { count: setup.units.ems,         unitLabel: '구급', unitType: 'ems',         vehLabel: '',       vehType: '',              hasVehicle: false },
  ] as const;

  type PendingUnit = { unitEntry: RosterEntry; vehEntry: RosterEntry | null };
  const pendingUnits: PendingUnit[] = [];

  for (const def of activityDefs) {
    for (let i = 1; i <= def.count; i++) {
      pendingUnits.push({
        unitEntry: { name: `${def.unitLabel}${i}`, unitType: def.unitType, linkedTo: null },
        vehEntry:  def.hasVehicle
          ? { name: `${def.vehLabel}${i}`, unitType: def.vehType, linkedTo: null }
          : null,
      });
    }
  }

  const result: DispatchRosterItem[] = [];

  for (const { unitEntry, vehEntry } of pendingUnits) {
    const prevUnit = prevByName.get(unitEntry.name);
    const unitId   = prevUnit?.id ?? generateId();
    const prefix   = prevUnit?.unitPrefix;
    result.push({
      id:           unitId,
      name:         unitEntry.name,
      unitType:     unitEntry.unitType,
      linkedTo:     null,
      unitPrefix:   prefix,
      arrivalSec:   prevUnit?.arrivalSec   ?? 0,
      arrivalOrder: prevUnit?.arrivalOrder ?? 1,
    });

    if (vehEntry) {
      const prevVeh = prevByName.get(vehEntry.name);
      result.push({
        id:           prevVeh?.id ?? generateId(),
        name:         vehEntry.name,
        unitType:     vehEntry.unitType,
        linkedTo:     unitId,
        unitPrefix:   prefix,  // 부모와 동기화
        arrivalSec:   prevVeh?.arrivalSec   ?? (prevUnit?.arrivalSec ?? 0),
        arrivalOrder: prevVeh?.arrivalOrder ?? (prevUnit?.arrivalOrder ?? 1),
      });
    }
  }

  // 별도 차량
  const vehicleDefs = [
    { key: 'aerial'       as const, prefix: '고가',    unitType: 'aerial' },
    { key: 'ladder'       as const, prefix: '굴절',    unitType: 'ladder' },
    { key: 'smokeExhaust' as const, prefix: '배연',    unitType: 'smokeExhaust' },
    { key: 'command'      as const, prefix: '지휘',    unitType: 'command' },
    { key: 'waterTank'    as const, prefix: '물탱크',  unitType: 'water_tank' },
  ];

  for (const def of vehicleDefs) {
    for (let i = 1; i <= setup.vehicles[def.key]; i++) {
      const name = `${def.prefix}${i}`;
      const prev = prevByName.get(name);
      result.push({
        id:           prev?.id ?? generateId(),
        name,
        unitType:     def.unitType,
        linkedTo:     null,
        unitPrefix:   prev?.unitPrefix,
        arrivalSec:   prev?.arrivalSec   ?? 0,
        arrivalOrder: prev?.arrivalOrder ?? 1,
      });
    }
  }

  return result;
}
