import { useSettings } from '../../store/settingsStore';
import type { DispatchSetup } from '../../types/settings';
import './DispatchSetupPanel.css';

const AUTO_VEHICLES: { label: string; unitKey: keyof DispatchSetup['units']; hint: string }[] = [
  { label: '펌프',   unitKey: 'suppression', hint: '진압대 연동' },
  { label: '구조차', unitKey: 'rescue',      hint: '구조대 연동' },
];

const VEHICLE_ROWS: { key: keyof DispatchSetup['vehicles']; label: string }[] = [
  { key: 'aerial',       label: '고가차' },
  { key: 'ladder',       label: '굴절차' },
  { key: 'smokeExhaust', label: '배연차' },
  { key: 'command',      label: '지휘차' },
  { key: 'waterTank',    label: '물탱크' },
];

interface StepperProps { value: number; onChange: (n: number) => void; }
function Stepper({ value, onChange }: StepperProps) {
  return (
    <div className="dsp__stepper">
      <button className="dsp__step-btn" type="button" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <input
        className="dsp__num-input"
        type="number"
        min={0}
        value={value}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
      />
      <button className="dsp__step-btn" type="button" onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

export function VehicleSetupPanel() {
  const { dispatchSetup, updateDispatchVehicles } = useSettings();
  const { units, vehicles } = dispatchSetup;

  return (
    <div className="dsp">
      <div className="dsp__group">
        <div className="dsp__group-title">차량 — 자동 연동</div>
        <p className="dsp__group-hint">활동대 수량에 맞춰 자동으로 생성됩니다. 구급대는 차량 연동 없음.</p>
        {AUTO_VEHICLES.map(v => (
          <div key={v.label} className="dsp__auto-row">
            <span className="dsp__label">{v.label}</span>
            <span className="dsp__auto-info">{units[v.unitKey]}대 ({v.hint})</span>
          </div>
        ))}
      </div>

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
    </div>
  );
}
