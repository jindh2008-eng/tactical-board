import { useState, useEffect } from 'react';
import { useSettings } from '../../store/settingsStore';
import type { DispatchSetup } from '../../types/settings';
import { secsToMmss, mmssToSecs } from '../../utils/dispatchRoster';
import './DispatchSetupPanel.css';

// ── 활동대 행 정의 ──────────────────────────────
const UNIT_ROWS: { key: keyof DispatchSetup['units']; label: string }[] = [
  { key: 'suppression', label: '진압대' },
  { key: 'rescue',      label: '구조대' },
  { key: 'ems',         label: '구급대' },
];

// ── 자동 연동 차량 안내 ──────────────────────────
const AUTO_VEHICLES = [
  { label: '펌프',   unitKey: 'suppression' as const, hint: '진압대 연동' },
  { label: '구조차', unitKey: 'rescue'      as const, hint: '구조대 연동' },
  { label: '구급차', unitKey: 'ems'         as const, hint: '구급대 연동' },
];

// ── 별도 입력 차량 ──────────────────────────────
const VEHICLE_ROWS: { key: keyof DispatchSetup['vehicles']; label: string }[] = [
  { key: 'aerial',       label: '고가차' },
  { key: 'ladder',       label: '굴절차' },
  { key: 'smokeExhaust', label: '배연차' },
  { key: 'command',      label: '지휘차' },
];

// ── 스테퍼 컴포넌트 ─────────────────────────────

interface StepperProps {
  value:    number;
  onChange: (n: number) => void;
}

function Stepper({ value, onChange }: StepperProps) {
  return (
    <div className="dsp__stepper">
      <button
        className="dsp__step-btn"
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
      >−</button>
      <input
        className="dsp__num-input"
        type="number"
        min={0}
        value={value}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
      />
      <button
        className="dsp__step-btn"
        type="button"
        onClick={() => onChange(value + 1)}
      >+</button>
    </div>
  );
}

// ── 메인 컴포넌트 ───────────────────────────────

export function DispatchSetupPanel() {
  const { dispatchSetup, updateDispatchUnits, updateDispatchVehicles, dispatchRoster, updateRosterArrival } = useSettings();
  const { units, vehicles } = dispatchSetup;

  // 로스터 도착시간 로컬 입력 상태 (MM:SS 문자열)
  const [arrivalInputs, setArrivalInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(dispatchRoster.map(r => [r.id, secsToMmss(r.arrivalSec)]))
  );

  // 로스터가 재생성되면 로컬 입력값 동기화 (새 항목 추가 / 삭제)
  useEffect(() => {
    setArrivalInputs(prev => {
      const next: Record<string, string> = {};
      for (const r of dispatchRoster) {
        // 기존 입력값 유지, 새 항목은 store 값으로 초기화
        next[r.id] = prev[r.id] ?? secsToMmss(r.arrivalSec);
      }
      return next;
    });
  }, [dispatchRoster]);

  function handleArrivalChange(id: string, raw: string) {
    setArrivalInputs(prev => ({ ...prev, [id]: raw }));
  }

  function handleArrivalCommit(id: string, linkedTo: string | null) {
    const raw = arrivalInputs[id] ?? '';
    const prev = dispatchRoster.find(r => r.id === id)?.arrivalSec ?? 0;
    const secs = mmssToSecs(raw, prev);
    const formatted = secsToMmss(secs);
    setArrivalInputs(p => ({ ...p, [id]: formatted }));
    // 활동대인 경우(linkedTo === null) 연동 차량도 함께 업데이트
    updateRosterArrival(id, secs, linkedTo === null);
  }

  const hasRoster = dispatchRoster.length > 0;

  return (
    <div className="dsp">

      {/* 활동대 */}
      <div className="dsp__group">
        <div className="dsp__group-title">활동대</div>
        {UNIT_ROWS.map(row => (
          <div key={row.key} className="dsp__row">
            <span className="dsp__label">{row.label}</span>
            <Stepper
              value={units[row.key]}
              onChange={n => updateDispatchUnits({ [row.key]: n })}
            />
          </div>
        ))}
      </div>

      {/* 차량 — 자동 연동 */}
      <div className="dsp__group">
        <div className="dsp__group-title">차량 — 자동 연동</div>
        <p className="dsp__group-hint">활동대 수량에 맞춰 자동으로 생성됩니다.</p>
        {AUTO_VEHICLES.map(v => (
          <div key={v.label} className="dsp__auto-row">
            <span className="dsp__label">{v.label}</span>
            <span className="dsp__auto-info">
              {units[v.unitKey]}대 ({v.hint})
            </span>
          </div>
        ))}
      </div>

      {/* 차량 — 별도 입력 */}
      <div className="dsp__group">
        <div className="dsp__group-title">차량 — 별도 입력</div>
        {VEHICLE_ROWS.map(row => (
          <div key={row.key} className="dsp__row">
            <span className="dsp__label">{row.label}</span>
            <Stepper
              value={vehicles[row.key]}
              onChange={n => updateDispatchVehicles({ [row.key]: n })}
            />
          </div>
        ))}
      </div>

      {/* 출동 목록 및 도착시간 */}
      <div className="dsp__group">
        <div className="dsp__group-title">출동 목록 &amp; 도착시간</div>
        <p className="dsp__group-hint">
          각 출동대·차량의 현장 도착 예정 시간을 MM:SS 형식으로 입력합니다.
          활동대 시간 변경 시 연동 차량도 함께 업데이트됩니다.
        </p>

        {!hasRoster ? (
          <div className="dsp__roster-empty">위에서 출동대를 추가하면 목록이 표시됩니다.</div>
        ) : (
          <div className="dsp__roster">
            <div className="dsp__roster-head">
              <span className="dsp__rh dsp__rh--name">명칭</span>
              <span className="dsp__rh dsp__rh--time">도착시간</span>
            </div>
            {dispatchRoster.map(item => (
              <div
                key={item.id}
                className={`dsp__roster-row${item.linkedTo ? ' dsp__roster-row--linked' : ''}`}
              >
                <span className="dsp__rc dsp__rc--name">{item.name}</span>
                <span className="dsp__rc dsp__rc--time">
                  <input
                    className="dsp__time-input"
                    type="text"
                    placeholder="00:00"
                    value={arrivalInputs[item.id] ?? ''}
                    onChange={e => handleArrivalChange(item.id, e.target.value)}
                    onBlur={() => handleArrivalCommit(item.id, item.linkedTo)}
                    onKeyDown={e => { if (e.key === 'Enter') handleArrivalCommit(item.id, item.linkedTo); }}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
