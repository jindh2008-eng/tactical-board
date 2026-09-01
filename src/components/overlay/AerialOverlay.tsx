import { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import type { UnitToken } from '../../types';
import { useTokens } from '../../context/TokenContext';
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
import { useDisplayOptions } from '../../context/DisplayOptionsContext';
import { canStartSpray } from '../../utils/waterSupply';
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
      alert('급수차 지정필요: 펌프차 또는 물탱크차를 먼저 송수 연결하세요.');
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
 * 바스켓 방수 핸들 — 사각형 바로 아래.
 *
 * 활동대의 관창(NozzleHandle)과 같은 조작이다 — 끌면 그 지점으로 방수개시,
 * 누르면 중단. 그 컴포넌트를 그대로 못 쓰는 이유는 저장하는 상태가 달라서다:
 * 관창은 `sprayState`, 고가·굴절은 `aerialSprayTarget` 이다.
 *
 * 급수원(펌프·물탱크)이 연결됐을 때만 나온다. 우클릭 팝업의 「방수개시」는
 * 그대로 남는다 — 이건 동선을 줄이는 수단이지 유일한 경로가 아니다.
 */
function AerialNozzle({ token, canSpray }: { token: UnitToken; canSpray: boolean }) {
  const { setAerialSprayTarget, setStatusTag } = useTokens();
  const isSpraying = token.aerialSprayTarget != null;

  const drag = useHandleDrag({
    enabled: true,
    lineColor: isSpraying ? '#88bbff' : '#66ccff',
    onDrop: ({ clientX, clientY }) => {
      if (!canSpray) return;
      const target = resolveSprayTarget(clientX, clientY);
      if (!target) return;
      setAerialSprayTarget(token.id, { floorId: target.floorId ?? '', x: target.x, y: target.y });
      setStatusTag(token.id, { label: `${target.label} 방수`, color: 'blue' });
    },
    onTap: () => {
      if (!isSpraying) return;
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

  const title = isSpraying ? '클릭 — 방수 중단' : '끌어서 방수 지점 지정';

  return (
    <div
      className={`nozzle-handle${isSpraying ? ' nozzle-handle--active' : ''}`}
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
  const { tokens, moveAerialTarget, setAerialTarget, setStatusTag, addLog } = useTokens();
  const { connections } = useWaterConnections();
  const { showWaterSupply } = useDisplayOptions();
  const waterLevel          = useWaterLevel();
  const svgRef         = useRef<SVGSVGElement>(null);
  const tokensRef      = useRef(tokens);
  const connsRef       = useRef(connections);
  // rAF 루프·이벤트 핸들러에서 최신값을 읽어야 해 ref 로 들고 있는다
  const showWaterSupplyRef = useRef(showWaterSupply);
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
  useEffect(() => { showWaterSupplyRef.current = showWaterSupply; }, [showWaterSupply]);
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

  const handleTipContextMenu = useCallback((
    e: MouseEvent,
    tokenId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const token   = tokensRef.current.find(t => t.id === tokenId);
    if (!token) return;
    // 송수 미사용 훈련(표시옵션 OFF)에서는 급수차 연결 없이도 방수한다
    const hasWater = canStartSpray(
      showWaterSupplyRef.current, connsRef.current, tokenId, token.unitType,
      emptyIdsRef.current,
    );
    const isSpray = token.aerialSprayTarget != null;
    setPopup({ tokenId, x: e.clientX, y: e.clientY, hasWater, isSpray });
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
          completeRescueRef.current(tokenId);
          setAerialTarget(tokenId, null);
        }
        cleanup();
        return;
      }

      const { floorId: newFloorId, floorHeight, displayLabel } = target;
      // 높이 초과 시 스냅백
      if (floorHeight > maxDeployHeight(tk.unitType)) {
        alert(overHeightMessage(tk.unitType));
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
            showWaterSupplyRef.current, connsRef.current, token.id, token.unitType,
            emptyIdsRef.current,
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

        // 방수 핸들 — 사각형 바로 아래 한가운데
        const nozzle = document.getElementById(`aa-nozzle-${token.id}`);
        if (nozzle) {
          nozzle.style.left    = `${tx}px`;
          nozzle.style.top     = `${ty + tipH / 2 + 2}px`;
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
            // ox,oy = 전개 끝단(사각형 중심), tx,ty = 화점
            fan.setAttribute('d',    buildFanPath(tx, ty, sprayPts.tx, sprayPts.ty));
            stream.setAttribute('d', buildStreamPath(tx, ty, sprayPts.tx, sprayPts.ty));
            // 눌러서 방수 중단 — 가운데 줄기에만 판정선을 둔다
            if (hit) hit.setAttribute('d', buildStreamPath(tx, ty, sprayPts.tx, sprayPts.ty));
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

  // 끝단 판정 사각형에 조작 이벤트를 건다 — 보이는 사각형이 아니라 넓은 쪽이다.
  // 잡기·우클릭·구조대상자 드롭이 모두 같은 넓이를 쓴다.
  useEffect(() => {
    const handlers: { el: Element; event: string; fn: (e: Event) => void }[] = [];

    for (const token of activeTokens) {
      const el = svgRef.current?.querySelector(`#aa-tipzone-${token.id}`);
      if (!el) continue;
      const tokenId = token.id;
      const ctxFn  = (e: Event) => handleTipContextMenu(e as MouseEvent, tokenId);
      const dragFn = (e: Event) => handleTipMouseDown(e as MouseEvent, tokenId);
      // 구조대상자를 바스켓에 태운다 — 출동대 토큰에 떨구는 것과 같은 처리다
      // (TokenCard.handleVictimDrop → attachVictimToUnit)
      const overFn = (e: Event) => {
        const ev = e as DragEvent;
        const types = ev.dataTransfer?.types;
        if (!types || (!types.includes('victimid') && !types.includes('victimId'))) return;
        ev.preventDefault();          // 없으면 drop 이 조용히 안 걸린다
        ev.stopPropagation();
        ev.dataTransfer!.dropEffect = 'move';
      };
      const dropFn = (e: Event) => {
        const ev = e as DragEvent;
        const victimId = ev.dataTransfer?.getData('victimId');
        if (!victimId) return;
        ev.preventDefault();
        ev.stopPropagation();
        attachVictimToUnit(victimId, tokenId);
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
   * 바스켓 아래 방수 핸들 — 급수원이 연결된 고가·굴절차에만 나온다.
   * 위치는 위 층과 같은 방식으로 rAF 가 옮긴다.
   */
  const nozzleLayer = (
    <div className="aerial-carried-layer">
      {activeTokens.map(token => {
        const canSpray = canStartSpray(
          showWaterSupply, connections, token.id, token.unitType, waterLevel?.emptyVehicleIds,
        );
        // 연결이 없으면 아예 그리지 않는다 — 물이 없는데 관창만 달려 있으면 오해한다
        if (!canSpray && token.aerialSprayTarget == null) return null;
        return (
          <div key={token.id} id={`aa-nozzle-${token.id}`} className="aerial-nozzle">
            <AerialNozzle token={token} canSpray={canSpray} />
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {ReactDOM.createPortal(
        <>
        {carriedLayer}
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
