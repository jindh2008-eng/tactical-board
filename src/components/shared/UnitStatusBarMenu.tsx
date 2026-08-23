import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UnitToken } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { useActionMode } from '../../context/ActionModeContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useDisplayOptions } from '../../context/DisplayOptionsContext';
import { sprayBlockReason, sprayBlockMessage } from '../../utils/waterSupply';
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
  const { toggleMissionTag, setStatusTag, setCustomNote, setSprayState, setAerialSprayTarget } = useTokens();
  const { enterMode }           = useActionMode();
  const { connections }         = useWaterConnections();
  const { showWaterSupply }     = useDisplayOptions();
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

  const canWaterConnect   = WATER_SOURCE_TYPES.has(token.unitType);
  const isAerialVehicle   = AERIAL_TYPES.has(token.unitType);
  const deployLabel       = token.unitType === 'aerial' ? '사다리전개' : '바스켓전개';
  const isSprayCapable    = SPRAY_CAPABLE_TYPES.has(token.unitType);
  const isSprayActive     = isSprayCapable && token.sprayState != null;
  const isMonitorUnit     = MONITOR_TYPES.has(token.unitType);
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

  const hasFuncButtons =
    isAerialVehicle ||
    isSprayCapable ||
    canWaterConnect ||
    isMonitorUnit ||
    showSearchButton;

  // ── 데이터 ──────────────────────────────────
  const missionPresets  = unitTagPresetConfig[token.unitType]?.missions ?? [];
  const statusPresets   = unitTagPresetConfig[token.unitType]?.statuses ?? [];
  const statusMessages  = unitStatusConfig[token.unitType] ?? [];
  const isDirectInput   = !!token.customNote && !statusMessages.includes(token.customNote);

  // ── 표시할 탭 결정 ──────────────────────────
  const tabs: { key: TabKey; label: string }[] = [];
  if (missionPresets.length > 0)                    tabs.push({ key: 'mission',   label: '임무' });
  if (statusPresets.length > 0)                     tabs.push({ key: 'status',    label: '상태' });
  if (statusMessages.length > 0 || true)            tabs.push({ key: 'statusMsg', label: '상태메세지' });
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

  function handleMission(label: string, color: string) {
    toggleMissionTag(token.id, { label, color });
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

  /** 송수 사용 훈련이면 급수 연결과 잔량을 확인한다. 막히면 안내하고 true 반환 */
  function blockedBySupply(): boolean {
    const reason = sprayBlockReason(
      showWaterSupply, connections, token.id, token.unitType, waterLevel?.emptyVehicleIds,
    );
    if (reason === null) return false;
    alert(sprayBlockMessage(reason, token.unitType));
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
          {missionPresets.map(preset => {
            const isActive = token.missionTags?.some(m => m.label === preset.label) ?? false;
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
