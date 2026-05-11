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

// 방수 팬 반각도 (도) — 진압대와 동일한 22°
const FAN_HALF_DEG = 22;
// 방수 팬 최대 끝단 반경 (px) — 진압대(~8-9px)보다 약간 크게
const FAN_MAX_R = 14;

// 끝단 사각형 크기
const TIP_W = 14;
const TIP_H = 10;

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
  const tx = boardRect.left + target.x;
  const ty = boardRect.top  + target.y;

  return { ox, oy, tx, ty };
}

// 굴절차 관절점 계산 — 내각 정확히 120° 보장
function computeElbow(
  ox: number, oy: number,
  tx: number, ty: number,
): { ex: number; ey: number } {
  const dx = tx - ox;
  const dy = ty - oy;
  const d  = Math.sqrt(dx * dx + dy * dy);
  if (d < 4) return { ex: ox, ey: oy };

  const h  = d / (2 * Math.sqrt(3));
  const mx = (ox + tx) / 2;
  const my = (oy + ty) / 2;

  const px = -dy / d;
  const py =  dx / d;
  const e1 = { ex: mx + h * px, ey: my + h * py };
  const e2 = { ex: mx - h * px, ey: my - h * py };

  const e1ok = e1.ey > ty;
  const e2ok = e2.ey > ty;

  if (e1ok && e2ok) return e1.ey < e2.ey ? e1 : e2;
  if (e1ok) return e1;
  if (e2ok) return e2;
  return e1.ey > e2.ey ? e1 : e2;
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
  const { enterMode, clearMode } = useActionMode();
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
  const { tokens } = useTokens();
  const { connections } = useWaterConnections();
  const svgRef     = useRef<SVGSVGElement>(null);
  const tokensRef  = useRef(tokens);
  const connsRef   = useRef(connections);
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

  // rAF 루프: 토큰·층 위치를 매 프레임 추적
  useEffect(() => {
    if (activeTokens.length === 0) return;
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
          hide(`#aa-tip-${id}`);
          hide(`#aa-fan-${id}`);
          hide(`#aa-stream-${id}`);
          continue;
        }

        const pts = getEndpoints(tokenEl, token.aerialTarget);
        if (!pts) continue;

        const { ox, oy, tx, ty } = pts;
        const isLadder = token.unitType === 'ladder';
        const isSpray  = token.aerialSprayTarget != null;

        // 팔 그리기
        if (isLadder) {
          const { ex, ey } = computeElbow(ox, oy, tx, ty);
          const arm1 = svg.querySelector(`#aa-arm1-${token.id}`) as SVGPathElement | null;
          const arm2 = svg.querySelector(`#aa-arm2-${token.id}`) as SVGPathElement | null;
          if (arm1) arm1.setAttribute('d', `M ${ox} ${oy} L ${ex} ${ey}`);
          if (arm2) arm2.setAttribute('d', `M ${ex} ${ey} L ${tx} ${ty}`);
          const elbow = svg.querySelector(`#aa-elbow-${token.id}`) as SVGCircleElement | null;
          if (elbow) { elbow.setAttribute('cx', String(ex)); elbow.setAttribute('cy', String(ey)); }
        } else {
          const arm = svg.querySelector(`#aa-arm1-${token.id}`) as SVGPathElement | null;
          if (arm) arm.setAttribute('d', `M ${ox} ${oy} L ${tx} ${ty}`);
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

      rafId = requestAnimationFrame(update);
    }

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [activeTokens.length]);

  // 끝단 rect에 contextmenu 이벤트 연결
  useEffect(() => {
    const handlers: { el: Element; fn: (e: Event) => void }[] = [];

    for (const token of activeTokens) {
      const tipId = `aa-tip-${token.id}`;
      const el = svgRef.current?.querySelector(`#${tipId}`);
      if (!el) continue;
      const tokenId = token.id;
      const fn = (e: Event) => handleTipContextMenu(e as MouseEvent, tokenId);
      el.addEventListener('contextmenu', fn);
      handlers.push({ el, fn });
    }

    return () => {
      for (const { el, fn } of handlers) {
        el.removeEventListener('contextmenu', fn);
      }
    };
  });

  if (activeTokens.length === 0) return null;

  return (
    <>
      {ReactDOM.createPortal(
        <svg ref={svgRef} className="aerial-svg" aria-hidden="true">
          {activeTokens.map(token => {
            const isLadder = token.unitType === 'ladder';
            const armCls   = isLadder ? 'aerial-arm aerial-arm--ladder' : 'aerial-arm aerial-arm--aerial';

            return (
              <g key={token.id}>
                {/* 붐/사다리 암 */}
                <path id={`aa-arm1-${token.id}`} d="" className={armCls} />
                {isLadder && (
                  <>
                    <path   id={`aa-arm2-${token.id}`}  d=""  className={armCls} />
                    <circle id={`aa-elbow-${token.id}`} cx="0" cy="-9999" r="4" className="aerial-elbow" />
                  </>
                )}

                {/* 끝단 사각형 (pointer-events: all — 우클릭 수신) */}
                <rect
                  id={`aa-tip-${token.id}`}
                  x="-9999" y="-9999"
                  width={TIP_W} height={TIP_H}
                  rx="2"
                  className={isLadder ? 'aerial-tip aerial-tip--ladder' : 'aerial-tip aerial-tip--aerial'}
                  style={{ pointerEvents: 'all', cursor: 'context-menu' }}
                />

                {/* 방수 팬 + 스트림 */}
                <path id={`aa-fan-${token.id}`}    d="" className="aerial-fan" />
                <path id={`aa-stream-${token.id}`} d="" className="aerial-fan-stream" />
              </g>
            );
          })}
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
