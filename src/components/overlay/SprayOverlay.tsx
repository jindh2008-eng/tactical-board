import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type { SprayState } from '../../types';
import { useTokens }         from '../../context/TokenContext';
import { useDisplayOptions } from '../../context/DisplayOptionsContext';
import './SprayOverlay.css';
import { stagePortalTarget } from '../../utils/stagePortal';

// ─────────────────────────────────────────────
// 방수 상태별 설정
// ─────────────────────────────────────────────

interface SprayConfig {
  halfDeg:  number;   // 팬 반각도
  streams:  number;   // 스트림 개수 (0이면 없음)
  streamOffsetDeg: number; // 좌우 스트림 오프셋
}

const SPRAY_CONFIG: Record<SprayState, SprayConfig> = {
  '100%': { halfDeg: 22, streams: 3, streamOffsetDeg: 10 },
  '30%':  { halfDeg: 14, streams: 1, streamOffsetDeg: 0  },
  '0%':   { halfDeg:  5, streams: 0, streamOffsetDeg: 0  },
};

// ─────────────────────────────────────────────
// 팬(부채꼴) 경로 계산
// ─────────────────────────────────────────────

function buildFanPath(
  ox: number, oy: number,
  tx: number, ty: number,
  halfDeg: number,
  maxHalfR: number,
): string {
  const dx = tx - ox;
  const dy = ty - oy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 4) return '';

  const angle   = Math.atan2(dy, dx);
  // 끝단 반경을 maxHalfR로 상한 → 거리에 비례하지 않도록 클램프
  const rawHalfR    = len * Math.sin(halfDeg * Math.PI / 180);
  const clampedR    = Math.min(rawHalfR, maxHalfR);
  const halfRad     = Math.asin(Math.min(clampedR / len, 1));

  const lx = ox + len * Math.cos(angle - halfRad);
  const ly = oy + len * Math.sin(angle - halfRad);
  const rx = ox + len * Math.cos(angle + halfRad);
  const ry = oy + len * Math.sin(angle + halfRad);

  const arcR = Math.max(1, clampedR);
  return `M ${ox} ${oy} L ${lx} ${ly} A ${arcR} ${arcR} 0 0 1 ${rx} ${ry} Z`;
}

// ─────────────────────────────────────────────
// 스트림 선 경로 계산 (오프셋 각도 적용)
// ─────────────────────────────────────────────

function buildStreamPath(
  ox: number, oy: number,
  tx: number, ty: number,
  offsetDeg: number,
  maxHalfR:  number,
  lengthRatio = 1,
): string {
  const dx  = tx - ox;
  const dy  = ty - oy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 4) return '';

  // 스트림 오프셋도 팬 폭 상한 내로 클램프
  const rawOffsetR   = len * Math.sin(Math.abs(offsetDeg) * Math.PI / 180);
  const clampedOff   = Math.min(rawOffsetR, maxHalfR);
  const clampedDeg   = offsetDeg === 0 ? 0
    : Math.sign(offsetDeg) * Math.asin(Math.min(clampedOff / len, 1)) * 180 / Math.PI;

  const angle    = Math.atan2(dy, dx) + clampedDeg * Math.PI / 180;
  const endLen   = len * lengthRatio;
  const ex = ox + endLen * Math.cos(angle);
  const ey = oy + endLen * Math.sin(angle);

  return `M ${ox} ${oy} L ${ex} ${ey}`;
}

// ─────────────────────────────────────────────
// SprayOverlay
// ─────────────────────────────────────────────

export function SprayOverlay() {
  const { showSpray } = useDisplayOptions();
  if (!showSpray) return null;
  return <SprayOverlayInner />;
}

function SprayOverlayInner() {
  const { tokens, setSprayState } = useTokens();
  const svgRef     = useRef<SVGSVGElement>(null);
  // 방수선 클릭 → 중단 팝업. 송수 해제(WaterConnectionOverlay)와 같은 조작 문법이다.
  const [popup, setPopup] = useState<{ tokenId: string; x: number; y: number } | null>(null);
  const tokensRef  = useRef(tokens);
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);

  const activeTokens = tokens.filter(t => t.sprayState != null && t.sprayTarget != null);

  // rAF 루프: 토큰 위치 추적 + 경로 갱신
  useEffect(() => {
    if (activeTokens.length === 0) return;
    let rafId: number;

    function update() {
      const svg   = svgRef.current;
      if (!svg) { rafId = requestAnimationFrame(update); return; }

      const board     = document.getElementById('tactical-area');
      const boardRect = board?.getBoundingClientRect();

      // 층 높이 기준 끝단 반경 상한 (zone-cell 높이의 1/5)
      const zoneCell  = board?.querySelector('.zone-cell');
      const floorH    = zoneCell?.getBoundingClientRect().height ?? 80;
      const maxHalfR  = floorH / 5;

      for (const token of tokensRef.current) {
        if (!token.sprayState || !token.sprayTarget) continue;

        const el = document.querySelector(`[data-token-id="${token.id}"]`);

        // 드래그 중이거나 DOM 없으면 숨김
        const isDragging = el?.getAttribute('data-dragging') === 'true';
        if (!el || isDragging) {
          const hide = (id: string) => {
            const p = svg.querySelector(`#${id}`) as SVGPathElement | null;
            if (p) p.setAttribute('d', '');
          };
          hide(`sf-${token.id}`);
          hide(`ss-${token.id}-0`);
          hide(`ss-${token.id}-1`);
          hide(`ss-${token.id}-2`);
          hide(`sh-${token.id}`);
          continue;
        }

        // 물이 나오는 자리에서 선이 시작해야 자연스럽다 — 관창 핸들이 있으면
        // 그 중심을, 없으면(대기 구역 등 핸들이 숨은 경우) 토큰 중심을 쓴다.
        const originEl  = el.querySelector('.nozzle-handle') ?? el;
        const originRect = originEl.getBoundingClientRect();
        const ox = originRect.left + originRect.width  / 2;
        const oy = originRect.top  + originRect.height / 2;
        const tx = (boardRect?.left ?? 0) + token.sprayTarget.x * (boardRect?.width  ?? 1);
        const ty = (boardRect?.top  ?? 0) + token.sprayTarget.y * (boardRect?.height ?? 1);

        const baseCfg = SPRAY_CONFIG[token.sprayState];

        // 초진 구역 방수 여부: 팬 크기 1/3 적용
        const floorId   = token.sprayTarget?.floorId;
        const isInitial = !!floorId &&
          !!document.querySelector(`[data-floor-id="${floorId}"] .zone-cell--fs-initial`);
        const cfg = isInitial
          ? { halfDeg: baseCfg.halfDeg / 3, streams: 1, streamOffsetDeg: 0 }
          : baseCfg;

        // 팬 경로
        const fanEl = svg.querySelector(`#sf-${token.id}`) as SVGPathElement | null;
        if (fanEl) fanEl.setAttribute('d', buildFanPath(ox, oy, tx, ty, cfg.halfDeg, maxHalfR));

        // 스트림 경로
        const offsets = cfg.streams === 3
          ? [-cfg.streamOffsetDeg, 0, cfg.streamOffsetDeg]
          : cfg.streams === 1 ? [0] : [];

        offsets.forEach((off, i) => {
          const streamEl = svg.querySelector(`#ss-${token.id}-${i}`) as SVGPathElement | null;
          if (streamEl) streamEl.setAttribute('d', buildStreamPath(ox, oy, tx, ty, off, maxHalfR, 0.92));
        });

        // 클릭 판정용 굵은 투명 선 — 가운데 줄기에만 둔다(부채꼴 전체를 덮으면
        // 밑에 있는 토큰·구역 클릭을 가린다)
        const hitEl = svg.querySelector(`#sh-${token.id}`) as SVGPathElement | null;
        if (hitEl) hitEl.setAttribute('d', buildStreamPath(ox, oy, tx, ty, 0, maxHalfR, 0.92));
        // 사용 안 하는 스트림 숨김
        for (let i = offsets.length; i < 3; i++) {
          const streamEl = svg.querySelector(`#ss-${token.id}-${i}`) as SVGPathElement | null;
          if (streamEl) streamEl.setAttribute('d', '');
        }
      }

      rafId = requestAnimationFrame(update);
    }

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [activeTokens.length]);

  if (activeTokens.length === 0 && popup === null) return null;

  return ReactDOM.createPortal(
    <>
    <svg ref={svgRef} className="spray-svg" aria-hidden="true">
      {activeTokens.map(token => {
        if (!token.sprayState) return null;
        const cls = token.sprayState.replace('%', 'pct');
        const cfg = SPRAY_CONFIG[token.sprayState];
        const offsets = cfg.streams === 3
          ? [-cfg.streamOffsetDeg, 0, cfg.streamOffsetDeg]
          : cfg.streams === 1 ? [0] : [];

        return (
          <g key={token.id}>
            {/* 팬 */}
            <path id={`sf-${token.id}`} d="" className={`spray-fan spray-fan--${cls}`} />
            {/* 스트림 */}
            {[0, 1, 2].map(i => (
              <path
                key={i}
                id={`ss-${token.id}-${i}`}
                d=""
                className={[
                  'spray-stream',
                  offsets[i] !== 0 ? 'spray-stream--side' : '',
                ].filter(Boolean).join(' ')}
              />
            ))}
            {/* 클릭 판정선 — 눌러서 방수 중단 */}
            <path
              id={`sh-${token.id}`}
              d=""
              className="spray-hit"
              onClick={e => { e.stopPropagation(); setPopup({ tokenId: token.id, x: e.clientX, y: e.clientY }); }}
            />
          </g>
        );
      })}
    </svg>

    {popup && (
      <>
        <div className="spray-popup-backdrop" onMouseDown={() => setPopup(null)} />
        <div className="spray-popup" style={{ left: popup.x, top: popup.y }}>
          <button
            className="spray-popup__btn"
            onMouseDown={e => {
              e.stopPropagation();
              setSprayState(popup.tokenId, null);
              setPopup(null);
            }}
          >
            방수 중단
          </button>
        </div>
      </>
    )}
    </>,
    stagePortalTarget(),
  );
}
