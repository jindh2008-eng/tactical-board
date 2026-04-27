import { useState }           from 'react';
import { useSettings }        from '../store/settingsStore';
import { useTraining }        from '../context/TrainingContext';
import { useTokens, TokenProvider } from '../context/TokenContext';
import { VictimProvider }     from '../context/VictimContext';
import { EventProvider }      from '../context/EventContext';
import { UnitStatusPanel as UnitInfoPanel } from '../components/left/UnitStatusPanel';
import { TokenCard }          from '../components/shared/TokenCard';
import { TacticalArea }       from '../components/building/TacticalArea';
import { UnitAddDrawer }      from '../components/overlays/UnitAddDrawer';
import { LogModal }           from '../components/overlays/LogModal';
import { AnalysisModal }      from '../components/overlays/AnalysisModal';
import './PlayPage.css';

type LeftPanel = 'resource' | 'unit' | null;

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

export function PlayPage() {
  const { building, timing, dispatchRoster, victimSetup, arrivalMode } = useSettings();
  const { runKey, status } = useTraining();

  const started = status === 'running';
  const [leftPanel, setLeftPanel] = useState<LeftPanel>(null);

  function togglePanel(panel: LeftPanel) {
    setLeftPanel(v => v === panel ? null : panel);
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
      >
        <VictimProvider
          key={runKey}
          initialVictimSetup={victimSetup}
          buildingConfig={building.config}
          fireFloor={building.fireFloor}
        >
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
                  stairSmokeStartFloor={building.stairSmokeStartFloor}
                />
              </div>
            </div>

            {/* ── 오버레이 (Drawer / Modal) ── */}
            <UnitAddDrawer />
            <LogModal />
            <AnalysisModal />
          </div>
        </VictimProvider>
      </TokenProvider>
      </EventProvider>
    </div>
  );
}
