import { useState } from 'react';
import type { BuildingConfig } from '../../types';
import './BuildingConfigPanel.css';

interface Props {
  config:                BuildingConfig;
  onChange:              (next: BuildingConfig) => void;
  fireFloor:             number;
  onFireFloorChange:     (n: number) => void;
  stairSmokeStartFloor:  number | null;
  onStairSmokeChange:    (floor: number | null) => void;
}

/**
 * BuildingConfigPanel — 건물 정보 입력 바
 *
 * 지상층수 / 지하층수 / 화점층 / 계단실 위치 입력 후 [적용].
 * 입력값은 로컬 state로 관리하고, 적용 시점에만 상위로 전달한다.
 *
 * 화점층 유효 범위: -지하층수 ~ 지상층수
 *   - 양수: 지상층 (1, 2, 3 ...)
 *   - 음수: 지하층 (-1 = B1, -2 = B2 ...)
 */
export function BuildingConfigPanel({
  config, onChange, fireFloor, onFireFloorChange,
  stairSmokeStartFloor, onStairSmokeChange,
}: Props) {
  const [above,    setAbove]    = useState(String(config.aboveGroundFloors));
  const [basement, setBasement] = useState(String(config.basementFloors));
  const [fire,     setFire]     = useState(String(fireFloor));

  function handleApply() {
    const a = Math.max(1,  Math.min(50, parseInt(above,    10) || 1));
    const b = Math.max(0,  Math.min(10, parseInt(basement, 10) || 0));

    // 화점층: 지하층은 음수(-b ~ -1), 지상층은 1 ~ a
    const parsed = parseInt(fire, 10);
    const f = Number.isNaN(parsed)
      ? 1
      : Math.max(-b, Math.min(a, parsed));

    onChange({ aboveGroundFloors: a, basementFloors: b });
    onFireFloorChange(f);

    setAbove(String(a));
    setBasement(String(b));
    setFire(String(f));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleApply();
  }

  return (
    <div className="config-bar">
      <span className="config-bar__title">건물 정보</span>

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

      <label className="config-bar__field">
        <span className="config-bar__label config-bar__label--fire">화점층</span>
        <input
          className="config-bar__input config-bar__input--fire"
          type="number"
          min={-(parseInt(basement, 10) || 0)}
          max={parseInt(above, 10) || 50}
          value={fire}
          onChange={e => setFire(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <span className="config-bar__unit">층</span>
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
          {/* 지상층: 높은 층부터 (내림차순)
              Array.from의 mapFn은 (el, idx) 두 인자만 받으므로
              세 번째 arr 인자 접근 불가 → Array.prototype.map으로 분리 */}
          {Array.from(
            { length: parseInt(above, 10) || config.aboveGroundFloors },
          ).map((_, i, arr) => (
            <option key={arr.length - i} value={arr.length - i}>
              {arr.length - i}층부터
            </option>
          ))}
          {/* 지하층: B1부터 깊이 순 */}
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
