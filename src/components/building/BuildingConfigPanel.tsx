import { useState } from 'react';
import type { BuildingConfig, FireStatus } from '../../types';
import type { ExtraFireFloor } from '../../types/settings';
import { floorLabel, buildFloorList } from '../../utils/floorOptions';
import './BuildingConfigPanel.css';
import { BOARD_COL_RATIO_MIN, BOARD_COL_RATIO_MAX, BOARD_COL_RATIO_DEFAULT } from '../../types/settings';

const FIRE_STATUS_OPTIONS: { value: FireStatus; label: string }[] = [
  { value: 'extension-peak', label: '연소확대' },
  { value: 'peak',           label: '최성기'   },
  { value: 'seventy',        label: '큰불잡음'   },
  { value: 'half',           label: '50%'      },
  { value: 'initial',        label: '초진'     },
  { value: 'complete',       label: '완진'     },
];

/**
 * 표시할 블록 — 설정창에서 "건물 · 소방시설" 화면을 탭으로 나눌 때 쓴다.
 *   structure : 대상명·층수
 *   fire      : 화점층·확대층
 *   facility  : 연결송수구·옥내소화전
 * 값이 없으면 예전처럼 전부 렌더한다.
 */
export type BuildingConfigTab = 'structure' | 'fire' | 'facility';

interface Props {
  tab?:                      BuildingConfigTab;
  config:                    BuildingConfig;
  onChange:                  (next: BuildingConfig) => void;
  fireFloor:                 number;
  onFireFloorChange:         (n: number) => void;
  fireStatus:                FireStatus | null;
  onFireStatusChange:        (s: FireStatus | null) => void;
  targetName:                string;
  onTargetNameChange:        (name: string) => void;
  extraFireFloors:           ExtraFireFloor[];
  onExtraFireFloorsChange:   (floors: ExtraFireFloor[]) => void;
  hasSiamesePipe:            boolean;
  onSiamesePipeChange:       (v: boolean) => void;
  hasIndoorHydrant:          boolean;
  onIndoorHydrantChange:     (v: boolean) => void;
  boardColumnRatio:          number;
  onBoardColumnRatioChange:  (ratio: number) => void;
}

export function BuildingConfigPanel({
  tab,
  config, onChange,
  fireFloor, onFireFloorChange,
  fireStatus, onFireStatusChange,
  targetName, onTargetNameChange,
  extraFireFloors, onExtraFireFloorsChange,
  hasSiamesePipe, onSiamesePipeChange,
  hasIndoorHydrant, onIndoorHydrantChange,
  boardColumnRatio, onBoardColumnRatioChange,
}: Props) {
  const [above,    setAbove]    = useState(String(config.aboveGroundFloors));
  const [basement, setBasement] = useState(String(config.basementFloors));

  const localAbove    = Math.max(1,  Math.min(50, parseInt(above,    10) || 1));
  const localBasement = Math.max(0,  Math.min(10, parseInt(basement, 10) || 0));
  const floorList     = buildFloorList(localAbove, localBasement);
  const safeFireFloor = floorList.includes(fireFloor) ? fireFloor : (floorList[0] ?? 1);

  // 이미 사용 중인 층 (화점층 + 추가 층)
  const usedFloors = new Set([safeFireFloor, ...extraFireFloors.map(e => e.floor)]);
  const availableForExtra = floorList.filter(f => !usedFloors.has(f));

  function applyFloors() {
    const list = buildFloorList(localAbove, localBasement);
    const f = list.includes(fireFloor) ? fireFloor : (list[0] ?? 1);
    onChange({ aboveGroundFloors: localAbove, basementFloors: localBasement });
    onFireFloorChange(f);
    setAbove(String(localAbove));
    setBasement(String(localBasement));
    // 층 범위 벗어난 추가 층 제거
    onExtraFireFloorsChange(extraFireFloors.filter(e => list.includes(e.floor) && e.floor !== f));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') applyFloors();
  }

  function addExtraFloor() {
    const f = availableForExtra[0];
    if (f == null) return;
    onExtraFireFloorsChange([...extraFireFloors, { floor: f, status: 'extension-peak' }]);
  }

  function updateExtraFloor(idx: number, patch: Partial<ExtraFireFloor>) {
    const next = extraFireFloors.map((e, i) => i === idx ? { ...e, ...patch } : e);
    onExtraFireFloorsChange(next);
  }

  function removeExtraFloor(idx: number) {
    onExtraFireFloorsChange(extraFireFloors.filter((_, i) => i !== idx));
  }

  // tab 이 없으면 전부 렌더 — 예전 동작 유지
  const show = (t: BuildingConfigTab) => tab == null || tab === t;

  return (
    <div className="bcf">
      {/* ── 기본 정보 행 ── */}
      {show('structure') && (
      <div className="bcf__row">
        <label className="bcf__field">
          <span className="bcf__label">대상명</span>
          <input
            className="bcf__input bcf__input--name"
            type="text"
            placeholder="건물명 입력"
            value={targetName}
            onChange={e => onTargetNameChange(e.target.value)}
          />
        </label>

        <div className="bcf__divider" />

        <label className="bcf__field">
          <span className="bcf__label">지상층수</span>
          <input
            className="bcf__input bcf__input--num"
            type="number" min={1} max={50}
            value={above}
            onChange={e => setAbove(e.target.value)}
            onBlur={applyFloors}
            onKeyDown={handleKeyDown}
          />
          <span className="bcf__unit">층</span>
        </label>

        <label className="bcf__field">
          <span className="bcf__label">지하층수</span>
          <input
            className="bcf__input bcf__input--num"
            type="number" min={0} max={10}
            value={basement}
            onChange={e => setBasement(e.target.value)}
            onBlur={applyFloors}
            onKeyDown={handleKeyDown}
          />
          <span className="bcf__unit">층</span>
        </label>

      </div>
      )}

      {/* ── 상황판 구역 비율 ──
          보드가 정사각으로 고정되면서 B:건물:D 비율이 화면 크기와 무관한
          시나리오 변수가 됐다. → docs/SCREEN_STAGE_PLAN.md §3.7 */}
      {show('structure') && (
      <div className="bcf__ratio-section">
        <span className="bcf__fire-label">상황판 구역 비율</span>
        <p className="bcf__ratio-hint">
          전술상황판에서 B면 · 건물 · D면이 차지하는 가로 폭의 비율입니다.
          건물 쪽을 넓히면 층 내부가 자세해지고, 줄이면 B/D면 활동 공간이 넓어집니다.
        </p>

        <div className="bcf__ratio-row">
          <input
            className="bcf__ratio-slider"
            type="range"
            min={BOARD_COL_RATIO_MIN}
            max={BOARD_COL_RATIO_MAX}
            step={0.05}
            value={boardColumnRatio}
            onChange={e => onBoardColumnRatioChange(Number(e.target.value))}
            aria-label="B면 대 건물 대 D면 비율"
          />
          <span className="bcf__ratio-value">
            1 : {boardColumnRatio.toFixed(2)} : 1
          </span>
          <button
            type="button"
            className="bcf__ratio-reset"
            onClick={() => onBoardColumnRatioChange(BOARD_COL_RATIO_DEFAULT)}
            disabled={Math.abs(boardColumnRatio - BOARD_COL_RATIO_DEFAULT) < 0.001}
          >
            기본값
          </button>
        </div>

        {/* 미리보기 — 실제 열 폭과 같은 비율로 그린다 */}
        <div className="bcf__ratio-preview" aria-hidden>
          <div className="bcf__ratio-bar bcf__ratio-bar--side" style={{ flex: 1 }}>B면</div>
          <div className="bcf__ratio-bar bcf__ratio-bar--center" style={{ flex: boardColumnRatio }}>건물</div>
          <div className="bcf__ratio-bar bcf__ratio-bar--side" style={{ flex: 1 }}>D면</div>
        </div>
      </div>
      )}

      {/* ── 화재 설정 ── */}
      {show('fire') && (
      <div className="bcf__fire-section">
        <span className="bcf__fire-label">화재 설정</span>

        {/* 화점층 (첫 번째, 삭제 불가) */}
        <div className="bcf__fire-row">
          <select
            className="bcf__floor-select bcf__floor-select--primary"
            value={safeFireFloor}
            onChange={e => {
              const newFloor = Number(e.target.value);
              // 새 화점층이 기존 추가 층과 겹치면 해당 추가 층 제거
              onExtraFireFloorsChange(extraFireFloors.filter(ef => ef.floor !== newFloor));
              onFireFloorChange(newFloor);
            }}
          >
            {floorList.map(f => (
              <option key={f} value={f}>{floorLabel(f)}</option>
            ))}
          </select>
          <span className="bcf__primary-badge">화점층</span>
          <select
            className="bcf__status-select"
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
        </div>

        {/* 추가 화재 층 */}
        {extraFireFloors.map((ef, idx) => {
          const usedExcludingThis = new Set([safeFireFloor, ...extraFireFloors.filter((_, i) => i !== idx).map(e => e.floor)]);
          const selectableFloors  = floorList.filter(f => !usedExcludingThis.has(f));
          return (
            <div key={idx} className="bcf__fire-row">
              <select
                className="bcf__floor-select"
                value={ef.floor}
                onChange={e => updateExtraFloor(idx, { floor: Number(e.target.value) })}
              >
                {selectableFloors.map(f => (
                  <option key={f} value={f}>{floorLabel(f)}</option>
                ))}
              </select>
              <select
                className="bcf__status-select"
                value={ef.status}
                onChange={e => updateExtraFloor(idx, { status: e.target.value as FireStatus })}
              >
                {FIRE_STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                className="bcf__remove-btn"
                onClick={() => removeExtraFloor(idx)}
                title="삭제"
              >✕</button>
            </div>
          );
        })}

        {/* 추가 버튼 */}
        {availableForExtra.length > 0 && (
          <button className="bcf__add-floor-btn" onClick={addExtraFloor}>
            + 층 추가
          </button>
        )}
      </div>
      )}

      {/* ── 연결송수구 — 위치는 1층 좌측 하단 고정이라 방면을 고르지 않는다 ── */}
      {show('facility') && (
      <div className="bcf__siamese-section">
        <span className="bcf__fire-label">연결송수구</span>
        <div className="bcf__siamese-faces">
          <label className="bcf__siamese-label">
            <input
              type="checkbox"
              checked={hasSiamesePipe}
              onChange={e => onSiamesePipeChange(e.target.checked)}
            />
            표시
          </label>
        </div>
      </div>
      )}

      {/* ── 옥내소화전 ── */}
      {show('facility') && (
      <div className="bcf__siamese-section">
        <span className="bcf__fire-label">옥내소화전</span>
        <div className="bcf__siamese-faces">
          <label className="bcf__siamese-label">
            <input
              type="checkbox"
              checked={hasIndoorHydrant}
              onChange={e => onIndoorHydrantChange(e.target.checked)}
            />
            표시
          </label>
        </div>
      </div>
      )}
    </div>
  );
}
