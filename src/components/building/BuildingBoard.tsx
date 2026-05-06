import { useCallback, useMemo } from 'react';
import type { BuildingConfig, DoorState, FireStatus } from '../../types';
import {
  DEFAULT_BUILDING_CONFIG,
  buildDisplayFloors,
  calcMinRowHeight,
} from '../../data/buildingData';
import { BuildingStateProvider, type SmokeLevel } from '../../context/BuildingStateContext';
import { useTokens } from '../../context/TokenContext';
import { FloorRow } from './FloorRow';
import './BuildingBoard.css';

// ─────────────────────────────────────────────
// 층 ID → 표시 레이블
// ─────────────────────────────────────────────

function floorIdToLabel(floorId: string): string {
  if (floorId === 'RF') return '옥상';
  if (floorId.startsWith('B')) return `${floorId}층`;
  const n = parseInt(floorId, 10);
  return isNaN(n) ? floorId : `${n}층`;
}

// 화재상태 → 한글 레이블
const FIRE_STATUS_LABELS: Record<string, string> = {
  'extension-peak': '연소확대',
  'peak':           '최성기',
  'seventy':        '70%',
  'half':           '50%',
  'initial':        '초진',
  'complete':       '완진',
};

// ─────────────────────────────────────────────
// BuildingBoard
// ─────────────────────────────────────────────

interface Props {
  config?:           BuildingConfig;
  fireFloor?:        number;
  initialFireStatus?: FireStatus | null;
}

export function BuildingBoard({
  config             = DEFAULT_BUILDING_CONFIG,
  fireFloor          = 1,
  initialFireStatus  = null,
}: Props) {
  const floors      = useMemo(() => buildDisplayFloors(config, fireFloor), [config, fireFloor]);
  const minRowPx    = calcMinRowHeight();
  const allFloorIds = useMemo(() => floors.map(f => f.id), [floors]);

  const { addLog } = useTokens();

  const handleFireChange = useCallback((floorId: string, status: FireStatus | null) => {
    const label = status ? (FIRE_STATUS_LABELS[status] ?? status) : '해제';
    addLog({
      logType: 'fire-status', tokenId: `fire-${floorId}`,
      tokenName: floorIdToLabel(floorId), fromZoneId: '', toZoneId: '', note: label,
    });
  }, [addLog]);

  const handleDoorChange = useCallback((floorId: string, state: DoorState) => {
    const floorLabel = floorId === 'RF' ? '옥상' : `${parseInt(floorId, 10)}층`;
    addLog({
      logType: 'door', tokenId: `door-${floorId}`,
      tokenName: `${floorLabel} 계단 방화문`,
      fromZoneId: '', toZoneId: '',
      note: state === 'open' ? '개방' : '폐쇄',
    });
  }, [addLog]);

  const handleSmokeChange = useCallback((level: SmokeLevel) => {
    const noteMap: Record<SmokeLevel, string> = {
      full: '연기 유입',
      weak: '연기 유입 (배연 중)',
      none: '클린존',
    };
    addLog({
      logType: 'smoke', tokenId: 'stair-smoke',
      tokenName: '계단실 연기', fromZoneId: '', toZoneId: '',
      note: noteMap[level],
    });
  }, [addLog]);

  return (
    <BuildingStateProvider
      allFloorIds={allFloorIds}
      fireFloor={fireFloor}
      initialFireStatus={initialFireStatus}
      aboveGroundFloors={config.aboveGroundFloors}
      onFireChange={handleFireChange}
      onDoorChange={handleDoorChange}
      onSmokeChange={handleSmokeChange}
    >
      <div
        className="building-body"
        style={{ '--min-row-height': `${minRowPx}px` } as React.CSSProperties}
      >
        {floors.map(floor => (
          <FloorRow
            key={floor.id}
            floor={floor}
            aboveGroundFloors={config.aboveGroundFloors}
          />
        ))}
      </div>
    </BuildingStateProvider>
  );
}
