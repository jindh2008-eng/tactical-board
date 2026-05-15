import type { BuildingConfig, FireStatus } from '../../types';
import { DEFAULT_BUILDING_CONFIG, buildDisplayFloors } from '../../data/buildingData';
import { BuildingBoard } from './BuildingBoard';
import { ExteriorZone } from './ExteriorZone';
import { BFaceWithStandby } from './BFaceWithStandby';
import { MedicalPostBox, BottomStandbyBoxes } from './StandbyColumn';
import { RescueStats } from './RescueStats';
import { ImminentStandby } from './ImminentStandby';
import { EventLayer } from '../events/EventLayer';
import './TacticalArea.css';

interface Props {
  config?:            BuildingConfig;
  fireFloor?:         number;
  initialFireStatus?: FireStatus | null;
  extraFireFloors?:   import('../../types/settings').ExtraFireFloor[];
}

/**
 * TacticalArea — 전술 상황판 전체 영역
 *
 * 3열 3행 CSS Grid:
 *
 *  자원+대기[1/1]   C면[2/1]    임시의료소[3/1]
 *  B면[1/2]         건물[2/2]   D면[3/2]
 *  직전대기[1/3]    A면[2/3]    구조활동통계[3/3]
 *
 * col 1: 좌측 (자원대기소+대기1단계 / B면 / 직전대기)
 * col 2: 중앙 (C면 / 건물 / A면)
 * col 3: 우측 (임시의료소 / D면 / 구조활동통계)
 */
export function TacticalArea({
  config            = DEFAULT_BUILDING_CONFIG,
  fireFloor         = 1,
  initialFireStatus = null,
  extraFireFloors   = [],
}: Props) {
  const displayFloors  = buildDisplayFloors(config, fireFloor);
  const aboveRows      = displayFloors.filter(f => !f.isBasement).length;
  const basementRows   = displayFloors.filter(f => f.isBasement).length;
  const totalRows      = aboveRows + basementRows;
  const abovePct       = totalRows > 0
    ? `${(aboveRows / totalRows * 100).toFixed(2)}%`
    : '100%';

  // Split middle row: RF (1fr) + non-RF above + optional basement
  const aboveNoRfFr = Math.max(aboveRows - 1, 0);
  const midRowParts: string[] = ['1fr'];
  if (aboveNoRfFr > 0)  midRowParts.push(`${aboveNoRfFr}fr`);
  if (basementRows > 0) midRowParts.push(`${basementRows}fr`);
  const gridTemplateRows = `140px ${midRowParts.join(' ')} 200px`;

  return (
    <div
      id="tactical-area"
      className="tactical-area"
      style={{ '--above-pct': abovePct, gridTemplateRows } as React.CSSProperties}
    >
      {/* row 1, col 1 — 자원대기소 + 대기1단계 */}
      <div className="tactical-area__bottom-standby">
        <BottomStandbyBoxes />
      </div>

      {/* row 1, col 2 — C면 (후면) */}
      <ExteriorZone face="C" />

      {/* row 1, col 3 — 임시의료소 */}
      <div className="tactical-area__medical-post">
        <MedicalPostBox />
      </div>

      {/* row 2, col 1 — B면 */}
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

      {/* row 2, col 3 — D면 */}
      <ExteriorZone face="D" />

      {/* row 2, 전체 폭 — 1층 바닥 슬래브 */}
      <div className="tactical-area__slab" aria-hidden="true" />

      {/* row 3, col 1 — 직전대기 */}
      <ImminentStandby />

      {/* row 3, col 2 — A면 (진입면) */}
      <ExteriorZone face="A" />

      {/* row 3, col 3 — 구조활동통계 */}
      <div className="tactical-area__rescue-stats">
        <RescueStats />
      </div>

      {/* 이벤트 토큰 오버레이 */}
      <EventLayer />
    </div>
  );
}
