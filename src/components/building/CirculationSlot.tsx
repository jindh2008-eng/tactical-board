import { useTokens } from '../../context/TokenContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useHydrantCirculation } from '../../context/HydrantCirculationContext';
import { useRoleRelease } from '../../context/RoleReleaseContext';
import { useWaterConnectDrag } from '../../hooks/useWaterConnectDrag';
import { circulationSourceId } from '../../utils/circulationFlow';
import { WATER_SUPPLY_TYPES, CIRCULATION_MAX_UNITS } from '../../config/unitMissions';
import { TokenCard } from '../shared/TokenCard';
import './CirculationSlot.css';

// ─────────────────────────────────────────────
// 순환보수 칸 — 소화전 위에 세우는 줄
//
// 거리 150m 이상인 소화전에만 생긴다. 호스 연장만으로는 압력과 시간이 나오지
// 않아 차량이 물을 실어 나르는 자리다.
//
// ## 줄이 곧 자리다 — 아래에서 위로 쌓는다
//
// 맨 아래(소화전에 가장 가까운 칸)가 **1번**이다.
//
//   1번 소비      — 중요물탱크에 보수한다. 제 물이 줄어든다
//   2번 대기      — 만수로 바로 뒤에 선다. 1번이 비면 즉시 교대
//   3번 보수·이동 — 소화전에서 받고 중계 지점까지 온다
//
// 1번이 비면 줄 끝으로 돌아간다(WaterLevelContext 가 부른다). 그래서 자리 이름은
// 고정이 아니라 **지금 몇 번인가**를 말한다.
//
// ## 송수라인의 출발점은 **칸이다**
//
// 순환대는 개별 송수라인을 갖지 않는다. 「순환급수」 이름표가 곧 손잡이이고, 거기서
// 나간 선 하나가 그 소화전에 붙은 순환대 **전체**가 함께 보내는 물이다.
// 그래서 출발 id 가 토큰 id 가 아니라 `circ-<소화전id>` 다.
// → docs/WATER_SUPPLY_MISSION_PLAN.md §3.2
//
// 5대가 차면 드롭을 **조용히 거절**한다(소화전 토출구가 다 찼을 때와 같은 문법).
// ─────────────────────────────────────────────

/** 줄 번호 → 그 자리가 지금 하는 일 */
const ROLE_LABELS = ['소비', '대기', '보수'] as const;
function roleLabel(index: number): string {
  return ROLE_LABELS[index] ?? '대기';
}

interface Props {
  hydrantId:   string;
  /** 로그·툴팁용 이름 — "44호 소화전" */
  hydrantName: string;
  /** 이 소화전이 선 방면의 구역 키. 밖에서 끌어온 차를 이 면으로 들인다 */
  zoneKey:     string;
}

export function CirculationSlot({ hydrantId, hydrantName, zoneKey }: Props) {
  const { tokens, moveToken }                 = useTokens();
  const { connections, removeConnection }     = useWaterConnections();
  const { slots, add }                        = useHydrantCirculation();
  const { releaseRolesFor }                   = useRoleRelease();

  const memberIds = slots[hydrantId] ?? [];
  const members   = memberIds
    .map(id => tokens.find(t => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);
  const isFull = memberIds.length >= CIRCULATION_MAX_UNITS;

  const sourceId = circulationSourceId(hydrantId);
  const { drag, full: lineFull } = useWaterConnectDrag({
    fromId:   sourceId,
    fromType: 'circulation',
    fromName: `${hydrantName} 순환급수`,
  });

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (isFull) return;                       // 받지 않는 자리에는 드롭 커서를 주지 않는다
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();                      // 부모 방면이 같은 이벤트를 또 처리하지 않게
    if (isFull) return;

    const tokenId = e.dataTransfer.getData('tokenId');
    if (!tokenId) return;
    const token = tokens.find(t => t.id === tokenId);
    if (!token || !WATER_SUPPLY_TYPES.has(token.unitType)) return;   // 펌프·물탱크만
    if (memberIds.includes(tokenId)) return;

    /*
     * 걸려 있던 송수라인을 끊는다.
     *
     * 순환대는 개별 연결을 갖지 않는다 — 칸에서 나가는 선 하나가 무리의 송수다.
     * 들어오는 선(소화전 직결)도 함께 끊는다. 소화전에 물려 있던 차가 순환대가
     * 되면 그 직결은 뜻을 잃는다(중요물탱크 자리를 떠난 것이다).
     */
    for (const c of connections) {
      if (c.fromId === tokenId || c.toId === tokenId) removeConnection(c.id);
    }

    // 밖에서 끌어왔으면 이 면으로 들인다. 배치는 이동 **뒤에** 한다
    // (이동이 옛 자리를 풀기 때문 — RoleReleaseContext)
    if (token.zoneKey !== zoneKey) moveToken(token.id, zoneKey);
    add(hydrantId, hydrantName, token.id, token.label);

    /*
     * **순환칸은 건물 내부처럼 별도 공간이다**(2026-09-09 사용자 결정).
     * 들어가는 순간 들고 있던 자리를 놓는다 — 소속대는 소속에서 빠지고,
     * 단위지휘관은 물러나며 「단위」 임무도 함께 떨어진다.
     *
     * 배치 **뒤에** 부른다. 앞이면 위의 `moveToken` 이 보내는 알림에 묻혀
     * 아무 일도 일어나지 않는다(그때는 같은 면이라 소속이 유지된다).
     * 'circulate' 를 붙이는 것은 방금 세운 이 줄까지 스스로 풀지 않게 하려는
     * 것이다 — RoleReleaseContext 의 ReleaseReason.
     */
    releaseRolesFor(token.id, token.label, null, 'circulate');
  }

  return (
    <div
      className={`circ-slot${isFull ? ' circ-slot--full' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={isFull
        ? `순환급수 ${CIRCULATION_MAX_UNITS}대를 모두 채웠습니다`
        : '순환급수 — 펌프차·물탱크차를 끌어다 놓으세요'}
    >
      {/* 아래가 1번이다 — CSS 가 column-reverse 로 뒤집는다 */}
      {members.length > 0 && (
        <div className="circ-slot__units">
          {members.map((token, i) => (
            <div className="circ-slot__row" key={token.id}>
              <TokenCard token={token} />
              <span className="circ-slot__role" aria-hidden="true">{roleLabel(i)}</span>
            </div>
          ))}
        </div>
      )}

      {/*
        이름표가 곧 송수 손잡이다. 선 오버레이도 `data-token-id` 로 이 자리를 찾는다
        (WaterConnectionOverlay 의 connectionAnchor).
      */}
      <span
        className={[
          'circ-slot__label',
          // 차가 없으면 회색 — 「아직 아무도 세우지 않았다」
          members.length === 0 ? 'circ-slot__label--empty'  : '',
          lineFull             ? 'circ-slot__label--linked' : '',
        ].filter(Boolean).join(' ')}
        data-token-id={sourceId}
        title={lineFull
          ? '이미 송수 중입니다 — 한 무리는 한 곳만 먹입니다'
          : members.length === 0
            ? '순환급수 미지정 — 펌프차·물탱크차를 끌어다 놓으세요'
            : '끌어서 펌프·물탱크에 송수 연결'}
        {...drag}
      >순환급수</span>
    </div>
  );
}
