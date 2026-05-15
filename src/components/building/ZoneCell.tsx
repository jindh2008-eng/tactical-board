import { useState } from 'react';
import ReactDOM from 'react-dom';
import type { Zone, FloorId, DoorState, FireStatus } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { useBuildingState } from '../../context/BuildingStateContext';
import type { SmokeLevel } from '../../context/BuildingStateContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import { FlameIcon } from '../shared/FlameIcon';
import './ZoneCell.css';

// ─────────────────────────────────────────────
// 화재단계 정의
// ─────────────────────────────────────────────

interface StageMeta {
  label:   string;
  bgClass: string;
}

const FIRE_STAGE_META: Record<FireStatus, StageMeta> = {
  'extension-peak': { label: '연소확대', bgClass: 'zone-cell--fs-extension-peak' },
  'peak':           { label: '최성기',   bgClass: 'zone-cell--fs-peak'           },
  'seventy':        { label: '큰불잡음', bgClass: 'zone-cell--fs-seventy'         },
  'half':           { label: '50%',     bgClass: 'zone-cell--fs-half'           },
  'initial':        { label: '초진',    bgClass: 'zone-cell--fs-initial'        },
  'complete':       { label: '완진',    bgClass: 'zone-cell--fs-complete'       },
};

// ─────────────────────────────────────────────
// 화재 원형 선택 메뉴
// ─────────────────────────────────────────────

const FIRE_RADIAL_RADIUS = 64;

interface FireRadialItem {
  value: FireStatus | null;
  label: string;
}

const FIRE_RADIAL_ITEMS: FireRadialItem[] = [
  { value: 'extension-peak', label: '연소확대' },
  { value: 'peak',           label: '최성기'  },
  { value: 'seventy',        label: '큰불잡음' },
  { value: 'half',           label: '50%'    },
  { value: 'initial',        label: '초진'   },
  { value: 'complete',       label: '완진'   },
  { value: null,             label: ' - '   },
];

function FireRadialMenu({ cx, cy, current, onSelect, onClose }: {
  cx:       number;
  cy:       number;
  current:  FireStatus | null;
  onSelect: (v: FireStatus | null) => void;
  onClose:  () => void;
}) {
  return ReactDOM.createPortal(
    <>
      <div className="radial-backdrop" onMouseDown={onClose} />
      <div className="radial-menu" style={{ left: cx, top: cy }}>
        {FIRE_RADIAL_ITEMS.map((item, i) => {
          const angleDeg = i * (360 / FIRE_RADIAL_ITEMS.length) - 90;
          const angleRad = angleDeg * (Math.PI / 180);
          const rx = Math.round(FIRE_RADIAL_RADIUS * Math.cos(angleRad));
          const ry = Math.round(FIRE_RADIAL_RADIUS * Math.sin(angleRad));
          const key = item.value ?? 'default';
          const isActive = current === item.value;
          return (
            <button
              key={key}
              className={[
                'fire-radial-item',
                `fire-radial-item--${key}`,
                isActive ? 'fire-radial-item--active' : '',
              ].filter(Boolean).join(' ')}
              style={{ transform: `translate(calc(-50% + ${rx}px), calc(-50% + ${ry}px))` }}
              onMouseDown={e => { e.stopPropagation(); onSelect(item.value); onClose(); }}
            >
              {item.value && <FlameIcon status={item.value} size={22} />}
              <span className="fire-ri__label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}


const WALL_X      = 98.75;
const WALL_STROKE = 2.5;
const DOOR_STROKE = 7;
const DOOR_TOP    = 65;
const DOOR_BOTTOM = 99;

interface Props {
  zone:       Zone;
  floorId:    FloorId;
  smokeLevel?: SmokeLevel;
  /**
   * true = 이 층은 복수 층이 묶인 요약 행.
   * 출동대 토큰은 그대로 드롭 가능하지만 구조대상자는 드롭·렌더 불가.
   */
  isRange?:   boolean;
}

// ─────────────────────────────────────────────
// 계단실 도면 SVG
// ─────────────────────────────────────────────
function StairDiagram({
  doorState  = 'open',
  showStairs = true,
}: {
  doorState?:  DoorState;
  showStairs?: boolean;
}) {
  return (
    <svg
      className="stair-diagram"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="100" height="100" fill="#f2efe7" />

      {showStairs && (
        <>
          <path
            d="M100 98 L85 98 L85 90 L70 90 L70 80 L55 80 L55 70 L40 70 L40 60 L25 60 L25 50 L0 50"
            stroke="#555" strokeWidth="1.2" fill="none"
            strokeLinejoin="miter" strokeLinecap="square"
          />
          <path
            d="M25 50 L25 40 L40 40 L40 30 L55 30 L55 20 L70 20 L70 10 L85 10 L85 2 L100 2"
            stroke="#555" strokeWidth="1.2" fill="none"
            strokeLinejoin="miter" strokeLinecap="square"
          />
        </>
      )}

      <line x1={WALL_X} y1={0}         x2={WALL_X} y2={DOOR_TOP}    stroke="#4e4a42" strokeWidth={WALL_STROKE} strokeLinecap="square" />
      <line x1={WALL_X} y1={DOOR_BOTTOM} x2={WALL_X} y2={100}       stroke="#4e4a42" strokeWidth={WALL_STROKE} strokeLinecap="square" />

      {doorState === 'closed' && (
        <line x1={WALL_X} y1={DOOR_TOP} x2={WALL_X} y2={DOOR_BOTTOM}
          stroke="#4e4a42" strokeWidth={DOOR_STROKE} strokeLinecap="butt" />
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────
// 구역 기본 라벨
// ─────────────────────────────────────────────
const ZONE_DEFAULT_LABELS: Partial<Record<string, string>> = {
  right: '화재',
};

// ─────────────────────────────────────────────
// 드롭 위치 보정 상수
//
// 좌표계: "커서 위치 = 토큰 중심"
//   - 저장 좌표: 토큰 중심의 구역 내 상대 px
//   - 렌더: position:absolute + left/top (중심) + translate(-50%,-50%)
//
// DROP_NUDGE_X/Y: 시각적 밀림이 느껴질 때 px 단위로 조절 (기본 0)
// ─────────────────────────────────────────────
const DROP_NUDGE_X = 0;  // 양수 = 오른쪽, 음수 = 왼쪽
const DROP_NUDGE_Y = 0;  // 양수 = 아래,   음수 = 위

// ─────────────────────────────────────────────
// ZoneCell
// ─────────────────────────────────────────────

export function ZoneCell({ zone, floorId, smokeLevel = 'none', isRange = false }: Props) {
  const isStair  = zone.id === 'stair';
  const isRight  = zone.id === 'right';
  const hasFire  = !!zone.status.fire;
  const hasSmoke = !!zone.status.smoke;
  const hasState = hasFire || hasSmoke;

  const { doorStates, fireStates, firePercentages, setDoorState: ctxSetDoor, setFireStatus: ctxSetFire } = useBuildingState();
  const doorState   = doorStates[floorId]     ?? (floorId === 'RF' ? 'closed' : 'open');
  const fireStatus  = fireStates[floorId]     ?? null;
  const firePct     = firePercentages[floorId];

  const [isDragOver,    setIsDragOver]    = useState(false);
  const [fireRadialPos, setFireRadialPos] = useState<{ x: number; y: number } | null>(null);

  // 출동대 토큰
  const { tokens, positions, moveToken } = useTokens();
  // 구조대상자 토큰
  const { victims, victimPositions, moveVictim } = useVictims();

  const isDropTarget       = zone.acceptsTokens && !isRight;
  // 요약 행(isRange)에는 구조대상자 배치 불가 — 출동대 토큰만 허용
  const isVictimDropTarget = isDropTarget && !isRange;
  const zoneKey            = `${floorId}-${zone.id}`;
  const zoneTokens         = isDropTarget        ? tokens.filter(t => t.zoneKey === zoneKey)  : [];
  const zoneVictims        = isVictimDropTarget  ? victims.filter(v => v.zoneKey === zoneKey) : [];

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!isDropTarget) return;
    e.preventDefault();
    // dragover 중 getData()는 보안상 불가능 → types 배열로 victimId 키 존재 판별
    const hasVictim = e.dataTransfer.types.includes('victimid');
    if (isRange && hasVictim) {
      // 요약 행에 구조대상자를 드래그 → 거부 커서
      e.dataTransfer.dropEffect = 'none';
    } else {
      e.dataTransfer.dropEffect = 'move';
    }
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (!isDropTarget) return;

    const tokenId  = e.dataTransfer.getData('tokenId');
    const victimId = e.dataTransfer.getData('victimId');
    if (!tokenId && !victimId) return;

    // ── 좌표: 커서 위치 = 토큰 중심, 구역 기준 상대좌표 ──────
    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) + DROP_NUDGE_X;
    const rawY = (e.clientY - rect.top)  + DROP_NUDGE_Y;

    const tokenW = parseFloat(e.dataTransfer.getData('tokenW')) || 40;
    const tokenH = parseFloat(e.dataTransfer.getData('tokenH')) || 14;
    const x = Math.max(tokenW / 2, Math.min(rect.width  - tokenW / 2, rawX));
    const y = Math.max(tokenH / 2, Math.min(rect.height - tokenH / 2, rawY));

    if (tokenId)                      moveToken(tokenId,   zoneKey, { x, y });
    if (victimId && !isRange)         moveVictim(victimId, zoneKey, { x, y });
  }

  // 옥상(RF)에는 화재상황 패널 표시하지 않음
  const showFirePanel = isRight && floorId !== 'RF';
  const showIcons     = !isStair && hasState && !(isRight && fireStatus !== null);
  const stageMeta     = fireStatus ? FIRE_STAGE_META[fireStatus] : null;
  const defaultLabel  = !hasState && fireStatus === null && zoneTokens.length === 0 && zoneVictims.length === 0
    ? ZONE_DEFAULT_LABELS[zone.id]
    : undefined;

  return (
    <div
      className={[
        'zone-cell',
        `zone-cell--${zone.id}`,
        hasFire  ? 'zone-cell--fire'  : '',
        hasSmoke ? 'zone-cell--smoke' : '',
        stageMeta?.bgClass ?? '',
        isDragOver && isDropTarget ? 'drop-target--active' : '',
      ].filter(Boolean).join(' ')}
      data-zone-key={zoneKey}
      data-floor={floorId}
      data-zone={zone.id}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isStair && <StairDiagram doorState={doorState} showStairs={floorId !== 'RF'} />}

      {isStair && (
        <button
          className={['stair-door-toggle', doorState === 'closed' ? 'stair-door-toggle--closed' : 'stair-door-toggle--open'].join(' ')}
          onClick={() => ctxSetDoor(floorId, doorState === 'open' ? 'closed' : 'open')}
          title={doorState === 'open' ? '방화문 열림 — 클릭하여 닫기' : '방화문 닫힘 — 클릭하여 열기'}
        >
          {doorState === 'open' ? 'Open' : 'Close'}
        </button>
      )}

      {isStair && smokeLevel !== 'none' && (
        <div
          className={[
            'zone-cell__stair-smoke',
            smokeLevel === 'weak' ? 'zone-cell__stair-smoke--weak' : '',
          ].filter(Boolean).join(' ')}
          aria-label="연기 유입"
        />
      )}

      {defaultLabel && <span className="zone-cell__zone-label">{defaultLabel}</span>}

      {showIcons && hasFire  && <span className="zone-cell__icon" title="화염">🔥</span>}
      {showIcons && hasSmoke && <span className="zone-cell__icon" title="연기">💨</span>}

      {showFirePanel && (
        <div
          className="zone-cell__fire-panel"
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setFireRadialPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); }}
        >
          {stageMeta && fireStatus ? (
            <div className="fire-cell">
              <FlameIcon status={fireStatus} className="fire-bg-icon" />
              <span className="fire-label">
                {firePct != null ? `${Math.round(firePct)}%` : stageMeta.label}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {fireRadialPos && (
        <FireRadialMenu
          cx={fireRadialPos.x}
          cy={fireRadialPos.y}
          current={fireStatus}
          onSelect={v => ctxSetFire(floorId, v)}
          onClose={() => setFireRadialPos(null)}
        />
      )}

      {/* 배치된 출동대 토큰 */}
      {isDropTarget && zoneTokens.map(token => (
        <TokenCard key={token.id} token={token} absPos={positions[token.id]} />
      ))}

      {/* 배치된 구조대상자 토큰 */}
      {isDropTarget && zoneVictims.map(victim => (
        <VictimCard key={victim.id} victim={victim} absPos={victimPositions[victim.id]} />
      ))}
    </div>
  );
}
