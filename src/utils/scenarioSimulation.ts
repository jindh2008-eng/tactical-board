import type { FireSuppressionConfig } from '../types/settings';

// ─────────────────────────────────────────────
// 공유 상수
// ─────────────────────────────────────────────

export const WATER_TANK_CAP  = 6000;   // L
export const SUPPRESSION_LPM = 300;    // L/min per 진압대
export const HYDRANT_LPM     = 1000;   // L/min per 소화전

export const MAX_SIM_SECS = 5400;      // 90분 상한

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type SimFireStatus =
  | 'extension-peak'
  | 'peak'
  | 'seventy'
  | 'half'
  | 'initial';

export interface ScenarioFloor {
  floorId:       string;
  label:         string;
  initialStatus: SimFireStatus;
  suppCount:     number;
}

export interface ScenarioArrival {
  id:         string;
  label:      string;
  arrivalSec: number;
}

export interface ScenarioInput {
  floors:              ScenarioFloor[];
  arrivals:            ScenarioArrival[];
  hydrantCount:        0 | 1 | 2;
  cfg:                 FireSuppressionConfig;
  unitFloorAssign?:    Record<string, string>;                        // legacy: fixed assignment
  unitMinuteAssign?:   Record<string, Record<number, string | null>>; // per-minute: minute→floorId|null
}

export interface SimEvent {
  sec:         number;
  type:        'arrival' | 'fire' | 'water';
  floorId?:    string;
  description: string;
}

export interface ScenarioResult {
  events:           SimEvent[];
  floorPct:         Record<string, number[]>;    // floorId → pct/sec
  initialTimes:     Record<string, number | null>;
  waterLevel:       number[];                    // level/sec
  finalNetDrainLpm: number;
  duration:         number;
}

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

export function defaultOrderSec(order: number): number {
  if (order === 1) return 180;
  if (order === 2) return 300;
  return 300 + (order - 2) * 120;
}

export function floorIdLabel(floorId: string): string {
  if (floorId === 'RF') return '옥상';
  const n = parseInt(floorId, 10);
  return isNaN(n) ? floorId : `${n}층`;
}

function initPct(status: SimFireStatus): number {
  if (status === 'peak')    return 100;
  if (status === 'seventy') return 70;
  if (status === 'half')    return 50;
  if (status === 'initial') return 0;
  return 100; // extension-peak
}

// ─────────────────────────────────────────────
// 시뮬레이션
// ─────────────────────────────────────────────

export function runScenarioSimulation(input: ScenarioInput): ScenarioResult {
  const { floors, arrivals, hydrantCount, cfg } = input;

  if (floors.length === 0) {
    return { events: [], floorPct: {}, initialTimes: {}, waterLevel: [], finalNetDrainLpm: 0, duration: 0 };
  }

  const sorted = [...arrivals].sort((a, b) => a.arrivalSec - b.arrivalSec);
  const useMinuteAssign = !!input.unitMinuteAssign;

  // 층별 배정 (legacy mode only)
  let unitFloor: Record<string, string> = {};
  if (!useMinuteAssign) {
    if (input.unitFloorAssign) {
      unitFloor = { ...input.unitFloorAssign };
    } else {
      let idx = 0;
      for (const fl of floors) {
        for (let i = 0; i < fl.suppCount && idx < sorted.length; i++, idx++) {
          unitFloor[sorted[idx].id] = fl.floorId;
        }
      }
    }
  }

  // 층 상태
  type FS = { status: SimFireStatus; pts: number; pct: number; doneSec: number | null };
  const fsMap: Record<string, FS> = {};
  for (const fl of floors) {
    fsMap[fl.floorId] = {
      status:  fl.initialStatus,
      pts:     0,
      pct:     initPct(fl.initialStatus),
      doneSec: fl.initialStatus === 'initial' ? 0 : null,
    };
  }

  const floorPct: Record<string, number[]> = {};
  for (const fl of floors) floorPct[fl.floorId] = [];

  const waterLevel: number[] = [];
  const events: SimEvent[]   = [];
  let wl = WATER_TANK_CAP;
  let simEnd = 0;
  let maxActiveUnits = 0;

  // minute-assign 모드: 직전 분의 배정층 추적 (도착 이벤트용)
  const prevMinFloor: Record<string, string | null> = {};
  if (useMinuteAssign) {
    for (const unit of sorted) prevMinFloor[unit.id] = null;
  }

  for (let sec = 0; sec <= MAX_SIM_SECS; sec++) {
    const minuteCol = Math.floor(sec / 60) + 1;

    if (useMinuteAssign) {
      // 매 분 시작 시점에 층 전환 → 도착 이벤트 발생
      if (sec % 60 === 0) {
        for (const unit of sorted) {
          const prev = prevMinFloor[unit.id];
          const cur  = input.unitMinuteAssign![unit.id]?.[minuteCol] ?? null;
          if (cur != null && cur !== prev) {
            const flLabel = floors.find(f => f.floorId === cur)?.label ?? cur;
            events.push({ sec, type: 'arrival', floorId: cur,
              description: `${unit.label} 방수 시작 (${flLabel})` });
          }
          prevMinFloor[unit.id] = cur;
        }
      }
    } else {
      for (const unit of sorted) {
        const fid = unitFloor[unit.id];
        if (!fid) continue;
        if (Math.round(unit.arrivalSec) === sec) {
          const flLabel = floors.find(f => f.floorId === fid)?.label ?? fid;
          events.push({ sec, type: 'arrival', floorId: fid,
            description: `${unit.label} 방수 시작 (${flLabel})` });
        }
      }
    }

    // 층별 활성 진압대 집계
    const unitsPerFloor: Record<string, number> = {};
    if (useMinuteAssign) {
      for (const unit of sorted) {
        const fid = input.unitMinuteAssign![unit.id]?.[minuteCol] ?? null;
        if (fid) unitsPerFloor[fid] = (unitsPerFloor[fid] ?? 0) + 1;
      }
    } else {
      for (const unit of sorted) {
        const fid = unitFloor[unit.id];
        if (!fid) continue;
        if (sec >= Math.round(unit.arrivalSec)) {
          unitsPerFloor[fid] = (unitsPerFloor[fid] ?? 0) + 1;
        }
      }
    }

    // 화재 소화 처리
    for (const fl of floors) {
      const fs = fsMap[fl.floorId];
      if (fs.doneSec !== null) { floorPct[fl.floorId].push(0); continue; }

      const pts = (unitsPerFloor[fl.floorId] ?? 0) * cfg.ptsPerSec;

      if (fs.status === 'extension-peak') {
        if (pts > 0) {
          fs.pts += pts;
          if (fs.pts >= cfg.thresholds['extension-peak']) {
            fs.status = 'peak'; fs.pct = 100; fs.pts = 0;
            events.push({ sec, type: 'fire', floorId: fl.floorId,
              description: `${fl.label} 최성기 진입` });
          }
        }
        floorPct[fl.floorId].push(100);

      } else if (fs.status === 'peak' || fs.status === 'seventy' || fs.status === 'half') {
        if (pts > 0) {
          const [rate, bound, next, lbl] =
            fs.status === 'peak'
              ? [30 / cfg.thresholds.peak,    70, 'seventy' as SimFireStatus, '큰불잡음 진입']
              : fs.status === 'seventy'
              ? [20 / cfg.thresholds.seventy, 50, 'half'    as SimFireStatus, '50% 진입']
              : [50 / cfg.thresholds.half,     0, 'initial' as SimFireStatus, '초진'];

          const newPct = fs.pct - pts * rate;
          if (newPct <= bound) {
            fs.status = next; fs.pct = bound;
            if (next === 'initial') {
              fs.doneSec = sec;
              events.push({ sec, type: 'fire', floorId: fl.floorId,
                description: `${fl.label} 초진` });
            } else {
              events.push({ sec, type: 'fire', floorId: fl.floorId,
                description: `${fl.label} ${lbl}` });
            }
          } else {
            fs.pct = newPct;
          }
        }
        floorPct[fl.floorId].push(Math.max(0, fs.pct));

      } else {
        if (fs.doneSec === null) fs.doneSec = sec;
        floorPct[fl.floorId].push(0);
      }
    }

    // 물탱크 수량 계산
    const totalUnits  = Object.values(unitsPerFloor).reduce((a, b) => a + b, 0);
    maxActiveUnits = Math.max(maxActiveUnits, totalUnits);
    const consumeLpm  = totalUnits * SUPPRESSION_LPM;
    const supplyLpm   = hydrantCount * HYDRANT_LPM;
    const netPerSec   = (consumeLpm - supplyLpm) / 60;
    wl = Math.max(0, Math.min(WATER_TANK_CAP, wl - netPerSec));
    waterLevel.push(wl);

    simEnd = sec;
    if (floors.every(fl => fsMap[fl.floorId].doneSec !== null)) break;
  }

  const initialTimes: Record<string, number | null> = {};
  for (const fl of floors) initialTimes[fl.floorId] = fsMap[fl.floorId].doneSec;

  const finalNetDrain = maxActiveUnits * SUPPRESSION_LPM - hydrantCount * HYDRANT_LPM;

  return { events, floorPct, initialTimes, waterLevel, finalNetDrainLpm: finalNetDrain, duration: simEnd + 1 };
}
