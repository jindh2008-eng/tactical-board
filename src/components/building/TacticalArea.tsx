import type { BuildingConfig } from '../../types';
import { DEFAULT_BUILDING_CONFIG, buildDisplayFloors } from '../../data/buildingData';
import { BuildingBoard } from './BuildingBoard';
import { ExteriorZone } from './ExteriorZone';
import { BFaceWithStandby } from './BFaceWithStandby';
import { StandbyColumn } from './StandbyColumn';
import { ImminentStandby } from './ImminentStandby';
import './TacticalArea.css';

interface Props {
  config?:               BuildingConfig;
  fireFloor?:            number;
  stairSmokeStartFloor?: number | null;
}

/**
 * TacticalArea — 전술 상황판 전체 영역
 *
 * 4열 3행 CSS Grid:
 *
 *  (빈칸)           (빈칸)       C면 [col3/row1]  (빈칸)
 *  대기구역[1/2]    B면[2/2]    건물[col3/row2]   D면[4/2]
 *  (빈칸)           직전대기[2/3] A면 [col3/row3]  (빈칸)
 *
 * col 1: 좌측 운영패널 (StandbyColumn) — row 2
 * col 2: B면 (row 2) + 직전대기 (row 3)
 * col 3: C면(row1) / 건물(row2) / A면(row3)
 * col 4: D면 (row 2)
 */
export function TacticalArea({
  config               = DEFAULT_BUILDING_CONFIG,
  fireFloor            = 1,
  stairSmokeStartFloor = null,
}: Props) {
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
      {/* row 1, col 3 — C면 (후면) */}
      <ExteriorZone face="C" />

      {/* row 2, col 1 — 좌측 운영패널 (임시의료소·구조현황통계·자원대기소·대기1단계) */}
      <StandbyColumn />

      {/* row 2, col 2 — B면 (독립 드롭존) */}
      <BFaceWithStandby />

      {/* row 2, col 3 — 건물 */}
      <div className="tactical-area__building">
        <BuildingBoard
          config={config}
          fireFloor={fireFloor}
          stairSmokeStartFloor={stairSmokeStartFloor}
        />
      </div>

      {/* row 2, col 4 — D면 */}
      <ExteriorZone face="D" />

      {/* row 2, col 1-5 — 1층 바닥 슬래브 전폭 */}
      <div className="tactical-area__slab" aria-hidden="true" />

      {/* row 3, col 2 — 직전대기 (A면 좌측 보조 박스) */}
      <ImminentStandby />

      {/* row 3, col 3 — A면 (진입면) */}
      <ExteriorZone face="A" />
    </div>
  );
}
