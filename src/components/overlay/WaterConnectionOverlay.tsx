import { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useHydrantState }     from '../../context/HydrantStateContext';
import { useTokens }           from '../../context/TokenContext';
import { useWaterLevel }       from '../../context/WaterLevelContext';
import { useDisplayOptions }   from '../../context/DisplayOptionsContext';
import { useWaterLinePeek }    from '../../context/waterLinePeek';
import { WaterDisconnectPopup } from '../shared/WaterDisconnectPopup';
import './WaterConnectionOverlay.css';
import { rectToStage, stageBounds, stagePortalTarget } from '../../utils/stagePortal';

// ─────────────────────────────────────────────
// 좌표 계산
// ─────────────────────────────────────────────

const ENDPOINT_OFFSET = 16;

/**
 * 선의 출발점 — **번호 배지가 있으면 거기서 뽑는다.**
 *
 * 펌프·물탱크는 어느 대와 이어졌는지를 토큰 위 번호 배지로 말한다(TokenCard).
 * 선이 토큰 한복판에서 나오면 배지와 선이 따로 놀아, 배지 ①이 가리키는 대가
 * 어느 선의 끝인지 다시 눈으로 좇아야 한다. 그 배지에서 출발시키면 둘이 한
 * 덩어리로 읽힌다.
 *
 * 배지가 없는 출발점(소화전 등)은 예전대로 토큰 자체를 쓴다.
 */
function connectionAnchor(fromId: string, toId: string): Element | null {
  return document.querySelector(`[data-water-anchor="${CSS.escape(`${fromId}:${toId}`)}"]`)
      ?? document.querySelector(`[data-token-id="${fromId}"]`);
}

function computePathD(fromId: string, toId: string): string | null {
  const fromEl = connectionAnchor(fromId, toId);
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

/* ─────────────────────────────────────────────
   clipPath d 생성 — 뷰포트 전체에서 토큰 영역을 evenodd 로 제거

   선이 토큰에 닿으면 토큰 **뒤로** 들어가 보이게 하는 장치다. 그런데
   구멍은 그리는 것만 막는 것이 아니라 **누르는 것도 막는다** — SVG 는
   클립 밖 영역이 포인터를 받지 않는다. 그래서 이 구멍 목록이 곧
   「선이 가리지 못하는 곳」의 목록이다.

   ## 왜 토큰 부속까지 뚫는가

   `.wco-hit` 은 눌러서 해제하려고 18px 짜리 투명 스트로크를 깔고 있고
   SVG 는 z-index 9800 이라 토큰 위에 얹힌다. 토큰 본체는 구멍이 있어
   멀쩡했지만 **게이지·방수포 핸들·번호 배지는 래퍼 박스 밖**이라
   (`left: 100%` 로 오른쪽·위쪽에 붙는다) 구멍에 들지 못했다. 실측에서
   5개 연결이 부챗살로 퍼진 펌프의 3·4·5번 배지와 게이지 중앙, 방수포
   핸들이 전부 선의 클릭 영역에 먹혔다 — 배지는 「송수라인」을 껐을 때
   유일한 해제 경로라 그대로 두면 끊을 방법이 없다.

   부속은 작아서 여유(pad)를 2px 만 준다. 6px 을 주면 배지 구멍이
   커져 **선이 제 배지에서 출발하는 모습**이 끊긴다 — 선의 시작점이
   배지 중심에서 16px(ENDPOINT_OFFSET) 인데 구멍 경계가 그 밖으로
   밀려나기 때문이다.

   ## ⚠ 구멍끼리 겹치면 상쇄된다

   `clip-rule: evenodd` 라 한 점을 감싼 경로가 짝수면 **바깥**이다. 구멍
   두 개가 겹친 자리는 3번 감싸이므로 다시 안쪽 — 즉 **막힌다.**

   방수포 핸들을 따로 뚫었다가 이걸로 되돌렸다. 핸들은 게이지 우측 상단에
   얹혀 있어 게이지 구멍 **안**에 완전히 들어가는데, 자기 구멍을 하나 더
   뚫으니 겹친 영역이 되살아나 게이지 중앙과 핸들이 그대로 먹혔다(실측).
   게이지 구멍 하나가 이미 둘을 덮는다.

   그래서 **새 구멍을 넣을 때는 기존 구멍과 겹치지 않는지 먼저 본다.**
   지금 남은 겹침은 얇은 띠 둘뿐이고(토큰↔게이지 사이 4px, 배지 아래 5px)
   어느 조작부의 중심도 덮지 않는다.

   관창(진압·구조) 핸들은 토큰 오른쪽·위로 조금 튀어나와 바깥 6.8px 이
   구멍 밖이다. 뚫으면 래퍼 구멍과 겹쳐 상쇄되므로 그대로 뒀다 —
   처음부터 그랬고, 활동대는 들어오는 선이 하나뿐이라 실제로 먹히는
   경우가 드물다.
   ─────────────────────────────────────────────*/

const TOKEN_CLIP_PAD = 6;
/** 토큰에 딸린 조작부 — 선이 가려서는 안 되는 것들 (서로 겹치지 않아야 한다) */
const PART_SELECTOR  = '.water-gauge, .token-supply-badge';
const PART_CLIP_PAD  = 2;

function buildTokenClipD(): string {
  // SVG 가 스테이지 안 포털이라 클립 경로도 캔버스 좌표계여야 한다.
  const { width: W, height: H } = stageBounds();
  let d = `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z`;

  const punch = (selector: string, pad: number) => {
    document.querySelectorAll(selector).forEach(el => {
      const r = rectToStage(el.getBoundingClientRect());
      if (!r.width || !r.height) return;
      const x = r.left - pad;
      const y = r.top  - pad;
      const w = r.width  + pad * 2;
      const h = r.height + pad * 2;
      d += ` M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`;
    });
  };

  punch('.token-card-wrapper', TOKEN_CLIP_PAD);
  punch(PART_SELECTOR,        PART_CLIP_PAD);
  return d;
}

// ─────────────────────────────────────────────
// WaterConnectionOverlay
// ─────────────────────────────────────────────

/**
 * 「송수라인」을 끄면 사라지는 연결 — **활동대로 들어가는 선만**이다.
 *
 * 판을 덮는 것이 이쪽이다. 펌프 하나에서 진압·구조 여러 대로 갈라져 나가
 * 구역을 가로지르는데, 그 정보는 펌프 토큰 위 번호 배지가 그대로 말해 준다.
 * 소화전↔차량·차량↔차량은 수가 적고 급수 계통의 뼈대라 늘 보인다.
 *
 * 감출 선도 **그리기는 그린다** — 숨기는 것은 CSS(`.wco-group--hidden`)다.
 * 송수를 끌 때 잠깐 되살려야 하는데(useWaterConnectDrag), 렌더에서 빼 버리면
 * 되살아난 첫 프레임에 좌표가 없어 선이 튄다. 매 프레임 좌표는 그대로 넣고
 * 보일지만 CSS 에 맡긴다.
 */
const HIDABLE_TO_TYPES = new Set(['suppression', 'rescue']);

export function WaterConnectionOverlay() {
  const { connections, removeConnection } = useWaterConnections();
  const { isBroken: isHydrantBroken }     = useHydrantState();
  const { tokens }                        = useTokens();
  const waterLevel                        = useWaterLevel();
  const { showWaterLine }                 = useDisplayOptions();
  const { peekConnId }                    = useWaterLinePeek();

  /** 지금 감춰 둘 연결 id — 표시옵션이 꺼져 있고 활동대로 가는 선 */
  const hiddenIds = useMemo(
    () => new Set(
      showWaterLine ? [] : connections.filter(c => HIDABLE_TO_TYPES.has(c.toType)).map(c => c.id),
    ),
    [connections, showWaterLine],
  );

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
        const vis = svg.querySelector(`#wc-vis-${conn.id}`) as SVGPathElement | null;
        const dot = svg.querySelector(`#wc-dot-${conn.id}`) as SVGPathElement | null;
        const hit = svg.querySelector(`#wc-hit-${conn.id}`) as SVGPathElement | null;

        const pathD = computePathD(conn.fromId, conn.toId);
        if (!pathD) {
          // 양 끝 중 하나가 DOM 에서 사라졌거나(구역 이동·리렌더) 두 점이 겹쳤다.
          // 예전에는 그냥 continue 라 **직전 d 가 그대로 남아 선이 얼어붙었다**(잔상).
          // 그릴 수 없으면 지운다 — 다음 프레임에 다시 그려지면 그만이다.
          for (const el of [vis, dot, hit]) el?.removeAttribute('d');
          continue;
        }
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
            const cls = [
              broken                 ? 'wco-group--broken' : '',
              hiddenIds.has(conn.id) ? 'wco-group--hidden' : '',
              conn.id === peekConnId ? 'wco-group--peek'   : '',
            ].filter(Boolean).join(' ');
            return (
              <g key={conn.id} data-conn-id={conn.id} className={cls}>
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
        <WaterDisconnectPopup
          x={popup.x} y={popup.y}
          onDisconnect={() => handleDisconnect(popup.connId)}
          onClose={() => setPopup(null)}
        />
      )}
    </>,
    stagePortalTarget(),
  );
}
