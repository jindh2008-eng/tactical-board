import { useState }       from 'react';
import { useUIOverlay }   from '../../context/UIOverlayContext';
import { useSettings }    from '../../store/settingsStore';
import './ChecklistDrawer.css';

/**
 * ChecklistDrawer — 진행상황관리(체크리스트) 서랍 UI.
 *
 * ## ⚠ 지금 아무도 import 하지 않는다. **그래도 지우지 말 것.**
 *
 * 죽은 코드처럼 보이지만 **의도적으로 남겨 둔 것이다.** 향후 신설할
 * **훈련모드(지휘) — 지휘교수 화면**에서 쓸 예정이다
 * (MASTER_PLAN.md §7.1, D-4 의 네 모드 중 셋째).
 *
 * D-5 로 진행상황관리를 무플 화면에서 빼면서 호출부가 사라졌다. 같은 시기에
 * `LogDrawer` 는 삭제했지만 이쪽은 용도가 남아 있어 보존한다. `UIOverlayContext`
 * 의 `OverlayType` 에 `'checklist'` 가 아직 있는 것도 같은 이유다 —
 * `'log'` 와 달리 **빼면 안 된다.**
 *
 * ## 되살릴 때 고칠 것
 *
 * 체크 상태를 이 컴포넌트의 로컬 `useState` 로 들고 있다. 지금 코드베이스는
 * `ChecklistProgressContext` 를 쓰므로, 지휘 화면에 붙일 때 그쪽으로 옮겨야
 * 무플 화면과 상태가 공유된다. 또 표시 전용이어야 하므로 부수효과를 가진
 * `ChecklistPanel` 이 아니라 `ChecklistView` 계열을 참고할 것
 * (DEFERRED_PROPAGATION.md P-2 · P-7).
 */
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
