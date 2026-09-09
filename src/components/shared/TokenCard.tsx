import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { TokenPos } from '../../context/TokenContext';
import { useTokens } from '../../context/TokenContext';
import { useUnitCommander } from '../../context/UnitCommanderContext';
import { groupOfMember, unitCommanderZoneLabel } from '../../utils/unitCommandScope';
import { useActionMode } from '../../context/ActionModeContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useHydrantCirculation } from '../../context/HydrantCirculationContext';
import { useWaterLinePeek } from '../../context/waterLinePeek';
import { useVictims } from '../../context/VictimContext';
import type { UnitToken } from '../../types';
import { PRESET_COLORS } from '../../types/presets';
import { MISSION_UNIT_COMMANDER } from '../../config/unitMissions';
import { secsToMmss } from '../../utils/dispatchRoster';
import { setDragGrabOffset } from '../../utils/dragDrop';
import { logDragEvent } from '../../utils/dragDiagnostics';
import { useWaterLevel }       from '../../context/WaterLevelContext';
import { useSettings }         from '../../store/settingsStore';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import { isOnTacticalBoard, isOnBuildingFace } from '../../utils/tokenHandles';
import { useWaterConnectDrag } from '../../hooks/useWaterConnectDrag';
import { canConnectWater } from '../../utils/waterConnectRules';
import { VictimCard }       from './VictimCard';
import { NozzleHandle }     from './NozzleHandle';
import { LadderHandle }     from './LadderHandle';
import { UnitStatusBarMenu } from './UnitStatusBarMenu';
import { WaterDisconnectPopup } from './WaterDisconnectPopup';
import { BoardListPopup } from './BoardListPopup';
import { HydrantBarMenu }    from './HydrantBarMenu';
import './TokenCard.css';
import { stagePortalTarget, rectToStage } from '../../utils/stagePortal';

// ── 수량 게이지 바 ───────────────────────────

const WATER_UNIT_TYPES  = new Set(['pump', 'water_tank']);
const AERIAL_UNIT_TYPES = new Set(['aerial', 'ladder']);
// 관창(진압·구조) + 방수포(펌프·물탱크) — 둘 다 우측 상단 방수 핸들을 쓴다
const SPRAY_HANDLE_TYPES = new Set(['suppression', 'rescue', 'pump', 'water_tank']);
/**
 * 송수 번호 배지를 다는 차종 — 물을 **내주는** 쪽이다.
 *
 * 선이 붙은 대의 이름을 판 위에서 좇는 대신, 물을 대주는 차 위에 번호를
 * 붙여 「이 펌프가 세 대에 물을 대고 있다」를 한눈에 읽게 한다. 「송수라인」을
 * 꺼 활동대로 가는 선을 감췄을 때 그 정보를 대신 지고 있는 것이 이 배지다
 * (DisplayOptionsContext).
 */
const SUPPLY_BADGE_TYPES = new Set(['pump', 'water_tank']);

function WaterGauge({ levelL, capacityL, token, draggable, showLevel }: {
  levelL: number; capacityL: number; token: UnitToken; draggable: boolean;
  /**
   * 잔량 **수치**를 보일 것인가.
   *
   * 설정에서 실시간 계산을 끄면 잔량이 줄지 않아 늘 100 이다. 안 변하는 100 은
   * 정보가 아니라 잡음이라 숫자만 숨긴다.
   *
   * 채움 막대는 끄지 않는다 — 파란 게이지가 있어야 이 네모가 물탱크의 수량
   * 칸으로 읽힌다. 비면 빈 상자가 되어 무엇인지 알 수 없고, 이 네모는 곧
   * 송수 연결을 끌어 잡는 손잡이라(아래 useWaterConnectDrag) 눈에 띄어야 한다.
   */
  showLevel: boolean;
}) {
  const pct       = capacityL > 0 ? Math.max(0, Math.min(1, levelL / capacityL)) : 0;
  const pctInt    = Math.round(pct * 100);
  const isLow     = pct < 0.5;
  const fillColor = isLow ? '#d94040' : '#2a8fd4';

  // 게이지 자체가 송수 연결의 손잡이다 — 끌어서 받을 대상에 놓는다
  const { drag } = useWaterConnectDrag({
    fromId:   token.id,
    fromType: token.unitType,
    disabled: !draggable || token.statusTag?.label === '펌프고장',
  });

  const amount = `${Math.round(levelL).toLocaleString()}L / ${capacityL.toLocaleString()}L`;

  return (
    <div
      className={`water-gauge${draggable ? ' water-gauge--draggable' : ''}`}
      title={[showLevel ? amount : '', draggable ? '끌어서 송수 연결' : '']
        .filter(Boolean).join(' — ')}
      {...(draggable ? drag : {})}
    >
      {/* 채움 바 — 아래에서 위로. 실시간 계산을 꺼도 그린다(늘 만수위) */}
      <div
        className="water-gauge__fill"
        style={{ height: `${pct * 100}%`, background: fillColor }}
      />
      {/* 25% 단위 구분선 3개 */}
      {[25, 50, 75].map(p => (
        <div key={p} className="water-gauge__divider" style={{ bottom: `${p}%` }} />
      ))}
      {/* 퍼센트 수치 — 실시간 계산을 끄면 늘 100 이라 숨긴다 */}
      {showLevel && <span className="water-gauge__pct">{pctInt}</span>}
    </div>
  );
}

/**
 * 이름표 끝의 번호 — 「진압3」 → `'3'`, 「펌프10」 → `'10'`.
 *
 * 송수 배지의 숫자가 곧 **누구인지**를 말하게 하려는 것이다. 빨간 배지에 3이면
 * 진압3이다 — 색으로 종류를, 숫자로 그 대를 읽는다(2026-09-09 사용자 결정).
 *
 * 부대명 접두사를 쓰면 이름이 「거진진압」처럼 되어 번호가 없다
 * (`computeRosterDisplayName` — utils/dispatchRoster.ts). 직접 만든 대도
 * 그럴 수 있다. 그때는 **점(●)** 을 찍는다 — 연결 순번으로 되돌리면 같은
 * 자리에 두 가지 뜻의 숫자가 섞여, 3이 「진압3」인지 「세 번째 선」인지
 * 알 수 없게 된다. 누구인지는 마우스를 올리면 이름이 나온다.
 */
function unitNumberOf(label: string | undefined): string | null {
  const m = label?.match(/(\d+)\s*$/);
  return m ? m[1] : null;
}

// ── statusTag 색상 (컴포넌트 외부 상수로 이동) ──────────
const STATUS_TAG_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue:   { bg: '#0d1e3a', border: '#2255aa', text: '#88bbff' },
  yellow: { bg: '#2a1e00', border: '#aa7700', text: '#ffcc44' },
  red:    { bg: '#2a0808', border: '#aa2222', text: '#ff7777' },
  green:  { bg: '#0a1e10', border: '#228844', text: '#55cc88' },
  white:  { bg: '#1e1e22', border: '#888888', text: '#dddddd' },
};

interface Props {
  token:     UnitToken;
  absPos?:   TokenPos;
  selectMode?:     boolean;
  selected?:       boolean;
  onToggleSelect?: () => void;
  onDoubleClick?:  () => void; // 대기 패널 간 더블클릭 이동용
}

export function TokenCard({ token, absPos, selectMode, selected, onToggleSelect, onDoubleClick }: Props) {
  const { tokens, moveToken, addLog, toggleMissionTag } = useTokens();
  const { groups, addMember, removeMember, release } = useUnitCommander();
  const { mode, clearMode }        = useActionMode();
  const { addConnection, connections, removeConnection } = useWaterConnections();
  const { circulationIds }         = useHydrantCirculation();
  const { setPeekConnId }          = useWaterLinePeek();
  const waterLevel                 = useWaterLevel();

  const [barMenu,      setBarMenu]      = useState<{
    left: number; top: number; right: number; bottom: number; width: number; height: number;
  } | null>(null);
  const [isRecent,     setIsRecent]     = useState(false);
  // 번호 배지에서 연 「송수 해제」 팝업
  const [supplyPopup,  setSupplyPopup]  = useState<{ connId: string; x: number; y: number } | null>(null);
  // 「대 N」 칩에서 연 소속대 목록
  const [memberPopup,  setMemberPopup]  = useState<{ x: number; y: number } | null>(null);
  // 마우스를 올린 번호 배지의 연결 id
  const [hoverConnId,  setHoverConnId]  = useState<string | null>(null);
  // 뷰포트 상단 근접 시 오버레이를 아래쪽으로 전환 (좌표 추적 없이 boolean만)
  const [overlayBelow, setOverlayBelow] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 이동 직후 2초 동안 강조
  useEffect(() => {
    if (!token.lastMovedAt) return;
    const elapsed = Date.now() - token.lastMovedAt;
    if (elapsed >= 2000) return;
    setIsRecent(true);
    const timer = setTimeout(() => setIsRecent(false), 2000 - elapsed);
    return () => clearTimeout(timer);
  }, [token.lastMovedAt]);

  // 위치 변경 후 오버레이 방향 재측정 (DOM 업데이트 이후 실행)
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setOverlayBelow(rect.top < 72);
  }, [absPos?.x, absPos?.y]);

  // ── ActionMode 상태 분류 ──────────────────────
  const isSource = mode.type !== null &&
    'sourceId' in mode && mode.sourceId === token.id;
  const isInMode = mode.type !== null && !isSource && mode.type !== 'water-connect';

  /** 순환보수 줄에 선 차 — 제 이름으로 송수하지 않는다(CirculationSlot) */
  const isCirculating = circulationIds.has(token.id);

  // ── 이벤트 핸들러 ────────────────────────────

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    if (mode.type !== null) {
      logDragEvent('TokenCard dragstart blocked', `token=${token.label} mode=${mode.type}`);
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('tokenId', token.id);
    setDragGrabOffset(e);
    e.dataTransfer.effectAllowed = 'move';
    setBarMenu(null);
    if (wrapperRef.current) wrapperRef.current.dataset.dragging = 'true';
    logDragEvent('TokenCard dragstart', `token=${token.label} id=${token.id}`);
  }

  function handleDragEnd() {
    if (wrapperRef.current) delete wrapperRef.current.dataset.dragging;
    logDragEvent('TokenCard dragend', token.label);
  }

  const touchDrag = useTouchDrag({
    enabled: mode.type === null && !selectMode,
    payload: { tokenId: token.id },
    dragElementRef: wrapperRef,
    onDragStart: () => {
      setBarMenu(null);
      logDragEvent('TokenCard touch dragstart', `token=${token.label} id=${token.id}`);
    },
    onDragEnd: () => logDragEvent('TokenCard touch dragend', token.label),
  });

  // ── 구조대상자를 출동대 위에 드롭 → 이송 연결 ──────────────────────
  // 연결되면 이 출동대가 구역을 옮길 때마다 따라 움직이고(VictimContext),
  // 임시의료소에 도착하면 자동으로 구조 처리된다.
  const { victims, attachVictimToUnit } = useVictims();
  // 연결된 구조대상자는 구역 흐름 배치에서 빼고(각 구역 컴포넌트가 carriedBy 를 걸러낸다)
  // 이 토큰 우측에 아이콘만 붙여 렌더한다.
  /*
   * 고가차·굴절차는 여기 그리지 않는다 — **바스켓 옆**에 붙는다.
   * 사람이 차에 탄 것이 아니라 사다리 끝에 매달린 상태라서다.
   * 그리는 것은 AerialOverlay 이고, 모양은 여기와 똑같다(같은 VictimCard).
   */
  const carriedVictims = AERIAL_UNIT_TYPES.has(token.unitType)
    ? []
    : victims.filter(v => v.carriedBy === token.id);

  /*
   * 이 토큰이 **단위지휘관인가.** 지휘관 위에 다른 출동대를 겹쳐 놓으면
   * 소속대가 된다 — 층 슬롯에 놓는 것과 같은 결과다(UnitCommanderContext).
   */
  const isUnitCommander = !!groups[token.id];

  /*
   * 이 토큰이 **누구 밑인가.** 표시는 토큰 안쪽 보라 테두리 하나다 —
   * 선(교차·배율 문제)도, 이름표(너무 크고 판이 복잡해짐)도 아니다.
   * 한 구역에 지휘관은 하나뿐이라 색만으로 대상이 정해지고, 이름은
   * 마우스를 올렸을 때 알려 준다.
   */
  const memberOf    = groupOfMember(groups, token.id);
  const commanderOf = memberOf
    ? tokens.find(t => t.id === memberOf.commanderId) ?? null
    : null;
  /*
   * 소속 표시는 **여기서 정한다.** 호출부가 내려보내던 `member` prop 은 구역마다
   * 빠뜨릴 수 있어(위 prop 주석) 관계와 표시가 갈라졌다. 관계를 아는 곳이
   * 곧 표시를 정하는 곳이어야 어디에 그려도 같게 나온다.
   */
  /**
   * 단위지휘관 밑에 든 **소속대**인가.
   *
   * 토큰 안쪽에 지휘관 칩과 같은 보라 테두리를 두른다. 현장지휘관은 그 구역을
   * 단위지휘관을 통해 통제하므로 소속대는 무전 상대가 아닌데, 지워도 안 되고
   * (현장에 있다) 또렷해도 안 되는 자리다. 한 구역에 지휘관은 하나뿐이라
   * 「누구 밑인가」는 색만으로 정해진다 — 이름표를 따로 붙이지 않는 이유다.
   *
   * **호출부가 내려보내던 값이었다.** 그러면 구역마다 빠뜨릴 수 있고, 실제로
   * B면(BFaceWithStandby)·대기 패널·순환칸이 넘기지 않아 건물 밖 소속대가
   * D면에서 B면으로 옮기면 소속이 풀린 것처럼 보였다(2026-09-09). 관계는
   * 그대로였고 **표시만 사라진 것**이라 오히려 헷갈렸다. 관계를 아는 곳이
   * 곧 표시를 정하는 곳이어야 어디에 그려도 같게 나온다.
   */
  const isMember = memberOf !== undefined;

  /** 이 토큰이 지휘관이면 그 소속대들 */
  const myMembers = (groups[token.id]?.members ?? [])
    .map(id => tokens.find(t => t.id === id))
    .filter((t): t is UnitToken => !!t);

  /**
   * 그 소속대를 잠깐 밝힌다 — 배지에 마우스를 올린 동안만. null 이면 전부 끈다.
   *
   * React 상태로 두지 않는다. 리렌더 없이 켜지고 꺼져야 하는 표시라,
   * 송수 드래그가 대상을 밝힐 때 쓰는 방식과 같다(useWaterConnectDrag).
   */
  /**
   * 단위지휘관에서 물러난다 — 자리·임무 표시·기록을 함께 정리한다.
   *
   * 우클릭 임무 「단위」를 다시 눌러 끄는 것과 같은 결과다. 그쪽은 임무 목록에
   * 있어 「표시를 끈다」로 읽히는데, 이 단추는 무리를 펼쳐 놓고 누르는 자리라
   * 「이 사람을 물린다」로 읽힌다 — 같은 일을 두 문맥에서 부르는 것이다.
   *
   * 이동으로 물러날 때의 기록(UnitCommanderBridge)과 같은 payload 를 남긴다.
   * 그래야 분석에서 「어떻게 물러났는가」와 무관하게 한 줄로 셀 수 있다.
   */
  function releaseCommander() {
    const scope = groups[token.id]?.scope;
    if (!scope) return;
    release(token.id);
    if (token.missionTags?.some(m => m.label === MISSION_UNIT_COMMANDER.label)) {
      toggleMissionTag(token.id, MISSION_UNIT_COMMANDER);
    }
    addLog({
      logType: 'post', tokenId: token.id, tokenName: token.label,
      fromZoneId: '', toZoneId: '',
      note:    `단위지휘관 해제: ${unitCommanderZoneLabel(scope)} · ${token.label}`,
      payload: {
        kind: 'unit-commander', floorId: scope,
        commanderTokenId: null, commanderLabel: null,
      },
    });
  }

  function peekMember(memberId: string | null) {
    for (const m of myMembers) {
      document.querySelector(`[data-token-id="${m.id}"]`)
        ?.classList.toggle('token-card-wrapper--member-peek', m.id === memberId);
    }
  }

  function handleVictimDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (token.unitType === 'hydrant') return;
    // dragover 에서는 값을 못 읽으므로 타입만 확인한다(브라우저가 소문자로 준다).
    const types = e.dataTransfer.types;
    const hasVictim = types.includes('victimid') || types.includes('victimId');
    const hasToken  = types.includes('tokenid')  || types.includes('tokenId');
    if (!hasVictim && !(hasToken && isUnitCommander)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleVictimDrop(e: React.DragEvent<HTMLDivElement>) {
    if (token.unitType === 'hydrant') return;

    const victimId = e.dataTransfer.getData('victimId');
    if (victimId) {
      e.preventDefault();
      e.stopPropagation();
      attachVictimToUnit(victimId, token.id);
      logDragEvent('TokenCard victim attach', `victim=${victimId} → ${token.label}`);
      return;
    }

    // ── 지휘관 위에 겹친 출동대 → 소속대 편입 ──
    const dropId = e.dataTransfer.getData('tokenId');
    if (!isUnitCommander || !dropId || dropId === token.id) return;  // 구역이 처리하게 둔다
    /*
     * **순환칸 안에서는 소속대를 붙일 수 없다**(2026-09-09 사용자 결정).
     * 칸 안의 「단위」는 그 순환급수팀 전체의 지휘관이라는 뜻이라, 그 밑에
     * 따로 대를 매다는 것은 같은 말을 두 번 하는 것이 된다 — 줄에 서 있는
     * 차들이 이미 무리다. 끌어낸 뒤에 붙이는 것은 그대로 된다.
     */
    if (isCirculating) return;
    const dropped = tokens.find(t => t.id === dropId);
    if (!dropped || dropped.type === 'agency') return;

    e.preventDefault();
    e.stopPropagation();
    // 겹친 대가 다른 구역에서 왔으면 지휘관과 같은 구역으로 들인다.
    // 편입은 이동 뒤에 한다(이동이 옛 소속을 풀기 때문).
    if (dropped.zoneKey !== token.zoneKey) moveToken(dropId, token.zoneKey!);
    addMember(token.id, dropId);
    addLog({
      logType: 'post', tokenId: dropId, tokenName: dropped.label,
      fromZoneId: '', toZoneId: '',
      note:    `단위지휘관 소속 편입: ${token.label} · ${dropped.label}`,
      payload: {
        kind: 'unit-commander', floorId: groups[token.id].scope,
        commanderTokenId: token.id, commanderLabel: token.label,
      },
    });
    logDragEvent('TokenCard member attach', `${dropped.label} → ${token.label}`);
  }

  function handleContextMenu(e: React.MouseEvent) {
    // 현장(ABCD면·건물)에 배치됐을 때만 상태 메뉴를 연다.
    // 대기 구역·추가출동대 박스에서는 이벤트를 그대로 흘려보내야 한다 —
    // 여기서 stopPropagation 하면 바깥(추가출동대 삭제 등)이 우클릭을 못 받는다.
    if (!onBoard) return;
    e.preventDefault();
    e.stopPropagation();
    if (mode.type !== null) { clearMode(); return; }
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) {
      setBarMenu({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (mode.type === 'water-connect' && !isSource) {
      e.stopPropagation();
      /*
       * 규칙은 끌어서 잇든 눌러서 잇든 같아야 한다.
       *
       * 이 경로에는 검사가 없었다 — 우클릭 「송수」로 들어온 모드에서는
       * 최대 연결 수도 종류 제한도 그냥 통과했다. 소화전 토출구가 2구인데
       * 세 번째 연결이 만들어질 수 있었다는 뜻이다.
       */
      if (canConnectWater(connections, mode.sourceId, mode.sourceType, token.id, token.unitType)) {
        addConnection(mode.sourceId, token.id, mode.sourceType, token.unitType, mode.sourceName);
      }
      clearMode();
      return;
    }
    if (isSource) return;
    if (isInMode) { e.stopPropagation(); clearMode(); }
  }

  const handleClose = useCallback(() => setBarMenu(null), []);

  // 출동대 상태메세지: 항상 토큰 위에 표시 (X로 닫기)
  const showStatusMsg = !!token.customNote;

  // ── 송수 번호 배지 ───────────────────────────
  const supplyLinks = SUPPLY_BADGE_TYPES.has(token.unitType)
                      && isOnTacticalBoard(token.zoneKey)
    ? connections.filter(c => c.fromId === token.id)
    : [];


  /*
   * 짚은 선 — **올린 배지가 우선, 없으면 팝업이 문 것**.
   *
   * 마우스를 치우면 짚은 것을 놓지만, 눌러서 팝업을 열었으면 계속 짚고 있는다
   * (핀). 「송수 해제」를 누르기 직전에 어느 선을 끊는지 보여야 하는데, 팝업이
   * 뜬 순간 선이 사라지면 확인할 수가 없다.
   *
   * 짚는 슬롯은 판 전체에 하나다(waterLinePeek). 팝업이 열려 있는 동안에는
   * 화면 전체를 덮는 backdrop 이 있어 **다른 배지에 마우스를 올릴 수 없으므로**,
   * 두 카드가 슬롯을 다툴 일이 없다.
   */
  const peekConnId = hoverConnId ?? supplyPopup?.connId ?? null;
  useEffect(() => {
    if (peekConnId === null) return;
    setPeekConnId(peekConnId);
    // 이 카드가 짚기를 놓을 때만 비운다 — 언마운트(연결이 끊겨 배지가
    // 사라지는 경우 포함)도 이 경로로 정리된다
    return () => setPeekConnId(null);
  }, [peekConnId, setPeekConnId]);

  // ── 절대 위치 스타일 ─────────────────────────
  // absPos 는 구역 대비 0~1 정규화 좌표 → 퍼센트로 넘겨 구역 크기 변화에 따라간다
  //
  // 배지가 달린 차는 한 칸 위로 올린다(5 → 7). 배지는 토큰 **위**에 서는데
  // A면 직전대기 띠(`.a-face-band`, z-index 6)가 그 자리를 덮고 있어, 5 로
  // 두면 띠 아래 깔려 눌리지 않는다 — 실측으로 확인했다(elementFromPoint 가
  // 띠를 집는다). 토큰 상자 자체의 자리는 그대로라 띠와 겹치는 것은 배지뿐이다.
  const wrapperStyle: React.CSSProperties | undefined = absPos
    ? {
        position:  'absolute',
        left:      `${absPos.x * 100}%`,
        top:       `${absPos.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        zIndex:    supplyLinks.length > 0 ? 7 : 5,
      }
    : undefined;

  // ── 카운트다운 ───────────────────────────────
  const { medicalCountdowns, arrivalCountdowns, setCustomNote } = useTokens();
  const medicalCountdown = token.zoneKey === 'medical-post'
    ? (medicalCountdowns[token.id] ?? null) : null;
  const arrivalCountdown = token.zoneKey === null
    ? (arrivalCountdowns[token.id] ?? null) : null;

  const hasBadges    = token.badges.length > 0;
  const hasMission   = (token.missionTags?.length ?? 0) > 0;

  // 카운트다운은 좌측 상단 고정 위치 표시용으로 포털 유지
  // (드래그 중 표시되지 않으므로 좌표 지연 문제 없음)
  function countdownPortal(className: string, label: string, content: React.ReactNode) {
    const raw = wrapperRef.current?.getBoundingClientRect();
    if (!raw) return null;
    // 포털이 스테이지(배율) 안에 있으므로 left/top 은 캔버스 좌표여야 한다.
    const rect = rectToStage(raw);
    return ReactDOM.createPortal(
      <div
        className={`token-countdown ${className}`}
        aria-label={label}
        style={{
          position:      'fixed',
          left:          rect.left,
          top:           rect.top,
          transform:     'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex:        9999,
        }}
      >
        {content}
      </div>,
      stagePortalTarget(),
    );
  }

  // ── 조작 핸들·게이지 표시 조건 ────────────────
  // 현장(ABCD면·건물)에 배치됐을 때만 띄운다. 출동대현황·자원대기소·대기1단계·
  // 직전대기·RIT·임시의료소에서는 활동 중이 아니라 의미가 없다.
  // 수량 게이지도 같은 규칙을 따른다 — 게이지가 곧 송수 연결 손잡이라서다.
  const onBoard = isOnTacticalBoard(token.zoneKey);

  // ── 수량 게이지 ──────────────────────────────
  // 실시간 계산이 꺼져 있으면 잔량이 늘 100 이라 숫자를 숨긴다(게이지 틀은 남긴다)
  const { realtimeCalcEnabled } = useSettings();
  const isWaterUnit    = waterLevel !== null && WATER_UNIT_TYPES.has(token.unitType);
  const waterLevelL    = isWaterUnit ? (waterLevel!.levels[token.id] ?? waterLevel!.getCapacity(token.id)) : 0;
  const waterCapL      = isWaterUnit ? waterLevel!.getCapacity(token.id) : 0;

  // ── 소화전 ───────────────────────────────────
  const isHydrant       = token.unitType === 'hydrant';
  const isHydrantBroken = isHydrant && token.statusTag?.label === '소화전고장';

  // ── 고가차/굴절차 방수 — 수원 미연결 시 빨간색 ─────
  const isAerialBansu = AERIAL_UNIT_TYPES.has(token.unitType) &&
    !!token.statusTag?.label?.endsWith('방수');
  const aerialHasWaterSource = isAerialBansu &&
    connections.some(c => {
      if (c.toId !== token.id || !WATER_UNIT_TYPES.has(c.fromType)) return false;
      const src = tokens.find(t => t.id === c.fromId);
      return src?.statusTag?.label !== '펌프고장';
    });
  const aerialBansuNoSource = isAerialBansu && !aerialHasWaterSource;

  // ── 수량 소진 (0%) ───────────────────────────
  const isWaterEmpty   = isWaterUnit && waterLevelL === 0;
  // 게이지는 늘 나온다 — 「송수라인」은 선만 감추는 옵션이다
  const showWaterGauge = onBoard && isWaterUnit;

  // ── CSS 클래스 조합 ──────────────────────────
  const cardClasses = [
    'token-card',
    `token-card--${token.color}`,
    isRecent        ? 'token-card--recently-moved'  : '',
    isSource        ? 'token-card--mode-source'     : '',
    isInMode        ? 'token-card--mode-dim'        : '',
    barMenu         ? 'token-card--menu-open'       : '',
    isHydrantBroken ? 'token-card--hydrant-broken'  : '',
    isWaterEmpty    ? 'token-card--water-empty'     : '',
  ].filter(Boolean).join(' ');

  const hasOverlay = hasBadges; // statusTag는 토큰 하단으로 이동

  // 방수 핸들만 방면 한정 — 건물 내부는 자리가 좁아 부속을 붙이지 않는다.
  // (방수 지점은 건물 내부도 그대로 지정할 수 있다)
  // 바스켓에 탄 활동대는 관창을 숨긴다 — 관창을 들고 바스켓에 오를 일이 없다.
  // 송수라인도 탑승할 때 함께 끊긴다(AerialOverlay.boardBasket · 사용자 결정).
  //
  // **순환대도 방수포를 쓰지 않는다**(2026-09-09 사용자 결정). 순환보수 중인 차는
  // 물을 실어 나르는 것이 임무라, 제 물을 방수포로 쏘면 그 임무가 무너진다.
  // 송수 손잡이를 뗀 것과 짝이다.
  const showNozzle      = isOnBuildingFace(token.zoneKey)
                          && SPRAY_HANDLE_TYPES.has(token.unitType) && !selectMode
                          && !token.ridingOn && !isCirculating;
  // 전개 전에만 띄운다 — 전개 후에는 사다리 끝단을 직접 끌어 옮긴다(AerialOverlay)
  // 방수포 핸들이 게이지 우측 상단을 차지하는가 — 수량 숫자를 아래로 내릴 조건
  // (게이지는 펌프·물탱크에만 붙으므로 둘은 늘 같이 나온다)
  const monitorNozzle   = showNozzle && isWaterUnit;
  const showLadder      = onBoard && AERIAL_UNIT_TYPES.has(token.unitType)
                          && !selectMode && token.aerialTarget == null;

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────

  return (
    <>
      <div
        className={`token-card-wrapper${selectMode ? ' token-card-wrapper--select' : ''}${carriedVictims.length > 0 ? ' token-card-wrapper--carrying' : ''}${isMember ? ' token-card-wrapper--member' : ''}${supplyLinks.length > 0 ? ' token-card-wrapper--supplying' : ''}${monitorNozzle ? ' token-card-wrapper--monitor-nozzle' : ''}`}
        style={wrapperStyle}
        ref={wrapperRef}
        data-token-id={token.id}
        data-water-type={token.unitType}
        data-touch-drop-target="true"
        title={commanderOf ? `${commanderOf.label} 단위지휘관 소속` : undefined}
        onDragOver={handleVictimDragOver}
        onDrop={handleVictimDrop}
      >
        {selectMode && (
          <label className="token-card__checkbox" onMouseDown={e => e.stopPropagation()}>
            <input type="checkbox" checked={!!selected} onChange={onToggleSelect} />
          </label>
        )}
        {/* 모드 소스 링 */}
        {isSource && (
          <div className="token-card-mode-ring" aria-hidden="true" />
        )}

        {/* ── 인라인 오버레이 ──────────────────────────────
            토큰 wrapper 내부에 position:absolute 로 배치.
            토큰이 이동하면 오버레이도 DOM 계층상 자동으로 함께 이동.
            부모 컨테이너(zone-cell 등)는 overflow:visible 로 변경하여 잘림 방지.
            위쪽 뷰포트 경계 근처일 때만 --below 클래스로 아래 방향 전환.
        ────────────────────────────────────────────────── */}
        {hasOverlay && (
          <div
            className={[
              'token-overlay',
              overlayBelow ? 'token-overlay--below' : '',
            ].filter(Boolean).join(' ')}
            aria-hidden="true"
          >
            {/* 시스템 배지 */}
            {hasBadges && (
              <div className="token-badge-overlay">
                {token.badges.map(badge => {
                  const col = badge.color ? PRESET_COLORS.find(c => c.value === badge.color) : null;
                  return (
                    <div
                      key={badge.id}
                      className="token-badge"
                      style={col ? { background: col.bg, borderColor: col.border } : undefined}
                    >
                      <span
                        className="token-badge__line"
                        style={col ? { color: col.text } : undefined}
                      >{badge.line1}</span>
                      {badge.line2 && (
                        <span
                          className="token-badge__line token-badge__line--sub"
                          style={col ? { color: col.text, opacity: 0.85 } : undefined}
                        >{badge.line2}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}


          </div>
        )}

        {/* ── 송수 배지 — 토큰 위, 상태메세지 아래 ──
             활동대는 종류로 묶어 개수, 차량은 낱개 순번(위 linkGroups 주석) */}
        {supplyLinks.length > 0 && (
          <div className="token-supply-badges">
            {supplyLinks.map(c => {
              const target = tokens.find(t => t.id === c.toId);
              const num    = unitNumberOf(target?.label ?? c.toName);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`token-supply-badge${(num?.length ?? 0) > 1 ? ' token-supply-badge--wide' : ''}`}
                  data-color={target?.color ?? 'white'}
                  // 이 연결의 선은 토큰 한복판이 아니라 이 배지에서 뽑는다
                  // (WaterConnectionOverlay 의 connectionAnchor)
                  data-water-anchor={`${c.fromId}:${c.toId}`}
                  title={`${target?.label ?? c.toName ?? ''} 송수`}
                  onMouseEnter={() => setHoverConnId(c.id)}
                  onMouseLeave={() => setHoverConnId(null)}
                  onMouseDown={e => {
                    e.stopPropagation();
                    setSupplyPopup({ connId: c.id, x: e.clientX, y: e.clientY });
                  }}
                >{num ?? '●'}</button>
              );
            })}
          </div>
        )}

        {/* ── 상단 출동대 상태메세지 ── */}
        {showStatusMsg && (
          <div className="token-status-msg">
            <span className="token-status-msg__text">{token.customNote}</span>
            <button
              className="token-status-msg__close"
              onMouseDown={e => { e.stopPropagation(); setCustomNote(token.id, ''); }}
              aria-label="메세지 닫기"
            >×</button>
          </div>
        )}

        {/* ── 좌측 임무 레이블 ── */}
        {hasMission && (
          <div className="token-mission-labels">
            {/*
              임무 칩은 장식이다 — 딱 하나, **「단위」만 누를 수 있다.**
              누르면 그 밑의 소속대와 「단위지휘관 해제」가 함께 열린다
              (2026-09-09 사용자 결정). 지휘 관계를 보고 푸는 자리를 그 표시
              위에 둔 것이라, 무리를 확인하러 다른 데를 뒤질 일이 없다.
            */}
            {token.missionTags?.map(m => (
              m.label === MISSION_UNIT_COMMANDER.label && isUnitCommander ? (
                <button
                  key={m.label}
                  type="button"
                  className="token-mission-label token-mission-label--action"
                  data-mission={m.label}
                  title={myMembers.length > 0
                    ? `소속대 ${myMembers.length}대 — 눌러서 목록·해제`
                    : '단위지휘관 — 눌러서 해제'}
                  onMouseDown={e => {
                    e.stopPropagation();
                    setMemberPopup({ x: e.clientX, y: e.clientY });
                  }}
                >{m.label}</button>
              ) : (
                <div key={m.label} className="token-mission-label" data-mission={m.label} aria-label={m.label}>
                  {m.label}
                </div>
              )
            ))}
          </div>
        )}

        <div
          className={cardClasses}
          draggable={mode.type === null}
          {...touchDrag}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onContextMenu={handleContextMenu}
          onClick={handleClick}
          onDoubleClick={onDoubleClick && mode.type === null ? (e => { e.stopPropagation(); onDoubleClick(); }) : undefined}
        >
          {isHydrantBroken ? `${token.label} [고장]` : token.label}
        </div>

        {/* ── 하단 상태 태그 (임무/상태 프리셋) ── */}
        {token.statusTag && !isHydrantBroken && (() => {
          const baseCol = STATUS_TAG_COLORS[token.statusTag!.color] ?? STATUS_TAG_COLORS.white;
          const col = aerialBansuNoSource ? STATUS_TAG_COLORS.red : baseCol;
          return (
            <div className="token-status-tag-below">
              <div
                className="token-status-tag"
                style={{ background: col.bg, borderColor: col.border, color: col.text }}
              >
                <span className="token-status-tag__main">{token.statusTag!.label}</span>
              </div>
            </div>
          );
        })()}

        {showWaterGauge && (
          <WaterGauge
            levelL={waterLevelL}
            capacityL={waterCapL}
            token={token}
            /*
             * 순환대는 **제 이름으로 송수하지 않는다.** 물은 순환칸에서 나가는
             * 선 하나로 무리가 함께 보낸다(CirculationSlot). 게이지는 그대로
             * 두되 손잡이만 뗀다 — 잔량은 여전히 읽어야 한다.
             */
            draggable={onBoard && !selectMode && !isCirculating}
            showLevel={realtimeCalcEnabled}
          />
        )}

        {/* ── 관창 핸들 — 끌어서 방수, 클릭해서 중단 ── */}
        {showNozzle && <NozzleHandle token={token} />}

        {/* ── 사다리·바스켓 핸들 — 끌어서 전개 ── */}
        {showLadder && <LadderHandle token={token} />}

        {/* ── 이송 연결된 구조대상자 — 토큰 바로 우측에 아이콘만 부착 ── */}
        {carriedVictims.length > 0 && (
          <div className="token-carried-victims">
            {carriedVictims.map(v => (
              <VictimCard key={v.id} victim={v} attached />
            ))}
          </div>
        )}
      </div>

      {/* 카운트다운 포털 (우측 배지 형태 — 드래그 중 표시 안 됨, 포털 유지) */}
      {medicalCountdown !== null && countdownPortal(
        '',
        `구조 처치 완료까지 ${medicalCountdown}초`,
        `구조중 ${medicalCountdown}초`,
      )}
      {arrivalCountdown !== null && countdownPortal(
        'token-countdown--arrival',
        `출동중 — 도착까지 ${secsToMmss(arrivalCountdown)}`,
        secsToMmss(arrivalCountdown),
      )}

      {/* 가로 막대형 상태 메뉴 */}
      {barMenu && isHydrant && (
        <HydrantBarMenu token={token} anchorRect={barMenu} onClose={handleClose} />
      )}
      {barMenu && !isHydrant && (
        <UnitStatusBarMenu token={token} anchorRect={barMenu} onClose={handleClose} />
      )}

      {supplyPopup && (
        <WaterDisconnectPopup
          x={supplyPopup.x} y={supplyPopup.y}
          onDisconnect={() => { removeConnection(supplyPopup.connId); setSupplyPopup(null); }}
          onClose={() => setSupplyPopup(null)}
        />
      )}

      {/* 「단위」 칩을 누르면 무리가 열린다 — 소속대 목록과 지휘관 해제가 한자리에 */}
      {memberPopup && (
        <BoardListPopup
          x={memberPopup.x} y={memberPopup.y}
          title={myMembers.length > 0 ? `소속대 ${myMembers.length}대` : '소속대 없음'}
          items={myMembers.map(m => ({ id: m.id, label: m.label, color: m.color }))}
          actionLabel="소속 해제"
          onPick={memberId => {
            const m = myMembers.find(t => t.id === memberId);
            if (m) removeMember(token.id, m.id, m.label);
            if (myMembers.length <= 1) setMemberPopup(null);
          }}
          onHover={peekMember}
          footerLabel="단위지휘관 해제"
          onFooter={() => { peekMember(null); releaseCommander(); setMemberPopup(null); }}
          onClose={() => { peekMember(null); setMemberPopup(null); }}
        />
      )}
    </>
  );
}
