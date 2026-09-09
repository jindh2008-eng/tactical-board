import { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import type { UnitToken } from '../../types';
import { useTokens } from '../../context/TokenContext';
import type { TokenPos } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { victimDisplayName } from '../../utils/logLabels';
import { VictimCard } from '../shared/VictimCard';
import { useHandleDrag } from '../../hooks/useHandleDrag';
import { resolveSprayTarget } from '../../utils/sprayTarget';
import '../shared/NozzleHandle.css';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useActionMode } from '../../context/ActionModeContext';
import {
  resolveAerialDeployFloor, maxDeployHeight, overHeightMessage, isAerialRetractZone,
} from '../../utils/aerialDeploy';
import { canStartSpray, sprayBlockMessage } from '../../utils/waterSupply';
import { showBoardNotice, noticeAnchorOf } from '../../utils/boardNotice';
import { useRoleRelease } from '../../context/RoleReleaseContext';
import { TokenCard } from '../shared/TokenCard';
import { useWaterLevel } from '../../context/WaterLevelContext';
import './AerialOverlay.css';
import { stageBounds, stagePortalTarget } from '../../utils/stagePortal';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const AERIAL_TYPES = new Set(['aerial', 'ladder']);
const MONITOR_TYPES = new Set(['pump', 'water_tank']);

// 방수 팬 반각도 (도) — 진압대와 동일한 22°
const FAN_HALF_DEG = 22;
// 방수 팬 최대 끝단 반경 (px) — 진압대(~8-9px)보다 약간 크게
const FAN_MAX_R = 14;

// 끝단 사각형 크기
/*
 * 바스켓(끝단) 크기 — **출동대 토큰 세로에 맞춘다.**
 *
 * 고정 px 로 두면 안 된다. 이 오버레이는 `position: fixed` 라 스테이지 배율
 * **밖**의 화면 px 로 그려지는데, 토큰은 배율을 타기 때문이다. 14px 로 박아
 * 두면 훈련장 PC(배율 0.975)에서는 토큰 35px 옆에 14px 바스켓이 붙는다.
 * 매 프레임 토큰 높이를 재서(getEndpoints.th) 그 값을 쓰면 배율이 얼마든
 * 나란히 보인다.
 *
 * 가로는 세로의 0.93 배 — 거의 정사각이다. 1.4 배(판을 가림) → 1/3 로 줄였다가
 * (너무 작음) 그 두 배로 맞췄다. 세로는 그대로 토큰 높이를 따른다.
 * 판정 사각형은 사방 7px 씩 더 크다. 보이는 것만 키우면 겨누기 어렵고,
 * 판정만 키우면 놓을 곳이 안 보인다(방수선의 `.aerial-fan-hit` 과 같은 수법).
 */
const TIP_RATIO   = 2.8 / 3;
const TIP_HIT_PAD = 7;
/** 토큰 높이를 못 잴 때의 하한 */
const TIP_MIN_H = 14;
/* ── 지면에 내린 활동대를 세우는 자리 (캔버스 px, 실측 2026-09-09) ──
   차량 우측에 세우는데, **사다리 핸들을 지나서** 세워야 한다. 전개가 풀리는
   순간 그 핸들이 다시 나타나고(LadderHandle) 하필 차량 우측 세로 중앙에
   붙어서, 글자대로 「우측」에 놓으면 활동대가 핸들을 덮어 사다리를 다시 펼
   수 없게 된다.

   핸들은 차량 우측 +4 에서 20px — 그래서 24px 을 비우고 간격을 두고 세운다. */
/** 사다리 핸들이 차지하는 폭 (간격 4 + 핸들 20) */
const LADDER_HANDLE_SPAN = 24;
/** 핸들과 활동대 사이 간격 */
const RIDER_GAP    = 6;
/** 활동대 토큰 대략 반폭 — 상황판 토큰 81.5px 기준 */
const RIDER_HALF_W = 41;

/** 구역 안에 붙여 둔다 — 우측 끝에 세운 차라면 활동대가 구역을 넘어간다 */
const clamp01 = (v: number) => Math.max(0.03, Math.min(0.97, v));

/** 바스켓 아랫변에서 방수포 중심까지 — 사각형에 겹치지 않게 내린다 */
const NOZZLE_DROP = 10;

// 사다리 레일 반폭 (px) — 레일 간격 = RAIL_HALF * 2
const RAIL_HALF    = 5;
// 가로대 간격 (px)
const RUNG_SPACING = 10;

// ─────────────────────────────────────────────
// 좌표 계산
// ─────────────────────────────────────────────

interface Endpoints {
  ox: number; oy: number;   // 차량 토큰 우측 상단 모서리
  tx: number; ty: number;   // 저장된 클릭 지점 (screen 좌표)
  th: number;               // 차량 토큰 세로 — 바스켓 크기의 기준
}

function getEndpoints(
  tokenEl: Element,
  target: { x: number; y: number },
): Endpoints | null {
  const tokenRect = tokenEl.getBoundingClientRect();
  const board     = document.getElementById('tactical-area');
  const boardRect = board?.getBoundingClientRect();
  if (!boardRect) return null;

  const ox = tokenRect.right;
  const oy = tokenRect.top;
  const tx = boardRect.left + target.x * boardRect.width;
  const ty = boardRect.top  + target.y * boardRect.height;

  return { ox, oy, tx, ty, th: tokenRect.height };
}

// 굴절차 관절점 계산
// - 관절 위치: 전체 거리의 80% 지점
// - 두 선분 사이 각도: 약 165° (수직 offset = d × 0.0447)
const ELBOW_T       = 0.8;    // 관절 위치 비율 (OT 방향 80%)
const ELBOW_H_RATIO = 0.0447; // 수직 offset / 거리 (165° 각도에 해당)

function computeElbow(
  ox: number, oy: number,
  tx: number, ty: number,
): { ex: number; ey: number } {
  const dx = tx - ox;
  const dy = ty - oy;
  const d  = Math.sqrt(dx * dx + dy * dy);
  if (d < 4) return { ex: ox, ey: oy };

  // 관절 기준점: OT 방향으로 80% 지점
  const bx = ox + ELBOW_T * dx;
  const by = oy + ELBOW_T * dy;

  // 수직 방향 offset
  const h  = d * ELBOW_H_RATIO;
  const px = -dy / d;
  const py =  dx / d;

  const e1 = { ex: bx + h * px, ey: by + h * py };
  const e2 = { ex: bx - h * px, ey: by - h * py };

  const e1ok = e1.ey > ty;
  const e2ok = e2.ey > ty;

  if (e1ok && e2ok) return e1.ey < e2.ey ? e1 : e2;
  if (e1ok) return e1;
  if (e2ok) return e2;
  return e1.ey > e2.ey ? e1 : e2;
}

// 펌프차/물탱크차 방수포 원점: 방수포 핸들(우측 상단) → 화점.
// 핸들이 숨은 상태(대기 구역 등)면 토큰 우측 중앙으로 폴백한다.
function getMonitorOrigin(
  tokenEl: Element,
  target: { x: number; y: number },
): Endpoints | null {
  const board     = document.getElementById('tactical-area');
  const boardRect = board?.getBoundingClientRect();
  if (!boardRect) return null;

  const handleEl  = tokenEl.querySelector('.nozzle-handle');
  const tokenRect = tokenEl.getBoundingClientRect();
  const originRect = handleEl?.getBoundingClientRect();

  const ox = originRect ? originRect.left + originRect.width  / 2 : tokenRect.right;
  const oy = originRect ? originRect.top  + originRect.height / 2 : tokenRect.top + tokenRect.height / 2;
  const tx = boardRect.left + target.x * boardRect.width;
  const ty = boardRect.top  + target.y * boardRect.height;

  return { ox, oy, tx, ty, th: tokenRect.height };
}

// 방수 팬 SVG path — 끝단(ox,oy)에서 화점(tx,ty)으로 퍼지는 원뿔
function buildFanPath(
  ox: number, oy: number,
  tx: number, ty: number,
): string {
  const dx  = tx - ox;
  const dy  = ty - oy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 4) return '';

  const halfRad   = FAN_HALF_DEG * Math.PI / 180;
  const halfWidth = Math.min(len * Math.tan(halfRad), FAN_MAX_R);

  // 화점에서의 수직 방향 단위벡터
  const px = -dy / len;
  const py =  dx / len;

  const lx = tx + halfWidth * px;
  const ly = ty + halfWidth * py;
  const rx = tx - halfWidth * px;
  const ry = ty - halfWidth * py;

  const arcR = Math.max(1, halfWidth);
  return `M ${ox} ${oy} L ${lx} ${ly} A ${arcR} ${arcR} 0 0 0 ${rx} ${ry} Z`;
}

// 사다리 레일·가로대 SVG path 생성 (단일 구간)
function buildLadderSegment(
  ox: number, oy: number,
  tx: number, ty: number,
): { rails: string; rungs: string } {
  const dx  = tx - ox;
  const dy  = ty - oy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 4) return { rails: '', rungs: '' };

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;   // 수직 단위벡터
  const py =  ux;

  // 좌·우 레일
  const lx0 = ox + px * RAIL_HALF, ly0 = oy + py * RAIL_HALF;
  const lx1 = tx + px * RAIL_HALF, ly1 = ty + py * RAIL_HALF;
  const rx0 = ox - px * RAIL_HALF, ry0 = oy - py * RAIL_HALF;
  const rx1 = tx - px * RAIL_HALF, ry1 = ty - py * RAIL_HALF;
  const rails = `M ${lx0} ${ly0} L ${lx1} ${ly1} M ${rx0} ${ry0} L ${rx1} ${ry1}`;

  // 가로대
  let rungs = '';
  const count = Math.floor(len / RUNG_SPACING);
  for (let i = 1; i <= count; i++) {
    const d  = i * RUNG_SPACING;
    const cx = ox + ux * d;
    const cy = oy + uy * d;
    rungs += `M ${cx + px * RAIL_HALF} ${cy + py * RAIL_HALF} L ${cx - px * RAIL_HALF} ${cy - py * RAIL_HALF} `;
  }
  return { rails, rungs };
}

// 방수 스트림 path — 끝단에서 화점까지 직선
function buildStreamPath(
  ox: number, oy: number,
  tx: number, ty: number,
): string {
  const dx  = tx - ox;
  const dy  = ty - oy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 4) return '';
  return `M ${ox} ${oy} L ${tx} ${ty}`;
}

// ─────────────────────────────────────────────
// 끝단 팝업 (방수개시 / 방수중단 / 급수차 지정필요)
// ─────────────────────────────────────────────

interface TipPopupProps {
  tokenId:    string;
  x:          number;
  y:          number;
  hasWater:   boolean;
  isSpray:    boolean;
  onClose:    () => void;
}

function TipPopup({ tokenId, x, y, hasWater, isSpray, onClose }: TipPopupProps) {
  const { enterMode } = useActionMode();
  const { setAerialSprayTarget, setStatusTag, tokens } = useTokens();
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭 / Esc 닫기
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  function handleSprayStart() {
    if (!hasWater) {
      // 메뉴는 닫고 안내만 남긴다 — 판 위 말풍선이라 조작을 막지 않는다
      const at = noticeAnchorOf(document.querySelector(`[data-token-id="${tokenId}"]`));
      showBoardNotice(
        sprayBlockMessage('no-supply', 'aerial'),
        at?.x ?? window.innerWidth / 2, at?.y ?? window.innerHeight / 2,
      );
      onClose();
      return;
    }
    enterMode({ type: 'aerial-spray-target', sourceId: tokenId });
    onClose();
  }

  function handleSprayStop() {
    const token = tokens.find(t => t.id === tokenId);
    if (token?.aerialTarget) {
      // 고가·굴절 — 방수만 멈추고 전개 상태 표시로 되돌린다
      const deployLabel = token.aerialTarget.deployLabel;
      const floorLabel  = token.aerialTarget.floorId;
      setStatusTag(tokenId, { label: `${floorLabel} ${deployLabel}`, color: 'yellow' });
    } else {
      // 방수포(펌프·물탱크) — 전개 개념이 없으므로 방수 태그를 지운다
      setStatusTag(tokenId, null);
    }
    setAerialSprayTarget(tokenId, null);
    onClose();
  }

  // 팝업이 화면 밖으로 나가지 않도록 조정
  const popupW = 120;
  const popupH = isSpray ? 44 : 44;
  const { width: vw, height: vh } = stageBounds();
  const left = Math.max(8, Math.min(x - popupW / 2, vw - popupW - 8));
  const top  = Math.max(8, Math.min(y - popupH - 8, vh - popupH - 8));

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className="aerial-tip-popup"
      style={{ position: 'fixed', left, top, zIndex: 9900 }}
      onContextMenu={e => e.preventDefault()}
    >
      {isSpray ? (
        <button
          className="aerial-tip-popup__btn aerial-tip-popup__btn--stop"
          onMouseDown={e => { e.stopPropagation(); handleSprayStop(); }}
        >
          방수중단
        </button>
      ) : hasWater ? (
        <button
          className="aerial-tip-popup__btn aerial-tip-popup__btn--start"
          onMouseDown={e => { e.stopPropagation(); handleSprayStart(); }}
        >
          방수개시
        </button>
      ) : (
        <button
          className="aerial-tip-popup__btn aerial-tip-popup__btn--no-water"
          onMouseDown={e => { e.stopPropagation(); handleSprayStart(); }}
        >
          급수차 지정필요
        </button>
      )}
    </div>,
    stagePortalTarget(),
  );
}

/**
 * 바스켓 방수포 — 사각형 바로 아래에 매단다.
 *
 * 물은 바스켓이 아니라 이 방수포에서 나간다(rAF 가 부채꼴 시작점을 여기로
 * 잡는다). 펌프·물탱크의 방수포와 같은 그림이라 같은 것으로 읽힌다.
 *
 * 활동대의 관창(NozzleHandle)과 같은 조작이다 — 끌면 그 지점으로 방수개시,
 * 누르면 중단. 그 컴포넌트를 그대로 못 쓰는 이유는 저장하는 상태가 달라서다:
 * 관창은 `sprayState`, 고가·굴절은 `aerialSprayTarget` 이다.
 *
 * ## 전개했으면 늘 있다 (2026-09-09)
 *
 * 예전에는 급수원이 연결됐을 때만 그렸고, 방수를 시작하는 다른 길로 바스켓
 * 우클릭 「방수개시」가 있었다. 둘을 바꿨다 — 우클릭은 없애고 이 핸들을
 * 상시 표시한다(사용자 결정).
 *
 * 급수가 없으면 **빨갛게** 두고, 끌거나 누르면 「급수차 지정필요」를 말한다.
 * 없애 버리면 「방수포가 없는 차」로 보여서, 왜 못 쏘는지가 아니라 무엇이
 * 달려 있는지를 먼저 헷갈린다. 활동대 관창이 급수 없이도 회색으로 남아
 * 있는 것과 같은 판단이다(NozzleHandle `--blocked`).
 */
function AerialNozzle({ token, canSpray }: { token: UnitToken; canSpray: boolean }) {
  const { setAerialSprayTarget, setStatusTag } = useTokens();
  const isSpraying = token.aerialSprayTarget != null;

  /** 급수가 없어 못 쏜다는 사실을 말한다 — 조작을 시도한 순간에만 */
  function tellNoSupply() {
    const at = noticeAnchorOf(document.querySelector(`[data-token-id="${token.id}"]`));
    showBoardNotice(
      sprayBlockMessage('no-supply', token.unitType),
      at?.x ?? window.innerWidth / 2, at?.y ?? window.innerHeight / 2,
    );
  }

  const drag = useHandleDrag({
    enabled: true,
    lineColor: isSpraying ? '#88bbff' : '#66ccff',
    onDrop: ({ clientX, clientY }) => {
      if (!canSpray) { tellNoSupply(); return; }
      const target = resolveSprayTarget(clientX, clientY);
      if (!target) return;
      setAerialSprayTarget(token.id, { floorId: target.floorId ?? '', x: target.x, y: target.y });
      setStatusTag(token.id, { label: `${target.label} 방수`, color: 'blue' });
    },
    onTap: () => {
      if (!isSpraying) { if (!canSpray) tellNoSupply(); return; }
      setAerialSprayTarget(token.id, null);
      // 방수만 멈추고 전개 상태 표시로 되돌린다(우클릭 팝업의 「방수중단」과 같다)
      if (token.aerialTarget) {
        setStatusTag(token.id, {
          label: `${token.aerialTarget.floorId} ${token.aerialTarget.deployLabel}`,
          color: 'yellow',
        });
      } else {
        setStatusTag(token.id, null);
      }
    },
  });

  const title = isSpraying
    ? '클릭 — 방수 중단'
    : canSpray
      ? '끌어서 방수 지점 지정'
      : '급수차 지정필요 — 펌프차·물탱크차를 먼저 송수 연결하세요';

  return (
    <div
      className={[
        'nozzle-handle',
        isSpraying          ? 'nozzle-handle--active'   : '',
        !isSpraying && !canSpray ? 'nozzle-handle--nosupply' : '',
      ].filter(Boolean).join(' ')}
      title={title}
      aria-label={title}
      {...drag}
    >
      {/* 관창 픽토그램 — 활동대와 같은 그림 */}
      <svg viewBox="0 0 20 12" aria-hidden="true">
        <rect x="1" y="4.2" width="8" height="3.6" rx="1.2" />
        <path d="M9 3.6 L13.5 4.8 L13.5 7.2 L9 8.4 Z" />
        <rect x="3.4" y="7.6" width="2.4" height="3.4" rx="0.9" />
        <path className="nozzle-handle__jet" d="M14.8 6 H18.6" />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────
// AerialOverlay
// ─────────────────────────────────────────────

export function AerialOverlay() {
  const { tokens, moveAerialTarget, setAerialTarget, setStatusTag, addLog,
          moveToken, setBasketRider } = useTokens();
  const { connections, removeConnection } = useWaterConnections();
  const { registerReleaser, releaseRolesFor } = useRoleRelease();
  const waterLevel          = useWaterLevel();
  const svgRef         = useRef<SVGSVGElement>(null);
  const tokensRef      = useRef(tokens);
  const connsRef       = useRef(connections);
  // rAF 루프·이벤트 핸들러에서 최신값을 읽어야 해 ref 로 들고 있는다
  const emptyIdsRef        = useRef<ReadonlySet<string> | undefined>(undefined);
  const dragRef        = useRef<{ tokenId: string } | null>(null);
  const { victims, attachVictimToUnit, moveVictim } = useVictims();
  const victimsRef = useRef(victims);
  useEffect(() => { victimsRef.current = victims; }, [victims]);
  const addLogRef  = useRef(addLog);
  useEffect(() => { addLogRef.current = addLog; }, [addLog]);

  const tipDragPosRef  = useRef<Map<string, { x: number; y: number }>>(new Map());
  /** 아래 completeBasketRescue 를 mouseup 콜백에서 최신으로 부르기 위한 통로 */
  const completeRescueRef = useRef<(tokenId: string) => void>(() => {});
  /** 같은 이유로 지면 처리도 ref 를 거친다 */
  const landRef           = useRef<(aerialId: string) => void>(() => {});

  /**
   * 바스켓을 완전히 접으면 태운 사람이 내린다 = 구조 완료.
   *
   * 활동대와 같은 문법이다 — 다만 활동대는 **자기가 임시의료소로 걸어가서**
   * 구조가 끝나고(VictimContext 의 동반 이동 감시자), 고가차는 **사다리를
   * 접는 것**이 그 자리를 대신한다. 차는 A면에 그대로 선다.
   *
   * `rescueUnit` 을 쓰지 않는 이유가 그것이다 — 그 함수는 로그만 남기는 것이
   * 아니라 **토큰을 임시의료소로 옮긴다**(TokenContext:723). 고가차에 쓰면
   * 사다리를 편 차가 임시의료소로 사라진다. 그래서 로그와 구조대상자 이동만
   * 여기서 직접 한다.
   */
  function completeBasketRescue(tokenId: string) {
    const carried = victimsRef.current.filter(v => v.carriedBy === tokenId);
    if (carried.length === 0) return;

    const token = tokensRef.current.find(t => t.id === tokenId);
    addLogRef.current({
      logType:    'rescue',
      tokenId,
      tokenName:  token?.label ?? tokenId,
      tokenColor: token?.color,
      fromZoneId: token?.zoneKey ?? 'pool',
      toZoneId:   'medical-post',
      note:       `${carried.map(victimDisplayName).join(', ')} 구조대상자 → 구조, 임시의료소 이동`,
    });
    // keepCarrier 없음 → 연결이 함께 끊긴다(활동대 도착과 같은 경로)
    for (const v of carried) moveVictim(v.id, 'medical-post');
  }

  useEffect(() => { tokensRef.current = tokens; }, [tokens]);
  useEffect(() => { connsRef.current = connections; }, [connections]);
  useEffect(() => { emptyIdsRef.current = waterLevel?.emptyVehicleIds; }, [waterLevel]);

  const [popup, setPopup] = useState<{
    tokenId: string;
    x: number;
    y: number;
    hasWater: boolean;
    isSpray: boolean;
  } | null>(null);

  const activeTokens = tokens.filter(
    t => AERIAL_TYPES.has(t.unitType) && t.aerialTarget != null,
  );

  const monitorTokens = tokens.filter(
    t => MONITOR_TYPES.has(t.unitType) && t.aerialSprayTarget != null,
  );

  /*
   * ── 바스켓 탑승 ────────────────────────────────────────────
   * 국내(강원) 고가·굴절차는 운전원이 1명이라, 바스켓을 운용하려면 활동대가
   * 따로 부서돼 올라타야 한다. 그 활동대를 바스켓에 끌어다 놓는 것이 이 길이다.
   *
   * **활동대만** 탄다(`type: 'activity'` = 진압·구조·구급). 차량·기관은 제외다.
   * 정원은 한 대다 — 실제로는 2~3명이 타지만 판에서는 한 대로 센다.
   */
  const riders = tokens.filter(t => t.ridingOn != null);

  function boardBasket(riderId: string, aerialId: string) {
    const rider  = tokens.find(t => t.id === riderId);
    const aerial = tokens.find(t => t.id === aerialId);
    if (!rider || !aerial || rider.ridingOn === aerialId) return;
    if (rider.type !== 'activity') return;

    const taken = riders.find(t => t.ridingOn === aerialId && t.id !== riderId);
    if (taken) {
      // 조사를 붙이지 않는다 — 대 이름은 설정에서 바꿀 수 있어 받침을 알 수 없다
      // 안내는 그 차 위에 띄운다 — 어느 바스켓이 찼는지가 문구보다 먼저 보인다
      const at = noticeAnchorOf(document.querySelector(`[data-token-id="${aerialId}"]`));
      showBoardNotice(
        `${aerial.label} 바스켓에는 이미 ${taken.label} 탑승 중입니다.`,
        at?.x ?? window.innerWidth / 2, at?.y ?? window.innerHeight / 2,
      );
      return;
    }

    // 차가 선 방면으로 데려온다 — 구조대상자를 태울 때와 같다(attachVictimToUnit)
    if (rider.zoneKey !== aerial.zoneKey) moveToken(riderId, aerial.zoneKey);

    /*
     * 송수라인을 끊는다. 관창을 들고 바스켓에 오를 일이 없다는 것이 근거다
     * (사용자) — 그래서 탄 활동대의 관창도 함께 숨긴다(TokenCard `showNozzle`).
     * 남겨 두면 물을 받는 채로 공중에 뜬 대가 생겨 방수 판정만 통과한다.
     */
    for (const c of connections) {
      if (c.toId === riderId || c.fromId === riderId) removeConnection(c.id);
    }
    /*
     * 맡고 있던 **자리**는 놓는다 — 바스켓에 탄 사람이 층을 지휘하거나
     * 임시의료소를 지킬 수는 없다. 자리(scope)를 null 로 넘기면 넓은 범위
     * 지휘관도 함께 풀린다(unitCommandScope).
     *
     * **소속은 그대로다.** 'board' 를 붙여 그 뜻을 알린다 — 탑승은 자리를
     * 뜨는 것이 아니라 그 차에 올라탄 것이라, 누구 밑인가는 바뀌지 않는다
     * (RoleReleaseContext 의 ReleaseReason).
     */
    releaseRolesFor(riderId, rider.label, null, 'board');

    setBasketRider(riderId, aerialId);
  }

  /** 사다리를 접거나 다른 구역으로 끌면 내린다 — 부르는 곳이 셋이다 */
  const dismountFrom = useCallback((aerialId: string) => {
    for (const t of tokensRef.current) {
      if (t.ridingOn === aerialId) setBasketRider(t.id, null);
    }
  }, [setBasketRider]);

  /**
   * 지면에 내린 활동대를 세울 자리 — **차량 우측**. 구역 대비 0~1 좌표다.
   *
   * 두 rect 를 같은 뷰포트 px 로 재서 비율만 쓰므로 스테이지 배율은 저절로
   * 약분된다 — 캔버스 px 로 쓰는 간격에만 배율을 곱한다(UnitCommanderSlot 과
   * 같은 계산이다).
   *
   * 잴 수 없으면 undefined 를 돌려준다. 그러면 좌표 없이 들어가 흐름 배치가
   * 되는데, 자리만 아쉬울 뿐 하차 자체는 멀쩡하다.
   */
  function rightOfVehiclePos(aerialId: string): TokenPos | undefined {
    const aerialEl = document.querySelector(`[data-token-id="${CSS.escape(aerialId)}"]`);
    const card     = aerialEl?.querySelector('.token-card');
    const zone     = aerialEl?.closest('.face-general-zone');
    if (!card || !(zone instanceof HTMLElement)) return undefined;

    const zr = zone.getBoundingClientRect();
    if (zr.width === 0 || zr.height === 0 || zone.offsetWidth === 0) return undefined;
    const scale = zr.width / zone.offsetWidth;

    const cr = card.getBoundingClientRect();
    const stepPx = (LADDER_HANDLE_SPAN + RIDER_GAP + RIDER_HALF_W) * scale;
    return {
      x: clamp01((cr.right + stepPx - zr.left) / zr.width),
      y: clamp01((cr.top + cr.height / 2 - zr.top) / zr.height),
    };
  }

  /*
   * ── 지면에 닿는 순간 ───────────────────────────────────────
   *
   * **탄 대원이 있으면 그 대원에게 인계한다.** 구조대상자를 활동대에 연결하고
   * 대원을 차량 우측에 내려 세운다. 그 다음은 활동대 구조의 원래 흐름이다 —
   * 대원이 임시의료소로 걸어가 도착하면 `rescueUnit` 이 구조중 배지·처치
   * 카운트다운·구조 로그를 남긴다(VictimContext 동반 이동 감시자).
   *
   * 그래서 **구조 시각이 사다리를 접는 순간에서 임시의료소 도착으로 밀린다.**
   * 실제 활동과는 이쪽이 맞다(사용자 확인). 접는 순간에는 인계 성격의 이송
   * 연결 로그만 남는다.
   *
   * 대원이 안 탔으면 예전 그대로 즉시 구조 완료다(completeBasketRescue) —
   * 고가차 운영은 탑승과 무관하게 되므로 그 경우가 여전히 성립한다.
   *
   * 하차를 따로 부르지 않는 것에 주의. `moveToken` 이 이동마다 역할 해제
   * 등록부를 거치고 그것이 바스켓 하차를 태운다 — **한 번의 이동이 자리와
   * 하차를 함께 처리한다.**
   */
  const landBasket = useCallback((aerialId: string) => {
    const rider = tokensRef.current.find(t => t.ridingOn === aerialId);
    if (!rider) {
      completeRescueRef.current(aerialId);
      dismountFrom(aerialId);          // 태운 대가 없어도 남은 것이 있으면 정리한다
      return;
    }

    for (const v of victimsRef.current) {
      if (v.carriedBy === aerialId) attachVictimToUnit(v.id, rider.id);
    }
    moveToken(rider.id, rider.zoneKey, rightOfVehiclePos(aerialId));
  // rightOfVehiclePos 는 DOM 만 읽어 의존성이 없다(매 렌더 새로 만들어져도 같다)
  }, [attachVictimToUnit, moveToken, dismountFrom]);

  /*
   * 탑승 토큰을 다른 자리로 끌어다 놓으면 내린다.
   * `moveToken` 이 이 등록부를 거치므로(RoleReleaseContext) 이동 경로마다
   * 따로 손댈 필요가 없다 — 단위지휘관이 쓰는 그 장치다.
   */
  useEffect(() => registerReleaser('basket-rider', tokenId => {
    const t = tokensRef.current.find(x => x.id === tokenId);
    if (t?.ridingOn) setBasketRider(tokenId, null);
  }), [registerReleaser, setBasketRider]);

  /*
   * 바스켓 우클릭 — **아무 것도 열지 않는다.** 브라우저 메뉴만 막는다.
   *
   * 예전에는 여기서 「방수개시」 팝업을 띄웠다. 방수는 이제 바스켓 아래
   * 매달린 방수포가 전담한다(상시 표시, 급수 없으면 빨강) — 조작 자리가
   * 둘이면 급수 상태를 어디서 읽어야 하는지 갈린다(사용자 결정).
   * 고가차 **토큰** 우클릭의 「방수개시」는 그대로 남는다.
   */
  const handleTipContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleTipMouseDown = useCallback((e: MouseEvent, tokenId: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const token = tokensRef.current.find(t => t.id === tokenId);
    if (!token?.aerialTarget) return;

    dragRef.current = { tokenId };
    document.body.style.cursor = 'grabbing';

    function onMouseMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const board = document.getElementById('tactical-area');
      const boardRect = board?.getBoundingClientRect();
      if (!boardRect) return;
      const x = Math.max(0, Math.min(1, (ev.clientX - boardRect.left) / boardRect.width));
      const y = Math.max(0, Math.min(1, (ev.clientY - boardRect.top)  / boardRect.height));
      tipDragPosRef.current.set(tokenId, { x, y });
    }

    function onMouseUp(ev: MouseEvent) {
      function cleanup() {
        tipDragPosRef.current.delete(tokenId);
        dragRef.current = null;
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup',   onMouseUp);
      }

      const board = document.getElementById('tactical-area');
      const boardRect = board?.getBoundingClientRect();
      if (!boardRect) { cleanup(); return; }

      const x = Math.max(0, Math.min(1, (ev.clientX - boardRect.left) / boardRect.width));
      const y = Math.max(0, Math.min(1, (ev.clientY - boardRect.top)  / boardRect.height));

      // 드롭 위치의 층 감지 (초기 전개와 동일한 방식 — B·D면 포함)
      const target = resolveAerialDeployFloor(ev.clientX, ev.clientY);
      const tk     = tokensRef.current.find(t => t.id === tokenId);

      if (!tk?.aerialTarget) { cleanup(); return; }

      if (!target) {
        // A면(또는 그 아래)까지 내려오면 회수 — 그 외 무효 지점(판 밖 등)은 스냅백.
        // setAerialTarget(null) 이 aerialSprayTarget 도 함께 지우고 "전개 해제" 로그를 남긴다.
        if (isAerialRetractZone(ev.clientX, ev.clientY)) {
          landRef.current(tokenId);         // 인계·하차·정렬을 한 자리에서 (landBasket)
          setAerialTarget(tokenId, null);
        }
        cleanup();
        return;
      }

      const { floorId: newFloorId, floorHeight, displayLabel } = target;
      // 높이 초과 시 스냅백 — 안내는 손을 뗀 자리에 띄운다
      if (floorHeight > maxDeployHeight(tk.unitType)) {
        showBoardNotice(overHeightMessage(tk.unitType), ev.clientX, ev.clientY);
        cleanup(); return;
      }

      // 층이 바뀐 경우 statusTag 갱신 → 이벤트 로그 자동 발생
      if (newFloorId !== tk.aerialTarget.floorId) {
        setStatusTag(tokenId, { label: `${displayLabel} ${tk.aerialTarget.deployLabel}`, color: 'yellow' });
      }

      moveAerialTarget(tokenId, x, y, newFloorId);
      cleanup();
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  // completeBasketRescue 는 ref 만 읽어 최신 클로저가 필요 없다. deps 에 넣으면
  // 매 렌더 함수가 새로 만들어져 이 콜백까지 함께 갈린다 — ref 로 고정한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveAerialTarget, setAerialTarget, setStatusTag]);

  // rAF 루프: 토큰·층 위치를 매 프레임 추적
  useEffect(() => {
    if (activeTokens.length === 0 && monitorTokens.length === 0) return;
    let rafId: number;

    function update() {
      const svg = svgRef.current;
      if (!svg) { rafId = requestAnimationFrame(update); return; }

      for (const token of tokensRef.current) {
        if (!AERIAL_TYPES.has(token.unitType) || !token.aerialTarget) continue;

        const tokenEl    = document.querySelector(`[data-token-id="${token.id}"]`);
        const isDragging = tokenEl?.getAttribute('data-dragging') === 'true';

        function hide(sel: string) {
          const el = svg!.querySelector(sel);
          if (el instanceof SVGPathElement) el.setAttribute('d', '');
          else if (el instanceof SVGCircleElement) {
            el.setAttribute('cx', '0'); el.setAttribute('cy', '-9999');
          } else if (el instanceof SVGRectElement) {
            el.setAttribute('x', '-9999'); el.setAttribute('y', '-9999');
          }
        }

        if (!tokenEl || isDragging) {
          const id = token.id;
          hide(`#aa-arm1-${id}`);
          hide(`#aa-arm2-${id}`);
          hide(`#aa-elbow-${id}`);
          hide(`#aa-rails-${id}`);
          hide(`#aa-rungs-${id}`);
          hide(`#aa-tip-${id}`);
          hide(`#aa-tipzone-${id}`);
          const carried = document.getElementById(`aa-carried-${id}`);
          if (carried) carried.style.display = 'none';
          const nozzle = document.getElementById(`aa-nozzle-${id}`);
          if (nozzle) nozzle.style.display = 'none';
          hide(`#aa-fan-${id}`);
          hide(`#aa-stream-${id}`);
          continue;
        }

        const dragPos   = tipDragPosRef.current.get(token.id);
        const effTarget = dragPos ? { ...token.aerialTarget, ...dragPos } : token.aerialTarget;
        const pts = getEndpoints(tokenEl, effTarget);
        if (!pts) continue;

        const { ox, oy, tx, ty, th } = pts;
        const isLadder = token.unitType === 'ladder';

        // 바스켓 크기 — 출동대 토큰 세로와 같게(배율을 따라간다)
        const tipH = Math.max(TIP_MIN_H, th);
        const tipW = tipH * TIP_RATIO;
        const isSpray  = token.aerialSprayTarget != null;

        if (isLadder) {
          // 굴절차 — 관절 기준 2개 직선
          const { ex, ey } = computeElbow(ox, oy, tx, ty);
          const arm1 = svg.querySelector(`#aa-arm1-${token.id}`) as SVGPathElement | null;
          const arm2 = svg.querySelector(`#aa-arm2-${token.id}`) as SVGPathElement | null;
          if (arm1) arm1.setAttribute('d', `M ${ox} ${oy} L ${ex} ${ey}`);
          if (arm2) arm2.setAttribute('d', `M ${ex} ${ey} L ${tx} ${ty}`);
          const elbow = svg.querySelector(`#aa-elbow-${token.id}`) as SVGCircleElement | null;
          if (elbow) { elbow.setAttribute('cx', String(ex)); elbow.setAttribute('cy', String(ey)); }
        } else {
          // 고가차 — 레일·가로대 사다리 형태
          const seg = buildLadderSegment(ox, oy, tx, ty);
          const railsEl = svg.querySelector(`#aa-rails-${token.id}`) as SVGPathElement | null;
          const rungsEl = svg.querySelector(`#aa-rungs-${token.id}`) as SVGPathElement | null;
          if (railsEl) railsEl.setAttribute('d', seg.rails);
          if (rungsEl) rungsEl.setAttribute('d', seg.rungs);
        }

        // 끝단 판정 사각형 — 보이는 것보다 넓게, 같은 중심
        const hitBox = svg.querySelector(`#aa-tipzone-${token.id}`) as SVGRectElement | null;
        if (hitBox) {
          hitBox.setAttribute('x',      String(tx - tipW / 2 - TIP_HIT_PAD));
          hitBox.setAttribute('y',      String(ty - tipH / 2 - TIP_HIT_PAD));
          hitBox.setAttribute('width',  String(tipW + TIP_HIT_PAD * 2));
          hitBox.setAttribute('height', String(tipH + TIP_HIT_PAD * 2));
        }

        // 끝단 사각형
        const tip = svg.querySelector(`#aa-tip-${token.id}`) as SVGRectElement | null;
        if (tip) {
          const hasWater = canStartSpray(
            connsRef.current, token.id, token.unitType, emptyIdsRef.current,
          );
          tip.setAttribute('x',      String(tx - tipW / 2));
          tip.setAttribute('y',      String(ty - tipH / 2));
          tip.setAttribute('width',  String(tipW));
          tip.setAttribute('height', String(tipH));
          // 색상: 방수중 → 파랑, 급수없음 → 빨강, 정상 → 차종색
          const stroke = isSpray
            ? '#88bbff'
            : !hasWater
              ? '#ff4444'
              : isLadder ? '#ff9944' : '#ffcc44';
          tip.setAttribute('stroke', stroke);
        }

        // 바스켓에 연결된 구조대상자 — 사각형 오른쪽에 붙인다.
        // (활동대가 토큰 오른쪽에 붙이는 것과 같은 자리다)
        const carried = document.getElementById(`aa-carried-${token.id}`);
        if (carried) {
          carried.style.left    = `${tx + tipW / 2 + 4}px`;
          carried.style.top     = `${ty}px`;
          carried.style.display = '';
        }

        // 바스켓에 탄 활동대 — 사각형 왼쪽. 오른쪽은 구조대상자가 쓴다
        const rider = document.getElementById(`aa-rider-${token.id}`);
        if (rider) {
          rider.style.left    = `${tx - tipW / 2 - 4}px`;
          rider.style.top     = `${ty}px`;
          rider.style.display = '';
        }

        /*
         * 방수포 — 바스켓 사각형 바로 아래에 매단다.
         *
         * 이 좌표가 곧 **물이 나가는 자리**다. 아래 부채꼴·물줄기를 바스켓
         * 중심(tx, ty)이 아니라 여기서 시작시켜야, 바스켓이 뿜는 것이 아니라
         * 방수포가 쏘는 그림이 된다 — 펌프·물탱크의 방수포와 같다.
         */
        const nozzleX = tx;
        const nozzleY = ty + tipH / 2 + NOZZLE_DROP;
        const nozzle = document.getElementById(`aa-nozzle-${token.id}`);
        if (nozzle) {
          nozzle.style.left    = `${nozzleX}px`;
          nozzle.style.top     = `${nozzleY}px`;
          nozzle.style.display = '';
        }

        // 방수 팬·스트림 — 끝단(aerialTarget)에서 화점(aerialSprayTarget)으로
        const fan    = svg.querySelector(`#aa-fan-${token.id}`)    as SVGPathElement | null;
        const stream = svg.querySelector(`#aa-stream-${token.id}`) as SVGPathElement | null;
        const hit = svg.querySelector(`#aa-hit-${token.id}`) as SVGPathElement | null;
        if (isSpray && token.aerialSprayTarget) {
          // 끝단 위치: aerialTarget의 tx,ty를 원점으로 사용
          const sprayPts = getEndpoints(tokenEl, token.aerialSprayTarget);
          if (sprayPts && fan && stream) {
            // 시작점은 바스켓 중심이 아니라 그 아래 매단 **방수포**다
            fan.setAttribute('d',    buildFanPath(nozzleX, nozzleY, sprayPts.tx, sprayPts.ty));
            stream.setAttribute('d', buildStreamPath(nozzleX, nozzleY, sprayPts.tx, sprayPts.ty));
            // 눌러서 방수 중단 — 가운데 줄기에만 판정선을 둔다
            if (hit) hit.setAttribute('d', buildStreamPath(nozzleX, nozzleY, sprayPts.tx, sprayPts.ty));
          }
        } else {
          if (fan)    fan.setAttribute('d', '');
          if (stream) stream.setAttribute('d', '');
          if (hit)    hit.setAttribute('d', '');
        }
      }

      // 방수포 (펌프차/물탱크차): 토큰 우측 중앙 → 화점
      for (const token of tokensRef.current) {
        if (!MONITOR_TYPES.has(token.unitType) || !token.aerialSprayTarget) continue;

        const tokenEl    = document.querySelector(`[data-token-id="${token.id}"]`);
        const isDragging = tokenEl?.getAttribute('data-dragging') === 'true';
        const fan    = svg.querySelector(`#aa-mfan-${token.id}`)    as SVGPathElement | null;
        const stream = svg.querySelector(`#aa-mstream-${token.id}`) as SVGPathElement | null;
        const hit    = svg.querySelector(`#aa-mhit-${token.id}`)    as SVGPathElement | null;

        if (!tokenEl || isDragging) {
          if (fan)    fan.setAttribute('d', '');
          if (stream) stream.setAttribute('d', '');
          if (hit)    hit.setAttribute('d', '');
          continue;
        }

        const pts = getMonitorOrigin(tokenEl, token.aerialSprayTarget);
        if (!pts) continue;

        const { ox, oy, tx, ty } = pts;
        if (fan)    fan.setAttribute('d',    buildFanPath(ox, oy, tx, ty));
        if (stream) stream.setAttribute('d', buildStreamPath(ox, oy, tx, ty));
        if (hit)    hit.setAttribute('d',    buildStreamPath(ox, oy, tx, ty));
      }

      rafId = requestAnimationFrame(update);
    }

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [activeTokens.length, monitorTokens.length]);

  // 매 렌더 갱신 — 최신 클로저를 유지한다(ChecklistPanel 의 remoteToggleRef 와 같은 방식).
  // 렌더 본문에서 직접 대입하면 「ref 를 렌더 중에 수정」으로 걸린다.
  useEffect(() => { completeRescueRef.current = completeBasketRescue; });
  useEffect(() => { landRef.current = landBasket; }, [landBasket]);

  // 끝단 판정 사각형에 조작 이벤트를 건다 — 보이는 사각형이 아니라 넓은 쪽이다.
  // 잡기·우클릭·구조대상자 드롭이 모두 같은 넓이를 쓴다.
  useEffect(() => {
    const handlers: { el: Element; event: string; fn: (e: Event) => void }[] = [];

    for (const token of activeTokens) {
      const el = svgRef.current?.querySelector(`#aa-tipzone-${token.id}`);
      if (!el) continue;
      const tokenId = token.id;
      const ctxFn  = (e: Event) => handleTipContextMenu(e as MouseEvent);
      const dragFn = (e: Event) => handleTipMouseDown(e as MouseEvent, tokenId);
      /*
       * 바스켓에 떨구는 것 둘 — **구조대상자**와 **활동대**다.
       *
       * 구조대상자는 출동대 토큰에 떨구는 것과 같은 처리다
       * (TokenCard.handleVictimDrop → attachVictimToUnit). 활동대는 탑승이다.
       *
       * `dragover` 에서는 `dataTransfer` 값을 못 읽어 종류를 알 수 없다. 그래서
       * 끌고 있는 토큰은 **DOM 표시**로 찾는다 — TokenCard 가 dragstart 에
       * `data-dragging` 을 붙여 둔다. 활동대가 아닌 것까지 여기서 받아 버리면
       * 그 드롭은 조용히 사라진다(SVG 는 포털 안이라 구역으로 안 올라간다).
       */
      const draggedToken = () => {
        const el = document.querySelector('.token-card-wrapper[data-dragging="true"]');
        const id = el?.getAttribute('data-token-id');
        return id ? tokens.find(t => t.id === id) : undefined;
      };
      const overFn = (e: Event) => {
        const ev = e as DragEvent;
        const types = ev.dataTransfer?.types;
        if (!types) return;
        const hasVictim = types.includes('victimid') || types.includes('victimId');
        const hasToken  = types.includes('tokenid')  || types.includes('tokenId');
        const rider     = hasToken ? draggedToken() : undefined;
        if (!hasVictim && rider?.type !== 'activity') return;
        ev.preventDefault();          // 없으면 drop 이 조용히 안 걸린다
        ev.stopPropagation();
        ev.dataTransfer!.dropEffect = 'move';
      };
      const dropFn = (e: Event) => {
        const ev = e as DragEvent;
        const victimId = ev.dataTransfer?.getData('victimId');
        if (victimId) {
          ev.preventDefault();
          ev.stopPropagation();
          attachVictimToUnit(victimId, tokenId);
          return;
        }
        const riderId = ev.dataTransfer?.getData('tokenId');
        if (!riderId || riderId === tokenId) return;
        ev.preventDefault();
        ev.stopPropagation();
        boardBasket(riderId, tokenId);
      };
      el.addEventListener('contextmenu', ctxFn);
      el.addEventListener('mousedown',   dragFn);
      el.addEventListener('dragover',    overFn);
      el.addEventListener('drop',        dropFn);
      handlers.push({ el, event: 'contextmenu', fn: ctxFn });
      handlers.push({ el, event: 'mousedown',   fn: dragFn });
      handlers.push({ el, event: 'dragover',    fn: overFn });
      handlers.push({ el, event: 'drop',        fn: dropFn });
    }

    return () => {
      for (const { el, event, fn } of handlers) {
        el.removeEventListener(event, fn);
      }
    };
  });

  // 방수선을 클릭하면 끝단 팝업과 같은 "방수중단" 팝업을 띄운다.
  // 송수 해제(연결선 클릭)·관창 방수 중단과 같은 조작 문법이다.
  function handleSprayLineClick(e: React.MouseEvent, tokenId: string) {
    e.stopPropagation();
    setPopup({ tokenId, x: e.clientX, y: e.clientY, hasWater: true, isSpray: true });
  }

  if (activeTokens.length === 0 && monitorTokens.length === 0) return null;

  /*
   * 바스켓에 연결된 구조대상자.
   *
   * 활동대와 **같은 컴포넌트**(VictimCard attached)를 쓴다 — 연결이라는 사실은
   * 같으니 모양도 같아야 한다. 다른 것은 붙는 자리뿐이다: 활동대는 토큰 옆,
   * 고가차는 사다리 끝 바스켓 옆.
   *
   * SVG 가 아니라 형제 HTML 층에 둔다. 오버레이가 `position: fixed; inset: 0`
   * 라 같은 화면 좌표계를 쓰고, 위치만 rAF 가 매 프레임 옮기면 된다.
   */
  const carriedLayer = (
    <div className="aerial-carried-layer">
      {activeTokens.map(token => {
        const riding = victims.filter(v => v.carriedBy === token.id);
        if (riding.length === 0) return null;
        return (
          <div key={token.id} id={`aa-carried-${token.id}`} className="aerial-carried">
            {riding.map(v => <VictimCard key={v.id} victim={v} attached />)}
          </div>
        );
      })}
    </div>
  );

  /*
   * 바스켓에 탄 활동대 — 사각형 **왼쪽**에 붙인다.
   *
   * 구조대상자와 자리를 갈라 둔다(그쪽은 오른쪽). 둘이 같이 있는 것이 정상
   * 상황이라 — 대원이 타고 올라가 사람을 받는다 — 한 줄에 몰면 구조대상자가
   * 늘 때마다 활동대가 밀린다.
   *
   * 바스켓 안이 아니라 옆인 이유는 크기다. 바스켓은 차량 토큰 세로(약 37px)에
   * 폭 34.5px 인데 활동대 토큰은 81.5×37 이라 들어가지 않는다. 「사다리 끝에
   * 얹어 그리지 말고 옆에 붙인다」는 판단은 구조대상자에서 이미 한 번 정했다
   * (f4aea8d — 그렇게까지 사실적일 이유가 없다).
   *
   * 토큰은 **실물 TokenCard** 다. 우클릭 메뉴·상태 태그·끌어 내리기가 전부
   * 따라온다 — 탄 대라고 다른 부품으로 그리면 그 기능을 여기서 다시 만들어야
   * 한다.
   */
  const riderLayer = (
    <div className="aerial-carried-layer">
      {activeTokens.map(aerial => {
        const rider = riders.find(t => t.ridingOn === aerial.id);
        if (!rider) return null;
        return (
          <div key={aerial.id} id={`aa-rider-${aerial.id}`} className="aerial-rider">
            <TokenCard token={rider} />
          </div>
        );
      })}
    </div>
  );

  /*
   * 바스켓 아래 방수 핸들 — **전개했으면 늘 있다.**
   *
   * 예전에는 급수원이 연결됐을 때만 그렸다. 그러면 「방수포가 없는 차」처럼
   * 보여서, 왜 못 쏘는지가 아니라 무엇이 있는지를 먼저 헷갈린다. 지금은 늘
   * 그리고 **급수가 없으면 빨갛게** 두고, 눌렀을 때 이유를 말한다
   * (AerialNozzle · 사용자 결정).
   */
  const nozzleLayer = (
    <div className="aerial-carried-layer">
      {activeTokens.map(token => (
        <div key={token.id} id={`aa-nozzle-${token.id}`} className="aerial-nozzle">
          <AerialNozzle
            token={token}
            canSpray={canStartSpray(
              connections, token.id, token.unitType, waterLevel?.emptyVehicleIds,
            )}
          />
        </div>
      ))}
    </div>
  );

  return (
    <>
      {ReactDOM.createPortal(
        <>
        {carriedLayer}
        {riderLayer}
        {nozzleLayer}
        <svg ref={svgRef} className="aerial-svg" aria-hidden="true">
          {activeTokens.map(token => {
            const isLadder = token.unitType === 'ladder';

            return (
              <g key={token.id}>
                {isLadder ? (
                  /* 굴절차 — 2개 직선 + 관절점 */
                  <>
                    <path   id={`aa-arm1-${token.id}`}  d=""  className="aerial-arm aerial-arm--ladder" />
                    <path   id={`aa-arm2-${token.id}`}  d=""  className="aerial-arm aerial-arm--ladder" />
                    <circle id={`aa-elbow-${token.id}`} cx="0" cy="-9999" r="4" className="aerial-elbow" />
                  </>
                ) : (
                  /* 고가차 — 레일·가로대 사다리 */
                  <>
                    <path id={`aa-rails-${token.id}`} d="" className="aerial-rails aerial-rails--aerial" />
                    <path id={`aa-rungs-${token.id}`} d="" className="aerial-rungs aerial-rungs--aerial" />
                  </>
                )}

                {/* 끝단 사각형 — 보이는 바스켓. 조작은 아래 판정 사각형이 받는다 */}
                <rect
                  id={`aa-tip-${token.id}`}
                  x="-9999" y="-9999"
                  width={TIP_MIN_H * TIP_RATIO} height={TIP_MIN_H}
                  rx="3"
                  className={isLadder ? 'aerial-tip aerial-tip--ladder' : 'aerial-tip aerial-tip--aerial'}
                  style={{ pointerEvents: 'none' }}
                />
                {/* 조작 판정 — 잡기·우클릭·구조대상자 드롭. 보이지 않는다 */}
                <rect
                  id={`aa-tipzone-${token.id}`}
                  x="-9999" y="-9999"
                  width={TIP_MIN_H * TIP_RATIO} height={TIP_MIN_H}
                  className="aerial-tip-hit"
                />

                {/* 방수 팬 + 스트림 */}
                <path id={`aa-fan-${token.id}`}    d="" className="aerial-fan" />
                <path id={`aa-stream-${token.id}`} d="" className="aerial-fan-stream" />
                {/* 방수선 클릭 → 방수 중단 */}
                <path
                  id={`aa-hit-${token.id}`}
                  d=""
                  className="aerial-fan-hit"
                  onClick={e => handleSprayLineClick(e, token.id)}
                />
              </g>
            );
          })}

          {/* 방수포 (펌프차/물탱크차): 팬 + 스트림 + 클릭 판정선 */}
          {monitorTokens.map(token => (
            <g key={`monitor-${token.id}`}>
              <path id={`aa-mfan-${token.id}`}    d="" className="aerial-fan" />
              <path id={`aa-mstream-${token.id}`} d="" className="aerial-fan-stream" />
              <path
                id={`aa-mhit-${token.id}`}
                d=""
                className="aerial-fan-hit"
                onClick={e => handleSprayLineClick(e, token.id)}
              />
            </g>
          ))}
        </svg>
        </>,
        stagePortalTarget(),
      )}

      {popup && (
        <TipPopup
          tokenId={popup.tokenId}
          x={popup.x}
          y={popup.y}
          hasWater={popup.hasWater}
          isSpray={popup.isSpray}
          onClose={() => setPopup(null)}
        />
      )}
    </>
  );
}
