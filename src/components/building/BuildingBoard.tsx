import { useCallback, useMemo, useEffect, useRef } from 'react';
import type { BuildingConfig, DoorState, FireStatus } from '../../types';
import {
  DEFAULT_BUILDING_CONFIG,
  buildDisplayFloors,
  calcMinRowHeight,
} from '../../data/buildingData';
import { BuildingStateProvider, useBuildingState, type SmokeLevel } from '../../context/BuildingStateContext';
import { useFireCommand } from '../../context/FireCommandContext';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
import { useEvents, type EventPos } from '../../context/EventContext';
import { resolveEventType } from '../../types/events';
import { useTraining } from '../../context/TrainingContext';
import { useVictims } from '../../context/VictimContext';
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
  'seventy':        '큰불잡음',
  'half':           '50%',
  'initial':        '초진',
  'complete':       '완진',
};

// FireCommandContext에 setFireStatus 등록 (BuildingStateProvider 내부)
function FireCommandRegistrar() {
  const { setFireStatus } = useBuildingState();
  const { register }      = useFireCommand();
  register(setFireStatus);
  return null;
}

// ─────────────────────────────────────────────
// 인명검색 페이즈 전환 감지 (BuildingStateProvider 내부)
// 화재층이 initial 도달 시 → 해당 층 2차 전환
// 모든 화재층 초진 → 비화재층 2차 전환
// ─────────────────────────────────────────────

const PHASE_POST_INITIAL = new Set<FireStatus>(['initial', 'complete']);

function SearchPhaseMonitor({ allFloorIds }: { allFloorIds: string[] }) {
  const { fireStates }                  = useBuildingState();
  const { transitionToSecondarySearch } = useVictims();
  const prevRef = useRef<Record<string, FireStatus | null> | null>(null);

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = { ...fireStates };
      return;
    }
    const prev = prevRef.current;
    const curr = fireStates;

    const newlyInitial: string[] = [];
    for (const [floorId, status] of Object.entries(curr)) {
      if (status !== null && PHASE_POST_INITIAL.has(status)) {
        const prevStatus = prev[floorId];
        if (!prevStatus || !PHASE_POST_INITIAL.has(prevStatus)) {
          newlyInitial.push(floorId);
        }
      }
    }

    if (newlyInitial.length > 0) {
      transitionToSecondarySearch(newlyInitial);

      // 모든 화재층이 초진 이후이면 → 비화재층도 2차 전환
      const fireFloorIds = Object.keys(curr).filter(id => curr[id] !== null);
      const allFireInitial =
        fireFloorIds.length > 0 &&
        fireFloorIds.every(id => PHASE_POST_INITIAL.has(curr[id]!));

      if (allFireInitial) {
        const fireSet    = new Set(fireFloorIds);
        const noFireIds  = allFloorIds.filter(id => !fireSet.has(id));
        if (noFireIds.length > 0) transitionToSecondarySearch(noFireIds);
      }
    }

    prevRef.current = { ...curr };
  }, [fireStates, transitionToSecondarySearch, allFloorIds]);

  return null;
}

// ─────────────────────────────────────────────
// 화재 소화 효과 (BuildingStateProvider 내부)
// ─────────────────────────────────────────────

// 연소확대만 포인트 기반 전환, peak/seventy/half는 연속 % 시스템 사용
const PERCENTAGE_FIRE_STATUSES = new Set<FireStatus>(['peak', 'seventy', 'half']);

function floorIdFromZoneKey(zoneKey: string): string | null {
  const m = zoneKey.match(/^(.+)-(center|right|stair)$/);
  return m ? m[1] : null;
}

function FireSuppressionEffect() {
  const { tokens }                                             = useTokens();
  const { fireStates, setFireStatus, setFirePercentage }      = useBuildingState();
  const { fireSuppressionConfig: cfg, aerialSuppressionConfig } = useSettings();
  const { status: trainingStatus }                             = useTraining();

  const fireStatesRef        = useRef(fireStates);
  const tokensRef            = useRef(tokens);
  const cfgRef               = useRef(cfg);
  const aerialCfgRef         = useRef(aerialSuppressionConfig);
  const setFireRef           = useRef(setFireStatus);
  const setFirePercentageRef = useRef(setFirePercentage);
  const trainingRef          = useRef(trainingStatus);
  const ptsRef               = useRef<Record<string, number>>({});
  const pctRef               = useRef<Record<string, number>>({});

  useEffect(() => { fireStatesRef.current        = fireStates;          }, [fireStates]);
  useEffect(() => { tokensRef.current            = tokens;              }, [tokens]);
  useEffect(() => { cfgRef.current               = cfg;                 }, [cfg]);
  useEffect(() => { aerialCfgRef.current         = aerialSuppressionConfig; }, [aerialSuppressionConfig]);
  useEffect(() => { setFireRef.current           = setFireStatus;       }, [setFireStatus]);
  useEffect(() => { setFirePercentageRef.current = setFirePercentage;   }, [setFirePercentage]);
  useEffect(() => { trainingRef.current          = trainingStatus;      }, [trainingStatus]);

  // 1초 간격: 연소확대→최성기는 포인트 누적, 최성기/70%/50%는 연속 % 감소
  useEffect(() => {
    const lastFireRef: Record<string, FireStatus | null> = {};

    const interval = setInterval(() => {
      if (trainingRef.current !== 'running') return;

      const config = cfgRef.current;
      const fires  = fireStatesRef.current;

      // 화재 상태 변경 감지 → pts/pct 동기화
      for (const [fid, status] of Object.entries(fires)) {
        if (lastFireRef[fid] !== status) {
          ptsRef.current[fid] = 0;
          lastFireRef[fid] = status;
          if (status === 'peak')         pctRef.current[fid] = 100;
          else if (status === 'seventy') pctRef.current[fid] = 70;
          else if (status === 'half')    pctRef.current[fid] = 50;
          else                           delete pctRef.current[fid];
        }
      }

      const ptsPerFloor: Record<string, number> = {};
      for (const token of tokensRef.current) {
        if (token.sprayState && token.sprayState !== '0%') {
          const floorId = token.sprayTarget?.floorId
            ?? (token.zoneKey ? floorIdFromZoneKey(token.zoneKey) ?? undefined : undefined);
          if (floorId) {
            const mult = token.sprayState === '100%' ? 1 : 0.3;
            ptsPerFloor[floorId] = (ptsPerFloor[floorId] ?? 0) + mult * config.ptsPerSec;
          }
        }
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

      for (const [floorId, ptsThisSec] of Object.entries(ptsPerFloor)) {
        const currentStatus = fires[floorId];
        if (!currentStatus) continue;

        if (currentStatus === 'extension-peak') {
          // 포인트 누적 → 최성기 전환 (기존 방식)
          const threshold = config.thresholds['extension-peak'];
          ptsRef.current[floorId] = (ptsRef.current[floorId] ?? 0) + ptsThisSec;
          if (ptsRef.current[floorId] >= threshold) {
            ptsRef.current[floorId] = 0;
            lastFireRef[floorId] = 'peak';
            setFireRef.current(floorId, 'peak');
          }
        } else if (PERCENTAGE_FIRE_STATUSES.has(currentStatus)) {
          // 연속 % 감소 방식
          let ratePctPerPt: number;
          let boundaryPct: number;
          let nextSt: FireStatus;

          if (currentStatus === 'peak') {
            ratePctPerPt = 30 / config.thresholds.peak;
            boundaryPct  = 70;
            nextSt       = 'seventy';
          } else if (currentStatus === 'seventy') {
            ratePctPerPt = 20 / config.thresholds.seventy;
            boundaryPct  = 50;
            nextSt       = 'half';
          } else {
            ratePctPerPt = 50 / config.thresholds.half;
            boundaryPct  = 0;
            nextSt       = 'initial';
          }

          const curPct = pctRef.current[floorId] ?? (currentStatus === 'peak' ? 100 : currentStatus === 'seventy' ? 70 : 50);
          const newPct = curPct - ptsThisSec * ratePctPerPt;

          if (newPct <= boundaryPct) {
            lastFireRef[floorId] = nextSt;
            setFireRef.current(floorId, nextSt);
          } else {
            pctRef.current[floorId] = newPct;
            setFirePercentageRef.current(floorId, newPct);
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return null;
}

// ─────────────────────────────────────────────
// 이벤트 화재 소화 효과
// ─────────────────────────────────────────────

// 연소확대 포인트 임계치 (포인트 누적 방식 유지)
const EVENT_연소확대_THRESHOLD = 60;

// % 감소 구간별 임계치 (감소 속도 계산용)
const EVENT_PCT_THRESHOLDS = {
  peak:    120,  // 100%→70% 구간
  seventy:  90,  // 70%→50% 구간
  half:     60,  // 50%→0% 구간
} as const;

// pos.x, pos.y 는 보드 대비 0~1 정규화된 토큰 좌상단 — 중심점으로 보정해 층 경계 오탐 방지
const EVENT_TOKEN_HALF_BASE = 27; // 기준 화면에서의 보정값

// 건물 내부 → data-floor-id, A/B/C/D면 → data-zone-key("face-*") 반환
function getEventLocationId(pos: EventPos): string | null {
  const board = document.getElementById('tactical-area');
  if (!board) return null;
  const rect = board.getBoundingClientRect();

  // 토큰이 --ui-scale 로 줄어들면 중심 보정값도 함께 줄어야 층 판정이 어긋나지 않는다
  const uiScale = parseFloat(getComputedStyle(board).getPropertyValue('--ui-scale')) || 1;
  const half = EVENT_TOKEN_HALF_BASE * uiScale;

  const cx = rect.left + pos.x * rect.width  + half;
  const cy = rect.top  + pos.y * rect.height + half;
  const elements = document.elementsFromPoint(cx, cy);
  for (const el of elements) {
    let cur: Element | null = el;
    while (cur) {
      const fid = cur.getAttribute('data-floor-id');
      if (fid) return fid;
      const zk = cur.getAttribute('data-zone-key');
      if (zk?.startsWith('face-')) return zk;
      cur = cur.parentElement;
    }
  }
  return null;
}

function EventFireSuppressionEffect() {
  const { enabledEvents, positions, statuses, setEventStatus, setFirePercentage } = useEvents();
  const { tokens }                                                                  = useTokens();
  const { fireSuppressionConfig: cfg }                                              = useSettings();
  const { status: trainingStatus }                                                  = useTraining();

  const tokensRef            = useRef(tokens);
  const statusesRef          = useRef(statuses);
  const positionsRef         = useRef(positions);
  const enabledRef           = useRef(enabledEvents);
  const cfgRef               = useRef(cfg);
  const setStatusRef         = useRef(setEventStatus);
  const setFirePercentageRef = useRef(setFirePercentage);
  const trainingRef          = useRef(trainingStatus);
  const ptsRef               = useRef<Record<string, number>>({});
  const pctRef               = useRef<Record<string, number>>({});

  useEffect(() => { tokensRef.current            = tokens;            }, [tokens]);
  useEffect(() => { statusesRef.current          = statuses;          }, [statuses]);
  useEffect(() => { positionsRef.current         = positions;         }, [positions]);
  useEffect(() => { enabledRef.current           = enabledEvents;     }, [enabledEvents]);
  useEffect(() => { cfgRef.current               = cfg;               }, [cfg]);
  useEffect(() => { setStatusRef.current         = setEventStatus;    }, [setEventStatus]);
  useEffect(() => { setFirePercentageRef.current = setFirePercentage; }, [setFirePercentage]);
  useEffect(() => { trainingRef.current          = trainingStatus;    }, [trainingStatus]);

  useEffect(() => {
    const lastStatusRef: Record<string, string> = {};

    const interval = setInterval(() => {
      if (trainingRef.current !== 'running') return;

      const config = cfgRef.current;
      const evts   = enabledRef.current;
      const sts    = statusesRef.current;
      const pos    = positionsRef.current;

      // 상태 변경 감지 → pts/pct 동기화
      for (const ev of evts) {
        const s = sts[ev.id];
        if (lastStatusRef[ev.id] !== s) {
          ptsRef.current[ev.id] = 0;
          lastStatusRef[ev.id]  = s;
          if (s === '최성기' || s === '화재') pctRef.current[ev.id] = 100;
          else if (s === '큰불잡음')             pctRef.current[ev.id] = 70;
          else if (s === '50%')               pctRef.current[ev.id] = 50;
          else                                delete pctRef.current[ev.id];
        }
      }

      // 위치 키별 소화포인트 계산
      const ptsPerLocation: Record<string, number> = {};
      for (const token of tokensRef.current) {
        if (token.sprayState && token.sprayState !== '0%') {
          const locId = token.sprayTarget?.floorId
            ?? (token.zoneKey?.startsWith('face-') ? token.zoneKey : undefined)
            ?? (token.zoneKey ? floorIdFromZoneKey(token.zoneKey) ?? undefined : undefined);
          if (locId) {
            const mult = token.sprayState === '100%' ? 1 : 0.3;
            ptsPerLocation[locId] = (ptsPerLocation[locId] ?? 0) + mult * config.ptsPerSec;
          }
        }
        if (token.aerialSprayTarget?.floorId) {
          const locId = token.aerialSprayTarget.floorId;
          ptsPerLocation[locId] = (ptsPerLocation[locId] ?? 0) + config.ptsPerSec;
        }
      }

      for (const ev of evts) {
        const status = sts[ev.id];
        if (!status || status === '-') continue;

        const evPos = pos[ev.id];
        if (!evPos) continue;
        const locId = getEventLocationId(evPos);
        if (!locId) continue;
        const ptsThisSec = ptsPerLocation[locId];
        if (!ptsThisSec) continue;

        const evType = resolveEventType(ev);

        if (status === '연소확대') {
          // 포인트 누적 → 최성기 전환
          ptsRef.current[ev.id] = (ptsRef.current[ev.id] ?? 0) + ptsThisSec;
          if (ptsRef.current[ev.id] >= EVENT_연소확대_THRESHOLD) {
            ptsRef.current[ev.id] = 0;
            lastStatusRef[ev.id]  = '최성기';
            setStatusRef.current(ev.id, '최성기');
          }
        } else if (evType === 'fire' && (status === '최성기' || status === '큰불잡음' || status === '50%')) {
          // 화재 이벤트 연속 % 감소
          let ratePctPerPt: number;
          let boundaryPct: number;
          let nextSt: string;
          if (status === '최성기') {
            ratePctPerPt = 30 / EVENT_PCT_THRESHOLDS.peak;
            boundaryPct  = 70;
            nextSt       = '큰불잡음';
          } else if (status === '큰불잡음') {
            ratePctPerPt = 20 / EVENT_PCT_THRESHOLDS.seventy;
            boundaryPct  = 50;
            nextSt       = '50%';
          } else {
            ratePctPerPt = 50 / EVENT_PCT_THRESHOLDS.half;
            boundaryPct  = 0;
            nextSt       = '초진';
          }
          const curPct = pctRef.current[ev.id] ?? (status === '최성기' ? 100 : status === '큰불잡음' ? 70 : 50);
          const newPct = curPct - ptsThisSec * ratePctPerPt;
          if (newPct <= boundaryPct) {
            lastStatusRef[ev.id] = nextSt;
            setStatusRef.current(ev.id, nextSt);
          } else {
            pctRef.current[ev.id] = newPct;
            setFirePercentageRef.current(ev.id, newPct);
          }
        } else if ((evType === 'gas' || evType === 'electric') && status === '화재') {
          // 가스/전기 화재: 3구간 동적 비율로 100%→0% 감소
          const curPct = pctRef.current[ev.id] ?? 100;
          let ratePctPerPt: number;
          if (curPct > 70)      ratePctPerPt = 30 / EVENT_PCT_THRESHOLDS.peak;
          else if (curPct > 50) ratePctPerPt = 20 / EVENT_PCT_THRESHOLDS.seventy;
          else                  ratePctPerPt = 50 / EVENT_PCT_THRESHOLDS.half;

          const newPct = curPct - ptsThisSec * ratePctPerPt;
          if (newPct <= 0) {
            lastStatusRef[ev.id] = '-';
            setStatusRef.current(ev.id, '-');
          } else {
            pctRef.current[ev.id] = newPct;
            setFirePercentageRef.current(ev.id, newPct);
          }
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
  config?:            BuildingConfig;
  fireFloor?:         number;
  initialFireStatus?: FireStatus | null;
  extraFireFloors?:   import('../../types/settings').ExtraFireFloor[];
}

export function BuildingBoard({
  config             = DEFAULT_BUILDING_CONFIG,
  fireFloor          = 1,
  initialFireStatus  = null,
  extraFireFloors    = [],
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
      extraFireFloors={extraFireFloors}
      aboveGroundFloors={config.aboveGroundFloors}
      onFireChange={handleFireChange}
      onDoorChange={handleDoorChange}
      onSmokeChange={handleSmokeChange}
    >
      <FireCommandRegistrar />
      <FireSuppressionEffect />
      <EventFireSuppressionEffect />
      <SearchPhaseMonitor allFloorIds={allFloorIds} />
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
