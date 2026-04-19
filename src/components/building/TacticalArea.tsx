import type { BuildingConfig } from '../../types';
import { DEFAULT_BUILDING_CONFIG, buildDisplayFloors } from '../../data/buildingData';
import { BuildingBoard } from './BuildingBoard';
import { ExteriorZone } from './ExteriorZone';
import { BFaceWithStandby } from './BFaceWithStandby';
import './TacticalArea.css';

interface Props {
  config?:               BuildingConfig;
  fireFloor?:            number;
  stairSmokeStartFloor?: number | null;
}

/**
 * TacticalArea — 전술 상황판 전체 영역
 *
 * 3열 CSS Grid. 5개 셀을 명시적으로 배치:
 *
 *  (빈칸)    C면 [col2/row1]    (빈칸)
 *  B면[1/2]  건물 [col2/row2]   D면[3/2]
 *  (빈칸)    A면 [col2/row3]    (빈칸)
 *
 * C/A면: col2 고정 → 건물과 동일한 너비 보장
 * B/D면: row2 고정 → auto 행 높이 = 건물 높이와 동일
 *
 * CornerFace 구역(AB/BC/CD/AD)은 타입으로만 정의되어 있고
 * 향후 드래그 앤 드롭 등에서 활용할 예정.
 */
export function TacticalArea({
  config               = DEFAULT_BUILDING_CONFIG,
  fireFloor            = 1,
  stairSmokeStartFloor = null,
}: Props) {
  // B/D면 높이를 지상층(옥상 포함) 범위에만 맞추기 위해
  // 표시 행에서 지상/지하 비율을 계산해 CSS 변수로 주입
  const displayFloors  = buildDisplayFloors(config, fireFloor);
  const aboveRows      = displayFloors.filter(f => !f.isBasement).length;
  const basementRows   = displayFloors.filter(f => f.isBasement).length;
  const totalRows      = aboveRows + basementRows;
  const abovePct       = totalRows > 0
    ? `${(aboveRows / totalRows * 100).toFixed(2)}%`
    : '100%';

  return (
    <div
      className="tactical-area"
      style={{ '--above-pct': abovePct } as React.CSSProperties}
    >
      {/* row 1, col 2 — C면 (후면) */}
      <ExteriorZone face="C" />

      {/* row 2 — B면(좌, 대기구역 포함) | 건물 | D면(우) */}
      <BFaceWithStandby />
      <div className="tactical-area__building">
        <BuildingBoard
          config={config}
          fireFloor={fireFloor}
          stairSmokeStartFloor={stairSmokeStartFloor}
        />
      </div>
      <ExteriorZone face="D" />

      {/* row 2, col 1-3 — 1층 바닥 슬래브 (B면~D면 전폭) */}
      <div className="tactical-area__slab" aria-hidden="true" />

      {/* row 3, col 2 — A면 (진입면) */}
      <ExteriorZone face="A" />
    </div>
  );
}
