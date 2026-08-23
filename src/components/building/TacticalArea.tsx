import { useRef, useState } from 'react';
import type { BuildingConfig, FireStatus } from '../../types';
import { DEFAULT_BUILDING_CONFIG, buildDisplayFloors } from '../../data/buildingData';
import { BuildingBoard } from './BuildingBoard';
import { ExteriorZone } from './ExteriorZone';
import { BFaceWithStandby } from './BFaceWithStandby';
import { EventLayer } from '../events/EventLayer';
import { useActionMode } from '../../context/ActionModeContext';
import { DrawingBoard } from '../drawing/DrawingBoard';
import './TacticalArea.css';
import { useSettings } from '../../store/settingsStore';

interface Props {
  config?:            BuildingConfig;
  fireFloor?:         number;
  initialFireStatus?: FireStatus | null;
  extraFireFloors?:   import('../../types/settings').ExtraFireFloor[];
}

// ─────────────────────────────────────────────
// 건물↔A면 높이 분배 — 건물은 마운트 시점 크기로 고정,
// 화면이 커지면(F11 등) 늘어난 공간은 A면이 흡수.
// 좌측(col 1) 경계 핸들 드래그로 수동 조절도 가능.
// ─────────────────────────────────────────────
/**
 * 저장 키는 **비율**이다(px 아님).
 *
 * 예전 키 `tacticalBoardBuildingHeight` 는 px 를 저장해서, 노트북에서 조절한
 * 높이가 훈련장 2560px PC 에 그대로 적용됐다. 기기를 넘나드는 px 는 오염이다.
 * 지금은 "자연 높이 대비 배수"만 저장하므로 어느 화면에서 조절하든 뜻이 같다.
 * → docs/SCREEN_STAGE_PLAN.md §1.2
 */
const BUILDING_RATIO_KEY   = 'tacticalBoardBuildingHeightRatio';
// 세로 계수는 ×1.1276 이다 — 보드 높이가 1277→1440 으로 **늘었기** 때문.
// 폭 계수(×0.8456)를 세로에 쓰면 A면이 17px 모자라 그리기 도구모음이 잘린다.
const A_FACE_MIN_HEIGHT    = 226;   // A면 최소 높이 (200px × 1.1276)
const C_FACE_HEIGHT        = 158;   // C면 높이     (140px × 1.1276)
const BUILDING_MIN_RATIO   = 0.6;   // 건물 최소 높이 = 자연 높이의 60%
const BUILDING_MAX_RATIO   = 1.4;   // 건물 최대 높이 = 자연 높이의 140%

/**
 * 캔버스가 고정이라 보드 안쪽 높이는 상수다 — 더 이상 잴 필요가 없다.
 * 정사각 보드 1440 - .tactical-area padding 4px×2 = 1432
 * → docs/SCREEN_STAGE_PLAN.md §3.4
 */
const BOARD_INNER_H        = 1432;
/** 사용자가 조절하지 않았을 때의 건물 높이 */
const NATURAL_BUILDING_H   = BOARD_INNER_H - C_FACE_HEIGHT - A_FACE_MIN_HEIGHT;

function loadBuildingRatio(): number {
  const raw = Number(localStorage.getItem(BUILDING_RATIO_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(BUILDING_MAX_RATIO, Math.max(BUILDING_MIN_RATIO, raw));
}

/**
 * TacticalArea — 전술 상황판 전체 영역
 *
 * 3열 3행 CSS Grid (대기1단계·임시의료소·직전대기·구조활동통계는
 * 우측 고정 패널로 이동 — PlayPage.tsx 참고):
 *
 *  C면[1/1 ~ 3/1, 전체 폭]
 *  B면[1/2]   건물[2/2]   D면[3/2]  (B/D면은 RF 트랙까지 확장)
 *  A면[1/3 ~ 3/3, 전체 폭] (직전대기는 A면 좌측 하단에 고정 코너로 포함)
 */
export function TacticalArea({
  config            = DEFAULT_BUILDING_CONFIG,
  fireFloor         = 1,
  initialFireStatus = null,
  extraFireFloors   = [],
}: Props) {
  const { mode } = useActionMode();
  const { boardColumnRatio } = useSettings();
  const drawingInteraction = mode.type === 'drawing' || mode.type === 'drawing-erase';
  const displayFloors  = buildDisplayFloors(config, fireFloor);
  const aboveRows      = displayFloors.filter(f => !f.isBasement).length;
  const basementRows   = displayFloors.filter(f => f.isBasement).length;
  const totalRows      = aboveRows + basementRows;
  const abovePct       = totalRows > 0
    ? `${(aboveRows / totalRows * 100).toFixed(2)}%`
    : '100%';

  // 건물 내부 RF/일반층/지하 비율 가중치 (기존 fr 값과 동일한 관계 유지)
  const aboveNoRfFr  = Math.max(aboveRows - 1, 0);
  const rowWeights: number[] = [1];
  if (aboveNoRfFr > 0)  rowWeights.push(aboveNoRfFr);
  if (basementRows > 0) rowWeights.push(basementRows);
  const totalWeight = rowWeights.reduce((a, b) => a + b, 0);

  const areaRef = useRef<HTMLDivElement>(null);
  // 측정하지 않는다. 캔버스가 고정이므로 상수 × 저장된 비율이 곧 높이다.
  // (예전에는 useLayoutEffect 로 1회만 재고 px 로 굳혀서, 창 크기를 바꿔도
  //  건물 행만 따라오지 않아 화면이 무너졌다 — 계획서 §1.2)
  const [buildingHeight, setBuildingHeight] = useState(
    () => NATURAL_BUILDING_H * loadBuildingRatio()
  );

  const midRowParts = rowWeights.map(
    w => `${(buildingHeight * w / totalWeight).toFixed(1)}px`
  );
  const gridTemplateRows =
    `${C_FACE_HEIGHT}px ${midRowParts.join(' ')} minmax(${A_FACE_MIN_HEIGHT}px, 1fr)`;
  // B : 건물 : D — 설정값을 fr 비율로 직접 만든다(§3.7). CSS 변수로는 안 된다.
  const gridTemplateColumns = `1fr ${boardColumnRatio}fr 1fr`;

  function handleRowResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    if (drawingInteraction) return;
    const el = areaRef.current;
    if (!el) return;

    const startY      = e.clientY;
    const startHeight = buildingHeight;
    const maxAllowed  = NATURAL_BUILDING_H * BUILDING_MAX_RATIO;
    const minAllowed  = NATURAL_BUILDING_H * BUILDING_MIN_RATIO;

    document.body.style.cursor     = 'ns-resize';
    document.body.style.userSelect = 'none';

    const pointerId = e.pointerId;

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const next = Math.min(maxAllowed, Math.max(minAllowed, startHeight + (ev.clientY - startY)));
      setBuildingHeight(next);
    }
    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      // px 가 아니라 자연 높이 대비 비율로 저장한다 — 기기가 바뀌어도 뜻이 같다.
      setBuildingHeight(h => {
        localStorage.setItem(BUILDING_RATIO_KEY, String(h / NATURAL_BUILDING_H));
        return h;
      });
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  return (
    <div
      id="tactical-area"
      ref={areaRef}
      className="tactical-area"
      style={{ '--above-pct': abovePct, gridTemplateColumns, gridTemplateRows } as React.CSSProperties}
    >
      {/* row 1, 전체 폭 — C면 (후면) */}
      <ExteriorZone face="C" />

      {/* row 2, col 1 — B면 (RF 트랙까지 확장) */}
      <BFaceWithStandby />

      {/* row 2, col 2 — 건물 */}
      <div className="tactical-area__building">
        <BuildingBoard
          config={config}
          fireFloor={fireFloor}
          initialFireStatus={initialFireStatus}
          extraFireFloors={extraFireFloors}
        />
      </div>

      {/* row 2, col 3 — D면 (RF 트랙까지 확장) */}
      <ExteriorZone face="D" />

      {/* row 2, 전체 폭 — 1층 바닥 슬래브. 소방통제선은 A면(exterior-zone--a) 내부 최상단에서 그린다
          — 이 슬랩 컨테이너(z-index:10)에 두면 A면(z-index:15)에 가려 보이지 않는다 */}
      <div className="tactical-area__slab" aria-hidden="true" />

      {/* 건물↔A면 높이 조절 핸들 — col 1(좌측)에서만, 훈련 중 실수 클릭 방지 */}
      <div
        className={`tactical-area__row-resize-handle${drawingInteraction ? ' tactical-area__row-resize-handle--disabled' : ''}`}
        onPointerDown={handleRowResizeStart}
        onContextMenu={e => e.preventDefault()}
        title="드래그하여 건물/A면 높이 조절"
      />

      {/* 마지막 행, 전체 폭 — A면 (진입면, 직전대기 코너 포함) */}
      <ExteriorZone face="A" />

      {/* 이벤트 토큰 오버레이 */}
      <EventLayer />

      {/* ABCD면과 건물을 하나의 좌표계로 사용하는 전술상황판 전체 그림판 */}
      <DrawingBoard />
    </div>
  );
}
