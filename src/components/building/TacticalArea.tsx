import { useLayoutEffect, useRef, useState } from 'react';
import type { BuildingConfig, FireStatus } from '../../types';
import { DEFAULT_BUILDING_CONFIG, buildDisplayFloors } from '../../data/buildingData';
import { BuildingBoard } from './BuildingBoard';
import { ExteriorZone } from './ExteriorZone';
import { BFaceWithStandby } from './BFaceWithStandby';
import { FireLine } from './FireLine';
import { useFireLine } from '../../context/FireLineContext';
import { EventLayer } from '../events/EventLayer';
import './TacticalArea.css';

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
const BUILDING_HEIGHT_KEY  = 'tacticalBoardBuildingHeight';
const A_FACE_MIN_HEIGHT    = 200;   // A면 최소 높이
const BUILDING_MIN_RATIO   = 0.6;   // 건물 최소 높이 = 최초 측정값의 60%

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
  const { showFireLine } = useFireLine();
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

  const areaRef           = useRef<HTMLDivElement>(null);
  const naturalHeightRef  = useRef<number | null>(null); // 최초 측정값(클램프 하한 기준)
  const [buildingHeight, setBuildingHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const totalH           = el.clientHeight;
    const naturalBuildingH = Math.max(0, totalH - 140 - A_FACE_MIN_HEIGHT);
    naturalHeightRef.current = naturalBuildingH;

    const maxAllowed = Math.max(A_FACE_MIN_HEIGHT, totalH - 140 - A_FACE_MIN_HEIGHT);
    const minAllowed = naturalBuildingH * BUILDING_MIN_RATIO;
    const saved       = Number(localStorage.getItem(BUILDING_HEIGHT_KEY));

    setBuildingHeight(
      saved > 0 ? Math.min(maxAllowed, Math.max(minAllowed, saved)) : naturalBuildingH
    );
  }, []); // 최초 마운트 시 1회만 현재 화면 크기를 기준으로 측정

  // 측정 전(최초 페인트 직전) 폴백 — 기존 fr 기반 동작과 동일하게 렌더
  const midRowParts = buildingHeight != null
    ? rowWeights.map(w => `${(buildingHeight * w / totalWeight).toFixed(1)}px`)
    : rowWeights.map(w => `${w}fr`);
  const gridTemplateRows = `140px ${midRowParts.join(' ')} minmax(${A_FACE_MIN_HEIGHT}px, 1fr)`;

  function handleRowResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    const el = areaRef.current;
    if (!el || buildingHeight == null) return;

    const startY      = e.clientY;
    const startHeight = buildingHeight;
    const totalH      = el.clientHeight;
    const maxAllowed  = Math.max(A_FACE_MIN_HEIGHT, totalH - 140 - A_FACE_MIN_HEIGHT);
    const minAllowed  = (naturalHeightRef.current ?? startHeight) * BUILDING_MIN_RATIO;

    document.body.style.cursor     = 'ns-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev: MouseEvent) {
      const next = Math.min(maxAllowed, Math.max(minAllowed, startHeight + (ev.clientY - startY)));
      setBuildingHeight(next);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      setBuildingHeight(h => {
        if (h != null) localStorage.setItem(BUILDING_HEIGHT_KEY, String(h));
        return h;
      });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div
      id="tactical-area"
      ref={areaRef}
      className="tactical-area"
      style={{ '--above-pct': abovePct, gridTemplateRows } as React.CSSProperties}
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

      {/* row 2, 전체 폭 — 1층 바닥 슬래브 + 소방통제선 */}
      <div className="tactical-area__slab" aria-hidden="true">
        {showFireLine && (
          <FireLine height={15} style={{ position: 'absolute', top: 'calc(var(--above-pct, 100%) - 9px)', left: 0, right: 0 }} />
        )}
      </div>

      {/* 건물↔A면 높이 조절 핸들 — col 1(좌측)에서만, 훈련 중 실수 클릭 방지 */}
      <div
        className="tactical-area__row-resize-handle"
        onMouseDown={handleRowResizeStart}
        title="드래그하여 건물/A면 높이 조절"
      />

      {/* 마지막 행, 전체 폭 — A면 (진입면, 직전대기 코너 포함) */}
      <ExteriorZone face="A" />

      {/* 이벤트 토큰 오버레이 */}
      <EventLayer />
    </div>
  );
}
