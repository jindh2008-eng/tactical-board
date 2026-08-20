import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useHydrantState }     from '../../context/HydrantStateContext';
import { useTokens }           from '../../context/TokenContext';
import { useWaterLevel }       from '../../context/WaterLevelContext';
import { useDisplayOptions }   from '../../context/DisplayOptionsContext';
import './WaterConnectionOverlay.css';

// ─────────────────────────────────────────────
// 좌표 계산
// ─────────────────────────────────────────────

const ENDPOINT_OFFSET = 16;

function computePathD(fromId: string, toId: string): string | null {
  const fromEl = document.querySelector(`[data-token-id="${fromId}"]`);
  const toEl   = document.querySelector(`[data-token-id="${toId}"]`);
  if (!fromEl || !toEl) return null;

  const fr = fromEl.getBoundingClientRect();
  const tr = toEl.getBoundingClientRect();
  const cx1 = fr.left + fr.width  / 2;
  const cy1 = fr.top  + fr.height / 2;
  const cx2 = tr.left + tr.width  / 2;
  const cy2 = tr.top  + tr.height / 2;

  const dx  = cx2 - cx1;
  const dy  = cy2 - cy1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;

  const ux = dx / len;
  const uy = dy / len;
  const x1 = cx1 + ux * ENDPOINT_OFFSET;
  const y1 = cy1 + uy * ENDPOINT_OFFSET;
  const x2 = cx2 - ux * ENDPOINT_OFFSET;
  const y2 = cy2 - uy * ENDPOINT_OFFSET;

  // S자 2-bend 곡선
  const curve = Math.min(len * 0.20, 80);
  const px    = -uy;
  const py    =  ux;

  let cp1x = x1 + (x2 - x1) * 0.30 + px * curve;
  let cp1y = y1 + (y2 - y1) * 0.30 + py * curve;
  let cp2x = x1 + (x2 - x1) * 0.70 - px * curve;
  let cp2y = y1 + (y2 - y1) * 0.70 - py * curve;

  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  cp1x = Math.max(minX, Math.min(maxX, cp1x));
  cp1y = Math.max(minY, Math.min(maxY, cp1y));
  cp2x = Math.max(minX, Math.min(maxX, cp2x));
  cp2y = Math.max(minY, Math.min(maxY, cp2y));

  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
}

// clipPath d 생성: 뷰포트 전체에서 토큰 영역을 evenodd로 제거
const TOKEN_CLIP_PAD = 6;
function buildTokenClipD(): string {
  const W = window.innerWidth;
  const H = window.innerHeight;
  let d = `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z`;
  document.querySelectorAll('.token-card-wrapper').forEach(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = r.left - TOKEN_CLIP_PAD;
    const y = r.top  - TOKEN_CLIP_PAD;
    const w = r.width  + TOKEN_CLIP_PAD * 2;
    const h = r.height + TOKEN_CLIP_PAD * 2;
    d += ` M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`;
  });
  return d;
}

// ─────────────────────────────────────────────
// WaterConnectionOverlay
// ─────────────────────────────────────────────

export function WaterConnectionOverlay() {
  const { connections, removeConnection } = useWaterConnections();
  const { isBroken: isHydrantBroken }     = useHydrantState();
  const { tokens }                        = useTokens();
  const waterLevel                        = useWaterLevel();
  const { showWaterSupply }               = useDisplayOptions();

  function isConnectionBroken(fromId: string, fromType: string, toId: string, toType: string): boolean {
    if (fromType === 'hydrant' || fromType === 'indoor_hydrant') return isHydrantBroken(fromId);
    if (toType === 'indoor_hydrant') return isHydrantBroken(toId);
    const src = tokens.find(t => t.id === fromId);
    if (src?.statusTag?.label === '펌프고장') return true;
    return waterLevel?.emptyVehicleIds.has(fromId) ?? false;
  }

  // ── rAF 기반 위치 갱신 ──────────────────────
  const svgRef     = useRef<SVGSVGElement>(null);
  const clipPathEl = useRef<SVGPathElement>(null);

  // 마운트 직후 clipPath를 뷰포트 전체로 초기화 (빈 d면 전체가 클립되어 보이지 않음)
  useEffect(() => {
    if (clipPathEl.current) {
      clipPathEl.current.setAttribute('d', buildTokenClipD());
    }
  }, []);

  useEffect(() => {
    if (connections.length === 0) return;
    let rafId: number;

    function update() {
      const svg = svgRef.current;
      if (!svg) { rafId = requestAnimationFrame(update); return; }

      for (const conn of connections) {
        const pathD = computePathD(conn.fromId, conn.toId);
        if (!pathD) continue;

        const vis = svg.querySelector(`#wc-vis-${conn.id}`) as SVGPathElement | null;
        const dot = svg.querySelector(`#wc-dot-${conn.id}`) as SVGPathElement | null;
        const hit = svg.querySelector(`#wc-hit-${conn.id}`) as SVGPathElement | null;
        if (vis) vis.setAttribute('d', pathD);
        if (dot) dot.setAttribute('d', pathD);
        if (hit) hit.setAttribute('d', pathD);
      }

      // 토큰 위치가 바뀔 수 있으므로 매 프레임 갱신
      if (clipPathEl.current) {
        clipPathEl.current.setAttribute('d', buildTokenClipD());
      }

      rafId = requestAnimationFrame(update);
    }

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [connections]);

  // ── "송수 해제" 팝업 ─────────────────────────
  const [popup, setPopup] = useState<{ connId: string; x: number; y: number } | null>(null);

  function handleLineClick(e: React.MouseEvent, connId: string) {
    e.stopPropagation();
    setPopup({ connId, x: e.clientX, y: e.clientY });
  }

  function handleDisconnect(connId: string) {
    removeConnection(connId);
    setPopup(null);
  }

  if (!showWaterSupply) return null;   // 송수 미사용 훈련 — 연결선 자체가 없다
  if (connections.length === 0 && popup === null) return null;

  return ReactDOM.createPortal(
    <>
      <svg ref={svgRef} className="wco-svg" aria-hidden="true">
        <defs>
          {/*
            clip-rule="evenodd": 뷰포트 전체 rect에서 토큰 rect를 구멍처럼 뚫음
            → 선이 토큰 영역에 진입하면 자동으로 클립되어 토큰 뒤로 들어가는 효과
          */}
          <clipPath id="wco-token-clip">
            <path ref={clipPathEl} clipRule="evenodd" />
          </clipPath>
        </defs>

        <g clipPath="url(#wco-token-clip)">
          {connections.map(conn => {
            const broken = isConnectionBroken(conn.fromId, conn.fromType, conn.toId, conn.toType);
            return (
              <g key={conn.id} className={broken ? 'wco-group--broken' : ''}>
                <path
                  id={`wc-vis-${conn.id}`}
                  d="M 0 0 L 0 0"
                  className="wco-line"
                  style={{ pointerEvents: 'none' }}
                />
                <path
                  id={`wc-dot-${conn.id}`}
                  d="M 0 0 L 0 0"
                  className="wco-flow"
                  style={{ pointerEvents: 'none' }}
                />
                <path
                  id={`wc-hit-${conn.id}`}
                  d="M 0 0 L 0 0"
                  className="wco-hit"
                  onClick={e => handleLineClick(e, conn.id)}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {popup && (
        <>
          <div className="wco-popup-backdrop" onMouseDown={() => setPopup(null)} />
          <div className="wco-popup" style={{ left: popup.x, top: popup.y }}>
            <button
              className="wco-popup__btn"
              onMouseDown={e => { e.stopPropagation(); handleDisconnect(popup.connId); }}
            >
              송수 해제
            </button>
          </div>
        </>
      )}
    </>,
    document.body,
  );
}
