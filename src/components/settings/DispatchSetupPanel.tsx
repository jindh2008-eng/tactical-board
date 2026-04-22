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

// ── 자동 연동 차량 안내 (구급차 제외) ────────────
const AUTO_VEHICLES = [
  { label: '펌프',   unitKey: 'suppression' as const, hint: '진압대 연동' },
  { label: '구조차', unitKey: 'rescue'      as const, hint: '구조대 연동' },
];

// ── 별도 입력 차량 ──────────────────────────────
const VEHICLE_ROWS: { key: keyof DispatchSetup['vehicles']; label: string }[] = [
  { key: 'aerial',       label: '고가차' },
  { key: 'ladder',       label: '굴절차' },
  { key: 'smokeExhaust', label: '배연차' },
  { key: 'command',      label: '지휘차' },
  { key: 'waterTank',    label: '물탱크' },
];

// 착대 옵션 (1~10)
const ORDER_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

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
  const {
    arrivalMode, updateArrivalMode,
    dispatchSetup, updateDispatchUnits, updateDispatchVehicles,
    dispatchRoster, updateRosterArrival, updateRosterOrder,
  } = useSettings();
  const { units, vehicles } = dispatchSetup;

  // 로스터 도착시간 로컬 입력 상태 (MM:SS 문자열) — 시간모드 전용
  const [arrivalInputs, setArrivalInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(dispatchRoster.map(r => [r.id, secsToMmss(r.arrivalSec)]))
  );

  // 로스터가 재생성되면 로컬 입력값 동기화
  useEffect(() => {
    setArrivalInputs(prev => {
      const next: Record<string, string> = {};
      for (const r of dispatchRoster) {
        next[r.id] = prev[r.id] ?? secsToMmss(r.arrivalSec);
      }
      return next;
    });
  }, [dispatchRoster]);

  function handleArrivalChange(id: string, raw: string) {
    setArrivalInputs(prev => ({ ...prev, [id]: raw }));
  }

  function handleArrivalCommit(id: string, linkedTo: string | null) {
    const raw  = arrivalInputs[id] ?? '';
    const prev = dispatchRoster.find(r => r.id === id)?.arrivalSec ?? 0;
    const secs = mmssToSecs(raw, prev);
    const formatted = secsToMmss(secs);
    setArrivalInputs(p => ({ ...p, [id]: formatted }));
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

      {/* 차량 — 자동 연동 (구급차 제외) */}
      <div className="dsp__group">
        <div className="dsp__group-title">차량 — 자동 연동</div>
        <p className="dsp__group-hint">활동대 수량에 맞춰 자동으로 생성됩니다. 구급대는 차량 연동 없음.</p>
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

      {/* 출동대 목록 및 도착설정 */}
      <div className="dsp__group">
        <div className="dsp__group-title">출동대 목록 및 도착설정</div>

        {/* 도착설정 방식 선택 */}
        <div className="dsp__mode-row">
          <span className="dsp__mode-label">도착설정 방식</span>
          <div className="dsp__mode-radios">
            <label className="dsp__radio-label">
              <input
                type="radio"
                name="arrivalMode"
                value="time"
                checked={arrivalMode === 'time'}
                onChange={() => updateArrivalMode('time')}
              />
              시간설정
            </label>
            <label className="dsp__radio-label">
              <input
                type="radio"
                name="arrivalMode"
                value="order"
                checked={arrivalMode === 'order'}
                onChange={() => updateArrivalMode('order')}
              />
              착대설정
            </label>
          </div>
        </div>

        {!hasRoster ? (
          <div className="dsp__roster-empty">위에서 출동대를 추가하면 목록이 표시됩니다.</div>
        ) : (
          <div className="dsp__roster">

            {/* 헤더 */}
            <div className={`dsp__roster-head dsp__roster-head--${arrivalMode}`}>
              <span className="dsp__rh dsp__rh--name">명칭</span>
              {arrivalMode === 'time'
                ? <span className="dsp__rh dsp__rh--time">도착시간</span>
                : <span className="dsp__rh dsp__rh--order">착대순서</span>
              }
            </div>

            {/* 행 */}
            {dispatchRoster.map(item => (
              <div
                key={item.id}
                className={`dsp__roster-row dsp__roster-row--${arrivalMode}${item.linkedTo ? ' dsp__roster-row--linked' : ''}`}
              >
                <span className="dsp__rc dsp__rc--name">{item.name}</span>

                {/* 연동 차량: 설정 불가 — AUTO 표시만 */}
                {item.linkedTo ? (
                  <span className="dsp__rc dsp__rc--auto">AUTO</span>
                ) : arrivalMode === 'time' ? (
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
                ) : (
                  <span className="dsp__rc dsp__rc--order">
                    <select
                      className="dsp__order-select"
                      value={item.arrivalOrder ?? 1}
                      onChange={e => updateRosterOrder(item.id, parseInt(e.target.value, 10))}
                    >
                      {ORDER_OPTIONS.map(n => (
                        <option key={n} value={n}>{n}착대</option>
                      ))}
                    </select>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
