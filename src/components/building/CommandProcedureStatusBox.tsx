import { useSettings } from '../../store/settingsStore';
import { useChecklistProgress } from '../../context/ChecklistProgressContext';
import './CommandProcedureStatusBox.css';

/**
 * D면 우측 상단 — 지휘절차에서 가져온 진행상황관리 항목의 수행 여부 표시.
 * 진행상황관리(ChecklistPanel)에서 항목을 체크하면 여기도 즉시 반영됨.
 */
export function CommandProcedureStatusBox() {
  const { checklistConfig } = useSettings();
  const { checked }         = useChecklistProgress();

  const sections = checklistConfig.sections
    .map(section => ({
      ...section,
      items: section.items.filter(it => it.sourceCommandProcedureItemId),
    }))
    .filter(section => section.items.length > 0);

  if (sections.length === 0) return null;

  return (
    <div className="cp-status-box" onClick={e => e.stopPropagation()}>
      {sections.map(section => (
        <div key={section.id} className="cp-status-box__section">
          <div className="cp-status-box__section-title">{section.title}</div>
          {section.items.map(item => {
            const done = checked.has(item.id);
            return (
              <div
                key={item.id}
                className={`cp-status-box__item${done ? ' cp-status-box__item--done' : ''}`}
              >
                <span className="cp-status-box__check">{done ? '✓' : ''}</span>
                <span className="cp-status-box__text">{item.text}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
