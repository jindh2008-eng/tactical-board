import { useState } from 'react';
import type { BuildingConfig, FireStatus } from '../../types';
import { floorLabel, buildFloorList } from '../../utils/floorOptions';
import './BuildingConfigPanel.css';

const FIRE_STATUS_OPTIONS: { value: FireStatus; label: string }[] = [
  { value: 'extension-peak', label: '연소확대' },
  { value: 'peak',           label: '최성기'   },
  { value: 'seventy',        label: '70%'      },
  { value: 'half',           label: '50%'      },
  { value: 'initial',        label: '초진'     },
  { value: 'complete',       label: '완진'     },
];

interface Props {
  config:              BuildingConfig;
  onChange:            (next: BuildingConfig) => void;
  fireFloor:           number;
  onFireFloorChange:   (n: number) => void;
  fireStatus:          FireStatus | null;
  onFireStatusChange:  (s: FireStatus | null) => void;
  targetName:          string;
  onTargetNameChange:  (name: string) => void;
}

export function BuildingConfigPanel({
  config, onChange, fireFloor, onFireFloorChange,
  fireStatus, onFireStatusChange,
  targetName, onTargetNameChange,
}: Props) {
  const [above,    setAbove]    = useState(String(config.aboveGroundFloors));
  const [basement, setBasement] = useState(String(config.basementFloors));

  const localAbove    = Math.max(1,  Math.min(50, parseInt(above,    10) || 1));
  const localBasement = Math.max(0,  Math.min(10, parseInt(basement, 10) || 0));
  const floorList     = buildFloorList(localAbove, localBasement);
  const safeFireFloor = floorList.includes(fireFloor) ? fireFloor : (floorList[0] ?? 1);

  function applyFloors() {
    const list = buildFloorList(localAbove, localBasement);
    const f = list.includes(fireFloor) ? fireFloor : (list[0] ?? 1);
    onChange({ aboveGroundFloors: localAbove, basementFloors: localBasement });
    onFireFloorChange(f);
    setAbove(String(localAbove));
    setBasement(String(localBasement));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') applyFloors();
  }

  return (
    <div className="config-bar">
      <span className="config-bar__title">건물 정보</span>

      {/* 대상명 */}
      <label className="config-bar__field">
        <span className="config-bar__label">대상명</span>
        <input
          className="config-bar__input config-bar__input--name"
          type="text"
          placeholder="건물명 입력"
          value={targetName}
          onChange={e => onTargetNameChange(e.target.value)}
        />
      </label>

      <div className="config-bar__divider" />

      <label className="config-bar__field">
        <span className="config-bar__label">지상층수</span>
        <input
          className="config-bar__input"
          type="number"
          min={1}
          max={50}
          value={above}
          onChange={e => setAbove(e.target.value)}
          onBlur={applyFloors}
          onKeyDown={handleKeyDown}
        />
        <span className="config-bar__unit">층</span>
      </label>

      <label className="config-bar__field">
        <span className="config-bar__label">지하층수</span>
        <input
          className="config-bar__input"
          type="number"
          min={0}
          max={10}
          value={basement}
          onChange={e => setBasement(e.target.value)}
          onBlur={applyFloors}
          onKeyDown={handleKeyDown}
        />
        <span className="config-bar__unit">층</span>
      </label>

      <div className="config-bar__divider" />

      {/* 화점층 */}
      <label className="config-bar__field">
        <span className="config-bar__label config-bar__label--fire">화점층</span>
        <select
          className="config-bar__select config-bar__select--fire"
          value={safeFireFloor}
          onChange={e => onFireFloorChange(Number(e.target.value))}
        >
          {floorList.map(f => (
            <option key={f} value={f}>{floorLabel(f)}</option>
          ))}
        </select>
      </label>

      <div className="config-bar__divider" />

      {/* 초기 화재상태 */}
      <label className="config-bar__field">
        <span className="config-bar__label config-bar__label--fire">화재상태</span>
        <select
          className="config-bar__select config-bar__select--fire"
          value={fireStatus ?? ''}
          onChange={e => {
            const v = e.target.value;
            onFireStatusChange(v === '' ? null : v as FireStatus);
          }}
        >
          <option value="">없음</option>
          {FIRE_STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
