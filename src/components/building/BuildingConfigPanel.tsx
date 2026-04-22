import { useState } from 'react';
import type { BuildingConfig } from '../../types';
import { floorLabel, buildFloorList } from '../../utils/floorOptions';
import './BuildingConfigPanel.css';

interface Props {
  config:                BuildingConfig;
  onChange:              (next: BuildingConfig) => void;
  fireFloor:             number;
  onFireFloorChange:     (n: number) => void;
  stairSmokeStartFloor:  number | null;
  onStairSmokeChange:    (floor: number | null) => void;
  targetName:            string;
  onTargetNameChange:    (name: string) => void;
}

/**
 * BuildingConfigPanel — 건물 정보 입력 바
 *
 * 대상명 / 지상층수 / 지하층수 / 화점층(셀렉트) / 계단실 연기 입력.
 * 지상층수·지하층수·화점층은 로컬 state로 관리 후 [적용] 시점에 상위로 전달.
 * 대상명·계단실 연기는 변경 즉시 상위로 전달.
 */
export function BuildingConfigPanel({
  config, onChange, fireFloor, onFireFloorChange,
  stairSmokeStartFloor, onStairSmokeChange,
  targetName, onTargetNameChange,
}: Props) {
  const [above,    setAbove]    = useState(String(config.aboveGroundFloors));
  const [basement, setBasement] = useState(String(config.basementFloors));

  const localAbove    = Math.max(1,  Math.min(50, parseInt(above,    10) || 1));
  const localBasement = Math.max(0,  Math.min(10, parseInt(basement, 10) || 0));
  const floorList     = buildFloorList(localAbove, localBasement);

  // 현재 화점층이 로컬 층 목록에 없으면 첫 번째 층으로 fallback
  const safeFireFloor = floorList.includes(fireFloor) ? fireFloor : (floorList[0] ?? 1);

  function handleApply() {
    const a = localAbove;
    const b = localBasement;
    const list = buildFloorList(a, b);
    const f = list.includes(fireFloor) ? fireFloor : (list[0] ?? 1);
    onChange({ aboveGroundFloors: a, basementFloors: b });
    onFireFloorChange(f);
    setAbove(String(a));
    setBasement(String(b));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleApply();
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
          onKeyDown={handleKeyDown}
        />
        <span className="config-bar__unit">층</span>
      </label>

      {/* 구분선 */}
      <div className="config-bar__divider" />

      {/* 화점층 — 셀렉트 */}
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

      <button className="config-bar__apply" onClick={handleApply}>
        적용
      </button>

      {/* 구분선 */}
      <div className="config-bar__divider" />

      {/* 계단실 연기 — 지상층(N→1) + 지하층(B1→BN) */}
      <label className="config-bar__field">
        <span className="config-bar__label config-bar__label--smoke">계단실 연기</span>
        <select
          className="config-bar__select"
          value={stairSmokeStartFloor ?? ''}
          onChange={e => {
            const v = e.target.value;
            onStairSmokeChange(v === '' ? null : Number(v));
          }}
        >
          <option value="">없음</option>
          {Array.from(
            { length: parseInt(above, 10) || config.aboveGroundFloors },
          ).map((_, i, arr) => (
            <option key={arr.length - i} value={arr.length - i}>
              {arr.length - i}층부터
            </option>
          ))}
          {Array.from(
            { length: parseInt(basement, 10) || config.basementFloors },
            (_, i) => i + 1,
          ).map(n => (
            <option key={-n} value={-n}>B{n}층부터</option>
          ))}
        </select>
      </label>
    </div>
  );
}
