import { useRef } from 'react';
import { isDrawnInBasket } from '../../utils/basketRider';
import type { Face, FaceZone } from '../../types';
import { ControlLine } from './ControlLine';
import { useFireLine } from '../../context/FireLineContext';
import { useDisplayOptions } from '../../context/DisplayOptionsContext';

// ── 드롭 위치 보정 상수 ──────────────────────────────────────
const DROP_NUDGE_X = 0;
const DROP_NUDGE_Y = 0;
import { FACE_META, getFaceZones, getFaceZoneDataAttrs } from '../../data/faceZoneData';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { useSettings } from '../../store/settingsStore';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import { HydrantIcon } from '../shared/HydrantIcon';
import { CirculationSlot } from './CirculationSlot';
import { CIRCULATION_MIN_DISTANCE_M } from '../../config/unitMissions';
import { useHydrantCirculation } from '../../context/HydrantCirculationContext';
import { AFaceBottomZones } from './AFaceBottomZones';
import { computeDropCenter } from '../../utils/dragDrop';
import { logDragEvent } from '../../utils/dragDiagnostics';
import './ExteriorZone.css';
import { DisplayOptionsBar } from './DisplayOptionsBar';

// ─────────────────────────────────────────────
// 일반 방면 영역 — 드롭 타겟 + 자유 위치 토큰
// ─────────────────────────────────────────────

// ── 소화전 코너 위치 ────────────────────────────────────────────
// A면: 짝수 인덱스 → 좌측하단, 홀수 인덱스 → 우측하단
// B면: 좌측하단, D면: 우측하단, C면: 좌측하단(기본)
type HydrantCorner = 'bottom-left' | 'bottom-right';

function getHydrantCorner(face: Face, index: number): HydrantCorner {
  if (face === 'A') return index % 2 === 0 ? 'bottom-left' : 'bottom-right';
  if (face === 'D') return 'bottom-right';
  return 'bottom-left';   // B, C
}

// A면: 하단 밴드(직전대기·RIT·현장지휘소·임시의료소) 바로 위에 앉힌다.
//       밴드가 A면 바닥 전체 폭을 쓰므로 예전처럼 상하 중앙에 두면 겹친다.
// 그 외 면: 기존과 동일하게 하단 고정
function cornerStyle(corner: HydrantCorner, face: Face): React.CSSProperties {
  const base: React.CSSProperties = face === 'A'
    ? {
        position:      'absolute',
        // 밴드는 A면이 낮으면 max-height(100% - 42px)에 눌린다. 같은 식으로
        // 실제 높이를 구해야 낮은 화면에서 소화전이 A면 밖으로 밀려나지 않는다.
        bottom:        'calc(min(var(--a-face-band-h), 100% - 42px - var(--a-face-hydrant-clear)) + var(--a-face-band-bottom) + 6px)',
        display:       'flex',
        flexDirection: 'column',
        gap:           4,
        zIndex:        3,
      }
    : {
        position:      'absolute',
        bottom:        4,
        display:       'flex',
        flexDirection: 'column-reverse',
        gap:           4,
        zIndex:        3,
      };
  return corner === 'bottom-left'
    ? { ...base, left: 4, alignItems: 'flex-start' }
    : { ...base, right: 4, alignItems: 'flex-end' };
}

/**
 * 소화전 하나와 그 위의 순환보수 칸.
 *
 * **한 상자로 감싸는 이유가 있다.** 소화전 기둥은 A면이 `column`, 나머지 면이
 * `column-reverse` 라(cornerStyle) 순환칸을 기둥의 형제로 두면 면에 따라 위아래가
 * 뒤집힌다. 이 상자가 자기 안에서 세로를 정하므로 어느 면에서든 순환칸이 위다.
 *
 * 칸은 **거리 150m 이상**일 때만 생긴다. 그 아래에서는 호스를 연장하면 되므로
 * 순환보수라는 것 자체가 없다.
 */
function HydrantStack({ hydrant, zoneKey, face }: {
  hydrant: { id: string; name: string; distanceM: number };
  zoneKey: string;
  face:    Face;
}) {
  /*
   * A면은 세로가 없다 — 구역 높이가 소화전 자체보다 낮다(실측 130px 대 116px,
   * HydrantIcon.css 주석의 「A면은 이 크기를 다 담지 못한다」와 같은 사정).
   * 그대로 두면 5대가 200px 가까이 건물 쪽으로 넘어간다. 성장 높이를 묶어
   * 세 대까지만 쌓고 그 위는 옆 열로 접는다(CirculationSlot.css).
   */
  const style = face === 'A'
    ? ({ '--circ-max-h': '124px' } as React.CSSProperties)
    : undefined;

  return (
    <div className="hydrant-stack" style={style}>
      {hydrant.distanceM >= CIRCULATION_MIN_DISTANCE_M && (
        <CirculationSlot
          hydrantId={hydrant.id}
          hydrantName={`${hydrant.name} 소화전`}
          zoneKey={zoneKey}
        />
      )}
      <HydrantIcon id={hydrant.id} name={hydrant.name} distanceM={hydrant.distanceM} />
    </div>
  );
}

function FaceGeneralZone({ zone, face }: { zone: FaceZone; face: Face }) {
  const { tokens, positions, moveToken }         = useTokens();
  const { victims, victimPositions, moveVictim } = useVictims();
  const { hydrantSetup }                         = useSettings();
  const { circulationIds }                       = useHydrantCirculation();

  // 이 방면에 배정된 소화전 필터링 후 코너별 그룹화
  const faceHydrants = hydrantSetup.filter(h => h.side === face);
  const leftHydrants  = faceHydrants.filter((_, i) => getHydrantCorner(face, i) === 'bottom-left');
  const rightHydrants = faceHydrants.filter((_, i) => getHydrantCorner(face, i) === 'bottom-right');

  const zoneKey     = `face-${face}`;
  /*
   * 바스켓에 탄 활동대는 AerialOverlay 가, 순환대는 순환칸이 그린다 —
   * 여기서 또 그리면 한 토큰이 두 번 보인다. 순환대의 zoneKey 는 이 면 그대로다
   * (자리를 옮긴 것이 아니라 소화전 옆에 선 것이다 — HydrantCirculationContext).
   */
  const zoneTokens  = tokens.filter(
    t => t.zoneKey === zoneKey && !isDrawnInBasket(tokens, t) && !circulationIds.has(t.id),
  );
  // 이송 연결된 구조대상자는 출동대 토큰 우측에 붙어 렌더된다(TokenCard) — 구역 배치에서 제외.
  const zoneVictims = victims.filter(v => v.zoneKey === zoneKey && !v.carriedBy);

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();

    const tokenId  = e.dataTransfer.getData('tokenId');
    const victimId = e.dataTransfer.getData('victimId');
    if (!tokenId && !victimId) {
      logDragEvent('FaceGeneralZone drop rejected', `zone=${zoneKey} payload 없음`);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = computeDropCenter(e, rect, DROP_NUDGE_X, DROP_NUDGE_Y);

    if (tokenId)  moveToken(tokenId,   zoneKey, { x, y });
    if (victimId) moveVictim(victimId, zoneKey, { x, y });
    logDragEvent('FaceGeneralZone drop', `zone=${zoneKey} tokenId=${tokenId} victimId=${victimId}`);
  }

  return (
    <div
      className="face-general-zone"
      data-zone-key={zoneKey}
      {...getFaceZoneDataAttrs(zone)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <span className="face-general-zone__label">{zone.face}</span>

      {/* 표시옵션 — C면 좌측 상단. 이 자리 드롭을 포기하는 대신
          제어 대상(보드) 바로 옆에 둔다 */}
      {face === 'C' && <DisplayOptionsBar />}

      {/* 출동대 토큰 — 소속대는 흐리게(무전 상대가 아니라는 표시) */}
      {zoneTokens.map(token => (
        <TokenCard
          key={token.id}
          token={token}
          absPos={positions[token.id]}
        />
      ))}
      {/* 구조대상자 토큰 */}
      {zoneVictims.map(victim => (
        <VictimCard key={victim.id} victim={victim} absPos={victimPositions[victim.id]} />
      ))}

      {/* 소화전 아이콘 — 좌측 (A면: 하단 밴드 위 / 그 외: 하단) */}
      {leftHydrants.length > 0 && (
        <div style={cornerStyle('bottom-left', face)}>
          {leftHydrants.map(h => <HydrantStack key={h.id} hydrant={h} zoneKey={zoneKey} face={face} />)}
        </div>
      )}

      {/* 소화전 아이콘 — 우측 (A면: 하단 밴드 위 / 그 외: 하단) */}
      {rightHydrants.length > 0 && (
        <div style={cornerStyle('bottom-right', face)}>
          {rightHydrants.map(h => <HydrantStack key={h.id} hydrant={h} zoneKey={zoneKey} face={face} />)}
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────
// ExteriorZone — 단일 면의 전체 외곽 공간
// ─────────────────────────────────────────────

interface Props {
  face: Face;
}

/** 소방통제선 띠 높이(px). CSS 의 여백 계산과 맞물려 있으니 함께 바꿀 것 */
const FIRE_LINE_H = 15;
/** 경찰통제선 띠 높이(px) — 바닥 고정 */
const POLICE_LINE_H = 15;
/** 띠가 A면 하단 밴드에 닿기 전에 남길 최소 간격 */
const FIRE_LINE_MIN_GAP = 6;

export function ExteriorZone({ face }: Props) {
  const meta      = FACE_META[face];
  const zones     = getFaceZones(face);
  const faceZone  = zones.find(z => z.category === 'face')!;
  const isHorizontal = face === 'A' || face === 'C';
  const { showFireLine, fireLineY, setFireLineY, showPoliceLine } = useFireLine();
  // 표시옵션에서 통제선을 끄면 띠가 사라진다(설치 버튼은 B면 상단 ControlLineToggles 에 있다)
  const { showControlLine } = useDisplayOptions();
  const { moveToken } = useTokens();
  const { moveVictim } = useVictims();
  // A면 소화전은 하단 밴드 위에 앉는다 — 있을 때만 밴드에서 그 높이를 뺀다
  const { hydrantSetup } = useSettings();
  const hasFaceHydrant = hydrantSetup.some(h => h.side === face);

  // ── 소방통제선 세로 드래그 ────────────────────────────────────
  // A면 최상단(0)에서 아래로, 하단 밴드 윗변까지만 내려간다.
  // 저장은 하지 않는다(설치 상태와 같은 수명 — 새로고침하면 초기화).
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; grabOffset: number } | null>(null);

  /** 지금 화면에서 띠가 내려갈 수 있는 최대 top(px). 밴드 높이가 배율마다 달라 실측한다 */
  function fireLineMaxTop(host: HTMLElement, hostH: number): number {
    let max = hostH - FIRE_LINE_H - POLICE_LINE_H;
    const hostTop = host.getBoundingClientRect().top;
    const band = host.querySelector('.a-face-band');
    if (band) {
      max = Math.min(max, band.getBoundingClientRect().top - hostTop - FIRE_LINE_H - FIRE_LINE_MIN_GAP);
    }
    return Math.max(0, max);
  }

  function handleFireLinePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const host = rootRef.current;
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    // 잡은 지점과 띠 윗변의 차이를 기억해야 띠가 커서로 튀지 않는다
    dragRef.current = {
      pointerId:  e.pointerId,
      grabOffset: e.clientY - hostRect.top - fireLineY * hostRect.height,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handleFireLinePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const host = rootRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !host) return;
    const hostRect = host.getBoundingClientRect();
    if (hostRect.height <= 0) return;
    const top = e.clientY - hostRect.top - drag.grabOffset;
    const clamped = Math.max(0, Math.min(fireLineMaxTop(host, hostRect.height), top));
    setFireLineY(clamped / hostRect.height);
  }

  function handleFireLinePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // 띠가 A면 위에 떠 있어 그 줄에 떨어뜨린 토큰을 가로챈다 — 아래 방면 구역으로 넘긴다.
  // (띠는 드래그하려고 pointer-events 를 켜 둔 상태라 그냥 두면 드롭이 조용히 거부된다)
  function handleBandDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleBandDrop(e: React.DragEvent<HTMLDivElement>) {
    const zone = rootRef.current?.querySelector('.face-general-zone');
    if (!zone) return;
    const tokenId  = e.dataTransfer.getData('tokenId');
    const victimId = e.dataTransfer.getData('victimId');
    if (!tokenId && !victimId) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = computeDropCenter(e, zone.getBoundingClientRect(), DROP_NUDGE_X, DROP_NUDGE_Y);
    if (tokenId)  moveToken(tokenId,   `face-${face}`, { x, y });
    if (victimId) moveVictim(victimId, `face-${face}`, { x, y });
  }

  return (
    <div
      className={[
        'exterior-zone',
        `exterior-zone--${face.toLowerCase()}`,
        meta.isPrimary  ? 'exterior-zone--primary'    : '',
        isHorizontal    ? 'exterior-zone--horizontal' : 'exterior-zone--vertical',
        hasFaceHydrant  ? 'exterior-zone--has-hydrant' : '',
      ].filter(Boolean).join(' ')}
      data-deployment-face={face}
      ref={rootRef}
    >
      {/* 소방통제선 — A면 내부 최상단(지면 표시 바로 아래, 경계와 겹치지 않음).
          TacticalArea.tsx 의 .tactical-area__slab(z-index:10)에 두면 A면(z-index:15)에
          가려 보이지 않아, A면 자신의 쌓임 맥락 안에서 그린다(2026-08-18). */}
      {face === 'A' && showControlLine && showFireLine && (
        <ControlLine
          variant="fire"
          height={FIRE_LINE_H}
          className="control-line--draggable"
          style={{ position: 'absolute', top: `${(fireLineY * 100).toFixed(4)}%`, left: 0, right: 0, zIndex: 2 }}
          title="위아래로 끌어 통제선 위치를 조절한다"
          onPointerDown={handleFireLinePointerDown}
          onPointerMove={handleFireLinePointerMove}
          onPointerUp={handleFireLinePointerUp}
          onPointerCancel={handleFireLinePointerUp}
          onDragOver={handleBandDragOver}
          onDrop={handleBandDrop}
        />
      )}
      {/* 경찰통제선 — A면 최하단 고정. 소방통제선과 달리 움직이지 않는다 */}
      {face === 'A' && showControlLine && showPoliceLine && (
        <ControlLine variant="police" height={POLICE_LINE_H} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2 }} />
      )}
      <div className="exterior-zone__content">
        <FaceGeneralZone zone={faceZone} face={face} />
      </div>
      {/* A면 하단 밴드 — 직전대기·RIT·현장지휘소·임시의료소가 바닥 전체 폭을 나눠 쓴다
          (2026-08-21. 그 전에는 좌·우 상자 두 개였고 가운데가 비어 있었다).
          exterior-zone__content 다음에 둬서 A면 워터마크 라벨 위에 그려지게 한다. */}
      {face === 'A' && <AFaceBottomZones />}
    </div>
  );
}
