import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useHydrantState }     from '../../context/HydrantStateContext';
import { useTokens }           from '../../context/TokenContext';
import { useWaterLevel }       from '../../context/WaterLevelContext';
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

  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

// ─────────────────────────────────────────────
// WaterConnectionOverlay
// ─────────────────────────────────────────────

export function WaterConnectionOverlay() {
  const { connections, removeConnection } = useWaterConnections();
  const { isBroken: isHydrantBroken }     = useHydrantState();
  const { tokens }                        = useTokens();
  const waterLevel                        = useWaterLevel();

  // ── 고장 여부 판별 ──────────────────────────
  // 소화전 고장: HydrantStateContext 기준
  // 펌프/물탱크 고장: statusTag === '펌프고장' 또는 수량 0% 소진
  function isConnectionBroken(fromId: string, fromType: string): boolean {
    if (fromType === 'hydrant') return isHydrantBroken(fromId);
    const src = tokens.find(t => t.id === fromId);
    if (src?.statusTag?.label === '펌프고장') return true;
    return waterLevel?.emptyVehicleIds.has(fromId) ?? false;
  }

  // ── rAF 기반 위치 갱신 ──────────────────────
  const svgRef = useRef<SVGSVGElement>(null);

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

  if (connections.length === 0 && popup === null) return null;

  return ReactDOM.createPortal(
    <>
      {/* ── SVG 오버레이 ─────────────────────── */}
      <svg ref={svgRef} className="wco-svg" aria-hidden="true">
        {connections.map(conn => {
          const broken = isConnectionBroken(conn.fromId, conn.fromType);
          return (
            <g key={conn.id} className={broken ? 'wco-group--broken' : ''}>
              {/* 배관 선 */}
              <path
                id={`wc-vis-${conn.id}`}
                d="M 0 0 L 0 0"
                className="wco-line"
                style={{ pointerEvents: 'none' }}
              />

              {/* 흐르는 물(점) — 고장 시 정지 */}
              <path
                id={`wc-dot-${conn.id}`}
                d="M 0 0 L 0 0"
                className="wco-flow"
                style={{ pointerEvents: 'none' }}
              />

              {/* 클릭 히트 영역 */}
              <path
                id={`wc-hit-${conn.id}`}
                d="M 0 0 L 0 0"
                className="wco-hit"
                onClick={e => handleLineClick(e, conn.id)}
              />
            </g>
          );
        })}
      </svg>

      {/* ── 송수 해제 팝업 ───────────────────── */}
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
