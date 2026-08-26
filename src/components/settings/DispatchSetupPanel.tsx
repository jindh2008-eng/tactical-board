import { useState } from 'react';
import { useSettings } from '../../store/settingsStore';
import type { DispatchSetup, DispatchRosterItem } from '../../types/settings';
import { computeRosterDisplayName } from '../../utils/dispatchRoster';
import { SetCard, SetIconButton, IconClose } from './ui';
import { unitTone } from './ui/unitTone';
import './DispatchSetupPanel.css';

/*
 * 유관기관 프리셋 — 2열로 **세로 채움**이라 배열 순서가 곧 왼쪽 열 → 오른쪽 열이다.
 * '지휘차' 를 뺐다: 차량 그룹에 이미 지휘차 칸이 있어 같은 것을 두 곳에서
 * 만들 수 있었고, 어느 쪽으로 만들었는지에 따라 토큰 색이 달라졌다
 * (차량이면 vehicle, 유관기관이면 agency).
 */
const AGENCY_PRESETS = ['경찰', '한전', '가스', '시청', '보건소', '군부대'];

/**
 * 생성칸 정의 — 「무엇을 몇 대」를 정하는 칸 하나.
 *
 * `rosterType` 은 그 칸이 만들어 낸 로스터 항목을 되찾는 열쇠다. 칸 아래에
 * 자기가 만든 출동대만 보여야 하는데, 로스터는 한 배열이라 unitType 으로 가른다.
 * buildRoster 의 unitType 과 **반드시 같아야 한다**(utils/dispatchRoster.ts).
 */
interface SlotDef {
  label:      string;
  rosterType: string;
}

const UNIT_SLOTS: (SlotDef & { key: keyof DispatchSetup['units'] })[] = [
  { key: 'suppression', label: '진압대', rosterType: 'suppression' },
  { key: 'rescue',      label: '구조대', rosterType: 'rescue' },
  { key: 'ems',         label: '구급대', rosterType: 'ems' },
];

/*
 * 차량은 **3열 × 2행**이다. 배열 순서가 곧 세로쌍이다 — 격자가 세로로
 * 채워지므로(grid-auto-flow: column) 두 개씩 끊어 읽으면 화면 배치가 보인다.
 *
 *   고가차  지휘차  물탱크
 *   굴절차  배연차  구조차
 *
 * 여섯을 한 줄로 늘어놓던 것을 접었다. 가로로 절반이 되어 남는 폭을 활동대가
 * 가져가고, 세로로는 두 행이 활동대 한 칸과 같은 높이를 나눠 쓴다.
 */
const VEHICLE_SLOTS: (SlotDef & { key: keyof DispatchSetup['vehicles'] })[] = [
  { key: 'aerial',        label: '고가차', rosterType: 'aerial' },
  { key: 'ladder',        label: '굴절차', rosterType: 'ladder' },
  { key: 'command',       label: '지휘차', rosterType: 'command' },
  { key: 'smokeExhaust',  label: '배연차', rosterType: 'smokeExhaust' },
  { key: 'waterTank',     label: '물탱크', rosterType: 'water_tank' },
  { key: 'rescueVehicle', label: '구조차', rosterType: 'rescue_vehicle' },
];

// ── 생성된 출동대 칩 ────────────────────────────

interface UnitChipProps {
  item:     DispatchRosterItem;
  onPrefix: (id: string, prefix: string) => void;
}

/**
 * 생성된 출동대 하나.
 *
 * 이름을 클릭하면 그 자리에서 **부대명 접두사**를 입력한다 — "거진" 을 넣으면
 * "거진진압" 이 된다. 접두사인 이유는 연동 펌프가 같은 이름을 물려받아야 해서다
 * (settingsStore.updateRosterPrefix 가 linkedTo 항목에 자동 전파한다).
 *
 * 색은 훈련모드 토큰과 같은 계열이다. 설정에서 만든 것이 훈련 화면에서 다른
 * 색으로 나오면 같은 대인지 알 수 없다.
 */
function UnitChip({ item, onPrefix }: UnitChipProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const display = computeRosterDisplayName(item);

  function begin() {
    setDraft(item.unitPrefix ?? '');
    setEditing(true);
  }

  function commit() {
    onPrefix(item.id, draft.trim());
    setEditing(false);
  }

  return (
    <div className="dsp__unit">
      {editing ? (
        <input
          className="dsp__unit-input"
          type="text"
          autoFocus
          maxLength={10}
          placeholder="부대명"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <button
          className={`dsp__unit-name dsp__unit-name--${unitTone(item.unitType)}`}
          type="button"
          onClick={begin}
          title="클릭해 부대명 입력 (예: 거진 → 거진진압)"
        >
          {display}
        </button>
      )}

    </div>
  );
}

// ── 생성칸 ──────────────────────────────────────

interface SlotProps {
  label:    string;
  tone:     'activity' | 'vehicle';
  value:    number;
  onChange: (n: number) => void;
  children: React.ReactNode;
}

function Slot({ label, tone, value, onChange, children }: SlotProps) {
  return (
    <div className="dsp__slot">
      <div className={`dsp__slot-head dsp__slot-head--${tone}${value > 0 ? ' dsp__slot-head--on' : ''}`}>
        <span className="dsp__slot-label">{label}</span>
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
            aria-label={`${label} 수량`}
          />
          <button
            className="dsp__step-btn"
            type="button"
            onClick={() => onChange(value + 1)}
            aria-label={`${label} 늘리기`}
          >+</button>
        </div>
      </div>
      <div className="dsp__slot-list">{children}</div>
    </div>
  );
}

// ── 메인 컴포넌트 ───────────────────────────────

/**
 * 출동대 생성 설정.
 *
 * 2026-08-25 재배치 — 「생성칸을 가로로 늘어놓고, 만들어진 대는 그 칸 바로
 * 아래에」 로 바꿨다. 예전에는 위에서 수량을 정하고 아래 표에서 부대명·착대를
 * 따로 잡아, 방금 만든 대가 표 어디로 갔는지 눈으로 따라가야 했다.
 *
 * 연동 펌프는 목록에 그리지 않는다. 진압대 1대에 펌프 1대가 딸려 생성되는데
 * (buildRoster), 칸에는 "진압대 1" 이라고 적혀 있으니 아래에 둘이 보이면
 * 숫자가 어긋난 것처럼 읽힌다. 펌프는 부대명·착대순서가 진압대를 그대로
 * 따라가므로(updateRosterPrefix·moveRosterToOrder 가 linkedTo 에 전파) 숨겨도
 * 정할 것이 남지 않는다. 훈련모드에는 그대로 넘어간다.
 */
export function DispatchSetupPanel() {
  const {
    dispatchSetup, updateDispatchUnits, updateDispatchVehicles,
    addDispatchExtraUnit, removeDispatchExtraUnit,
    dispatchRoster, updateRosterPrefix,
  } = useSettings();
  // extraUnits 는 직접 읽지 않는다 — 로스터가 이미 그것들을 담고 있고,
  // 착대순서는 로스터에만 있어서 로스터 쪽을 봐야 한 곳에서 다 나온다.
  const { units, vehicles } = dispatchSetup;

  const [customInput, setCustomInput] = useState('');

  /** 그 칸이 만든 출동대만 — 연동 차량(펌프)은 뺀다 */
  const unitsOf = (rosterType: string) =>
    dispatchRoster.filter(r => r.linkedTo === null && r.unitType === rosterType);

  const chipProps = { onPrefix: updateRosterPrefix };

  function addCustom() {
    const t = customInput.trim();
    if (!t) return;
    addDispatchExtraUnit(t, 'general');
    setCustomInput('');
  }

  return (
    <div className="dsp">

      <div className="dsp__groups">

        {/* ── 활동대 ── */}
        <SetCard title="활동대" dense className="dsp__group dsp__group--activity">
          <div className="dsp__slots">
            {UNIT_SLOTS.map(s => (
              <Slot
                key={s.key}
                label={s.label}
                tone="activity"
                value={units[s.key]}
                onChange={n => updateDispatchUnits({ [s.key]: n })}
              >
                {unitsOf(s.rosterType).map(item => (
                  <UnitChip key={item.id} item={item} {...chipProps} />
                ))}
              </Slot>
            ))}
          </div>
        </SetCard>

        {/* ── 차량 ── */}
        <SetCard title="차량" dense className="dsp__group dsp__group--vehicle">
          <div className="dsp__slots dsp__slots--grid">
            {VEHICLE_SLOTS.map(s => (
              <Slot
                key={s.key}
                label={s.label}
                tone="vehicle"
                value={vehicles[s.key]}
                onChange={n => updateDispatchVehicles({ [s.key]: n })}
              >
                {unitsOf(s.rosterType).map(item => (
                  <UnitChip key={item.id} item={item} {...chipProps} />
                ))}
              </Slot>
            ))}
          </div>
        </SetCard>

        {/* ── 유관기관 ── */}
        <SetCard title="유관기관" dense className="dsp__group dsp__group--fixed dsp__group--agency">
          {/* 아이콘 자산이 없어 텍스트 칩 2열로 간다 */}
          <div className="dsp__preset-grid">
            {AGENCY_PRESETS.map(name => (
              <button
                key={name}
                className="dsp__preset-btn"
                type="button"
                onClick={() => addDispatchExtraUnit(name, 'agency')}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="dsp__slot-list">
            {unitsOf('agency').map(item => (
              <ExtraChip key={item.id} item={item} onRemove={removeDispatchExtraUnit} {...chipProps} />
            ))}
          </div>
        </SetCard>

        {/* ── 직접입력 ── */}
        <SetCard title="직접입력" dense className="dsp__group dsp__group--fixed dsp__group--custom">
          <div className="dsp__extra-input-row">
            <input
              className="dsp__extra-input"
              type="text"
              placeholder="이름 입력"
              maxLength={16}
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
            />
            <button className="dsp__preset-btn" type="button" onClick={addCustom}>추가</button>
          </div>
          <div className="dsp__slot-list">
            {unitsOf('general').map(item => (
              <ExtraChip key={item.id} item={item} onRemove={removeDispatchExtraUnit} {...chipProps} />
            ))}
          </div>
        </SetCard>
      </div>
    </div>
  );
}

/**
 * 유관기관·직접입력 항목.
 *
 * 활동대·차량과 달리 **수량이 아니라 개별 추가**라 지울 수 있어야 한다.
 * 부대명 접두사는 붙이지 않는다 — "시청" 은 그 자체가 이름이다.
 */
function ExtraChip({
  item, onRemove,
}: {
  item: DispatchRosterItem;
  onPrefix: (id: string, prefix: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="dsp__unit">
      <span className={`dsp__unit-name dsp__unit-name--${unitTone(item.unitType)} dsp__unit-name--static`}>
        {item.name}
      </span>
      <SetIconButton
        size="sm"
        variant="danger"
        label={`${item.name} 제거`}
        icon={<IconClose size={13} />}
        onClick={() => onRemove(item.id)}
      />
    </div>
  );
}
