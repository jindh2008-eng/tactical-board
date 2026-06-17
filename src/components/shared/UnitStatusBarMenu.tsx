import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UnitToken } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { useActionMode } from '../../context/ActionModeContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useSettings } from '../../store/settingsStore';
import { useVictims } from '../../context/VictimContext';
import { useOptionalBuildingState, computeStairSmokeLevel } from '../../context/BuildingStateContext';
import './UnitStatusBarMenu.css';

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

/** zoneKey(예: "3F-center")에서 층 번호를 추출. 외곽면(face-A 등) → null */
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

const GAP = 8; // 토큰 엣지와 배지 그룹 사이 간격(px)

// ─────────────────────────────────────────────
// UnitStatusBarMenu
// ─────────────────────────────────────────────

export function UnitStatusBarMenu({ token, anchorRect, onClose }: Props) {
  const { toggleMissionTag, setStatusTag, setCustomNote, setSprayState, setAerialSprayTarget } = useTokens();
  const { enterMode }           = useActionMode();
  useWaterConnections();
  const { unitTagPresetConfig, unitStatusConfig } = useSettings();
  const { activeSearches, searchScores, addUnitToSearch, removeUnitFromSearch } = useVictims();
  const buildingState      = useOptionalBuildingState();
  const stairSmokeFloor    = buildingState?.stairSmokeFloor    ?? null;
  const smokeConcentration = buildingState?.smokeConcentration ?? 0;
  const fireStates         = buildingState?.fireStates         ?? {};

  const [noteOpen,  setNoteOpen]  = useState(false);
  const [noteDraft, setNoteDraft] = useState(token.customNote ?? '');
  const noteInputRef = useRef<HTMLInputElement>(null);

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
  // 건물 내부(face- 아닌 것)이고 배치된 상태인지
  const isInInterior    = !!tokenZoneKey && !tokenZoneKey.startsWith('face-');

  // 층 ID 추출 (예: "3F-center" → "3F")
  const floorId = isInInterior && tokenZoneKey ? tokenZoneKey.split('-')[0] : null;

  // 현재 층의 농연 여부 계산
  const floorNum = getFloorNumFromZoneKey(tokenZoneKey);
  const smokeLevel = floorNum !== null
    ? computeStairSmokeLevel({ floorEndNum: floorNum, stairSmokeFloor, smokeConcentration })
    : 'none';
  const hasDenseSmoke = smokeLevel !== 'none';

  // 현재 층의 화염 여부 (연소확대·최성기·큰불잡음 → 활성 화재 100점)
  const ACTIVE_FIRE_STATUSES = new Set(['extension-peak', 'peak', 'seventy']);
  const POST_INITIAL_SET     = new Set(['initial', 'complete']);
  const floorFireStatus = floorId ? (fireStates[floorId] ?? null) : null;
  const hasActiveFire   = !!floorFireStatus && ACTIVE_FIRE_STATUSES.has(floorFireStatus);

  // 인명검색 초기 점수: 화염 100, 농연 70, 없음 30
  const initialScore  = hasActiveFire ? 100 : hasDenseSmoke ? 70 : 30;
  // 초당 감소율: 구조대 2, 진압대 1
  const decrementRate = token.unitType === 'rescue' ? 2 : 1;

  // 2차 시작 점수: 화재 있는 층=50, 없는 층=30
  const isFireFloor      = floorId !== null && fireStates[floorId] != null;
  const secondaryInitial = isFireFloor ? 50 : 30;

  // 2차 전환 여부: 초진 이후면 바로 2차로 시작
  const allFireFloorsInitial = Object.values(fireStates)
    .filter(s => s !== null)
    .every(s => POST_INITIAL_SET.has(s as string));
  const startInSecondary = floorId !== null
    ? (isFireFloor
        ? POST_INITIAL_SET.has(floorFireStatus as string)
        : allFireFloorsInitial)
    : false;

  // 이 토큰이 현재 층에서 검색 중인지
  const isSearchActive = floorId !== null
    ? (activeSearches[floorId]?.units.some(u => u.tokenId === token.id) ?? false)
    : false;

  // 중단 버튼에 표시할 현재 점수
  const searchScore = token.id in searchScores ? searchScores[token.id] : null;

  // 인명검색 버튼 표시: 내부 구역 배치 + 인명검색 가능 대 (구조대상자 유무와 무관)
  const showSearchButton = isSearchCapable && isInInterior;

  const hasFuncButtons =
    isAerialVehicle ||
    isSprayCapable ||
    canWaterConnect ||
    isMonitorUnit ||
    showSearchButton;

  // ── 방향별 그룹 위치 계산 ────────────────────
  const cx = anchorRect.left + anchorRect.width  / 2;
  const cy = anchorRect.top  + anchorRect.height / 2;

  // 상단: 하단 엣지 = 토큰 상단 - GAP  (위로 성장)
  const topStyle: React.CSSProperties = {
    position:  'fixed',
    bottom:    `${window.innerHeight - anchorRect.top + GAP}px`,
    left:      `${cx}px`,
    transform: 'translateX(-50%)',
    zIndex:    9998,
  };
  // 좌측: 우측 엣지 = 토큰 좌측 - GAP
  const leftStyle: React.CSSProperties = {
    position:  'fixed',
    right:     `${window.innerWidth - anchorRect.left + GAP}px`,
    top:       `${cy}px`,
    transform: 'translateY(-50%)',
    zIndex:    9998,
  };
  // 우측: 좌측 엣지 = 토큰 우측 + GAP
  const rightStyle: React.CSSProperties = {
    position:  'fixed',
    left:      `${anchorRect.right + GAP}px`,
    top:       `${cy}px`,
    transform: 'translateY(-50%)',
    zIndex:    9998,
  };
  // 하단: 상단 엣지 = 토큰 하단 + GAP
  const bottomStyle: React.CSSProperties = {
    position:  'fixed',
    top:       `${anchorRect.bottom + GAP}px`,
    left:      `${cx}px`,
    transform: 'translateX(-50%)',
    zIndex:    9998,
  };

  // ── 외부 클릭 / Esc ──────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // ── 핸들러 ──────────────────────────────────

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

  function handleSprayStart() {
    enterMode({ type: 'spray-target', sourceId: token.id, sourceZoneKey: token.zoneKey });
    onClose();
  }

  function handleSprayStop() {
    setSprayState(token.id, null);
    onClose();
  }

  function handleMonitorStart() {
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


  // ── 데이터 ──────────────────────────────────
  const missionPresets  = unitTagPresetConfig[token.unitType]?.missions ?? [];
  const statusPresets   = unitTagPresetConfig[token.unitType]?.statuses ?? [];
  const statusMessages  = unitStatusConfig[token.unitType] ?? [];
  const isDirectInput   = !!token.customNote && !statusMessages.includes(token.customNote);

  // ─────────────────────────────────────────────
  // 렌더 — 방향별 배지 그룹
  // ─────────────────────────────────────────────

  return createPortal(
    <>
      {/* 전체 클릭 닫기 백드롭 */}
      <div className="usbm__backdrop" onMouseDown={onClose} />

      {/* ── 상단: 출동대 상태메세지 ──────────────────────── */}
      <div className="usbm__group usbm__group--top" style={topStyle} onMouseDown={e => e.stopPropagation()}>
        {noteOpen ? (
          <div className="usbm__note-panel">
            <input
              ref={noteInputRef}
              className="usbm__note-input"
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
            <div className="usbm__note-row">
              {token.customNote && (
                <button className="usbm__note-clear" onMouseDown={e => { e.stopPropagation(); handleClearNote(); }}>
                  삭제
                </button>
              )}
              <button className="usbm__note-save" onMouseDown={e => { e.stopPropagation(); handleSaveNote(); }}>
                저장
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 등록된 프리셋 메세지 배지 */}
            {statusMessages.map(msg => {
              const isActive = token.customNote === msg;
              return (
                <button
                  key={msg}
                  className={['usbm__badge usbm__badge--msg', isActive ? 'usbm__badge--msg-active' : ''].filter(Boolean).join(' ')}
                  onMouseDown={e => {
                    e.stopPropagation();
                    setCustomNote(token.id, isActive ? '' : msg);
                    onClose();
                  }}
                >
                  {isActive && <span className="usbm__check">✓</span>}
                  {msg}
                </button>
              );
            })}
            {/* 직접 입력 버튼 */}
            <button
              className={['usbm__badge usbm__badge--note', isDirectInput ? 'usbm__badge--note-has' : ''].filter(Boolean).join(' ')}
              onMouseDown={e => { e.stopPropagation(); setNoteOpen(true); setNoteDraft(token.customNote ?? ''); }}
            >
              ✎ {isDirectInput ? token.customNote : '직접입력'}
            </button>
          </>
        )}
      </div>

      {/* ── 좌측: 임무 ───────────────────────────────────── */}
      {missionPresets.length > 0 && (
        <div className="usbm__group usbm__group--left" style={leftStyle} onMouseDown={e => e.stopPropagation()}>
          <span className="usbm__dir-label usbm__dir-label--right">임무</span>
          {missionPresets.map(preset => {
            const isActive = token.missionTags?.some(m => m.label === preset.label) ?? false;
            const col = TAG_COLORS[preset.color] ?? TAG_COLORS.white;
            return (
              <button
                key={preset.label}
                className={['usbm__badge', isActive ? 'usbm__badge--active' : ''].filter(Boolean).join(' ')}
                style={{
                  background:  col.bg,
                  borderColor: isActive ? col.text : col.border,
                  color:       col.text,
                  ...(isActive ? { boxShadow: `0 0 0 2px ${col.text}` } : {}),
                }}
                onMouseDown={e => { e.stopPropagation(); handleMission(preset.label, preset.color); }}
              >
                {isActive && <span className="usbm__check">✓</span>}
                {preset.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── 우측: 기능 ───────────────────────────────────── */}
      {hasFuncButtons && (
        <div className="usbm__group usbm__group--right" style={rightStyle} onMouseDown={e => e.stopPropagation()}>
          {/* 고가차/굴절차 전개 */}
          {isAerialVehicle && (
            <button
              className="usbm__badge"
              style={{ background: '#2a1e00', borderColor: '#aa7700', color: '#ffcc44' }}
              onMouseDown={e => { e.stopPropagation(); handleAerialDeploy(deployLabel); }}
            >
              {deployLabel}
            </button>
          )}

          {/* 방수개시 / 방수중단 (진압대·구조대) */}
          {isSprayCapable && !isSprayActive && (
            <button
              className="usbm__badge usbm__badge--spray-start"
              onMouseDown={e => { e.stopPropagation(); handleSprayStart(); }}
            >
              방수개시
            </button>
          )}
          {isSprayActive && (
            <button
              className="usbm__badge usbm__badge--spray-stop"
              onMouseDown={e => { e.stopPropagation(); handleSprayStop(); }}
            >
              방수중단
            </button>
          )}

          {/* 송수 연결 (펌프/물탱크) */}
          {canWaterConnect && (
            <button
              className="usbm__badge usbm__badge--water"
              onMouseDown={e => { e.stopPropagation(); handleWaterConnect(); }}
            >
              송수
            </button>
          )}

          {/* 방수포 (펌프/물탱크) */}
          {isMonitorUnit && (
            isMonitorActive ? (
              <button
                className="usbm__badge usbm__badge--spray-stop"
                onMouseDown={e => { e.stopPropagation(); handleMonitorStop(); }}
              >
                방수중단
              </button>
            ) : (
              <button
                className="usbm__badge usbm__badge--spray-start"
                onMouseDown={e => { e.stopPropagation(); handleMonitorStart(); }}
              >
                방수포
              </button>
            )
          )}

          {/* 인명검색 (진압대·구조대) */}
          {showSearchButton && (
            isSearchActive ? (
              <button
                className="usbm__badge usbm__badge--search-stop"
                onMouseDown={e => { e.stopPropagation(); handleSearchStop(); }}
              >
                인명검색 중단{searchScore !== null ? ` (${searchScore})` : ''}
              </button>
            ) : (
              <button
                className="usbm__badge usbm__badge--search-start"
                onMouseDown={e => { e.stopPropagation(); handleSearchStart(); }}
              >
                인명검색
              </button>
            )
          )}

        </div>
      )}

      {/* ── 하단: 상태 ───────────────────────────────────── */}
      {statusPresets.length > 0 && (
        <div className="usbm__group usbm__group--bottom" style={bottomStyle} onMouseDown={e => e.stopPropagation()}>
          <span className="usbm__dir-label">상태</span>
          <div className="usbm__badge-row">
            {statusPresets.map(preset => {
              const isActive = token.statusTag?.label === preset.label;
              const col = TAG_COLORS[preset.color] ?? TAG_COLORS.white;
              return (
                <button
                  key={preset.label}
                  className={['usbm__badge', isActive ? 'usbm__badge--active' : ''].filter(Boolean).join(' ')}
                  style={{
                    background:  col.bg,
                    borderColor: isActive ? col.text : col.border,
                    color:       col.text,
                    ...(isActive ? { boxShadow: `0 0 0 2px ${col.text}` } : {}),
                  }}
                  onMouseDown={e => { e.stopPropagation(); handleStatus(preset.label, preset.color); }}
                >
                  {isActive && <span className="usbm__check">✓</span>}
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
