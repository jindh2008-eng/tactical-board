import { UnitStatus }    from '../left/UnitStatus';
import { VictimCreator } from '../left/VictimCreator';
import { useUIOverlay }  from '../../context/UIOverlayContext';
import './overlays.css';

export function UnitAddDrawer() {
  const { overlay, closeOverlay } = useUIOverlay();
  const isOpen = overlay === 'unit-add';

  return (
    <>
      {isOpen && <div className="overlay-backdrop" onClick={closeOverlay} />}
      <div className={`unit-add-drawer${isOpen ? ' unit-add-drawer--open' : ''}`}>
        <div className="unit-add-drawer__header">
          <span>출동대 추가</span>
          <button className="unit-add-drawer__close" onClick={closeOverlay}>✕</button>
        </div>
        <div className="unit-add-drawer__body">
          <UnitStatus />
          <VictimCreator />
        </div>
      </div>
    </>
  );
}
