import { useCallback, useMemo, useEffect, useRef } from 'react';
import type { BuildingConfig, DoorState, FireStatus } from '../../types';
import {
  DEFAULT_BUILDING_CONFIG,
  buildDisplayFloors,
  calcMinRowHeight,
} from '../../data/buildingData';
import { BuildingStateProvider, useBuildingState, type SmokeLevel } from '../../context/BuildingStateContext';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
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
// 화재 소화 효과 (BuildingStateProvider 내부)
// ─────────────────────────────────────────────

const NEXT_FIRE_STATE: Partial<Record<FireStatus, FireStatus>> = {
  'extension-peak': 'peak',
  'peak':           'seventy',
  'seventy':        'half',
  'half':           'initial',
};

function floorIdFromZoneKey(zoneKey: string): string | null {
  const m = zoneKey.match(/^(.+)-(center|right|stair)$/);
  return m ? m[1] : null;
}

function FireSuppressionEffect() {
  const { tokens }                                   = useTokens();
  const { fireStates, setFireStatus }                = useBuildingState();
  const { fireSuppressionConfig: cfg, aerialSuppressionConfig } = useSettings();

  const fireStatesRef  = useRef(fireStates);
  const tokensRef      = useRef(tokens);
  const cfgRef         = useRef(cfg);
  const aerialCfgRef   = useRef(aerialSuppressionConfig);
  const setFireRef     = useRef(setFireStatus);
  const ptsRef         = useRef<Record<string, number>>({});

  useEffect(() => { fireStatesRef.current = fireStates; }, [fireStates]);
  useEffect(() => { tokensRef.current    = tokens;      }, [tokens]);
  useEffect(() => { cfgRef.current       = cfg;         }, [cfg]);
  useEffect(() => { aerialCfgRef.current = aerialSuppressionConfig; }, [aerialSuppressionConfig]);
  useEffect(() => { setFireRef.current   = setFireStatus; }, [setFireStatus]);

  // 1초 간격으로 소화포인트 누적 → 임계치 초과 시 화재 상태 전환
  useEffect(() => {
    const lastFireRef: Record<string, FireStatus | null> = {};

    const interval = setInterval(() => {
      const config = cfgRef.current;
      const fires  = fireStatesRef.current;

      // 화재 상태 변경 감지 → 해당 층 포인트 초기화 (인터벌 내에서 처리해 경쟁조건 제거)
      for (const [fid, status] of Object.entries(fires)) {
        if (lastFireRef[fid] !== status) {
          ptsRef.current[fid] = 0;
          lastFireRef[fid] = status;
        }
      }

      const ptsPerFloor: Record<string, number> = {};
      for (const token of tokensRef.current) {
        // 진압대 방수
        if (token.sprayState && token.sprayState !== '0%') {
          const floorId = token.sprayTarget?.floorId
            ?? (token.zoneKey ? floorIdFromZoneKey(token.zoneKey) ?? undefined : undefined);
          if (floorId) {
            const mult = token.sprayState === '100%' ? 1 : 0.3;
            ptsPerFloor[floorId] = (ptsPerFloor[floorId] ?? 0) + mult * config.ptsPerSec;
          }
        }
        // 고가차/굴절차 방수 (화재 단계별 배율 적용)
        if (token.aerialSprayTarget) {
          const floorId = token.aerialSprayTarget.floorId;
          if (floorId) {
            const currentStatus = fires[floorId];
            const mult = currentStatus
              ? (aerialCfgRef.current.multipliers[currentStatus as keyof typeof aerialCfgRef.current.multipliers] ?? 0)
              : 0;
            ptsPerFloor[floorId] = (ptsPerFloor[floorId] ?? 0) + mult * config.ptsPerSec;
          }
        }
      }

      for (const [floorId, pts] of Object.entries(ptsPerFloor)) {
        const currentStatus = fires[floorId];
        if (!currentStatus) continue;
        const nextStatus = NEXT_FIRE_STATE[currentStatus];
        if (!nextStatus) continue;
        const threshold = config.thresholds[currentStatus as keyof typeof config.thresholds];
        if (threshold == null) continue;

        ptsRef.current[floorId] = (ptsRef.current[floorId] ?? 0) + pts;
        if (ptsRef.current[floorId] >= threshold) {
          ptsRef.current[floorId] = 0;
          lastFireRef[floorId] = nextStatus; // 다음 틱에서 이중 초기화 방지
          setFireRef.current(floorId, nextStatus);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return null;
}

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
      <FireSuppressionEffect />
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
