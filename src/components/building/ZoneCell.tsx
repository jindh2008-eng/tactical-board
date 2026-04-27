import { useState } from 'react';
import ReactDOM from 'react-dom';
import type { Zone, FloorId } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import './ZoneCell.css';

// ─────────────────────────────────────────────
// 화재단계 정의
// ─────────────────────────────────────────────

type FireStatus = 'extension-peak' | 'peak' | 'half' | 'initial' | 'complete';

interface StageMeta {
  label:     string;
  bgClass:   string;
  showFlame: boolean;
  darkFlame: boolean;
}

const FIRE_STAGE_META: Record<FireStatus, StageMeta> = {
  'extension-peak': { label: '최성기',     bgClass: 'zone-cell--fs-extension-peak', showFlame: true,  darkFlame: false },
  'peak':           { label: '연소확대',    bgClass: 'zone-cell--fs-peak',           showFlame: true,  darkFlame: false },
  'half':           { label: '진화율 50%', bgClass: 'zone-cell--fs-half',           showFlame: true,  darkFlame: false },
  'initial':        { label: '초진',       bgClass: 'zone-cell--fs-initial',        showFlame: true,  darkFlame: true  },
  'complete':       { label: '완진',       bgClass: 'zone-cell--fs-complete',       showFlame: false, darkFlame: false },
};

// ─────────────────────────────────────────────
// 화재 원형 선택 메뉴
// ─────────────────────────────────────────────

const FIRE_RADIAL_RADIUS = 58;

interface FireRadialItem {
  value:     FireStatus | null;
  label:     string;
  showFlame: boolean;
  darkFlame: boolean;
}

const FIRE_RADIAL_ITEMS: FireRadialItem[] = [
  { value: 'extension-peak', label: '최성기',  showFlame: true,  darkFlame: false },
  { value: 'peak',           label: '연소확대', showFlame: true,  darkFlame: false },
  { value: 'half',           label: '50%',    showFlame: true,  darkFlame: false },
  { value: 'initial',        label: '초진',    showFlame: true,  darkFlame: false },
  { value: 'complete',       label: '완진',    showFlame: false, darkFlame: false },
  { value: null,             label: ' - ',    showFlame: false, darkFlame: false },
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
              {item.showFlame && (
                <img
                  className={['fire-ri__flame', item.darkFlame ? 'fire-ri__flame--dark' : ''].filter(Boolean).join(' ')}
                  src="/fire.png"
                  alt=""
                  draggable={false}
                />
              )}
              <span className="fire-ri__label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}

// ─────────────────────────────────────────────
// 화염 이미지
// ─────────────────────────────────────────────

function FlameImage({ dark = false }: { dark?: boolean }) {
  return (
    <img
      className={['fire-bg-icon', dark ? 'fire-bg-icon--dark' : ''].filter(Boolean).join(' ')}
      src="/fire.png"
      alt=""
      aria-hidden="true"
    />
  );
}

// ─────────────────────────────────────────────
// 방화문 상태
// ─────────────────────────────────────────────
export type DoorState = 'open' | 'closed';

const WALL_X      = 98.75;
const WALL_STROKE = 2.5;
const DOOR_STROKE = 7;
const DOOR_TOP    = 65;
const DOOR_BOTTOM = 99;

interface Props {
  zone:             Zone;
  floorId:          FloorId;
  stairSmoke?:      boolean;
  stairSmokeEntry?: boolean;
  /**
   * true = 이 층은 복수 층이 묶인 요약 행.
   * 출동대 토큰은 그대로 드롭 가능하지만 구조대상자는 드롭·렌더 불가.
   */
  isRange?:         boolean;
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
  left:  '단위',
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

export function ZoneCell({ zone, floorId, stairSmoke = false, stairSmokeEntry = false, isRange = false }: Props) {
  const isStair  = zone.id === 'stair';
  const isRight  = zone.id === 'right';
  const hasFire  = !!zone.status.fire;
  const hasSmoke = !!zone.status.smoke;
  const hasState = hasFire || hasSmoke;

  const [fireStatus,    setFireStatus]    = useState<FireStatus | null>(null);
  const [doorState,     setDoorState]     = useState<DoorState>('open');
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
          onClick={() => setDoorState(d => d === 'open' ? 'closed' : 'open')}
          title={doorState === 'open' ? '방화문 열림 — 클릭하여 닫기' : '방화문 닫힘 — 클릭하여 열기'}
        >
          {doorState === 'open' ? 'Open' : 'Close'}
        </button>
      )}

      {isStair && stairSmoke     && <div className="zone-cell__stair-smoke" aria-label="연기 유입" />}
      {isStair && stairSmokeEntry && <span className="zone-cell__stair-smoke-entry" aria-label="연기 유입 시작">💨</span>}

      {defaultLabel && <span className="zone-cell__zone-label">{defaultLabel}</span>}

      {showIcons && hasFire  && <span className="zone-cell__icon" title="화염">🔥</span>}
      {showIcons && hasSmoke && <span className="zone-cell__icon" title="연기">💨</span>}

      {showFirePanel && (
        <div
          className="zone-cell__fire-panel"
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setFireRadialPos({ x: e.clientX, y: e.clientY }); }}
        >
          {stageMeta ? (
            <div className="fire-cell">
              {stageMeta.showFlame && <FlameImage dark={stageMeta.darkFlame} />}
              <span className="fire-label">{stageMeta.label}</span>
            </div>
          ) : null}
        </div>
      )}

      {fireRadialPos && (
        <FireRadialMenu
          cx={fireRadialPos.x}
          cy={fireRadialPos.y}
          current={fireStatus}
          onSelect={setFireStatus}
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
