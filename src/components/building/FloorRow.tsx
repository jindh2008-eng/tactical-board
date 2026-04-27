import type { DisplayFloor } from '../../types';
import { useBuildingState, computeStairSmokeLevel } from '../../context/BuildingStateContext';
import { ZoneCell } from './ZoneCell';
import './FloorRow.css';

interface Props {
  floor:                DisplayFloor;
  stairSmokeStartFloor?: number | null;
  fireFloor?:           number;
  aboveGroundFloors?:   number;
}

export function FloorRow({
  floor,
  stairSmokeStartFloor  = null,
  fireFloor             = 1,
  aboveGroundFloors     = 1,
}: Props) {
  const classes = [
    'floor-row',
    floor.isBasement ? 'floor-row--basement' : '',
    floor.isRange    ? 'floor-row--range'    : '',
  ].filter(Boolean).join(' ');

  const { doorStates, fireStates } = useBuildingState();

  // RF의 endFloor = aboveGroundFloors + 1
  const floorEndNum = floor.id === 'RF'
    ? aboveGroundFloors + 1
    : floor.endFloor;

  const smokeLevel = computeStairSmokeLevel({
    floorEndNum,
    doorStates,
    fireStates,
    stairSmokeStartFloor,
    fireFloor,
  });

  return (
    <div className={classes}>
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
