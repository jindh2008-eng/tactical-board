import type { FloorId } from '../../types';

interface Props {
  floorId: FloorId;
}

/** 계단실 셀 — 향후 계단 이동 로직 확장 가능 */
export function StairCell({ floorId }: Props) {
  return (
    <div
      className="zone-cell zone-cell--stair"
      data-floor={floorId}
      data-zone="stair"
    >
      <span className="zone-cell__label" style={{ writingMode: 'vertical-rl', fontSize: '0.6rem' }}>
        계단실
      </span>
    </div>
  );
}
