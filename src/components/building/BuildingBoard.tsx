import type { BuildingConfig } from '../../types';
import {
  DEFAULT_BUILDING_CONFIG,
  buildDisplayFloors,
  calcMinRowHeight,
} from '../../data/buildingData';
import { BuildingStateProvider } from '../../context/BuildingStateContext';
import { FloorRow } from './FloorRow';
import './BuildingBoard.css';

interface Props {
  config?:               BuildingConfig;
  fireFloor?:            number;
  stairSmokeStartFloor?: number | null;
}

export function BuildingBoard({
  config               = DEFAULT_BUILDING_CONFIG,
  fireFloor            = 1,
  stairSmokeStartFloor = null,
}: Props) {
  const floors     = buildDisplayFloors(config, fireFloor);
  const minRowPx   = calcMinRowHeight();
  const allFloorIds = floors.map(f => f.id);

  return (
    <BuildingStateProvider
      allFloorIds={allFloorIds}
      stairSmokeStartFloor={stairSmokeStartFloor}
      aboveGroundFloors={config.aboveGroundFloors}
    >
      <div
        className="building-body"
        style={{ '--min-row-height': `${minRowPx}px` } as React.CSSProperties}
      >
        {floors.map(floor => (
          <FloorRow
            key={floor.id}
            floor={floor}
            stairSmokeStartFloor={stairSmokeStartFloor}
            fireFloor={fireFloor}
            aboveGroundFloors={config.aboveGroundFloors}
          />
        ))}
      </div>
    </BuildingStateProvider>
  );
}
