import { useState, useRef, useEffect } from 'react';
import { useSettings }        from '../store/settingsStore';
import { useTraining }        from '../context/TrainingContext';
import { useUIOverlay }       from '../context/UIOverlayContext';
import { useNavSlot }         from '../context/NavSlotContext';
import { DisplayOptionsContext } from '../context/DisplayOptionsContext';
import { useTokens, TokenProvider } from '../context/TokenContext';
import { VictimProvider }     from '../context/VictimContext';
import { EventProvider }      from '../context/EventContext';
import { ActionModeProvider, useActionMode } from '../context/ActionModeContext';
import { WaterConnectionProvider } from '../context/WaterConnectionContext';
import { WaterLevelProvider }      from '../context/WaterLevelContext';
import { HydrantStateProvider }    from '../context/HydrantStateContext';
import { FireCommandProvider }     from '../context/FireCommandContext';
import { SprayOverlay }            from '../components/overlay/SprayOverlay';
import { AerialOverlay }          from '../components/overlay/AerialOverlay';
import { UnitStatusPanel as UnitInfoPanel } from '../components/left/UnitStatusPanel';
import { TokenCard }          from '../components/shared/TokenCard';
import { TacticalArea }       from '../components/building/TacticalArea';
import { WaterConnectionOverlay } from '../components/overlay/WaterConnectionOverlay';
import { UnitAddDrawer }      from '../components/overlays/UnitAddDrawer';
import { AnalysisModal }      from '../components/overlays/AnalysisModal';
import { LogDrawer }          from '../components/overlays/LogDrawer';
import { ChecklistPanel }     from '../components/panels/ChecklistPanel';
import './PlayPage.css';

type LeftPanel  = 'resource' | 'unit' | null;
type RightPanel = 'checklist' | null;

// ─────────────────────────────────────────────
// ActionMode 오버레이 배너
// (ActionModeProvider 내부에서만 동작)
// ─────────────────────────────────────────────

function ActionModeBanner() {
  const { mode, clearMode } = useActionMode();
  if (mode.type === null) return null;

  let message = '';
  if (mode.type === 'rescue') {
    message = '구조대상자를 클릭하세요  (같은 구역의 피해자만 선택 가능)';
  } else if (mode.type === 'select-floor') {
    message = '층·구역을 클릭하세요';
  } else if (mode.type === 'select-pump') {
    message = '부서 위치를 클릭하세요';
  } else if (mode.type === 'water-connect') {
    message = '송수 대상 토큰을 클릭하세요  (ESC 취소)';
  } else if (mode.type === 'spray-target') {
    message = '방수 지점을 클릭하세요  (ESC 취소)';
  } else if (mode.type === 'aerial-floor-select') {
    message = `전개 지점을 클릭하세요  (ESC 취소)`;
  } else if (mode.type === 'aerial-spray-target') {
    message = '방수 지점을 클릭하세요  (ESC 취소)';
  }

  return (
    <div className="action-mode-banner">
      <span className="action-mode-banner__icon">⬤</span>
      <span className="action-mode-banner__msg">{message}</span>
      <button className="action-mode-banner__cancel" onClick={clearMode}>
        ESC 취소
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// 방수 지점 선택 오버레이
// spray-target 모드 중 전체 화면에 클릭 영역을 제공
// ─────────────────────────────────────────────

// 클릭 좌표에서 data-floor-id, data-zone-key 탐색
function getPointInfo(cx: number, cy: number): { floorId?: string; zoneKey?: string } {
  const elements = document.elementsFromPoint(cx, cy);
  let floorId: string | undefined;
  let zoneKey: string | undefined;
  for (const el of elements) {
    let cur: Element | null = el;
    while (cur) {
      if (!floorId) { const v = cur.getAttribute('data-floor-id'); if (v) floorId = v; }
      if (!zoneKey) { const v = cur.getAttribute('data-zone-key');  if (v) zoneKey  = v; }
      if (floorId && zoneKey) break;
      cur = cur.parentElement;
    }
    if (floorId && zoneKey) break;
  }
  return { floorId, zoneKey };
}

// 층 zone key (e.g. "3F-center") 에서 floor ID (e.g. "3F") 추출
function floorIdFromZoneKey(zoneKey: string): string | null {
  const m = zoneKey.match(/^(.+)-(center|right|stair)$/);
  return m ? m[1] : null;
}

// 클릭 위치가 토큰의 구역(층 또는 방면)과 일치하는지 검증
function isValidSprayZone(cx: number, cy: number, sourceZoneKey: string | null): boolean {
  if (!sourceZoneKey) return false;
  const { floorId, zoneKey } = getPointInfo(cx, cy);

  if (sourceZoneKey.startsWith('face-')) {
    // 방면 구역: data-zone-key 직접 일치
    return zoneKey === sourceZoneKey;
  }
  // 층 구역: floor ID 비교
  const srcFloorId = floorIdFromZoneKey(sourceZoneKey);
  return srcFloorId !== null && floorId === srcFloorId;
}

function SprayTargetOverlay() {
  const { mode, clearMode } = useActionMode();
  const { setSprayState }   = useTokens();

  if (mode.type !== 'spray-target') return null;
  const sprayMode = mode;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const { floorId, zoneKey } = getPointInfo(e.clientX, e.clientY);

    // 토큰이 있는 구역 외 클릭은 무시
    if (!isValidSprayZone(e.clientX, e.clientY, sprayMode.sourceZoneKey)) return;

    const board = document.getElementById('tactical-area');
    const rect  = board?.getBoundingClientRect();
    if (!rect) return;

    // 방면 구역은 zoneKey, 층 구역은 floorId를 방수 지점에 저장
    const resolvedFloorId = sprayMode.sourceZoneKey?.startsWith('face-')
      ? (zoneKey ?? floorId)
      : floorId;

    setSprayState(sprayMode.sourceId, '100%', {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
      floorId: resolvedFloorId,
    });
    clearMode();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9800, cursor: 'crosshair' }}
      onClick={handleClick}
    />
  );
}

// ─────────────────────────────────────────────
// 고가차/굴절차 전개·방수 지점 선택 오버레이
// aerial-floor-select 모드 중 임의 지점 클릭 → 층 정보 자동 감지
// ─────────────────────────────────────────────

const AERIAL_MAX_HEIGHT  = 15;
const LADDER_MAX_HEIGHT  = 7;

function AerialTargetOverlay() {
  const { mode, clearMode }               = useActionMode();
  const { setStatusTag, setAerialTarget } = useTokens();

  if (mode.type !== 'aerial-floor-select') return null;
  const aerialMode = mode;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    // 클릭 지점에서 floor-row 탐색
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    let floorEl: Element | null = null;
    for (const el of elements) {
      let cur: Element | null = el;
      while (cur) {
        if (cur.getAttribute('data-floor-id')) { floorEl = cur; break; }
        cur = cur.parentElement;
      }
      if (floorEl) break;
    }
    if (!floorEl) return;

    // 지하층 제외
    if (floorEl.classList.contains('floor-row--basement')) return;

    const floorId      = floorEl.getAttribute('data-floor-id')!;
    const floorHeight  = Number(floorEl.getAttribute('data-floor-height') ?? 0);
    const displayLabel = floorEl.getAttribute('data-floor-label') ?? floorId;

    // 높이 제한 검증
    const maxHeight   = aerialMode.unitType === 'ladder' ? LADDER_MAX_HEIGHT : AERIAL_MAX_HEIGHT;
    const vehicleName = aerialMode.unitType === 'ladder' ? '굴절차' : '고가차';
    if (floorHeight > maxHeight) {
      alert(`${vehicleName}는 ${maxHeight}층 높이까지만 전개 가능합니다.`);
      return;
    }

    const board = document.getElementById('tactical-area');
    const rect  = board?.getBoundingClientRect();
    if (!rect) return;

    setStatusTag(aerialMode.sourceId, { label: `${displayLabel} ${aerialMode.actionLabel}`, color: 'yellow' });
    setAerialTarget(aerialMode.sourceId, {
      floorId,
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
      deployLabel: aerialMode.actionLabel,
    });
    clearMode();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9800, cursor: 'crosshair' }}
      onClick={handleClick}
    />
  );
}

// ─────────────────────────────────────────────
// 고가차/굴절차 방수 지점 선택 오버레이
// aerial-spray-target 모드 중 임의 지점 클릭 → aerialSprayTarget 저장
// ─────────────────────────────────────────────

function AerialSprayTargetOverlay() {
  const { mode, clearMode }                           = useActionMode();
  const { setAerialSprayTarget, setStatusTag, tokens } = useTokens();

  if (mode.type !== 'aerial-spray-target') return null;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    let floorEl: Element | null = null;
    let faceKey: string | null  = null;
    for (const el of elements) {
      let cur: Element | null = el;
      while (cur) {
        if (!floorEl && cur.getAttribute('data-floor-id')) { floorEl = cur; }
        if (!faceKey) {
          const zk = cur.getAttribute('data-zone-key');
          if (zk?.startsWith('face-')) faceKey = zk;
        }
        if (floorEl && faceKey) break;
        cur = cur.parentElement;
      }
      if (floorEl && faceKey) break;
    }

    const board = document.getElementById('tactical-area');
    const rect  = board?.getBoundingClientRect();
    if (!rect) return;

    const floorId = floorEl?.getAttribute('data-floor-id') ?? faceKey ?? null;

    if (mode.type !== 'aerial-spray-target') return;
    const token = tokens.find(t => t.id === mode.sourceId);
    if (!token) return;

    const floorLabel  = floorEl?.getAttribute('data-floor-label') ?? '';
    setStatusTag(mode.sourceId, { label: `${floorLabel} 방수`, color: 'blue' });
    setAerialSprayTarget(mode.sourceId, {
      floorId: floorId ?? (token.aerialTarget?.floorId ?? ''),
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
    });
    clearMode();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9800, cursor: 'crosshair' }}
      onClick={handleClick}
    />
  );
}

// ─────────────────────────────────────────────
// 자원대기소 패널
// ─────────────────────────────────────────────

function ResourcePanel() {
  const { tokens, moveToken }                        = useTokens();
  const { stagingAreaChief, updateStagingAreaChief } = useSettings();
  const [isDragOver, setIsDragOver]                  = useState(false);

  const zoneKey    = 'standby-resource';
  const zoneTokens = tokens.filter(t => t.zoneKey === zoneKey);

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, zoneKey);
  }

  return (
    <div className="resource-panel">
      <div className="resource-panel__header">
        <span className="resource-panel__title">자원대기소</span>
        <select
          className="resource-panel__chief-select"
          value={stagingAreaChief}
          onChange={e => updateStagingAreaChief(e.target.value)}
        >
          <option value="">소장 미지정</option>
          {zoneTokens.map(t => (
            <option key={t.id} value={t.label}>{t.label}</option>
          ))}
        </select>
      </div>
      <div
        className={`resource-panel__body${isDragOver ? ' drop-target--active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {zoneTokens.length === 0 ? (
          <span className="resource-panel__placeholder">―</span>
        ) : (
          zoneTokens.map(t => <TokenCard key={t.id} token={t} />)
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// nav 옵션 드롭다운
// ─────────────────────────────────────────────

type OptionKey = 'waterConn' | 'spray' | 'waterLevel';

interface NavOptionsMenuProps {
  showWaterConn:  boolean;
  showSpray:      boolean;
  showWaterLevel: boolean;
  onToggle:       (key: OptionKey) => void;
}

function NavOptionsMenu({ showWaterConn, showSpray, showWaterLevel, onToggle }: NavOptionsMenuProps) {
  return (
    <div className="nav-options">
      <span className="nav-options__label">표시옵션</span>
      <label className="nav-options__item">
        <input type="checkbox" checked={showWaterConn} onChange={() => onToggle('waterConn')} />
        송수 연결선
      </label>
      <label className="nav-options__item">
        <input type="checkbox" checked={showSpray} onChange={() => onToggle('spray')} />
        방수 표시
      </label>
      <label className="nav-options__item">
        <input type="checkbox" checked={showWaterLevel} onChange={() => onToggle('waterLevel')} />
        수량표시
      </label>
    </div>
  );
}

// ─────────────────────────────────────────────
// PlayPage
// ─────────────────────────────────────────────

export function PlayPage() {
  const { building, timing, dispatchRoster, victimSetup, arrivalMode } = useSettings();
  const { runKey, status, elapsed, loadSettings, start, stop }         = useTraining();
  const { openOverlay }                                                 = useUIOverlay();

  const [showWaterConn,  setShowWaterConn]  = useState(true);
  const [showSpray,      setShowSpray]      = useState(true);
  const [showWaterLevel, setShowWaterLevel] = useState(true);

  function handleOptionToggle(key: OptionKey) {
    if (key === 'waterConn')  setShowWaterConn(v => !v);
    else if (key === 'spray') setShowSpray(v => !v);
    else                      setShowWaterLevel(v => !v);
  }

  const elapsedRef = useRef(elapsed);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // ── nav 슬롯: 훈련 컨트롤을 상단 공유 nav 바에 주입 ──
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const timerLabel =
    status === 'running' ? `진행중 ${mm}:${ss}` :
    status === 'ended'   ? `종료   ${mm}:${ss}` :
                           '대기중 00:00';

  useNavSlot(
    <div className="play-nav-slot">
      {/* 좌 */}
      <div className="play-nav__left">
        <button className="nav-btn nav-btn--overlay" onClick={() => openOverlay('unit-add')}>
          출동대 추가
        </button>
        <button className="nav-btn nav-btn--overlay" onClick={() => openOverlay('log')}>
          이벤트 로그
        </button>
        <NavOptionsMenu
          showWaterConn={showWaterConn}
          showSpray={showSpray}
          showWaterLevel={showWaterLevel}
          onToggle={handleOptionToggle}
        />
        <div className="play-nav__divider" />
      </div>

      {/* 중앙 — 대상명 + 타이머 */}
      <div className="play-nav__center">
        <span className="play-nav__target">{building.targetName || '대상 미설정'}</span>
        <span className={`play-nav__timer${status === 'running' ? ' play-nav__timer--running' : ''}`}>
          {timerLabel}
        </span>
      </div>

      {/* 우 */}
      <div className="play-nav__btns">
        <button
          className="nav-btn nav-btn--setting"
          onClick={loadSettings}
          title="설정 데이터를 실행 상태로 불러오고 초기화"
        >
          훈련 세팅
        </button>
        <button className="nav-btn nav-btn--start" onClick={start} disabled={status !== 'idle'}>
          시작
        </button>
        <button className="nav-btn nav-btn--stop" onClick={stop} disabled={status !== 'running'}>
          종료
        </button>
      </div>
    </div>
  );

  const started = status === 'running';
  const [leftPanel,  setLeftPanel]  = useState<LeftPanel>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);

  function togglePanel(panel: LeftPanel) {
    setLeftPanel(v => v === panel ? null : panel);
  }

  function toggleRightPanel(panel: RightPanel) {
    setRightPanel(v => v === panel ? null : panel);
  }

  return (
    <div className="play-page" onContextMenu={e => e.preventDefault()}>
      <DisplayOptionsContext.Provider value={{ showWaterConn, showSpray, showWaterLevel }}>
      <EventProvider key={runKey}>
      <TokenProvider
        key={runKey}
        timingConfig={{ rescueTimeSec: timing.rescueTimeSec, moveTimeSec: timing.moveTimeSec }}
        initialRoster={dispatchRoster}
        started={started}
        arrivalMode={arrivalMode}
        getElapsed={() => elapsedRef.current}
      >
        <VictimProvider
          key={runKey}
          initialVictimSetup={victimSetup}
          buildingConfig={building.config}
          fireFloor={building.fireFloor}
        >
          {/* ActionModeProvider: TokenContext + VictimContext 내부에 배치 */}
          <ActionModeProvider>
          <WaterConnectionProvider>
          <FireCommandProvider>
          <WaterLevelProvider>
          <HydrantStateProvider>
            <div className="play-layout">
              {/* ── 자원대기소 Drawer (상단 절반) ── */}
              <div className={`left-drawer left-drawer--resource${leftPanel === 'resource' ? ' left-drawer--open' : ''}`}>
                <div className="left-drawer__panel">
                  <ResourcePanel />
                </div>
                <button
                  className="left-drawer__tab"
                  onClick={() => togglePanel('resource')}
                  title="자원대기소"
                >
                  자원대기소
                </button>
              </div>

              {/* ── 출동대현황 Drawer (하단) ── */}
              <div className={`left-drawer left-drawer--unit${leftPanel === 'unit' ? ' left-drawer--open' : ''}`}>
                <div className="left-drawer__panel">
                  <UnitInfoPanel />
                </div>
                <button
                  className="left-drawer__tab"
                  onClick={() => togglePanel('unit')}
                  title="출동대현황"
                >
                  출동대현황
                </button>
              </div>

              {/* ── 진행상황 관리 탭 (항상 좌측 가장자리에 표시) ── */}
              <button
                className={`right-panel__tab${rightPanel === 'checklist' ? ' right-panel__tab--active' : ''}`}
                onClick={() => toggleRightPanel('checklist')}
                title="진행상황 관리"
              >
                진행상황 관리
              </button>

              {/* ── 진행상황 관리 패널 (탭 오른쪽에서 슬라이드) ── */}
              <div className={`right-panel${rightPanel === 'checklist' ? ' right-panel--open' : ''}`}>
                <div className="right-panel__panel">
                  <ChecklistPanel />
                </div>
              </div>

              {/* ── 전술상황판 — 항상 전체 크기 유지 ── */}
              <div className="tactical-board-wrap">
                <div className="tactical-board-inner">
                  <TacticalArea
                    config={building.config}
                    fireFloor={building.fireFloor}
                    initialFireStatus={building.fireStatus}
                    extraFireFloors={building.extraFireFloors ?? []}
                  />
                </div>
              </div>

              {/* ── 오버레이 (Drawer / Modal) ── */}
              <UnitAddDrawer />
              <LogDrawer />
              <AnalysisModal />

              {/* ── ActionMode 배너 (모드 활성 시만 표시) ── */}
              <ActionModeBanner />

              {/* ── 송수 연결선 오버레이 ── */}
              <WaterConnectionOverlay />

              {/* ── 방수 SVG 오버레이 ── */}
              <SprayOverlay />

              {/* ── 고가차/굴절차 전개 SVG 오버레이 ── */}
              <AerialOverlay />

              {/* ── 방수 지점 선택 오버레이 ── */}
              <SprayTargetOverlay />

              {/* ── 고가차/굴절차 전개·방수 지점 선택 오버레이 ── */}
              <AerialTargetOverlay />
              <AerialSprayTargetOverlay />
            </div>
          </HydrantStateProvider>
          </WaterLevelProvider>
          </FireCommandProvider>
          </WaterConnectionProvider>
          </ActionModeProvider>
        </VictimProvider>
      </TokenProvider>
      </EventProvider>
      </DisplayOptionsContext.Provider>
    </div>
  );
}
