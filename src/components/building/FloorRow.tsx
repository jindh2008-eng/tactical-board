import type { DisplayFloor } from '../../types';
import { useBuildingState, computeStairSmokeLevel } from '../../context/BuildingStateContext';
import { useActionMode } from '../../context/ActionModeContext';
import { useTokens } from '../../context/TokenContext';
import { ZoneCell } from './ZoneCell';
import './FloorRow.css';

// 층 높이 제한
const AERIAL_MAX_HEIGHT = 15;
const LADDER_MAX_HEIGHT = 7;

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

  const { doorStates, stairSmokeFloor, smokeConcentration } = useBuildingState();
  const { mode, clearMode }                                 = useActionMode();
  const { setStatusTag }                                    = useTokens();

  // RF의 endFloor = aboveGroundFloors + 1
  const floorEndNum = floor.id === 'RF'
    ? aboveGroundFloors + 1
    : floor.endFloor;

  const smokeLevel = computeStairSmokeLevel({ floorEndNum, stairSmokeFloor, smokeConcentration });

  // ── 고가차/굴절차 층 선택 모드 ─────────────────
  const isAerialMode    = mode.type === 'aerial-floor-select';
  const isSelectable    = isAerialMode && !floor.isBasement;

  function handleFloorLabelClick(e: React.MouseEvent) {
    if (mode.type !== 'aerial-floor-select') return;
    if (floor.isBasement) return;

    e.stopPropagation();

    // 층 높이 및 표시 레이블 계산
    let floorHeight: number;
    let displayLabel: string;

    if (floor.id === 'RF') {
      floorHeight  = aboveGroundFloors + 1;
      displayLabel = '옥상';
    } else {
      // isRange: endFloor = 해당 행의 최고층 (높이 검증에 사용)
      floorHeight  = floor.endFloor;
      displayLabel = floor.isRange
        ? `${floor.endFloor}~${floor.startFloor}층`
        : `${floor.endFloor}층`;
    }

    // 높이 제한 검증
    const maxHeight   = mode.unitType === 'ladder' ? LADDER_MAX_HEIGHT : AERIAL_MAX_HEIGHT;
    const vehicleName = mode.unitType === 'ladder' ? '굴절차' : '고가차';

    if (floorHeight > maxHeight) {
      alert(`${vehicleName}는 ${maxHeight}층 높이까지만 전개 가능합니다.`);
      return;
    }

    // 상태 태그 설정 후 모드 종료
    const color = mode.actionLabel === '방수' ? 'blue' : 'yellow';
    setStatusTag(mode.sourceId, { label: `${displayLabel} ${mode.actionLabel}`, color });
    clearMode();
  }

  return (
    <div className={classes} data-floor-id={floor.id}>
      <div
        className={[
          'floor-row__label',
          isSelectable ? 'floor-row__label--selectable' : '',
        ].filter(Boolean).join(' ')}
        onClick={isSelectable ? handleFloorLabelClick : undefined}
        role={isSelectable ? 'button' : undefined}
        title={isSelectable
          ? (floor.id === 'RF' ? '옥상 선택' : `${floor.endFloor}층 선택`)
          : undefined}
      >
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
