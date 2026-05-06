import { useState, useRef, useEffect } from 'react';
import { useSettings }        from '../store/settingsStore';
import { useTraining }        from '../context/TrainingContext';
import { useTokens, TokenProvider } from '../context/TokenContext';
import { VictimProvider }     from '../context/VictimContext';
import { EventProvider }      from '../context/EventContext';
import { ActionModeProvider, useActionMode } from '../context/ActionModeContext';
import { WaterConnectionProvider } from '../context/WaterConnectionContext';
import { HydrantStateProvider }    from '../context/HydrantStateContext';
import { UnitStatusPanel as UnitInfoPanel } from '../components/left/UnitStatusPanel';
import { TokenCard }          from '../components/shared/TokenCard';
import { TacticalArea }       from '../components/building/TacticalArea';
import { WaterConnectionOverlay } from '../components/overlay/WaterConnectionOverlay';
import { UnitAddDrawer }      from '../components/overlays/UnitAddDrawer';
import { AnalysisModal }      from '../components/overlays/AnalysisModal';
import { LogPanel }           from '../components/right/LogPanel';
import './PlayPage.css';

type LeftPanel  = 'resource' | 'unit' | null;
type RightPanel = 'log' | null;

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
// PlayPage
// ─────────────────────────────────────────────

export function PlayPage() {
  const { building, timing, dispatchRoster, victimSetup, arrivalMode } = useSettings();
  const { runKey, status, elapsed } = useTraining();

  const elapsedRef = useRef(elapsed);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

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
    <div className="play-page">
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

              {/* ── 출동대현황 Drawer (하단 절반) ── */}
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

              {/* ── 전술상황판 — 항상 전체 크기 유지 ── */}
              <div className="tactical-board-wrap">
                <div className="tactical-board-inner">
                  <TacticalArea
                    config={building.config}
                    fireFloor={building.fireFloor}
                    initialFireStatus={building.fireStatus}
                  />
                </div>
              </div>

              {/* ── 우측 로그 패널 (탭 토글) ── */}
              <div className={`right-drawer${rightPanel === 'log' ? ' right-drawer--open' : ''}`}>
                <div className="right-drawer__panel">
                  <LogPanel collapsed={false} onToggle={() => {}} />
                </div>
                <button
                  className="right-drawer__tab"
                  onClick={() => toggleRightPanel('log')}
                  title="이벤트 로그"
                >
                  이벤트 로그
                </button>
              </div>

              {/* ── 오버레이 (Drawer / Modal) ── */}
              <UnitAddDrawer />
              <AnalysisModal />

              {/* ── ActionMode 배너 (모드 활성 시만 표시) ── */}
              <ActionModeBanner />

              {/* ── 송수 연결선 오버레이 ── */}
              <WaterConnectionOverlay />
            </div>
          </HydrantStateProvider>
          </WaterConnectionProvider>
          </ActionModeProvider>
        </VictimProvider>
      </TokenProvider>
      </EventProvider>
    </div>
  );
}
