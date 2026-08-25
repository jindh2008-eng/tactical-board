import type { DispatchSetup, DispatchRosterItem } from '../types/settings';
import { generateId } from './settingsStorage';

// ─── 부대명 표시 ──────────────────────────────────────────────────────

const ROSTER_TYPE_SUFFIX: Record<string, string> = {
  suppression:    '진압',
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
 * 부대명 접두사가 있으면 "거진진압" 형식으로 반환, 없으면 item.name 그대로.
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
 * 진압대만 차량(펌프)을 자동 연동한다.
 * 구조대·구급대는 연동하지 않는다 — 구조차가 필요하면 차량 항목에서 따로 넣는다.
 */
/**
 * 새로 만든 대에 줄 착대 번호 — **같은 종류 중 최대 + 1**.
 *
 * 진압 5대가 1~5착대에 있으면 진압6은 6착대다. 진압5를 4착대로 옮겼다면
 * 최대가 4 이므로 진압6은 5착대가 된다.
 *
 * 빈 번호를 메우지 않는 이유는 압축(compactArrivalOrders)이 빈 번호를 없애기
 * 때문이다 — 1..max 가 항상 꽉 차 있어서 "최대+1" 과 "가장 작은 빈 번호"가
 * 같은 값이 된다. 둘 중 무엇으로 적어도 결과가 같다면 읽기 쉬운 쪽을 쓴다.
 *
 * 유관기관(agency)·직접입력(general)은 각자 별도 계수기다 — unitType 이
 * 다르므로 이 함수가 자연히 갈라 센다.
 */
function nextOrderFor(unitType: string, assigned: DispatchRosterItem[]): number {
  let max = 0;
  for (const r of assigned) {
    if (r.unitType !== unitType) continue;
    if (r.linkedTo !== null) continue;      // 연동 차량은 부모를 따르므로 세지 않는다
    max = Math.max(max, r.arrivalOrder ?? 1);
  }
  return max + 1;
}

export function buildRoster(
  setup: DispatchSetup,
  prevRoster: DispatchRosterItem[],
): DispatchRosterItem[] {
  const prevByName = new Map(prevRoster.map(r => [r.name, r]));

  // 활동대 정의 — hasVehicle: true 인 경우만 차량 자동 연동
  const activityDefs = [
    { count: setup.units.suppression, unitLabel: '진압', unitType: 'suppression', vehLabel: '펌프',   vehType: 'pump',           hasVehicle: true  },
    { count: setup.units.rescue,      unitLabel: '구조', unitType: 'rescue',      vehLabel: '',       vehType: '',              hasVehicle: false },
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
      // 이미 있던 대는 그 값을 지킨다 — 사용자가 도착순서에서 옮겨 둔 것이다
      arrivalOrder: prevUnit?.arrivalOrder ?? nextOrderFor(unitEntry.unitType, [...prevRoster, ...result]),
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
    { key: 'rescueVehicle' as const, prefix: '구조차', unitType: 'rescue_vehicle' },
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
        arrivalOrder: prev?.arrivalOrder ?? nextOrderFor(def.unitType, [...prevRoster, ...result]),
      });
    }
  }

  // 유관기관·직접입력 추가 항목 (ID 기준으로 이전 도착설정 보존)
  const prevById = new Map(prevRoster.map(r => [r.id, r]));
  for (const extra of (setup.extraUnits ?? [])) {
    const prev = prevById.get(extra.id);
    result.push({
      id:           extra.id,
      name:         extra.name,
      unitType:     extra.unitType,
      linkedTo:     null,
      arrivalSec:   prev?.arrivalSec   ?? 0,
      arrivalOrder: prev?.arrivalOrder ?? nextOrderFor(extra.unitType, [...prevRoster, ...result]),
    });
  }

  return result;
}


/**
 * 빈 착대를 걷어내고 위를 당긴다.
 *
 * 4착대가 비면 5착대가 4착대가 된다. 도착순서 목록에 빈 줄이 남지 않게 하려는
 * 것인데, **번호가 밀리는 부작용이 있다** — 체크리스트의 도착 항목이
 * `arrivalOrder` 를 저장하고 있어서(types/settings.ts ChecklistItem), 압축 뒤에는
 * 그 항목이 다른 편성을 가리킨다. 그래서 호출부가 경고를 띄운다.
 *
 * 체크리스트를 여기서 같이 고치지 않는 것은 의도다 — 설정모드가 다른 화면의
 * 데이터를 조용히 바꾸기 시작하면 되돌릴 방법이 없다. 몇 개가 영향을 받는지
 * 알리고 판단은 사람이 한다.
 *
 * @returns 바뀐 항목이 담긴 새 배열과, 옛 번호 → 새 번호 대응(바뀐 것만)
 */
export function compactArrivalOrders(
  roster: DispatchRosterItem[],
): { roster: DispatchRosterItem[]; remap: Map<number, number> } {
  const used = [...new Set(roster.map(r => r.arrivalOrder ?? 1))].sort((a, b) => a - b);

  const remap = new Map<number, number>();
  used.forEach((old, i) => {
    const next = i + 1;
    if (old !== next) remap.set(old, next);
  });

  if (remap.size === 0) return { roster, remap };

  return {
    roster: roster.map(r => {
      const old = r.arrivalOrder ?? 1;
      const next = remap.get(old);
      return next === undefined ? r : { ...r, arrivalOrder: next };
    }),
    remap,
  };
}
