import { useState }       from 'react';
import { useUIOverlay }   from '../../context/UIOverlayContext';
import { useSettings }    from '../../store/settingsStore';
import './ChecklistDrawer.css';

export function ChecklistDrawer() {
  const { overlay, closeOverlay }  = useUIOverlay();
  const { checklistConfig }        = useSettings();
  const [checked, setChecked]      = useState<Set<string>>(new Set());

  const isOpen = overlay === 'checklist';

  function toggleItem(itemId: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else                  next.add(itemId);
      return next;
    });
  }

  const totalItems   = checklistConfig.sections.reduce((n, s) => n + s.items.length, 0);
  const checkedCount = checklistConfig.sections.reduce(
    (n, s) => n + s.items.filter(it => checked.has(it.id)).length, 0
  );

  return (
    <>
      {isOpen && <div className="overlay-backdrop" onClick={closeOverlay} />}
      <div className={`checklist-drawer${isOpen ? ' checklist-drawer--open' : ''}`}>
        <div className="checklist-drawer__header">
          <span>진행상황 관리</span>
          {totalItems > 0 && (
            <span className="checklist-drawer__progress">
              {checkedCount} / {totalItems}
            </span>
          )}
          <button className="checklist-drawer__close" onClick={closeOverlay}>✕</button>
        </div>

        <div className="checklist-drawer__body">
          {checklistConfig.sections.length === 0 ? (
            <p className="checklist-drawer__empty">
              설정창의 "초급 체크리스트"에서 항목을 추가하세요.
            </p>
          ) : (
            checklistConfig.sections.map(section => (
              <div key={section.id} className="checklist-drawer__section">
                <div className="checklist-drawer__section-title">{section.title}</div>
                <div className="checklist-drawer__divider" />
                {section.items.map(item => {
                  const isChecked = checked.has(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`checklist-drawer__item${isChecked ? ' checklist-drawer__item--checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="checklist-drawer__checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(item.id)}
                      />
                      <span className="checklist-drawer__item-text">{item.text}</span>
                    </label>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
