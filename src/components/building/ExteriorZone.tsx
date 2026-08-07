import type { Face, FaceZone } from '../../types';
import { FireLine } from './FireLine';
import { useFireLine } from '../../context/FireLineContext';

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
import { SiamesePipeIcon } from './SiamesePipeIcon';
import { CommandProcedureStatusBox } from './CommandProcedureStatusBox';
import { ImminentStandby } from './ImminentStandby';
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
  const { hydrantSetup, building }               = useSettings();
  const hasSiamesePipe = face !== 'D' && (building.siamesePipeFaces ?? []).includes(face);

  // 이 방면에 배정된 소화전 필터링 후 코너별 그룹화
  const faceHydrants = hydrantSetup.filter(h => h.side === face);
  const leftHydrants  = faceHydrants.filter((_, i) => getHydrantCorner(face, i) === 'bottom-left');
  const rightHydrants = faceHydrants.filter((_, i) => getHydrantCorner(face, i) === 'bottom-right');

  const zoneKey     = `face-${face}`;
  const zoneTokens  = tokens.filter(t => t.zoneKey === zoneKey);
  const zoneVictims = victims.filter(v => v.zoneKey === zoneKey);

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

      {hasSiamesePipe && <SiamesePipeIcon face={face} />}

      {/* D면 우측 상단 — 지휘절차 수행 여부 표시 */}
      {face === 'D' && <CommandProcedureStatusBox />}

      {/* A면 좌측 하단 — 직전대기 고정 코너 (C면과 동일 높이) */}
      {face === 'A' && <ImminentStandby />}
    </div>
  );
}

// ─────────────────────────────────────────────
// ExteriorZone — 단일 면의 전체 외곽 공간
// ─────────────────────────────────────────────

interface Props {
  face: Face;
}

export function ExteriorZone({ face }: Props) {
  const meta      = FACE_META[face];
  const zones     = getFaceZones(face);
  const faceZone  = zones.find(z => z.category === 'face')!;
  const isHorizontal = face === 'A' || face === 'C';
  const { showFireLine } = useFireLine();

  return (
    <div
      className={[
        'exterior-zone',
        `exterior-zone--${face.toLowerCase()}`,
        meta.isPrimary  ? 'exterior-zone--primary'    : '',
        isHorizontal    ? 'exterior-zone--horizontal' : 'exterior-zone--vertical',
      ].filter(Boolean).join(' ')}
      data-deployment-face={face}
    >
      {face === 'A' && showFireLine && (
        <FireLine height={15} style={{ position: 'absolute', top: -9, left: 0, right: 0, zIndex: 2 }} />
      )}
      <div className="exterior-zone__content">
        <FaceGeneralZone zone={faceZone} face={face} />
      </div>
    </div>
  );
}
