import { useRef } from 'react';
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
import { ImminentStandby } from './ImminentStandby';
import { MedicalPostBox } from './StandbyColumn';
import { computeDropCenter } from '../../utils/dragDrop';
import { logDragEvent } from '../../utils/dragDiagnostics';
import './ExteriorZone.css';

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

// A면: 좌/우측에 배치하되 상하 중앙(높이의 중간 지점) 고정
// 그 외 면: 기존과 동일하게 하단 고정
function cornerStyle(corner: HydrantCorner, face: Face): React.CSSProperties {
  const base: React.CSSProperties = face === 'A'
    ? {
        position:      'absolute',
        top:           '50%',
        transform:     'translateY(-50%)',
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

function FaceGeneralZone({ zone, face }: { zone: FaceZone; face: Face }) {
  const { tokens, positions, moveToken }         = useTokens();
  const { victims, victimPositions, moveVictim } = useVictims();
  const { hydrantSetup }                         = useSettings();

  // 이 방면에 배정된 소화전 필터링 후 코너별 그룹화
  const faceHydrants = hydrantSetup.filter(h => h.side === face);
  const leftHydrants  = faceHydrants.filter((_, i) => getHydrantCorner(face, i) === 'bottom-left');
  const rightHydrants = faceHydrants.filter((_, i) => getHydrantCorner(face, i) === 'bottom-right');

  const zoneKey     = `face-${face}`;
  const zoneTokens  = tokens.filter(t => t.zoneKey === zoneKey);
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

      {/* 출동대 토큰 */}
      {zoneTokens.map(token => (
        <TokenCard key={token.id} token={token} absPos={positions[token.id]} />
      ))}
      {/* 구조대상자 토큰 */}
      {zoneVictims.map(victim => (
        <VictimCard key={victim.id} victim={victim} absPos={victimPositions[victim.id]} />
      ))}

      {/* 소화전 아이콘 — 좌측 (A면: 상하 중앙 / 그 외: 하단) */}
      {leftHydrants.length > 0 && (
        <div style={cornerStyle('bottom-left', face)}>
          {leftHydrants.map(h => (
            <HydrantIcon key={h.id} id={h.id} name={h.name} distanceM={h.distanceM} />
          ))}
        </div>
      )}

      {/* 소화전 아이콘 — 우측 (A면: 상하 중앙 / 그 외: 하단) */}
      {rightHydrants.length > 0 && (
        <div style={cornerStyle('bottom-right', face)}>
          {rightHydrants.map(h => (
            <HydrantIcon key={h.id} id={h.id} name={h.name} distanceM={h.distanceM} />
          ))}
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
/** 띠가 A면 하단 박스(직전대기·임시의료소)에 닿기 전에 남길 최소 간격 */
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

  // ── 소방통제선 세로 드래그 ────────────────────────────────────
  // A면 최상단(0)에서 아래로, 하단 박스 윗변까지만 내려간다.
  // 저장은 하지 않는다(설치 상태와 같은 수명 — 새로고침하면 초기화).
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; grabOffset: number } | null>(null);

  /** 지금 화면에서 띠가 내려갈 수 있는 최대 top(px). 박스 크기가 배율마다 달라 실측한다 */
  function fireLineMaxTop(host: HTMLElement, hostH: number): number {
    let max = hostH - FIRE_LINE_H - POLICE_LINE_H;
    const hostTop = host.getBoundingClientRect().top;
    for (const sel of ['.a-face-zone--medical', '.a-face-zone--imminent']) {
      const box = host.querySelector(sel);
      if (!box) continue;
      max = Math.min(max, box.getBoundingClientRect().top - hostTop - FIRE_LINE_H - FIRE_LINE_MIN_GAP);
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
      {/* A면 하단 구역 — 좌: 직전대기·RIT / 우: 임시의료소 (2026-08-18 좌측 패널에서 이동).
          exterior-zone__content 다음에 둬서 A면 워터마크 라벨 위에 그려지게 한다. */}
      {face === 'A' && (
        <>
          <ImminentStandby />
          <MedicalPostBox />
        </>
      )}
    </div>
  );
}
