import type { DisplayFloor } from '../../types';
import { useBuildingState, computeStairSmokeLevel } from '../../context/BuildingStateContext';
import { ZoneCell } from './ZoneCell';
import './FloorRow.css';

interface Props {
  floor:              DisplayFloor;
  aboveGroundFloors?: number;
}

export function FloorRow({
  floor,
  aboveGroundFloors = 1,
}: Props) {
  const classes = [
    'floor-row',
    floor.isBasement ? 'floor-row--basement' : '',
    floor.isRange    ? 'floor-row--range'    : '',
  ].filter(Boolean).join(' ');

  const { stairSmokeFloor, smokeConcentration } = useBuildingState();

  // RF의 endFloor = aboveGroundFloors + 1
  const floorEndNum = floor.id === 'RF'
    ? aboveGroundFloors + 1
    : floor.endFloor;

  const smokeLevel = computeStairSmokeLevel({ floorEndNum, stairSmokeFloor, smokeConcentration });

  // AerialTargetOverlay에서 DOM으로 읽을 층 정보
  const displayLabel = floor.id === 'RF'
    ? '옥상'
    : floor.isRange
      ? `${floor.endFloor}~${floor.startFloor}층`
      : `${floor.endFloor}층`;

  return (
    <div
      className={classes}
      data-floor-id={floor.id}
      data-floor-height={floorEndNum}
      data-floor-label={displayLabel}
    >
      <div className="floor-row__label">
        <span
          className={[
            'floor-row__label-text',
            floor.label.includes('\n') ? 'floor-row__label-text--range' : '',
          ].filter(Boolean).join(' ')}
        >
          {floor.label}
        </span>
      </div>
      <div className="floor-row__zones">
        {floor.zones.map(zone => (
          <ZoneCell
            key={zone.id}
            zone={zone}
            floorId={floor.id}
            isRange={floor.isRange}
            smokeLevel={zone.id === 'stair' ? smokeLevel : 'none'}
          />
        ))}
      </div>
    </div>
  );
}
