import { LogPanel }      from '../right/LogPanel';
import { useUIOverlay } from '../../context/UIOverlayContext';
import './overlays.css';

export function LogDrawer() {
  const { overlay, closeOverlay } = useUIOverlay();
  const isOpen = overlay === 'log';

  return (
    <>
      {isOpen && <div className="overlay-backdrop" onClick={closeOverlay} />}
      <div className={`log-drawer${isOpen ? ' log-drawer--open' : ''}`}>
        <div className="log-drawer__header">
          <span>이벤트 로그</span>
          <button className="log-drawer__close" onClick={closeOverlay}>✕</button>
        </div>
        <div className="log-drawer__body">
          <LogPanel collapsed={false} onToggle={() => {}} />
        </div>
      </div>
    </>
  );
}
