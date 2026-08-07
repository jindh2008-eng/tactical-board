import { getFaceZones, getFaceZoneDataAttrs } from '../../data/faceZoneData';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { useSettings } from '../../store/settingsStore';
import { useFireLine } from '../../context/FireLineContext';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import { HydrantIcon } from '../shared/HydrantIcon';
import { computeDropCenter } from '../../utils/dragDrop';
import { logDragEvent } from '../../utils/dragDiagnostics';
import './BFaceWithStandby.css';
import './ExteriorZone.css';

// ─────────────────────────────────────────────
// B면 드롭 영역
// ─────────────────────────────────────────────

const DROP_NUDGE_X = 0;
const DROP_NUDGE_Y = 0;

function BFaceDropZone() {
  const { tokens, positions, moveToken }         = useTokens();
  const { victims, victimPositions, moveVictim } = useVictims();
  const { hydrantSetup } = useSettings();

  // B면에 배정된 소화전 — 좌측하단 고정
  const bHydrants = hydrantSetup.filter(h => h.side === 'B');

  const zones    = getFaceZones('B');
  const faceZone = zones.find(z => z.category === 'face')!;
  const zoneKey  = 'face-B';

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
      logDragEvent('BFaceDropZone drop rejected', 'payload 없음');
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = computeDropCenter(e, rect, DROP_NUDGE_X, DROP_NUDGE_Y);

    if (tokenId)  moveToken(tokenId,   zoneKey, { x, y });
    if (victimId) moveVictim(victimId, zoneKey, { x, y });
    logDragEvent('BFaceDropZone drop', `tokenId=${tokenId} victimId=${victimId}`);
  }

  return (
    <div
      className="face-general-zone bface-drop-zone"
      {...getFaceZoneDataAttrs(faceZone)}
      title="B면 일반 이동 영역"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <span className="face-general-zone__label">B</span>

      {zoneTokens.map(token => (
        <TokenCard key={token.id} token={token} absPos={positions[token.id]} />
      ))}
      {zoneVictims.map(victim => (
        <VictimCard key={victim.id} victim={victim} absPos={victimPositions[victim.id]} />
      ))}

      {/* 소화전 아이콘 — B면 좌측하단 */}
      {bHydrants.length > 0 && (
        <div style={{
          position:      'absolute',
          bottom:        4,
          left:          4,
          display:       'flex',
          flexDirection: 'column-reverse',
          gap:           4,
          zIndex:        3,
          alignItems:    'flex-start',
        }}>
          {bHydrants.map(h => (
            <HydrantIcon key={h.id} id={h.id} name={h.name} distanceM={h.distanceM} />
          ))}
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────
// BFaceWithStandby — B면 독립 컬럼 (대기구역 분리됨)
// ─────────────────────────────────────────────

export function BFaceWithStandby() {
  const { showFireLine, toggleFireLine } = useFireLine();
  return (
    <div className="exterior-zone exterior-zone--b exterior-zone--primary exterior-zone--vertical">
      <div className="exterior-zone__content">
        <BFaceDropZone />
      </div>
      <button
        className={`fire-line-toggle${showFireLine ? ' fire-line-toggle--active' : ''}`}
        onClick={toggleFireLine}
      >
        소방통제선 {showFireLine ? '해제' : '표시'}
      </button>
    </div>
  );
}
