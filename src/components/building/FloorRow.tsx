import type { DisplayFloor, FireStatus } from '../../types';
import { useBuildingState, computeStairSmokeLevel } from '../../context/BuildingStateContext';
import type { SmokeLevel } from '../../context/BuildingStateContext';
import { ZoneCell } from './ZoneCell';
import './FloorRow.css';

const ACTIVE_FIRE_STATUSES = new Set<FireStatus>(['extension-peak', 'peak', 'seventy', 'half']);

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
    floor.id === 'RF'    ? 'floor-row--rf'       : '',
    floor.isBasement     ? 'floor-row--basement'  : '',
    floor.isRange        ? 'floor-row--range'     : '',
  ].filter(Boolean).join(' ');

  const { stairSmokeFloor, smokeConcentration, doorStates, fireStates } = useBuildingState();

  // RF의 endFloor = aboveGroundFloors + 1
  const floorEndNum = floor.id === 'RF'
    ? aboveGroundFloors + 1
    : floor.endFloor;

  const smokeLevel = computeStairSmokeLevel({ floorEndNum, stairSmokeFloor, smokeConcentration });

  const doorState     = doorStates[floor.id] ?? (floor.id === 'RF' ? 'closed' : 'open');
  const fireStatus    = fireStates[floor.id] ?? null;
  const hasActiveFire = fireStatus !== null && ACTIVE_FIRE_STATUSES.has(fireStatus);

  // 화점층: 방화문 상태와 무관하게 항상 내부 연기 (화재는 건물 내부에서 발생)
  // 상층부: 계단실 연기 있음 + 방화문 열림 → 내부로 연기 유입
  // RF: 내부 연기 표시 안 함
  const interiorSmokeLevel: SmokeLevel =
    floor.id === 'RF' ? 'none' :
    hasActiveFire ? 'full' :
    (smokeLevel !== 'none' && doorState === 'open') ? smokeLevel : 'none';

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
        {floor.zones
          .filter(zone => !(floor.id === 'RF' && zone.id === 'right'))
          .map(zone => (
            <ZoneCell
              key={zone.id}
              zone={zone}
              floorId={floor.id}
              isRange={floor.isRange}
              smokeLevel={zone.id === 'stair' ? smokeLevel : interiorSmokeLevel}
            />
          ))}
      </div>
    </div>
  );
}
