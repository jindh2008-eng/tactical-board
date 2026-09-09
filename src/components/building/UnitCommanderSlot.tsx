import { useTokens } from '../../context/TokenContext';
import { MISSION_UNIT_COMMANDER } from '../../config/unitMissions';
import { useUnitCommander } from '../../context/UnitCommanderContext';
import { unitCommanderZoneLabel, commanderOfScope } from '../../utils/unitCommandScope';
import { RoleSlot } from '../shared/RoleSlot';
import type { TokenPos } from '../../context/TokenContext';
import './UnitCommanderSlot.css';

// ─────────────────────────────────────────────
// 층별 단위지휘관 슬롯 — 각 층 옥내소화전 위의 「단위지휘관」
//
// 자리는 **소화전이 있든 없든 고정**이다. 지휘관 지정은 설비가 아니라 지휘
// 행위라, 옥내소화전이 없는 건물이라고 지정할 자리가 사라지면 안 된다.
// 그래서 위치는 소화전이 있을 때를 기준으로 잡고 그대로 둔다(CSS 참고).
//
// 지명된 토큰은 **여기가 그린다.** 그 층 구역 셀은 같은 토큰을 렌더에서
// 빼므로(ZoneCell) 한 토큰이 두 번 보이지 않는다.
// 해제는 여기 없다 — 그 토큰을 어디로든 다시 끌어다 놓으면 풀린다
// (RoleReleaseContext).
//
// 지휘관이 앉은 뒤 같은 자리에 출동대를 또 놓으면 **소속대**가 된다.
// 소속대는 제 자리(구역)에 그대로 서 있고, 지휘관과 묶였다는 표시만 받는다
// — 소속대 토큰 옆에 「└진압1」 이름표가 붙고 채도가 빠진다(TokenCard).
//
// ## 밖에서 끌어온 대는 줄 끝에 세운다
//
// 그 층에 이미 있던 대는 서 있던 자리를 지킨다. 하지만 다른 구역에서 끌어온
// 대는 그 층 좌표가 없어, 그냥 들이면 구역 좌상단에 흐름 배치로 얹힌다 —
// 지휘관과 멀찍이 떨어져 연결선만 길게 늘어진다.
// 그래서 **줄의 끝 옆에** 자리를 잡아 준다(소속대가 있으면 마지막 소속대 옆,
// 없으면 지휘관 토큰 옆).
// ─────────────────────────────────────────────

/** 앞 토큰과의 가로 간격 (캔버스 px) */
const NEXT_GAP  = 10;
/** 새로 놓을 토큰의 대략 반폭 — 상황판 토큰 66px 기준 (TokenCard.css) */
const HALF_CARD = 33;
/** 오른쪽 끝에 닿았을 때 아래로 내리는 폭 (캔버스 px) */
const WRAP_DROP = 46;

interface Props {
  /** 'RF' · '3F' · 'B1' · 요약 행이면 '1F-3F' */
  floorId: string;
}

const clamp01 = (v: number) => Math.max(0.03, Math.min(0.97, v));

export function UnitCommanderSlot({ floorId }: Props) {
  const { tokens, moveToken, addLog, toggleMissionTag } = useTokens();
  const { groups, assign, addMember }                   = useUnitCommander();

  const zoneKey     = `${floorId}-center`;
  const commanderId = commanderOfScope(groups, zoneKey);
  const holder      = commanderId ? tokens.find(t => t.id === commanderId) ?? null : null;
  const memberIds   = commanderId ? groups[commanderId].members : [];
  const floorName   = unitCommanderZoneLabel(zoneKey);

  /** 「단위」 임무가 없으면 붙인다 — 슬롯 지정과 우클릭 임무는 같은 것을 만든다 */
  function ensureUnitMission(token: { id: string; missionTags?: { label: string }[] }) {
    const has = token.missionTags?.some(m => m.label === MISSION_UNIT_COMMANDER.label) ?? false;
    if (!has) toggleMissionTag(token.id, MISSION_UNIT_COMMANDER);
  }

  /**
   * 줄 끝 오른쪽 자리를 구역 대비 0~1 좌표로 돌려준다.
   *
   * 기준은 마지막 소속대, 없으면 지휘관 토큰이다. 둘 다 DOM 에서 재는데,
   * 지휘관 토큰은 슬롯 안에 있고 소속대는 구역 안에 있어 계산식이 하나로
   * 떨어지지 않기 때문이다. 두 rect 를 같은 뷰포트 px 로 재서 비율만 쓰므로
   * 스테이지 배율은 저절로 약분된다 — 캔버스 px 로 쓰는 간격만 배율을 곱한다.
   *
   * 잴 수 없으면 undefined 를 돌려준다. 그러면 좌표 없이 들어가 예전처럼
   * 흐름 배치가 되는데, 자리만 아쉬울 뿐 동작은 멀쩡하다.
   */
  function nextInLinePos(): TokenPos | undefined {
    const row  = document.querySelector(`.floor-row[data-floor-id="${CSS.escape(floorId)}"]`);
    const zone = row?.querySelector('.zone-cell--center');
    if (!row || !(zone instanceof HTMLElement)) return undefined;

    const zr = zone.getBoundingClientRect();
    if (zr.width === 0 || zr.height === 0 || zone.offsetWidth === 0) return undefined;
    const scale = zr.width / zone.offsetWidth;

    const anchorId = memberIds[memberIds.length - 1];
    const anchorEl = anchorId
      ? row.querySelector(`[data-token-id="${CSS.escape(anchorId)}"]`)
      : row.querySelector('.unit-commander-slot .role-slot .token-card-wrapper');
    if (!anchorEl) return undefined;

    const ar = anchorEl.getBoundingClientRect();
    if (ar.width === 0 && ar.height === 0) return undefined;

    const stepPx = (NEXT_GAP + HALF_CARD) * scale;
    const rawX   = (ar.right + stepPx - zr.left) / zr.width;
    const rawY   = (ar.top + ar.height / 2 - zr.top) / zr.height;

    // 오른쪽 끝을 넘으면 한 줄 내려 앞 토큰 아래에 세운다
    if (rawX > 0.94) {
      return {
        x: clamp01((ar.left + ar.width / 2 - zr.left) / zr.width),
        y: clamp01(rawY + (WRAP_DROP * scale) / zr.height),
      };
    }
    return { x: clamp01(rawX), y: clamp01(rawY) };
  }

  return (
    <div className="unit-commander-slot">
      <RoleSlot
        holder={holder}
        tag="단위"
        emptyTag="단위지휘관"
        roleName={`${floorName} 단위지휘관`}
        onAssign={token => {
          // 지휘관은 그 층에 있는 사람이다 — 밖에서 끌어왔으면 층으로 함께 들인다.
          // 지명은 이동 **뒤에** 한다(이동이 옛 역할을 풀기 때문).
          // 지휘관 토큰은 슬롯이 그리므로 구역 좌표는 필요 없다.
          if (token.zoneKey !== zoneKey) moveToken(token.id, zoneKey);
          assign(zoneKey, token.id);
          ensureUnitMission(token);
          addLog({
            logType: 'post', tokenId: token.id, tokenName: token.label,
            fromZoneId: '', toZoneId: '',
            note:    `단위지휘관 지정: ${floorName} · ${token.label}`,
            payload: {
              kind: 'unit-commander', floorId: zoneKey,
              commanderTokenId: token.id, commanderLabel: token.label,
            },
          });
        }}
        onAddMember={token => {
          /*
           * 그 층에 이미 있던 대는 **자리를 지킨다** — 서 있던 곳이 곧 배치다.
           * 밖에서 끌어온 대만 줄 끝 옆에 세운다(위 주석).
           * 편입은 이동 뒤에 한다(이동이 옛 소속을 풀기 때문).
           */
          if (token.zoneKey !== zoneKey) moveToken(token.id, zoneKey, nextInLinePos());
          if (commanderId) addMember(commanderId, token.id);
          addLog({
            logType: 'post', tokenId: token.id, tokenName: token.label,
            fromZoneId: '', toZoneId: '',
            note:    `단위지휘관 소속 편입: ${floorName} · ${token.label}`,
            payload: {
              kind: 'unit-commander', floorId: zoneKey,
              commanderTokenId: commanderId ?? null,
              commanderLabel:   holder?.label ?? null,
            },
          });
        }}
      />
    </div>
  );
}
