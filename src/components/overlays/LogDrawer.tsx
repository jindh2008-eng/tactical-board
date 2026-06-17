import { LogPanel }      from '../right/LogPanel';
import { useUIOverlay } from '../../context/UIOverlayContext';
import { useTokens }    from '../../context/TokenContext';
import { useSettings }  from '../../store/settingsStore';
import { exportLogsAsCsv, exportLogsAsPdf } from '../../utils/exportLog';
import './overlays.css';

export function LogDrawer() {
  const { overlay, closeOverlay } = useUIOverlay();
  const { logs }    = useTokens();
  const { building } = useSettings();
  const isOpen = overlay === 'log';

  return (
    <>
      {isOpen && <div className="overlay-backdrop" onClick={closeOverlay} />}
      <div className={`log-drawer${isOpen ? ' log-drawer--open' : ''}`}>
        <div className="log-drawer__header">
          <span>이벤트 로그</span>
          <div className="log-drawer__header-actions">
            {logs.length > 0 && (
              <>
                <button
                  className="log-panel__export-btn"
                  onClick={() => exportLogsAsPdf(logs, building.targetName ?? '')}
                  title="이벤트 로그를 PDF로 저장"
                >
                  ↓ PDF
                </button>
                <button
                  className="log-panel__export-btn"
                  onClick={() => exportLogsAsCsv(logs, building.targetName ?? '')}
                  title="이벤트 로그를 CSV로 저장"
                >
                  ↓ CSV
                </button>
              </>
            )}
            <button className="log-drawer__close" onClick={closeOverlay}>✕</button>
          </div>
        </div>
        <div className="log-drawer__body">
          <LogPanel collapsed={false} onToggle={() => {}} />
        </div>
      </div>
    </>
  );
}
