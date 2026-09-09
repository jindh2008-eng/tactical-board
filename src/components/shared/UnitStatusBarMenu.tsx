import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UnitToken } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { missionPresetsFor, MISSION_UNIT_COMMANDER } from '../../config/unitMissions';
import { useUnitCommander } from '../../context/UnitCommanderContext';
import {
  commanderOfScope, groupOfMember, commandScopeOf, EXTERIOR_SCOPE, circulationScope,
} from '../../utils/unitCommandScope';
import { useActionMode } from '../../context/ActionModeContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useHydrantCirculation } from '../../context/HydrantCirculationContext';
import { sprayBlockReason, sprayBlockMessage } from '../../utils/waterSupply';
import { showBoardNotice } from '../../utils/boardNotice';
import { useWaterLevel } from '../../context/WaterLevelContext';
import { useSettings } from '../../store/settingsStore';
import { useVictims } from '../../context/VictimContext';
import { useOptionalBuildingState, computeStairSmokeLevel } from '../../context/BuildingStateContext';
import './UnitStatusBarMenu.css';
import { stagePortalTarget, stageBounds, rectToStage } from '../../utils/stagePortal';

// ─────────────────────────────────────────────
// 색상 팔레트
// ─────────────────────────────────────────────

const TAG_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue:   { bg: '#0d1e3a', border: '#2255aa', text: '#88bbff' },
  yellow: { bg: '#2a1e00', border: '#aa7700', text: '#ffcc44' },
  red:    { bg: '#2a0808', border: '#aa2222', text: '#ff7777' },
  green:  { bg: '#0a1e10', border: '#228844', text: '#55cc88' },
  white:  { bg: '#1e1e22', border: '#888888', text: '#dddddd' },
};

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

interface AnchorRect {
  left: number; top: number; right: number; bottom: number; width: number; height: number;
}

interface Props {
  token:      UnitToken;
  anchorRect: AnchorRect;
  onClose:    () => void;
}

const WATER_SOURCE_TYPES   = new Set(['pump', 'water_tank', 'indoor_hydrant']);
const SPRAY_CAPABLE_TYPES  = new Set(['suppression', 'rescue']);
const SEARCH_CAPABLE_TYPES = new Set(['suppression', 'rescue']);
const MONITOR_TYPES        = new Set(['pump', 'water_tank']);
const AERIAL_TYPES         = new Set(['aerial', 'ladder']);

type TabKey = 'mission' | 'status' | 'statusMsg' | 'func';

const TAB_COLORS: Record<TabKey, { bg: string; border: string; text: string; activeBg: string }> = {
  mission:   { bg: '#0d1e3a', border: '#2255aa', text: '#88bbff', activeBg: '#142a4a' },
  status:    { bg: '#0a1e10', border: '#228844', text: '#55cc88', activeBg: '#0e2a16' },
  statusMsg: { bg: '#1e1800', border: '#997700', text: '#ddaa33', activeBg: '#2a2200' },
  func:      { bg: '#1a1030', border: '#6644aa', text: '#aa88ee', activeBg: '#221640' },
};

function getFloorNumFromZoneKey(zoneKey: string | null): number | null {
  if (!zoneKey || zoneKey.startsWith('face-')) return null;
  const floorId = zoneKey.split('-')[0];
  if (floorId === 'RF') return null;
  if (floorId.startsWith('B')) {
    const n = parseInt(floorId.slice(1), 10);
    return isNaN(n) ? null : -n;
  }
  const match = floorId.match(/^(\d+)F$/);
  return match ? parseInt(match[1], 10) : null;
}

const GAP = 6;

// ─────────────────────────────────────────────
// UnitStatusBarMenu
// ─────────────────────────────────────────────

export function UnitStatusBarMenu({ token, anchorRect, onClose }: Props) {
  const { toggleMissionTag, setStatusTag, setCustomNote, setSprayState, setAerialSprayTarget,
          setBasketRider } = useTokens();
  const { groups, assign, release, removeMember } = useUnitCommander();
  const { enterMode }           = useActionMode();
  const { connections }         = useWaterConnections();
  const { circulationIds, hydrantOf } = useHydrantCirculation();
  const waterLevel              = useWaterLevel();
  const { unitTagPresetConfig, unitStatusConfig } = useSettings();
  const { activeSearches, searchScores, addUnitToSearch, removeUnitFromSearch } = useVictims();
  const buildingState      = useOptionalBuildingState();
  const stairSmokeFloor    = buildingState?.stairSmokeFloor    ?? null;
  const smokeConcentration = buildingState?.smokeConcentration ?? 0;
  const fireStates         = buildingState?.fireStates         ?? {};

  const [activeTab,  setActiveTab]  = useState<TabKey | null>(null);
  const [noteOpen,   setNoteOpen]   = useState(false);
  const [noteDraft,  setNoteDraft]  = useState(token.customNote ?? '');
  const menuRef      = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const tabRefs      = useRef<Record<string, HTMLButtonElement | null>>({});

  /*
   * 순환대는 **제 이름으로 송수하지 않는다.** 물은 순환칸에서 나가는 선 하나로
   * 무리가 함께 보낸다(CirculationSlot). 여기 단추를 남기면 눌러 놓고도
   * 어디에도 이을 수 없는(연결 규칙이 거절하는) 단추가 된다.
   */
  const canWaterConnect   = WATER_SOURCE_TYPES.has(token.unitType)
                            && !circulationIds.has(token.id);
  const isAerialVehicle   = AERIAL_TYPES.has(token.unitType);
  const deployLabel       = token.unitType === 'aerial' ? '사다리전개' : '바스켓전개';
  /*
   * 바스켓에 탄 활동대는 방수를 걸 수 없다 — 관창을 숨기고 송수라인을 끊는
   * 것과 짝이다(TokenCard `showNozzle` · AerialOverlay.boardBasket).
   * 여기만 남기면 「방수개시」가 보이는데 눌러도 급수가 없어 막히는,
   * 왜 안 되는지 알 수 없는 단추가 된다.
   */
  const isSprayCapable    = SPRAY_CAPABLE_TYPES.has(token.unitType) && !token.ridingOn;
  const isSprayActive     = isSprayCapable && token.sprayState != null;
  /*
   * 순환대는 방수포도 쓰지 않는다 — 제 물을 쏘면 실어 나를 물이 없다.
   * 「송수」와 같은 이유로 단추 자체를 감춘다(TokenCard 의 `showNozzle` 과 짝).
   */
  const isMonitorUnit     = MONITOR_TYPES.has(token.unitType)
                            && !circulationIds.has(token.id);
  const isMonitorActive   = isMonitorUnit && token.aerialSprayTarget != null;

  // ── 인명검색 ──────────────────────────────────
  const isSearchCapable = SEARCH_CAPABLE_TYPES.has(token.unitType);
  const tokenZoneKey    = token.zoneKey;
  const isInInterior    = !!tokenZoneKey && !tokenZoneKey.startsWith('face-');
  const floorId = isInInterior && tokenZoneKey ? tokenZoneKey.split('-')[0] : null;

  const floorNum = getFloorNumFromZoneKey(tokenZoneKey);
  const smokeLevel = floorNum !== null
    ? computeStairSmokeLevel({ floorEndNum: floorNum, stairSmokeFloor, smokeConcentration })
    : 'none';
  const hasDenseSmoke = smokeLevel !== 'none';

  const ACTIVE_FIRE_STATUSES = new Set(['extension-peak', 'peak', 'seventy']);
  const POST_INITIAL_SET     = new Set(['initial', 'complete']);
  const floorFireStatus = floorId ? (fireStates[floorId] ?? null) : null;
  const hasActiveFire   = !!floorFireStatus && ACTIVE_FIRE_STATUSES.has(floorFireStatus);

  const initialScore  = hasActiveFire ? 100 : hasDenseSmoke ? 70 : 30;
  const decrementRate = token.unitType === 'rescue' ? 2 : 1;

  const isFireFloor      = floorId !== null && fireStates[floorId] != null;
  const secondaryInitial = isFireFloor ? 50 : 30;

  const allFireFloorsInitial = Object.values(fireStates)
    .filter(s => s !== null)
    .every(s => POST_INITIAL_SET.has(s as string));
  const startInSecondary = floorId !== null
    ? (isFireFloor
        ? POST_INITIAL_SET.has(floorFireStatus as string)
        : allFireFloorsInitial)
    : false;

  const isSearchActive = floorId !== null
    ? (activeSearches[floorId]?.units.some(u => u.tokenId === token.id) ?? false)
    : false;

  const searchScore = token.id in searchScores ? searchScores[token.id] : null;

  const showSearchButton = isSearchCapable && isInInterior;

  /*
   * 단위지휘관 소속에서 빼는 길.
   *
   * 예전에는 연결선을, 그다음에는 소속 이름표를 눌렀다. 표시가 토큰 안쪽
   * 테두리 하나로 줄면서 누를 자리가 없어져 여기로 옮겼다 — 그 대를 두고
   * 통제만 떼는 동작이라 「기능」에 있는 것이 맞다(구역 밖으로 끌어내면
   * 자리를 옮기는 것이라 그때는 저절로 풀린다).
   */
  const memberOf = groupOfMember(groups, token.id);

  const hasFuncButtons =
    isAerialVehicle ||
    isSprayCapable ||
    canWaterConnect ||
    isMonitorUnit ||
    showSearchButton ||
    memberOf !== undefined;

  // ── 데이터 ──────────────────────────────────
  /*
   * 임무는 설정모드가 아니라 코드에서 온다 — 시나리오마다 달라지는 값이
   * 아니라 편성상 정해진 것이라서다(config/unitMissions.ts, 2026-09-04).
   * 상태(status)는 그대로 설정모드가 정한다.
   */
  const missionPresets  = missionPresetsFor(token.unitType);
  const statusPresets   = unitTagPresetConfig[token.unitType]?.statuses ?? [];
  const statusMessages  = unitStatusConfig[token.unitType] ?? [];
  const isDirectInput   = !!token.customNote && !statusMessages.includes(token.customNote);

  // ── 표시할 탭 결정 ──────────────────────────
  const tabs: { key: TabKey; label: string }[] = [];
  if (missionPresets.length > 0)                    tabs.push({ key: 'mission',   label: '임무' });
  if (statusPresets.length > 0)                     tabs.push({ key: 'status',    label: '상태' });
  // 상태메세지 탭은 **프리셋이 없어도** 낸다 — 그 안에 「직접입력」이 있다.
  // (조건이 `statusMessages.length > 0 || true` 로 적혀 있었다. 뒤의 `|| true`
  //  가 앞을 죽여 늘 참이었으니, 읽는 사람이 조건을 따지게 두지 않는다)
  tabs.push({ key: 'statusMsg', label: '상태메세지' });
  if (hasFuncButtons)                               tabs.push({ key: 'func',      label: '기능' });

  // ── 위/아래 배치 결정 ────────────────────────
  // 이 메뉴도 스테이지 안 포털이라 좌표를 캔버스 기준으로 바꿔 쓴다.
  const a0 = rectToStage(anchorRect);
  const anchor = { ...a0, bottom: a0.top + a0.height };
  const stage = stageBounds();
  const cx = anchor.left + anchor.width / 2;
  const showAbove = anchor.top > 160;

  // ── 외부 클릭 / Esc ──────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // ── 핸들러 ──────────────────────────────────

  function handleTabHover(key: TabKey) {
    setActiveTab(key);
    setNoteOpen(false);
  }

  function handleTabLeave() {
    // 팝업 위로 마우스가 이동하면 유지되므로 여기서는 아무것도 안 함
  }

  /**
   * 임무를 켜고 끈다.
   *
   * 「단위」는 임무 표시에서 끝나지 않는다 — 그 대는 **그 자리의
   * 단위지휘관**이 된다. 층 슬롯에 끌어다 놓는 것과 같은 결과다
   * (UnitCommanderContext 주석). 임무를 떼면 그 자리를 물리고 소속대도
   * 함께 풀린다.
   */
  function handleMission(label: string, color: string) {
    const wasOn = token.missionTags?.some(m => m.label === label) ?? false;
    toggleMissionTag(token.id, { label, color });

    /*
     * 순환칸에 선 차의 「단위」는 **그 순환급수팀 전체의 지휘관**이라는 뜻이다
     * (2026-09-09 사용자 결정). 면(`face-D`)이 아니라 그 팀을 자리로 넘겨야
     * 「D면 지휘관」과 뜻이 섞이지 않고, 칸을 떠나면 저절로 물러난다
     * (자리 하나짜리 — unitCommandScope).
     */
    const circHydrant = hydrantOf(token.id);
    const commandKey  = circHydrant ? circulationScope(circHydrant) : token.zoneKey;

    if (label === MISSION_UNIT_COMMANDER.label && commandKey) {
      if (wasOn) { release(token.id); return; }

      /*
       * 한 범위에 지휘관은 하나다 — 층도, 계단실도. 이미 있던 지휘관은
       * 자리에서 물러나므로 그 대의 「단위」 임무도 함께 뗀다. 안 그러면
       * 지휘관이 아닌 대가 지휘관 표시를 달고 남는다.
       * 건물 밖만 예외다 — 임무 단위로 여럿 설 수 있어 밀어내지 않는다.
       */
      const prevId = commandScopeOf(commandKey) === EXTERIOR_SCOPE
        ? undefined
        : commanderOfScope(groups, commandKey);
      if (prevId && prevId !== token.id) {
        toggleMissionTag(prevId, MISSION_UNIT_COMMANDER);
      }
      assign(commandKey, token.id);
    }
  }

  function handleStatus(label: string, color: string) {
    if (token.statusTag?.label === label) {
      setStatusTag(token.id, null);
    } else {
      setStatusTag(token.id, { label, color });
    }
    onClose();
  }

  function handleSaveNote() {
    setCustomNote(token.id, noteDraft.trim());
    onClose();
  }

  function handleClearNote() {
    setCustomNote(token.id, '');
    setNoteOpen(false);
    onClose();
  }

  function handleWaterConnect() {
    enterMode({ type: 'water-connect', sourceId: token.id, sourceType: token.unitType });
    onClose();
  }

  /** 급수 연결과 잔량을 확인한다. 막히면 안내하고 true 반환 */
  function blockedBySupply(): boolean {
    const reason = sprayBlockReason(
      connections, token.id, token.unitType, waterLevel?.emptyVehicleIds,
    );
    if (reason === null) return false;
    /*
     * 메뉴는 곧 닫힌다 — 안내는 **메뉴 밖**(BoardNoticeHost)이 그린다.
     * 여기서 그리면 닫히면서 같이 사라져 한 프레임도 안 보인다.
     * 자리는 그 토큰 위다(메뉴를 띄운 앵커).
     */
    showBoardNotice(
      sprayBlockMessage(reason, token.unitType),
      anchorRect.left + anchorRect.width / 2,
      anchorRect.top,
    );
    onClose();
    return true;
  }

  function handleSprayStart() {
    if (blockedBySupply()) return;
    enterMode({ type: 'spray-target', sourceId: token.id, sourceZoneKey: token.zoneKey });
    onClose();
  }

  function handleSprayStop() {
    setSprayState(token.id, null);
    onClose();
  }

  function handleMonitorStart() {
    if (blockedBySupply()) return;   // 방수포는 자기 수량이 0이면 못 쏜다
    enterMode({ type: 'aerial-spray-target', sourceId: token.id });
    onClose();
  }

  function handleMonitorStop() {
    setAerialSprayTarget(token.id, null);
    setStatusTag(token.id, null);
    onClose();
  }

  function handleSearchStart() {
    if (!floorId) return;
    addUnitToSearch(token.id, floorId, initialScore, secondaryInitial, decrementRate, startInSecondary);
    onClose();
  }

  function handleSearchStop() {
    removeUnitFromSearch(token.id);
    onClose();
  }

  function handleAerialDeploy(actionLabel: string) {
    enterMode({ type: 'aerial-floor-select', sourceId: token.id, unitType: token.unitType, actionLabel });
    onClose();
  }

  // ── 팝업 내용 렌더 ──────────────────────────

  function renderPopup() {
    if (!activeTab) return null;

    if (activeTab === 'mission') {
      return (
        <div className="usbm2__popup-items">
          {/*
            버튼 색은 붙었을 때 토큰에 나타나는 칩과 같다 — 임무는 파랑,
            「단위」만 지휘 축이라 보라다(App.css 「판 위 칩 두 축」).
            고른 것만 테두리를 밝혀 표시한다.
          */}
          {missionPresets.map(preset => {
            const isActive = token.missionTags?.some(m => m.label === preset.label) ?? false;
            return (
              <button
                key={preset.label}
                className={[
                  'usbm2__popup-btn', 'usbm2__popup-btn--mission',
                  isActive ? 'usbm2__popup-btn--active' : '',
                ].filter(Boolean).join(' ')}
                data-mission={preset.label}
                onMouseDown={e => { e.stopPropagation(); handleMission(preset.label, preset.color); }}
              >
                {isActive && <span className="usbm2__check">✓</span>}
                {preset.label}
              </button>
            );
          })}
        </div>
      );
    }

    if (activeTab === 'status') {
      return (
        <div className="usbm2__popup-items">
          {statusPresets.map(preset => {
            const isActive = token.statusTag?.label === preset.label;
            const col = TAG_COLORS[preset.color] ?? TAG_COLORS.white;
            return (
              <button
                key={preset.label}
                className={['usbm2__popup-btn', isActive ? 'usbm2__popup-btn--active' : ''].filter(Boolean).join(' ')}
                style={{
                  background:  col.bg,
                  borderColor: isActive ? col.text : col.border,
                  color:       col.text,
                  ...(isActive ? { boxShadow: `0 0 0 2px ${col.text}` } : {}),
                }}
                onMouseDown={e => { e.stopPropagation(); handleStatus(preset.label, preset.color); }}
              >
                {isActive && <span className="usbm2__check">✓</span>}
                {preset.label}
              </button>
            );
          })}
        </div>
      );
    }

    if (activeTab === 'statusMsg') {
      if (noteOpen) {
        return (
          <div className="usbm2__popup-items">
            <div className="usbm2__note-panel">
              <input
                ref={noteInputRef}
                className="usbm2__note-input"
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter')  handleSaveNote();
                  if (e.key === 'Escape') setNoteOpen(false);
                }}
                placeholder="직접 입력…"
                maxLength={40}
                autoFocus
              />
              <div className="usbm2__note-row">
                {token.customNote && (
                  <button className="usbm2__note-clear" onMouseDown={e => { e.stopPropagation(); handleClearNote(); }}>
                    삭제
                  </button>
                )}
                <button className="usbm2__note-save" onMouseDown={e => { e.stopPropagation(); handleSaveNote(); }}>
                  저장
                </button>
              </div>
            </div>
          </div>
        );
      }
      return (
        <div className="usbm2__popup-items">
          {statusMessages.map(msg => {
            const isActive = token.customNote === msg;
            return (
              <button
                key={msg}
                className={['usbm2__popup-btn usbm2__popup-btn--msg', isActive ? 'usbm2__popup-btn--msg-active' : ''].filter(Boolean).join(' ')}
                onMouseDown={e => {
                  e.stopPropagation();
                  setCustomNote(token.id, isActive ? '' : msg, 'preset');
                  onClose();
                }}
              >
                {isActive && <span className="usbm2__check">✓</span>}
                {msg}
              </button>
            );
          })}
          <button
            className={['usbm2__popup-btn usbm2__popup-btn--note', isDirectInput ? 'usbm2__popup-btn--note-has' : ''].filter(Boolean).join(' ')}
            onMouseDown={e => { e.stopPropagation(); setNoteOpen(true); setNoteDraft(token.customNote ?? ''); }}
          >
            ✎ {isDirectInput ? token.customNote : '직접입력'}
          </button>
        </div>
      );
    }

    if (activeTab === 'func') {
      return (
        <div className="usbm2__popup-items">
          {isAerialVehicle && (
            <button
              className="usbm2__popup-btn usbm2__popup-btn--func"
              style={{ background: '#2a1e00', borderColor: '#aa7700', color: '#ffcc44' }}
              onMouseDown={e => { e.stopPropagation(); handleAerialDeploy(deployLabel); }}
            >
              {deployLabel}
            </button>
          )}
          {isSprayCapable && !isSprayActive && (
            <button
              className="usbm2__popup-btn usbm2__popup-btn--spray-start"
              onMouseDown={e => { e.stopPropagation(); handleSprayStart(); }}
            >
              방수개시
            </button>
          )}
          {isSprayActive && (
            <button
              className="usbm2__popup-btn usbm2__popup-btn--spray-stop"
              onMouseDown={e => { e.stopPropagation(); handleSprayStop(); }}
            >
              방수중단
            </button>
          )}
          {canWaterConnect && (
            <button
              className="usbm2__popup-btn usbm2__popup-btn--water"
              onMouseDown={e => { e.stopPropagation(); handleWaterConnect(); }}
            >
              송수
            </button>
          )}
          {isMonitorUnit && (
            isMonitorActive ? (
              <button
                className="usbm2__popup-btn usbm2__popup-btn--spray-stop"
                onMouseDown={e => { e.stopPropagation(); handleMonitorStop(); }}
              >
                방수중단
              </button>
            ) : (
              <button
                className="usbm2__popup-btn usbm2__popup-btn--spray-start"
                onMouseDown={e => { e.stopPropagation(); handleMonitorStart(); }}
              >
                방수포
              </button>
            )
          )}
          {token.ridingOn && (
            <button
              className="usbm2__popup-btn usbm2__popup-btn--unit-member"
              onMouseDown={e => {
                e.stopPropagation();
                setBasketRider(token.id, null);
                onClose();
              }}
            >
              하차
            </button>
          )}
          {memberOf && (
            <button
              className="usbm2__popup-btn usbm2__popup-btn--unit-member"
              onMouseDown={e => {
                e.stopPropagation();
                removeMember(memberOf.commanderId, token.id, token.label);
                onClose();
              }}
            >
              소속 해제
            </button>
          )}
          {showSearchButton && (
            isSearchActive ? (
              <button
                className="usbm2__popup-btn usbm2__popup-btn--search-stop"
                onMouseDown={e => { e.stopPropagation(); handleSearchStop(); }}
              >
                인명검색 중단{searchScore !== null ? ` (${searchScore})` : ''}
              </button>
            ) : (
              <button
                className="usbm2__popup-btn usbm2__popup-btn--search-start"
                onMouseDown={e => { e.stopPropagation(); handleSearchStart(); }}
              >
                인명검색
              </button>
            )
          )}
        </div>
      );
    }

    return null;
  }

  // ── 탭바 위치 ────────────────────────────────
  const barStyle: React.CSSProperties = showAbove
    ? {
        position:  'fixed',
        bottom:    `${stage.height - anchor.top + GAP}px`,
        left:      `${cx}px`,
        transform: 'translateX(-50%)',
        zIndex:    9998,
      }
    : {
        position:  'fixed',
        top:       `${anchor.bottom + GAP}px`,
        left:      `${cx}px`,
        transform: 'translateX(-50%)',
        zIndex:    9998,
      };

  return createPortal(
    <>
      <div className="usbm2__backdrop" onMouseDown={onClose} />

      <div
        ref={menuRef}
        className="usbm2"
        style={barStyle}
        onMouseDown={e => e.stopPropagation()}
        onContextMenu={e => e.preventDefault()}
        onMouseLeave={() => { if (!noteOpen) setActiveTab(null); }}
      >
        {/* 탭바 — 위치 고정 기준 */}
        <div className="usbm2__tabbar">
          {tabs.map(tab => {
            const tc = TAB_COLORS[tab.key];
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                ref={el => { tabRefs.current[tab.key] = el; }}
                className={['usbm2__tab', isActive ? 'usbm2__tab--active' : ''].filter(Boolean).join(' ')}
                style={{
                  background:    isActive ? tc.activeBg : tc.bg,
                  borderColor:   tc.border,
                  color:         tc.text,
                  boxShadow:     isActive ? `inset 0 -2px 0 ${tc.text}` : 'none',
                }}
                onMouseEnter={() => handleTabHover(tab.key)}
                onMouseLeave={handleTabLeave}
                onMouseDown={e => {
                  e.stopPropagation();
                  setActiveTab(prev => prev === tab.key ? null : tab.key);
                }}
              >
                {tab.label}
              </button>
            );
          })}

          {/* 2차 팝업 — 활성 탭 바로 위에 정렬 */}
          {activeTab && (() => {
            const tabEl   = tabRefs.current[activeTab];
            const barEl   = menuRef.current?.querySelector('.usbm2__tabbar') as HTMLElement | null;
            let leftPx    = 0;
            if (tabEl && barEl) {
              const tabRect = tabEl.getBoundingClientRect();
              const barRect = barEl.getBoundingClientRect();
              leftPx = tabRect.left - barRect.left + tabRect.width / 2;
            }
            return (
              <div
                className={`usbm2__popup ${showAbove ? 'usbm2__popup--above' : 'usbm2__popup--below'}`}
                style={{ left: `${leftPx}px` }}
              >
                {renderPopup()}
              </div>
            );
          })()}
        </div>
      </div>
    </>,
    stagePortalTarget(),
  );
}
