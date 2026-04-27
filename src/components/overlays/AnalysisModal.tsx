import { CommandInfo }  from '../right/CommandInfo';
import { useUIOverlay } from '../../context/UIOverlayContext';
import './overlays.css';

export function AnalysisModal() {
  const { overlay, closeOverlay } = useUIOverlay();
  if (overlay !== 'analysis') return null;

  return (
    <div className="overlay-backdrop" onClick={closeOverlay}>
      <div className="overlay-modal analysis-modal" onClick={e => e.stopPropagation()}>
        <button className="overlay-modal-close" onClick={closeOverlay}>✕</button>
        <CommandInfo collapsed={false} onToggle={() => {}} />
      </div>
    </div>
  );
}
