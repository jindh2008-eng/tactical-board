import type { DisplayFloor } from '../../types';
import { ZoneCell } from './ZoneCell';
import './FloorRow.css';

interface Props {
  floor:                DisplayFloor;
  stairSmokeStartFloor?: number | null;
}

export function FloorRow({ floor, stairSmokeStartFloor = null }: Props) {
  const classes = [
    'floor-row',
    floor.isBasement ? 'floor-row--basement' : '',
    floor.isRange    ? 'floor-row--range'    : '',
  ].filter(Boolean).join(' ');

  // 이 층의 계단실에 연기 표시 여부
  // 옥상(RF): endFloor = aboveGroundFloors+1 이므로 선택한 층이 있으면 항상 true
  // 묶음 행:  endFloor(상단 층)이 기준 이상이면 true — 범위 내 일부라도 연기가 있으면 표시
  const stairHasSmoke =
    stairSmokeStartFloor !== null && floor.endFloor >= stairSmokeStartFloor;

  // 연기 시작층 여부 — 해당 층에만 💨 아이콘 표시
  const isSmokeBoundary =
    stairSmokeStartFloor !== null &&
    floor.startFloor <= stairSmokeStartFloor &&
    floor.endFloor   >= stairSmokeStartFloor;

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
            stairSmoke={zone.id === 'stair' ? stairHasSmoke : false}
            stairSmokeEntry={zone.id === 'stair' ? isSmokeBoundary : false}
          />
        ))}
      </div>
    </div>
  );
}
