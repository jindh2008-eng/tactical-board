import { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTokens } from '../../context/TokenContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useActionMode } from '../../context/ActionModeContext';
import './AerialOverlay.css';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const AERIAL_TYPES = new Set(['aerial', 'ladder']);
const WATER_SOURCE_TYPES = new Set(['pump', 'water_tank']);
const MONITOR_TYPES = new Set(['pump', 'water_tank']);

// 방수 팬 반각도 (도) — 진압대와 동일한 22°
const FAN_HALF_DEG = 22;
// 방수 팬 최대 끝단 반경 (px) — 진압대(~8-9px)보다 약간 크게
const FAN_MAX_R = 14;

// 끝단 사각형 크기
const TIP_W = 14;
const TIP_H = 10;

// 고가차/굴절차 최대 전개 층수
const AERIAL_MAX_HEIGHT = 15;
const LADDER_MAX_HEIGHT = 7;

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

  return { ox, oy, tx, ty };
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

// 펌프차/물탱크차 방수포 원점: 토큰 우측 중앙 → 화점
function getMonitorOrigin(
  tokenEl: Element,
  target: { x: number; y: number },
): Endpoints | null {
  const tokenRect = tokenEl.getBoundingClientRect();
  const board     = document.getElementById('tactical-area');
  const boardRect = board?.getBoundingClientRect();
  if (!boardRect) return null;

  const ox = tokenRect.right;
  const oy = tokenRect.top + tokenRect.height / 2;
  const tx = boardRect.left + target.x * boardRect.width;
  const ty = boardRect.top  + target.y * boardRect.height;

  return { ox, oy, tx, ty };
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
      const deployLabel = token.aerialTarget.deployLabel;
      const floorLabel  = token.aerialTarget.floorId;
      setStatusTag(tokenId, { label: `${floorLabel} ${deployLabel}`, color: 'yellow' });
    }
    setAerialSprayTarget(tokenId, null);
    onClose();
  }

  // 팝업이 화면 밖으로 나가지 않도록 조정
  const popupW = 120;
  const popupH = isSpray ? 44 : 44;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
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
    document.body,
  );
}

// ─────────────────────────────────────────────
// AerialOverlay
// ─────────────────────────────────────────────

export function AerialOverlay() {
  const { tokens, moveAerialTarget, setStatusTag } = useTokens();
  const { connections } = useWaterConnections();
  const svgRef         = useRef<SVGSVGElement>(null);
  const tokensRef      = useRef(tokens);
  const connsRef       = useRef(connections);
  const dragRef        = useRef<{ tokenId: string } | null>(null);
  const tipDragPosRef  = useRef<Map<string, { x: number; y: number }>>(new Map());
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);
  useEffect(() => { connsRef.current = connections; }, [connections]);

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
    const hasWater = connsRef.current.some(
      c => c.toId === tokenId && WATER_SOURCE_TYPES.has(c.fromType),
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

      // 드롭 위치의 층 감지 (초기 전개와 동일한 방식)
      const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
      let floorEl: Element | null = null;
      for (const el of elements) {
        let cur: Element | null = el;
        while (cur) {
          if (cur.getAttribute('data-floor-id')) { floorEl = cur; break; }
          cur = cur.parentElement;
        }
        if (floorEl) break;
      }

      const tk = tokensRef.current.find(t => t.id === tokenId);

      // 층 미감지 또는 지하층이면 원위치로 스냅백
      if (!floorEl || floorEl.classList.contains('floor-row--basement') || !tk?.aerialTarget) {
        cleanup(); return;
      }

      const newFloorId     = floorEl.getAttribute('data-floor-id')!;
      const floorHeight    = Number(floorEl.getAttribute('data-floor-height') ?? 0);
      const displayLabel   = floorEl.getAttribute('data-floor-label') ?? newFloorId;
      const isLadder       = tk.unitType === 'ladder';
      const maxHeight      = isLadder ? LADDER_MAX_HEIGHT : AERIAL_MAX_HEIGHT;

      // 높이 초과 시 스냅백
      if (floorHeight > maxHeight) {
        alert(`${isLadder ? '굴절차' : '고가차'}는 ${maxHeight}층 높이까지만 전개 가능합니다.`);
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
  }, [moveAerialTarget, setStatusTag]);

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
          hide(`#aa-fan-${id}`);
          hide(`#aa-stream-${id}`);
          continue;
        }

        const dragPos   = tipDragPosRef.current.get(token.id);
        const effTarget = dragPos ? { ...token.aerialTarget, ...dragPos } : token.aerialTarget;
        const pts = getEndpoints(tokenEl, effTarget);
        if (!pts) continue;

        const { ox, oy, tx, ty } = pts;
        const isLadder = token.unitType === 'ladder';
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

        // 끝단 사각형
        const tip = svg.querySelector(`#aa-tip-${token.id}`) as SVGRectElement | null;
        if (tip) {
          const hasWater = connsRef.current.some(
            c => c.toId === token.id && WATER_SOURCE_TYPES.has(c.fromType),
          );
          tip.setAttribute('x', String(tx - TIP_W / 2));
          tip.setAttribute('y', String(ty - TIP_H / 2));
          // 색상: 방수중 → 파랑, 급수없음 → 빨강, 정상 → 차종색
          const stroke = isSpray
            ? '#88bbff'
            : !hasWater
              ? '#ff4444'
              : isLadder ? '#ff9944' : '#ffcc44';
          tip.setAttribute('stroke', stroke);
        }

        // 방수 팬·스트림 — 끝단(aerialTarget)에서 화점(aerialSprayTarget)으로
        const fan    = svg.querySelector(`#aa-fan-${token.id}`)    as SVGPathElement | null;
        const stream = svg.querySelector(`#aa-stream-${token.id}`) as SVGPathElement | null;
        if (isSpray && token.aerialSprayTarget) {
          // 끝단 위치: aerialTarget의 tx,ty를 원점으로 사용
          const sprayPts = getEndpoints(tokenEl, token.aerialSprayTarget);
          if (sprayPts && fan && stream) {
            // ox,oy = 전개 끝단(사각형 중심), tx,ty = 화점
            fan.setAttribute('d',    buildFanPath(tx, ty, sprayPts.tx, sprayPts.ty));
            stream.setAttribute('d', buildStreamPath(tx, ty, sprayPts.tx, sprayPts.ty));
          }
        } else {
          if (fan)    fan.setAttribute('d', '');
          if (stream) stream.setAttribute('d', '');
        }
      }

      // 방수포 (펌프차/물탱크차): 토큰 우측 중앙 → 화점
      for (const token of tokensRef.current) {
        if (!MONITOR_TYPES.has(token.unitType) || !token.aerialSprayTarget) continue;

        const tokenEl    = document.querySelector(`[data-token-id="${token.id}"]`);
        const isDragging = tokenEl?.getAttribute('data-dragging') === 'true';
        const fan    = svg.querySelector(`#aa-mfan-${token.id}`)    as SVGPathElement | null;
        const stream = svg.querySelector(`#aa-mstream-${token.id}`) as SVGPathElement | null;

        if (!tokenEl || isDragging) {
          if (fan)    fan.setAttribute('d', '');
          if (stream) stream.setAttribute('d', '');
          continue;
        }

        const pts = getMonitorOrigin(tokenEl, token.aerialSprayTarget);
        if (!pts) continue;

        const { ox, oy, tx, ty } = pts;
        if (fan)    fan.setAttribute('d',    buildFanPath(ox, oy, tx, ty));
        if (stream) stream.setAttribute('d', buildStreamPath(ox, oy, tx, ty));
      }

      rafId = requestAnimationFrame(update);
    }

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [activeTokens.length, monitorTokens.length]);

  // 끝단 rect에 contextmenu·mousedown 이벤트 연결
  useEffect(() => {
    const handlers: { el: Element; event: string; fn: (e: Event) => void }[] = [];

    for (const token of activeTokens) {
      const el = svgRef.current?.querySelector(`#aa-tip-${token.id}`);
      if (!el) continue;
      const tokenId = token.id;
      const ctxFn  = (e: Event) => handleTipContextMenu(e as MouseEvent, tokenId);
      const dragFn = (e: Event) => handleTipMouseDown(e as MouseEvent, tokenId);
      el.addEventListener('contextmenu', ctxFn);
      el.addEventListener('mousedown',   dragFn);
      handlers.push({ el, event: 'contextmenu', fn: ctxFn });
      handlers.push({ el, event: 'mousedown',   fn: dragFn });
    }

    return () => {
      for (const { el, event, fn } of handlers) {
        el.removeEventListener(event, fn);
      }
    };
  });

  if (activeTokens.length === 0 && monitorTokens.length === 0) return null;

  return (
    <>
      {ReactDOM.createPortal(
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

                {/* 끝단 사각형 (pointer-events: all — 우클릭 수신) */}
                <rect
                  id={`aa-tip-${token.id}`}
                  x="-9999" y="-9999"
                  width={TIP_W} height={TIP_H}
                  rx="2"
                  className={isLadder ? 'aerial-tip aerial-tip--ladder' : 'aerial-tip aerial-tip--aerial'}
                  style={{ pointerEvents: 'all', cursor: 'grab' }}
                />

                {/* 방수 팬 + 스트림 */}
                <path id={`aa-fan-${token.id}`}    d="" className="aerial-fan" />
                <path id={`aa-stream-${token.id}`} d="" className="aerial-fan-stream" />
              </g>
            );
          })}

          {/* 방수포 (펌프차/물탱크차): 팬 + 스트림만 */}
          {monitorTokens.map(token => (
            <g key={`monitor-${token.id}`}>
              <path id={`aa-mfan-${token.id}`}    d="" className="aerial-fan" />
              <path id={`aa-mstream-${token.id}`} d="" className="aerial-fan-stream" />
            </g>
          ))}
        </svg>,
        document.body,
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
