import { useState, type ReactNode } from 'react';
import type { BuildingConfig, FireStatus } from '../../types';
import type { ExtraFireFloor } from '../../types/settings';
import { floorLabel, buildFloorList } from '../../utils/floorOptions';
import { SetCard } from '../settings/ui';
import { BuildingPreview } from './BuildingPreview';
import { useSettings } from '../../store/settingsStore';
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

interface Props {
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
  /**
   * 소방시설 열 아래에 붙는 추가 내용 — SettingsPage 가 `<HydrantSetupPanel/>` 을 넣는다.
   * 이 컴포넌트를 **store 를 읽지 않는 순수 props 컴포넌트로 유지**하려고 슬롯으로 받는다.
   */
  facilityExtra?:            ReactNode;
}

/**
 * 건물 · 소방시설 설정 폼 (설정창 전용).
 *
 * 2026-08-24 전까지는 「건물 구조 / 화재 설정 / 소방시설」 세 탭이었다. 탭을 없애고
 * 한 화면에 이어 붙였더니 세로로만 길어져 읽기가 나빠져서, **3열로 나눠 배치**한다.
 * 2026-08-25 다시 2열로 바꿨다. 3열(건물 / 화재 / 소방시설)은 카드 높이가
 * 크게 달라(건물이 화재의 3배쯤) 오른쪽 두 열 아래가 늘 비었고, 무엇보다
 * **편집한 값이 어떤 화면이 되는지 볼 방법이 없었다.**
 *   좌 — 입력 폼 세 장을 세로로: 건물 · 화재 설정 · 소방시설
 *   우 — 상황판 구역 비율 + 미리보기
 * 비율 슬라이더를 미리보기 바로 위에 둔 것이 요점이다. 슬라이더를 움직이면
 * 아래 표의 가운데 칸이 같이 넓어져서 1 : 1.74 : 1 이 무엇인지 설명 없이 보인다.
 * 좁은 폭에서는 1열로 접힌다 — 열 수는 컨테이너 쿼리가 정한다(§12-C).
 */
export function BuildingConfigPanel({
  config, onChange,
  fireFloor, onFireFloorChange,
  fireStatus, onFireStatusChange,
  targetName, onTargetNameChange,
  extraFireFloors, onExtraFireFloorsChange,
  hasSiamesePipe, onSiamesePipeChange,
  hasIndoorHydrant, onIndoorHydrantChange,
  boardColumnRatio, onBoardColumnRatioChange,
  facilityExtra,
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

  // 미리보기에만 쓰는 값이라 props 계약을 늘리지 않고 store 에서 직접 읽는다
  // (이 컴포넌트는 설정모드 전용이다 — 파일 머리 주석 참고)
  const { hydrantSetup } = useSettings();

  const fireFloorCount = 1 + extraFireFloors.length;

  return (
    <div className="bcf">
      {/* ── 좌: 입력 폼 세 장을 세로로 쌓는다 ────────────── */}
      <div className="bcf__stack">
      <SetCard title="건물" meta={`지상 ${localAbove} · 지하 ${localBasement}`} className="bcf__col">
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

        <div className="bcf__field-pair">
          <label className="bcf__field">
            <span className="bcf__label">지상층수</span>
            <span className="bcf__num-wrap">
              <input
                className="bcf__input bcf__input--num"
                type="number" min={1} max={50}
                value={above}
                onChange={e => setAbove(e.target.value)}
                onBlur={applyFloors}
                onKeyDown={handleKeyDown}
              />
              <span className="bcf__unit">층</span>
            </span>
          </label>

          <label className="bcf__field">
            <span className="bcf__label">지하층수</span>
            <span className="bcf__num-wrap">
              <input
                className="bcf__input bcf__input--num"
                type="number" min={0} max={10}
                value={basement}
                onChange={e => setBasement(e.target.value)}
                onBlur={applyFloors}
                onKeyDown={handleKeyDown}
              />
              <span className="bcf__unit">층</span>
            </span>
          </label>
        </div>

      </SetCard>

      {/* ── 중: 화재 설정 ────────────────────────────── */}
      <SetCard title="화재 설정" meta={`${fireFloorCount}개 층`} className="bcf__col">
        {/* 열 머리글 — 세 줄 이상이면 어느 칸이 무엇인지 헷갈린다 */}
        <div className="bcf__fire-head" aria-hidden>
          <span>층</span>
          <span>상태</span>
          <span />
        </div>

        {/* 화점층 (첫 번째, 삭제 불가) */}
        <div className="bcf__fire-row">
          <select
            className="bcf__floor-select bcf__floor-select--primary"
            aria-label="화점층"
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
          <select
            className="bcf__status-select"
            aria-label="화점층 상태"
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
          <span className="bcf__primary-badge">화점층</span>
        </div>

        {/* 추가 화재 층 */}
        {extraFireFloors.map((ef, idx) => {
          const usedExcludingThis = new Set([safeFireFloor, ...extraFireFloors.filter((_, i) => i !== idx).map(e => e.floor)]);
          const selectableFloors  = floorList.filter(f => !usedExcludingThis.has(f));
          return (
            <div key={idx} className="bcf__fire-row">
              <select
                className="bcf__floor-select"
                aria-label={`확대층 ${idx + 1} 층`}
                value={ef.floor}
                onChange={e => updateExtraFloor(idx, { floor: Number(e.target.value) })}
              >
                {selectableFloors.map(f => (
                  <option key={f} value={f}>{floorLabel(f)}</option>
                ))}
              </select>
              <select
                className="bcf__status-select"
                aria-label={`확대층 ${idx + 1} 상태`}
                value={ef.status}
                onChange={e => updateExtraFloor(idx, { status: e.target.value as FireStatus })}
              >
                {FIRE_STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="bcf__remove-btn"
                onClick={() => removeExtraFloor(idx)}
                aria-label={`${floorLabel(ef.floor)} 확대층 삭제`}
                title="삭제"
              >✕</button>
            </div>
          );
        })}

        {/* 추가 버튼 */}
        {availableForExtra.length > 0 && (
          <button type="button" className="bcf__add-floor-btn" onClick={addExtraFloor}>
            + 층 추가
          </button>
        )}
      </SetCard>

      {/* ── 우: 소방시설 ─────────────────────────────── */}
      <SetCard title="소방시설" className="bcf__col">
        <div className="bcf__toggles">
          {/* 연결송수구 — 위치는 1층 좌측 하단 고정이라 방면을 고르지 않는다 */}
          <label className="bcf__toggle">
            <input
              type="checkbox"
              checked={hasSiamesePipe}
              onChange={e => onSiamesePipeChange(e.target.checked)}
            />
            <span className="bcf__toggle-text">연결송수구</span>
            <span className="bcf__toggle-note">1층 좌측 하단 고정</span>
          </label>

          <label className="bcf__toggle">
            <input
              type="checkbox"
              checked={hasIndoorHydrant}
              onChange={e => onIndoorHydrantChange(e.target.checked)}
            />
            <span className="bcf__toggle-text">옥내소화전</span>
            <span className="bcf__toggle-note">전 층 표시</span>
          </label>
        </div>

        {facilityExtra && (
          <div className="bcf__sub">
            <span className="bcf__sub-title">
              옥외소화전
              <span className="bcf__sub-meta">실행 시 초기 배치</span>
            </span>
            {facilityExtra}
          </div>
        )}
      </SetCard>
      </div>

      {/* ── 우: 비율 설정 + 미리보기 ──────────────────────
          비율을 미리보기 바로 위에 둔다. 슬라이더를 움직이면 아래 표의
          가운데 칸이 같이 넓어져서, 숫자(1 : 1.74 : 1)가 무엇을 뜻하는지
          설명 없이 보인다. 예전에는 건물 카드 안에 있어 그 연결이 없었다. */}
      <div className="bcf__side">
        <SetCard title="상황판 구역 비율" className="bcf__ratio-card">
        <p className="bcf__ratio-hint">
          전술상황판에서 B면 · 건물 · D면이 차지하는 가로 폭의 비율입니다.
          건물 쪽을 넓히면 층 내부가 자세해지고, 줄이면 B/D면 활동 공간이 넓어집니다.
        </p>

        {/* 미리보기 — 실제 열 폭과 같은 비율로 그린다 */}
        {/*
          아래 미리보기 표와 같은 비율·같은 폭이다. 표에서 층 라벨 전용 열을
          없앤 뒤로는 앞을 비울 필요가 없어졌다 — 표가 B 열부터 시작한다.
        */}
        <div className="bcf__ratio-preview" aria-hidden>
          <div className="bcf__ratio-bars">
            <div className="bcf__ratio-bar bcf__ratio-bar--side" style={{ flex: 1 }}>B면</div>
            <div className="bcf__ratio-bar bcf__ratio-bar--center" style={{ flex: boardColumnRatio }}>건물</div>
            <div className="bcf__ratio-bar bcf__ratio-bar--side" style={{ flex: 1 }}>D면</div>
          </div>
        </div>

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

        <div className="bcf__ratio-row">
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
        </SetCard>

        <SetCard title="미리보기" meta="훈련 상황판 구성" className="bcf__preview-card">
          <BuildingPreview
            config={config}
            fireFloor={fireFloor}
            fireStatus={fireStatus}
            extraFireFloors={extraFireFloors}
            hasSiamesePipe={hasSiamesePipe}
            hasIndoorHydrant={hasIndoorHydrant}
            boardColumnRatio={boardColumnRatio}
            hydrants={hydrantSetup}
          />
        </SetCard>
      </div>
    </div>
  );
}
