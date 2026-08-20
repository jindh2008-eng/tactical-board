import { useState, useEffect } from 'react';
import { useSettings } from '../../store/settingsStore';
import type { DispatchSetup } from '../../types/settings';
import { secsToMmss, mmssToSecs, computeRosterDisplayName } from '../../utils/dispatchRoster';
import './DispatchSetupPanel.css';

const AGENCY_PRESETS = ['지휘차', '시청', '경찰', '보건소', '군부대', '한전', '가스'];

// ── 활동대 행 정의 ──────────────────────────────
const UNIT_ROWS: { key: keyof DispatchSetup['units']; label: string }[] = [
  { key: 'suppression', label: '진압대' },
  { key: 'rescue',      label: '구조대' },
  { key: 'ems',         label: '구급대' },
];

// ── 별도 입력 차량 ──────────────────────────────
const VEHICLE_ROWS: { key: keyof DispatchSetup['vehicles']; label: string }[] = [
  { key: 'aerial',       label: '고가차' },
  { key: 'ladder',       label: '굴절차' },
  { key: 'smokeExhaust', label: '배연차' },
  { key: 'command',      label: '지휘차' },
  { key: 'waterTank',    label: '물탱크' },
  { key: 'rescueVehicle', label: '구조차' },
];

// 착대 옵션 (1~10)
const ORDER_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

// ── 수량 칩 ─────────────────────────────────────

/**
 * CountChip — 훈련모드 출동대 생성 버튼과 같은 모양의 수량 칩.
 *
 * 설정창은 "지금 만든다"가 아니라 "몇 대인지 정한다"라서 버튼 하나로는 줄일 수 없다.
 * 그래서 생김새(색 박스·버튼 톤·크기)는 훈련모드에 맞추고, 안에 −/수량/+ 를 둔다.
 */
interface CountChipProps {
  label:    string;
  tone:     'activity' | 'vehicle';
  value:    number;
  onChange: (n: number) => void;
  /** 라벨 아래 보조 설명 (예: 자동 연동되는 펌프 수) */
  suffix?:  string;
}

function CountChip({ label, tone, value, onChange, suffix }: CountChipProps) {
  return (
    <div className={`dsp__chip dsp__chip--${tone}${value > 0 ? ' dsp__chip--on' : ''}`}>
      <span className="dsp__chip-label">
        {label}
        {suffix && <span className="dsp__chip-suffix">{suffix}</span>}
      </span>
      <div className="dsp__stepper">
        <button
          className="dsp__step-btn"
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`${label} 줄이기`}
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
          aria-label={`${label} 늘리기`}
        >+</button>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ───────────────────────────────

export function DispatchSetupPanel() {
  const {
    arrivalMode, updateArrivalMode,
    dispatchSetup, updateDispatchUnits, updateDispatchVehicles,
    addDispatchExtraUnit, removeDispatchExtraUnit,
    dispatchRoster, updateRosterArrival, updateRosterOrder, updateRosterPrefix,
  } = useSettings();
  const { units, vehicles, extraUnits = [] } = dispatchSetup;

  const [customInput, setCustomInput] = useState('');

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

      {/* 활동대 — 훈련모드 출동대 생성 메뉴와 같은 색 박스·버튼 배열 */}
      <div className="dsp__group dsp__group--activity">
        <div className="dsp__group-title dsp__group-title--activity">활동대</div>
        <p className="dsp__group-hint">진압대를 넣으면 펌프가 함께 생성됩니다. 구조대·구급대는 차량 연동 없음.</p>
        <div className="dsp__chips">
          {UNIT_ROWS.map(row => (
            <CountChip
              key={row.key}
              label={row.label}
              tone="activity"
              value={units[row.key]}
              onChange={n => updateDispatchUnits({ [row.key]: n })}
              suffix={row.key === 'suppression' && units.suppression > 0
                ? `+ 펌프 ${units.suppression}`
                : undefined}
            />
          ))}
        </div>
      </div>

      {/* 차량 */}
      <div className="dsp__group dsp__group--vehicle">
        <div className="dsp__group-title dsp__group-title--vehicle">차량</div>
        <div className="dsp__chips">
          {VEHICLE_ROWS.map(row => (
            <CountChip
              key={row.key}
              label={row.label}
              tone="vehicle"
              value={vehicles[row.key]}
              onChange={n => updateDispatchVehicles({ [row.key]: n })}
            />
          ))}
        </div>
      </div>

      {/* 유관기관 및 직접입력 */}
      <div className="dsp__group dsp__group--agency">
        <div className="dsp__group-title dsp__group-title--agency">유관기관 및 직접입력</div>

        {/* 유관기관 프리셋 버튼 */}
        <div className="dsp__extra-presets">
          {AGENCY_PRESETS.map(name => (
            <button
              key={name}
              className="dsp__extra-btn"
              type="button"
              onClick={() => addDispatchExtraUnit(name, 'agency')}
            >
              {name}
            </button>
          ))}
        </div>

        {/* 직접입력 */}
        <div className="dsp__extra-input-row">
          <input
            className="dsp__extra-input"
            type="text"
            placeholder="직접입력..."
            maxLength={16}
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const t = customInput.trim();
                if (t) { addDispatchExtraUnit(t, 'general'); setCustomInput(''); }
              }
            }}
          />
          <button
            className="dsp__extra-btn"
            type="button"
            onClick={() => {
              const t = customInput.trim();
              if (t) { addDispatchExtraUnit(t, 'general'); setCustomInput(''); }
            }}
          >
            추가
          </button>
        </div>

        {/* 추가된 항목 목록 */}
        {extraUnits.length > 0 && (
          <div className="dsp__extra-list">
            {extraUnits.map(u => (
              <div key={u.id} className="dsp__extra-item">
                <span className="dsp__extra-name">{u.name}</span>
                <button
                  className="dsp__extra-remove"
                  type="button"
                  onClick={() => removeDispatchExtraUnit(u.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
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
              <span className="dsp__rh dsp__rh--prefix">부대명</span>
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
                <span className="dsp__rc dsp__rc--name">
                  {computeRosterDisplayName(item)}
                </span>

                {/* 부대명 입력 (비연동 행만) */}
                {item.linkedTo ? (
                  <span className="dsp__rc dsp__rc--prefix-empty" />
                ) : (
                  <span className="dsp__rc dsp__rc--prefix">
                    <input
                      className="dsp__prefix-input"
                      type="text"
                      placeholder="부대명"
                      value={item.unitPrefix ?? ''}
                      onChange={e => updateRosterPrefix(item.id, e.target.value)}
                    />
                  </span>
                )}

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
