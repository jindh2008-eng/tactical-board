import { LogPanel }      from '../right/LogPanel';
import { useUIOverlay }  from '../../context/UIOverlayContext';
import './overlays.css';

export function LogModal() {
  const { overlay, closeOverlay } = useUIOverlay();
  if (overlay !== 'log') return null;

  return (
    <div className="overlay-backdrop" onClick={closeOverlay}>
      <div className="overlay-modal log-modal" onClick={e => e.stopPropagation()}>
        <button className="overlay-modal-close" onClick={closeOverlay}>✕</button>
        <LogPanel collapsed={false} onToggle={() => {}} />
      </div>
    </div>
  );
}
