import { useMemo, useState } from 'react';
import { useSettings } from '../../store/settingsStore';
import { useUIOverlay } from '../../context/UIOverlayContext';
import {
  runScenarioSimulation,
  floorIdLabel,
  SUPPRESSION_LPM,
  HYDRANT_LPM,
  defaultOrderSec,
} from '../../utils/scenarioSimulation';
import type { SimFireStatus } from '../../utils/scenarioSimulation';
import { computeRosterDisplayName, secsToMmss } from '../../utils/dispatchRoster';
import './ScenarioModal.css';

const STATUS_OPTIONS: { value: SimFireStatus; label: string }[] = [
  { value: 'extension-peak', label: '연소확대' },
  { value: 'peak',           label: '최성기'   },
  { value: 'seventy',        label: '큰불잡음'   },
  { value: 'half',           label: '50%'      },
];

const FLOOR_COLORS = ['#ef4444', '#fb923c', '#eab308'];

// ── 소방용수 관련 상수/타입 ──────────────────────────────
const VEHICLE_CAPACITY: Record<string, number> = { pump: 2800, water_tank: 6000 };

type WaterVehicleStatus = '사용' | '사용안함';
type HydrantGridStatus  = '-' | '점령';

// 소방용수 스택 영역 (좌→우 step, 위→아래 역순 step)
function buildStepArea(tops: number[], bottoms: number[], toY: (v: number) => number): string {
  const n = tops.length;
  if (n === 0) return '';
  const pts: string[] = [`M 0 ${toY(tops[0])}`];
  for (let i = 0; i < n; i++) {
    if (i > 0) pts.push(`V ${toY(tops[i])}`);
    pts.push(`H ${(i + 1) * CELL_W}`);
  }
  for (let i = n - 1; i >= 0; i--) {
    pts.push(`V ${toY(bottoms[i])}`);
    pts.push(`H ${i * CELL_W}`);
  }
  pts.push('Z');
  return pts.join(' ');
}

function buildStepLine(values: number[], toY: (v: number) => number): string {
  const n = values.length;
  if (n === 0) return '';
  const pts: string[] = [`M 0 ${toY(values[0])}`];
  for (let i = 0; i < n; i++) {
    if (i > 0) pts.push(`V ${toY(values[i])}`);
    pts.push(`H ${(i + 1) * CELL_W}`);
  }
  return pts.join(' ');
}

const SIM_STATUSES = new Set<string>(['extension-peak', 'peak', 'seventy', 'half']);
function toSimStatus(s: string | null | undefined): SimFireStatus {
  return (s && SIM_STATUSES.has(s)) ? s as SimFireStatus : 'peak';
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}초`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return s === 0 ? `${m}분` : `${m}분 ${s}초`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `${h}시간` : `${h}시간 ${rm}분`;
}

interface ExtraFloor {
  floorNum: number;
  status:   SimFireStatus;
}

// 차트 치수
const CELL_W = 75;   // 분 열 너비 (SVG viewBox x 단위)
const MT     = 10;
const MB     = 6;
const SVG_H  = 444;
const PLOT_H = SVG_H - MT - MB;

export function ScenarioModal({ standalone = false }: { standalone?: boolean }) {
  const { closeOverlay } = useUIOverlay();
  const {
    building,
    arrivalMode,
    dispatchRoster,
    hydrantSetup,
    fireSuppressionConfig,
    updateFireSuppressionConfig,
    realtimeCalcEnabled,
    setRealtimeCalcEnabled,
    aerialSuppressionConfig,
    updateAerialSuppressionConfig,
  } = useSettings();

  const fireFloor = building.fireFloor;
  const maxFloor  = building.config.aboveGroundFloors;

  const suppRoster = useMemo(
    () => dispatchRoster.filter(r => r.unitType === 'suppression'),
    [dispatchRoster],
  );

  const [mainStatus,     setMainStatus]     = useState<SimFireStatus>(() => toSimStatus(building.fireStatus));
  const [extras,         setExtras]         = useState<ExtraFloor[]>(() =>
    (building.extraFireFloors ?? [])
      .filter(e => e.floor > fireFloor && e.floor <= maxFloor)
      .slice(0, 2)
      .map(e => ({ floorNum: e.floor, status: toSimStatus(e.status) }))
  );
  const [hydrantLpm, setHydrantLpm] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const h of hydrantSetup) init[h.id] = 1000;
    return init;
  });
  const [displayMinutes, setDisplayMinutes] = useState<15 | 20 | 25>(15);
  const [chartTab,       setChartTab]       = useState<'fire' | 'water' | 'combined'>('fire');

  // 진압대별·분별 배치층 (null = 미배정). 최대 25분치 저장
  const [unitMinuteAssign, setUnitMinuteAssign] = useState<Record<string, Record<number, string | null>>>(() => {
    const fireFloorStr = String(fireFloor);
    const init: Record<string, Record<number, string | null>> = {};
    for (const r of suppRoster) {
      const arrSec  = arrivalMode === 'order' ? defaultOrderSec(r.arrivalOrder) : r.arrivalSec;
      const startMin = Math.floor(arrSec / 60) + 1;
      const mins: Record<number, string | null> = {};
      for (let m = 1; m <= 25; m++) {
        mins[m] = m >= startMin ? fireFloorStr : null;
      }
      init[r.id] = mins;
    }
    return init;
  });

  const availableFloors = useMemo(() => {
    const nums: number[] = [];
    for (let f = fireFloor + 1; f <= maxFloor; f++) nums.push(f);
    return nums;
  }, [fireFloor, maxFloor]);

  const allFloors = useMemo(() => [
    { floorId: String(fireFloor), label: floorIdLabel(String(fireFloor)), initialStatus: mainStatus, suppCount: 0 },
    ...extras.map(e => ({
      floorId:       String(e.floorNum),
      label:         floorIdLabel(String(e.floorNum)),
      initialStatus: e.status,
      suppCount:     0,
    })),
  ], [fireFloor, mainStatus, extras]);

  // 층별 최대 배정 대수 (좌측 패널 배지용)
  const peakCountPerFloor = useMemo(() => {
    const peak: Record<string, number> = {};
    for (let m = 1; m <= displayMinutes; m++) {
      const cnt: Record<string, number> = {};
      for (const r of suppRoster) {
        const fid = unitMinuteAssign[r.id]?.[m] ?? null;
        if (fid) cnt[fid] = (cnt[fid] ?? 0) + 1;
      }
      for (const [fid, c] of Object.entries(cnt)) {
        peak[fid] = Math.max(peak[fid] ?? 0, c);
      }
    }
    return peak;
  }, [suppRoster, unitMinuteAssign, displayMinutes]);

  const totalAssigned = useMemo(
    () => suppRoster.filter(r =>
      Object.values(unitMinuteAssign[r.id] ?? {}).some(v => v != null)
    ).length,
    [suppRoster, unitMinuteAssign],
  );

  const simInput = useMemo(() => ({
    floors: allFloors,
    arrivals: suppRoster.map(r => ({
      id:         r.id,
      label:      computeRosterDisplayName(r),
      arrivalSec: 0,
    })),
    hydrantCount: Math.min(2, hydrantSetup.length) as 0 | 1 | 2,
    cfg:             fireSuppressionConfig,
    unitMinuteAssign,
  }), [allFloors, suppRoster, hydrantSetup.length, fireSuppressionConfig, unitMinuteAssign]);

  const result = useMemo(() => runScenarioSimulation(simInput), [simInput]);
  const { events, floorPct, initialTimes } = result;

  function availableForExtra(idx: number): number[] {
    const used = new Set([fireFloor, ...extras.map((e, i) => i !== idx ? e.floorNum : -1)]);
    const list = availableFloors.filter(f => !used.has(f));
    if (extras[idx] && !list.includes(extras[idx].floorNum)) list.unshift(extras[idx].floorNum);
    return list;
  }

  function addExtra() {
    if (extras.length >= 2) return;
    const used = new Set([fireFloor, ...extras.map(e => e.floorNum)]);
    const nextFloor = availableFloors.find(f => !used.has(f));
    if (nextFloor == null) return;
    setExtras(prev => [...prev, { floorNum: nextFloor, status: 'extension-peak' }]);
  }

  function removeExtra(idx: number) {
    const removedFid = String(extras[idx].floorNum);
    setExtras(prev => prev.filter((_, i) => i !== idx));
    setUnitMinuteAssign(prev => {
      const next: typeof prev = {};
      for (const [uid, mins] of Object.entries(prev)) {
        const nm: Record<number, string | null> = {};
        for (const [m, fid] of Object.entries(mins)) nm[Number(m)] = fid === removedFid ? null : fid;
        next[uid] = nm;
      }
      return next;
    });
  }

  function updateExtra(idx: number, patch: Partial<ExtraFloor>) {
    const oldFid = String(extras[idx].floorNum);
    setExtras(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));
    if (patch.floorNum != null) {
      const newFid = String(patch.floorNum);
      setUnitMinuteAssign(prev => {
        const next: typeof prev = {};
        for (const [uid, mins] of Object.entries(prev)) {
          const nm: Record<number, string | null> = {};
          for (const [m, fid] of Object.entries(mins)) nm[Number(m)] = fid === oldFid ? newFid : fid;
          next[uid] = nm;
        }
        return next;
      });
    }
  }

  function setUnitMinute(unitId: string, min: number, floorId: string | null) {
    setUnitMinuteAssign(prev => {
      const updated = { ...(prev[unitId] ?? {}) };
      for (let m = min; m <= 25; m++) updated[m] = floorId;
      return { ...prev, [unitId]: updated };
    });
  }

  // ── 소방용수: 차량 로스터 (펌프차 + 물탱크차) ───────────────
  const vehicleRoster = useMemo(
    () => dispatchRoster.filter(r => r.unitType === 'pump' || r.unitType === 'water_tank'),
    [dispatchRoster],
  );

  // 차량 분별 상태 (fill-forward)
  const [vehicleMinuteAssign, setVehicleMinuteAssign] = useState<Record<string, Record<number, WaterVehicleStatus>>>(() => {
    const init: Record<string, Record<number, WaterVehicleStatus>> = {};
    const vehicles = dispatchRoster.filter(r => r.unitType === 'pump' || r.unitType === 'water_tank');
    for (const v of vehicles) {
      const mins: Record<number, WaterVehicleStatus> = {};
      for (let m = 1; m <= 25; m++) mins[m] = '사용안함';
      init[v.id] = mins;
    }
    return init;
  });

  // 소화전 분별 상태 (fill-forward)
  const [hydrantMinuteStatus, setHydrantMinuteStatus] = useState<Record<string, Record<number, HydrantGridStatus>>>(() => {
    const init: Record<string, Record<number, HydrantGridStatus>> = {};
    for (const h of hydrantSetup) {
      const mins: Record<number, HydrantGridStatus> = {};
      for (let m = 1; m <= 25; m++) mins[m] = '-';
      init[h.id] = mins;
    }
    return init;
  });

  function setVehicleMinute(vid: string, min: number, status: WaterVehicleStatus) {
    setVehicleMinuteAssign(prev => {
      const updated = { ...(prev[vid] ?? {}) };
      for (let m = min; m <= 25; m++) updated[m] = status;
      return { ...prev, [vid]: updated };
    });
  }

  function setHydrantMinute(hid: string, min: number, status: HydrantGridStatus) {
    setHydrantMinuteStatus(prev => {
      const updated = { ...(prev[hid] ?? {}) };
      for (let m = min; m <= 25; m++) updated[m] = status;
      return { ...prev, [hid]: updated };
    });
  }

  // 분별 소방용수 데이터 — 순차 시뮬레이션
  const waterData = useMemo(() => {
    let pool1seon = 0;
    const prevVehStatus: Record<string, WaterVehicleStatus> = {};
    for (const v of vehicleRoster) prevVehStatus[v.id] = '사용안함';

    const result = [];
    for (let m = 1; m <= displayMinutes; m++) {
      let maxCapacity = 0;
      for (const v of vehicleRoster) {
        const prev = prevVehStatus[v.id];
        const cur  = vehicleMinuteAssign[v.id]?.[m] ?? '사용안함';
        const cap  = VEHICLE_CAPACITY[v.unitType] ?? 0;
        const wasActive = prev === '사용';
        const isActive  = cur  === '사용';
        if (!wasActive && isActive)  pool1seon += cap;
        if (wasActive  && !isActive) pool1seon = Math.max(0, pool1seon - cap);
        prevVehStatus[v.id] = cur;
        if (isActive) maxCapacity += cap;
      }

      const activeSuppression = suppRoster.filter(r => (unitMinuteAssign[r.id]?.[m] ?? null) != null).length;
      const bansu = activeSuppression * SUPPRESSION_LPM;
      const connectedHydrants = hydrantSetup.filter(h => (hydrantMinuteStatus[h.id]?.[m] ?? '-') === '점령');
      const bosu = connectedHydrants.reduce((sum, h) => sum + (hydrantLpm[h.id] ?? HYDRANT_LPM), 0);

      const netFlow = bosu - bansu;
      pool1seon = Math.max(0, Math.min(maxCapacity, pool1seon + netFlow));

      const totalHydrant = bosu;
      result.push({
        m, bosu, bansu,
        total1seon: pool1seon,
        totalHydrant,
        total: pool1seon,
      });
    }
    return result;
  }, [displayMinutes, suppRoster, unitMinuteAssign, vehicleRoster, vehicleMinuteAssign, hydrantSetup, hydrantMinuteStatus, hydrantLpm]);

  // 소방용수 Y축 스케일
  const yMaxW = useMemo(() => {
    const maxPool  = waterData.reduce((m, d) => Math.max(m, d.total1seon), 0);
    const maxBansu = waterData.reduce((m, d) => Math.max(m, d.bansu), 0);
    const raw = Math.max(maxPool, maxBansu, SUPPRESSION_LPM);
    return Math.ceil(raw / SUPPRESSION_LPM) * SUPPRESSION_LPM;
  }, [waterData]);

  const waterYTicks = useMemo(() => {
    const total = Math.round(yMaxW / SUPPRESSION_LPM);
    const labelEvery = Math.max(1, Math.ceil(total / 7));
    return Array.from({ length: total + 1 }, (_, i) => ({
      v:     i * SUPPRESSION_LPM,
      label: i % labelEvery === 0,
    }));
  }, [yMaxW]);

  // 그래프 헬퍼
  const chartW = displayMinutes * CELL_W;
  function toX(sec: number) { return Math.min(sec / 60, displayMinutes) * CELL_W; }
  function toY(pct: number) { return MT + (1 - pct / 100) * PLOT_H; }
  const yTicks = [0, 25, 50, 75, 100];

  function toYW(v: number) { return MT + (1 - Math.min(v, yMaxW) / yMaxW) * PLOT_H; }
  function fmtL(l: number) { return l >= 1000 ? `${Math.round(l / 1000)}k` : `${Math.round(l)}`; }

  // 수량 현황
  const maxBansu     = waterData.reduce((m, d) => Math.max(m, d.bansu), 0);
  const maxBosu      = hydrantSetup.reduce((sum, h) => sum + (hydrantLpm[h.id] ?? HYDRANT_LPM), 0);
  const netDrain     = Math.max(0, maxBansu - maxBosu);
  const maxPool      = waterData.reduce((m, d) => Math.max(m, d.total1seon), 0);
  const depletionSec = netDrain > 0 && maxPool > 0 ? Math.round(maxPool / netDrain * 60) : null;
  const finalReserve = waterData.length > 0 ? waterData[waterData.length - 1].total : 0;

  /*
   * 상단 띠 — 실시간 계산 스위치.
   *
   * `.scen-body` 가 가로 flex 라(왼쪽 320px 고정) 그 안에 넣으면 열이 하나 더
   * 생긴다. 바깥을 세로로 한 겹 감싸 폭 전체를 쓰는 줄을 만든다.
   * 체크박스를 고른 것은 설정모드가 이미 그 형태를 쓰기 때문이다
   * (건물·소방시설의 「연결송수구」·「옥내소화전」).
   */
  const realtimeBar = (
    <div className="scen-realtime">
      <label className="scen-realtime__toggle">
        <input
          type="checkbox"
          checked={realtimeCalcEnabled}
          onChange={e => setRealtimeCalcEnabled(e.target.checked)}
        />
        <span className="scen-realtime__text">실시간 반영</span>
        <span className="scen-realtime__note">화재진화율 · 수량 변경</span>
      </label>
      <span className="scen-realtime__desc">
        {realtimeCalcEnabled
          ? '훈련 「시작」 후 매 초 화재 단계와 물탱크 잔량이 계산됩니다.'
          : '자동 계산이 멈춥니다 — 화재 단계는 체크리스트로, 수량은 만수위로 고정됩니다.'}
      </span>
    </div>
  );

  const body = (
    <div className={standalone ? 'scen-page scen-page--standalone' : 'scen-page'}>
    {realtimeBar}
    <div className={standalone ? 'scen-body scen-body--standalone' : 'scen-body'}>

      {/* ── 왼쪽 패널 ── */}
      <div className="scen-left">

        {/* 소화 설정 */}
        <div className="scen-section">
          <div className="scen-section__title">소화 설정</div>

          <div className="scen-cfg-row">
            <span className="scen-cfg-label">소화포인트/초</span>
            <div className="scen-cfg-stepper">
              <button className="scen-cfg-stepper__btn"
                onClick={() => updateFireSuppressionConfig({ ptsPerSec: Math.max(1, fireSuppressionConfig.ptsPerSec - 1) })}>◄</button>
              <span className="scen-cfg-stepper__val">{fireSuppressionConfig.ptsPerSec}</span>
              <button className="scen-cfg-stepper__btn"
                onClick={() => updateFireSuppressionConfig({ ptsPerSec: fireSuppressionConfig.ptsPerSec + 1 })}>►</button>
            </div>
          </div>

          <div className="scen-cfg-subtitle">단계 임계치 (pt)</div>
          <div className="scen-cfg-grid">
            {(['extension-peak', 'peak', 'seventy', 'half'] as const).map((key, i) => (
              <div key={key} className="scen-cfg-label-pair">
                <span>{['연소확대→최', '최성기→큰불', '큰불→50%', '50%→초진'][i]}</span>
                <div className="scen-cfg-stepper">
                  <button className="scen-cfg-stepper__btn"
                    onClick={() => updateFireSuppressionConfig({ thresholds: { ...fireSuppressionConfig.thresholds, [key]: Math.max(10, fireSuppressionConfig.thresholds[key] - 10) } })}>◄</button>
                  <span className="scen-cfg-stepper__val">{fireSuppressionConfig.thresholds[key]}</span>
                  <button className="scen-cfg-stepper__btn"
                    onClick={() => updateFireSuppressionConfig({ thresholds: { ...fireSuppressionConfig.thresholds, [key]: fireSuppressionConfig.thresholds[key] + 10 } })}>►</button>
                </div>
              </div>
            ))}
          </div>

          <div className="scen-cfg-subtitle">고가차/굴절차 배율</div>
          <div className="scen-cfg-grid">
            {(['extension-peak', 'peak', 'seventy', 'half'] as const).map((key, i) => (
              <div key={key} className="scen-cfg-label-pair">
                <span>{['연소확대→최', '최성기→큰불', '큰불→50%', '50%→초진'][i]}</span>
                <div className="scen-cfg-stepper">
                  <button className="scen-cfg-stepper__btn"
                    onClick={() => updateAerialSuppressionConfig({ multipliers: { ...aerialSuppressionConfig.multipliers, [key]: Math.max(0.1, parseFloat((aerialSuppressionConfig.multipliers[key] - 0.1).toFixed(1))) } })}>◄</button>
                  <span className="scen-cfg-stepper__val">{aerialSuppressionConfig.multipliers[key].toFixed(1)}</span>
                  <button className="scen-cfg-stepper__btn"
                    onClick={() => updateAerialSuppressionConfig({ multipliers: { ...aerialSuppressionConfig.multipliers, [key]: parseFloat((aerialSuppressionConfig.multipliers[key] + 0.1).toFixed(1)) } })}>►</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 화점층 설정 */}
        <div className="scen-section">
          <div className="scen-section__title">화점층 설정</div>
          <div className="scen-floor-row">
            <span className="scen-floor-row__label">{floorIdLabel(String(fireFloor))}</span>
            <select
              className="scen-status-select"
              value={mainStatus}
              onChange={e => setMainStatus(e.target.value as SimFireStatus)}
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="scen-floor-count">
              {peakCountPerFloor[String(fireFloor)] ?? 0}대
            </span>
          </div>
          {extras.map((ex, idx) => (
            <div key={idx} className="scen-extra-row">
              <select
                className="scen-floor-select"
                value={ex.floorNum}
                onChange={e => updateExtra(idx, { floorNum: Number(e.target.value) })}
              >
                {availableForExtra(idx).map(f => (
                  <option key={f} value={f}>{floorIdLabel(String(f))}</option>
                ))}
              </select>
              <select
                className="scen-status-select"
                value={ex.status}
                onChange={e => updateExtra(idx, { status: e.target.value as SimFireStatus })}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="scen-extra-row__tail">
                <span className="scen-floor-count">
                  {peakCountPerFloor[String(ex.floorNum)] ?? 0}대
                </span>
                <button className="scen-remove-btn" onClick={() => removeExtra(idx)}>×</button>
              </div>
            </div>
          ))}
          {extras.length < 2 && availableFloors.length > extras.length && (
            <button className="scen-add-btn" onClick={addExtra}>+ 화재층 추가</button>
          )}
          <div className={`scen-assign-hint${totalAssigned > suppRoster.length ? ' scen-assign-hint--over' : ''}`}>
            배정 {totalAssigned} / 전체 {suppRoster.length}대
          </div>
        </div>

        {/* 소화전 */}
        <div className="scen-section">
          <div className="scen-section__title">소화전</div>
          {hydrantSetup.length === 0 ? (
            <div className="scen-hydrant-empty">훈련 설정에 소화전 없음</div>
          ) : (
            hydrantSetup.map(h => (
              <div key={h.id} className="scen-hydrant-row">
                <span className="scen-hydrant-row__name">{h.name}호 소화전</span>
                <select
                  className="scen-hydrant-row__select"
                  value={hydrantLpm[h.id] ?? 1000}
                  onChange={e => setHydrantLpm(prev => ({ ...prev, [h.id]: Number(e.target.value) }))}
                >
                  {[600, 700, 800, 900, 1000].map(v => (
                    <option key={v} value={v}>{v} L/분</option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>

        {/* 초진 예상시간 */}
        <div className="scen-section">
          <div className="scen-section__title">초진 예상시간</div>
          <div className="scen-summary">
            {allFloors.map((fl, fi) => {
              const t = initialTimes[fl.floorId];
              return (
                <div key={fl.floorId} className="scen-summary-row">
                  <span className="scen-summary-row__label">
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: FLOOR_COLORS[fi] ?? '#888', marginRight: 5, verticalAlign: 'middle' }} />
                    {fl.label}
                  </span>
                  <span className={`scen-summary-row__value${t == null ? ' scen-summary-row__value--warn' : ' scen-summary-row__value--highlight'}`}>
                    {t == null ? '초진 불가' : t === 0 ? '즉시 초진' : formatDuration(t)}
                  </span>
                </div>
              );
            })}
            {allFloors.length > 1 && (() => {
              const vals = Object.values(initialTimes);
              const anyNull = vals.some(t => t == null);
              const max = anyNull ? null : Math.max(...vals.map(t => t ?? 0));
              return (
                <div className="scen-summary-row" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 6, marginTop: 2 }}>
                  <span className="scen-summary-row__label">전체 초진</span>
                  <span className={`scen-summary-row__value${anyNull ? ' scen-summary-row__value--warn' : ' scen-summary-row__value--highlight'}`}>
                    {anyNull ? '초진 불가' : max === 0 ? '즉시 초진' : formatDuration(max!)}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* 수량 현황 */}
        <div className="scen-section">
          <div className="scen-section__title">수량 현황</div>
          <div className="scen-water-grid">
            <div className="scen-water-kv">
              <span className="scen-water-kv__key">최대 방수량</span>
              <span className="scen-water-kv__val">{maxBansu} L/분</span>
            </div>
            <div className="scen-water-kv">
              <span className="scen-water-kv__key">최대 보수량</span>
              <span className="scen-water-kv__val">{maxBosu} L/분</span>
            </div>
            <div className="scen-water-kv">
              <span className="scen-water-kv__key">순소모 (최대)</span>
              <span className={`scen-water-kv__val${netDrain > 0 ? ' scen-water-kv__val--deficit' : ' scen-water-kv__val--surplus'}`}>
                {netDrain > 0 ? `${netDrain}` : '부족 없음'} {netDrain > 0 ? 'L/분' : ''}
              </span>
            </div>
            <div className="scen-water-kv">
              <span className="scen-water-kv__key">1선/중요 소진</span>
              <span className={`scen-water-kv__val${depletionSec != null ? ' scen-water-kv__val--deficit' : ' scen-water-kv__val--surplus'}`}>
                {depletionSec != null ? formatDuration(depletionSec) : '소진 없음'}
              </span>
            </div>
            <div className="scen-water-kv">
              <span className="scen-water-kv__key">잔여 ({displayMinutes}분)</span>
              <span className={`scen-water-kv__val${finalReserve < 3000 ? ' scen-water-kv__val--deficit' : ''}`}>
                {Math.round(finalReserve).toLocaleString()} L
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 오른쪽 패널 ── */}
      <div className="scen-right">

        {/* 차트 탭 + 표시 시간 */}
        <div className="scen-chart-tabs">
          <button
            className={`scen-chart-tab${chartTab === 'fire' ? ' scen-chart-tab--active' : ''}`}
            onClick={() => setChartTab('fire')}
          >
            화재진화율 (%)
          </button>
          <button
            className={`scen-chart-tab${chartTab === 'water' ? ' scen-chart-tab--active' : ''}`}
            onClick={() => setChartTab('water')}
          >
            소방용수
          </button>
          <button
            className={`scen-chart-tab${chartTab === 'combined' ? ' scen-chart-tab--active' : ''}`}
            onClick={() => setChartTab('combined')}
          >
            화재/용수
          </button>
          <div className="scen-chart-tabs__spacer" />
          <span className="scen-duration-label">표시 시간</span>
          {([15, 20, 25] as const).map(n => (
            <button
              key={n}
              className={`scen-duration-btn${displayMinutes === n ? ' scen-duration-btn--active' : ''}`}
              onClick={() => setDisplayMinutes(n)}
            >
              {n}분
            </button>
          ))}
        </div>

        {/* 차트 + 그리드: 같은 스크롤 컨테이너 → 분 칸 정렬 */}
        {chartTab === 'fire' && (
        <div className="scen-grid-wrap">

          {/* 화재 진화율 SVG */}
          <div className="scen-chart-row">
            <div className="scen-yaxis" style={{ height: SVG_H }}>
              {yTicks.map(pct => (
                <span key={pct} className="scen-yaxis__label" style={{ top: toY(pct) }}>{pct}</span>
              ))}
            </div>
            <div className="scen-chart-area">
              <svg
                viewBox={`0 0 ${chartW} ${SVG_H}`}
                preserveAspectRatio="none"
                style={{ display: 'block', width: '100%', height: SVG_H }}
              >
                {yTicks.map(pct => (
                  <line key={pct} x1={0} y1={toY(pct)} x2={chartW} y2={toY(pct)} stroke="#2a3a4a" strokeWidth="0.5" />
                ))}
                {Array.from({ length: displayMinutes + 1 }, (_, m) => (
                  <line key={m} x1={m * CELL_W} y1={MT} x2={m * CELL_W} y2={SVG_H - MB}
                    stroke="#2a3a4a" strokeWidth={m === 0 ? 1 : 0.5} />
                ))}
                <line x1={0} y1={SVG_H - MB} x2={chartW} y2={SVG_H - MB} stroke="#2a3a4a" strokeWidth="1" />
                {allFloors.map((fl, fi) => {
                  const pts = (floorPct[fl.floorId] ?? []).slice(0, displayMinutes * 60 + 1);
                  if (pts.length === 0) return null;
                  const step = Math.max(1, Math.floor(pts.length / 600));
                  const indices: number[] = [];
                  for (let i = 0; i < pts.length; i += step) indices.push(i);
                  if (indices[indices.length - 1] !== pts.length - 1) indices.push(pts.length - 1);
                  const d = indices.map((i, si) =>
                    `${si === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(pts[i]).toFixed(1)}`
                  ).join(' ');
                  return (
                    <path key={fl.floorId} d={d} fill="none"
                      stroke={FLOOR_COLORS[fi] ?? '#888'} strokeWidth="1.5" strokeLinejoin="round" />
                  );
                })}
              </svg>
            </div>
          </div>

          {/* 범례 */}
          <div className="scen-graph-legend">
            {allFloors.map((fl, fi) => (
              <div key={fl.floorId} className="scen-legend-item">
                <span className="scen-legend-dot" style={{ background: FLOOR_COLORS[fi] ?? '#888' }} />
                {fl.label}
              </div>
            ))}
          </div>

          {/* 진압대 배치 그리드 */}
          {suppRoster.length === 0 ? (
            <div className="scen-empty" style={{ padding: '10px 0', flex: 'none' }}>진압대 없음</div>
          ) : (
            <div className="scen-grid-table-wrap">
              <table className="scen-grid" style={{ width: '100%' }}>
                <colgroup>
                  <col style={{ width: '72px' }} />
                  {Array.from({ length: displayMinutes }, (_, i) => (
                    <col key={i} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="scen-grid__unit-hdr">진압대</th>
                    {Array.from({ length: displayMinutes }, (_, i) => (
                      <th key={i + 1} className="scen-grid__min-hdr">{i + 1}분</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppRoster.map(r => (
                    <tr key={r.id}>
                      <td className="scen-grid__unit-cell">{computeRosterDisplayName(r)}</td>
                      {Array.from({ length: displayMinutes }, (_, i) => {
                        const min      = i + 1;
                        const val      = unitMinuteAssign[r.id]?.[min] ?? null;
                        const floorIdx = val ? allFloors.findIndex(f => f.floorId === val) : -1;
                        const color    = floorIdx >= 0 ? FLOOR_COLORS[floorIdx] : null;
                        const options  = [null, ...allFloors.map(f => f.floorId)];
                        return (
                          <td
                            key={min}
                            className="scen-grid__cell scen-grid__cell--click"
                            style={color ? { background: color + '28', color } : undefined}
                            onClick={() => {
                              const cur  = options.indexOf(val);
                              const next = options[(cur + 1) % options.length];
                              setUnitMinute(r.id, min, next);
                            }}
                          >
                            {val ?? ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
        )}{/* /.scen-grid-wrap (화재 진화율) */}

        {/* ── 소방용수 차트 + 그리드 ─────────────────────── */}
        {chartTab === 'water' && (
        <div className="scen-grid-wrap">

          {/* 소방용수 SVG */}
          <div className="scen-chart-row">
            <div className="scen-yaxis" style={{ height: SVG_H }}>
              <span className="scen-yaxis__title">보유수량(L)</span>
              {waterYTicks.filter(t => t.label).map(({ v }) => (
                <span key={v} className="scen-yaxis__label" style={{ top: toYW(v) }}>{fmtL(v)}</span>
              ))}
            </div>
            <div className="scen-chart-area">
              <svg
                viewBox={`0 0 ${chartW} ${SVG_H}`}
                preserveAspectRatio="none"
                style={{ display: 'block', width: '100%', height: SVG_H }}
              >
                {waterYTicks.map(({ v, label }) => (
                  <line key={v} x1={0} y1={toYW(v)} x2={chartW} y2={toYW(v)}
                    stroke="#2a3a4a" strokeWidth={label ? 0.8 : 0.3} />
                ))}
                {Array.from({ length: displayMinutes + 1 }, (_, m) => (
                  <line key={m} x1={m * CELL_W} y1={MT} x2={m * CELL_W} y2={SVG_H - MB}
                    stroke="#2a3a4a" strokeWidth={m === 0 ? 1 : 0.5} />
                ))}
                <line x1={0} y1={SVG_H - MB} x2={chartW} y2={SVG_H - MB} stroke="#2a3a4a" strokeWidth="1" />
                <path
                  d={buildStepArea(
                    waterData.map(d => d.total1seon),
                    waterData.map(() => 0),
                    toYW,
                  )}
                  fill="#1a82d9" opacity="0.65"
                />
                <path
                  d={buildStepLine(waterData.map(d => d.bansu), toYW)}
                  fill="none" stroke="#f97316" strokeWidth="1.5"
                />
              </svg>
            </div>
          </div>

          {/* 범례 */}
          <div className="scen-graph-legend">
            <div className="scen-legend-item">
              <span className="scen-legend-dot" style={{ background: '#1a82d9', height: 8, width: 10 }} />보유수량 (1선/중요)
            </div>
            <div className="scen-legend-item">
              <span className="scen-legend-dot" style={{ background: '#f97316' }} />방수량
            </div>
          </div>

          {/* 소방용수 그리드 */}
          <div className="scen-grid-table-wrap">
            <table className="scen-grid" style={{ width: '100%' }}>
              <colgroup>
                <col style={{ width: '72px' }} />
                {Array.from({ length: displayMinutes }, (_, i) => (
                  <col key={i} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="scen-grid__unit-hdr">차량</th>
                  {Array.from({ length: displayMinutes }, (_, i) => (
                    <th key={i + 1} className="scen-grid__min-hdr">{i + 1}분</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicleRoster.map(v => (
                  <tr key={v.id}>
                    <td className={`scen-grid__unit-cell scen-grid__unit-cell--${v.unitType}`}>{computeRosterDisplayName(v)}</td>
                    {Array.from({ length: displayMinutes }, (_, i) => {
                      const min    = i + 1;
                      const status = vehicleMinuteAssign[v.id]?.[min] ?? '사용안함';
                      return (
                        <td
                          key={min}
                          className={`scen-grid__cell scen-grid__cell--click${status === '사용' ? ' scen-ws--1seon' : ''}`}
                          onClick={() => setVehicleMinute(v.id, min, status === '사용안함' ? '사용' : '사용안함')}
                        >
                          {status === '사용' ? 'O' : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {hydrantSetup.map(h => (
                  <tr key={h.id}>
                    <td className="scen-grid__unit-cell scen-grid__unit-cell--hydrant">소화전 {h.name}</td>
                    {Array.from({ length: displayMinutes }, (_, i) => {
                      const min    = i + 1;
                      const status = hydrantMinuteStatus[h.id]?.[min] ?? '-';
                      return (
                        <td
                          key={min}
                          className={`scen-grid__cell scen-grid__cell--click${status === '점령' ? ' scen-ws--jeomlyang' : ''}`}
                          onClick={() => setHydrantMinute(h.id, min, status === '-' ? '점령' : '-')}
                        >
                          {status === '점령' ? 'O' : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
        )}{/* /.scen-grid-wrap (소방용수) */}

        {/* ── 화재/용수 복합 차트 ─────────────────────── */}
        {chartTab === 'combined' && (
        <div className="scen-grid-wrap">
          <div className="scen-chart-row">

            {/* 왼쪽 Y축: 보유수량(L) */}
            <div className="scen-yaxis" style={{ height: SVG_H }}>
              <span className="scen-yaxis__title">수량(L)</span>
              {waterYTicks.filter(t => t.label).map(({ v }) => (
                <span key={v} className="scen-yaxis__label" style={{ top: toYW(v) }}>{fmtL(v)}</span>
              ))}
            </div>

            {/* 차트 SVG */}
            <div className="scen-chart-area">
              <svg
                viewBox={`0 0 ${chartW} ${SVG_H}`}
                preserveAspectRatio="none"
                style={{ display: 'block', width: '100%', height: SVG_H }}
              >
                {/* 수량 Y축 그리드 */}
                {waterYTicks.map(({ v, label }) => (
                  <line key={v} x1={0} y1={toYW(v)} x2={chartW} y2={toYW(v)}
                    stroke="#2a3a4a" strokeWidth={label ? 0.8 : 0.3} />
                ))}
                {/* 수직 그리드 */}
                {Array.from({ length: displayMinutes + 1 }, (_, m) => (
                  <line key={m} x1={m * CELL_W} y1={MT} x2={m * CELL_W} y2={SVG_H - MB}
                    stroke="#2a3a4a" strokeWidth={m === 0 ? 1 : 0.5} />
                ))}
                <line x1={0} y1={SVG_H - MB} x2={chartW} y2={SVG_H - MB} stroke="#2a3a4a" strokeWidth="1" />
                {/* 보유수량 면적 */}
                <path
                  d={buildStepArea(waterData.map(d => d.total1seon), waterData.map(() => 0), toYW)}
                  fill="#1a82d9" opacity="0.45"
                />
                {/* 방수량 라인 */}
                <path
                  d={buildStepLine(waterData.map(d => d.bansu), toYW)}
                  fill="none" stroke="#f97316" strokeWidth="1.5"
                />
                {/* 화재진화율 라인 */}
                {allFloors.map((fl, fi) => {
                  const pts = (floorPct[fl.floorId] ?? []).slice(0, displayMinutes * 60 + 1);
                  if (pts.length === 0) return null;
                  const step = Math.max(1, Math.floor(pts.length / 600));
                  const indices: number[] = [];
                  for (let i = 0; i < pts.length; i += step) indices.push(i);
                  if (indices[indices.length - 1] !== pts.length - 1) indices.push(pts.length - 1);
                  const d = indices.map((i, si) =>
                    `${si === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(pts[i]).toFixed(1)}`
                  ).join(' ');
                  return (
                    <path key={fl.floorId} d={d} fill="none"
                      stroke={FLOOR_COLORS[fi] ?? '#888'} strokeWidth="2" strokeLinejoin="round" />
                  );
                })}
              </svg>
            </div>

            {/* 오른쪽 Y축: 화재진화율(%) */}
            <div className="scen-yaxis scen-yaxis--right" style={{ height: SVG_H }}>
              <span className="scen-yaxis__title scen-yaxis__title--right">진화율(%)</span>
              {yTicks.map(pct => (
                <span key={pct} className="scen-yaxis__label scen-yaxis__label--right" style={{ top: toY(pct) }}>
                  {pct}
                </span>
              ))}
            </div>
          </div>

          {/* 범례 */}
          <div className="scen-graph-legend">
            <div className="scen-legend-item">
              <span className="scen-legend-dot" style={{ background: '#1a82d9', height: 8, width: 10 }} />보유수량
            </div>
            <div className="scen-legend-item">
              <span className="scen-legend-dot" style={{ background: '#f97316' }} />방수량
            </div>
            {allFloors.map((fl, fi) => (
              <div key={fl.floorId} className="scen-legend-item">
                <span className="scen-legend-dot" style={{ background: FLOOR_COLORS[fi] ?? '#888' }} />
                {fl.label} 진화율
              </div>
            ))}
          </div>
        </div>
        )}{/* /.scen-grid-wrap (화재/용수) */}

        {/* 타임라인 */}
        {events.length > 0 && (
          <div className="scen-section">
            <div className="scen-section__title">타임라인</div>
            <div className="scen-timeline">
              {events.map((ev, i) => (
                <div key={i} className={`scen-tl-row scen-tl-row--${ev.type}`}>
                  <span className="scen-tl-time">{secsToMmss(ev.sec)}</span>
                  <span>{ev.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );

  if (standalone) return body;

  return (
    <div className="scen-backdrop" onClick={e => { if (e.target === e.currentTarget) closeOverlay(); }}>
      <div className="scen-modal">
        <div className="scen-header">
          <span className="scen-header__title">시나리오 예측</span>
          <button className="scen-header__close" onClick={closeOverlay}>닫기</button>
        </div>
        {body}
      </div>
    </div>
  );
}
