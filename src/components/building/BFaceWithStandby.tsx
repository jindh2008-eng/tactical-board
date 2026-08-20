import { getFaceZones, getFaceZoneDataAttrs } from '../../data/faceZoneData';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { useSettings } from '../../store/settingsStore';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import { HydrantIcon } from '../shared/HydrantIcon';
import { ControlLineToggles } from './ControlLineToggles';
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
      data-zone-key={zoneKey}
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
  return (
    <div className="exterior-zone exterior-zone--b exterior-zone--primary exterior-zone--vertical">
      {/* 통제선·연결송수구 설치 버튼 — B면 상단(2026-08-20 A면 코너에서 이동).
          드롭존 위에 겹쳐 띄운다 — 자리를 차지하면 B면 배치 공간이 줄어든다 */}
      <ControlLineToggles />
      <div className="exterior-zone__content">
        <BFaceDropZone />
      </div>
    </div>
  );
}
