import type { DisplayFloor } from '../../types';
import { ZoneCell } from './ZoneCell';
import './RoofRow.css';

interface Props {
  floor: DisplayFloor;
}

export function RoofRow({ floor }: Props) {
  return (
    <div className="roof-row" data-zone="roof" data-floor="RF">
      <div className="roof-row__label">옥상</div>
      <div className="roof-row__zones">
        {floor.zones.map(zone => (
          <ZoneCell key={zone.id} zone={zone} floorId="RF" />
        ))}
      </div>
    </div>
  );
}
