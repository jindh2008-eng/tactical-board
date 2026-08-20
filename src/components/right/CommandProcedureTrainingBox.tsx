import { useSettings } from '../../store/settingsStore';
import { useChecklistProgress } from '../../context/ChecklistProgressContext';
import { useTokens } from '../../context/TokenContext';
import type { CommandProcedureItem, CommandProcedureItemType, CommandProcedureLevel } from '../../types/settings';
import '../panels/ChecklistPanel.css';
import './CommandProcedureTrainingBox.css';

/**
 * CommandProcedureTrainingBox — 무플 화면 우측 고정 패널
 *
 * 진행상황관리(ChecklistPanel/checklistConfig)를 거치지 않고
 * commandProcedureConfigs[activeCommandProcedureLevel] 을 직접 읽어 표시·체크한다.
 * 레벨은 설정관리(CommandProcedurePanel)에서 선택한다.
 *
 * 체크 상태는 ChecklistProgressContext(checked: Set<string>)를 그대로 재사용한다 —
 * CommandProcedureItem.id 는 설정관리에서 고정 발급되는 안정적인 ID라
 * 진행상황관리를 거치지 않고 바로 키로 써도 된다.
 */

const LEVEL_LABELS: Record<CommandProcedureLevel, string> = {
  beginner:     '초급',
  intermediate: '중급',
  advanced:     '고급',
};

const TYPE_LABELS: Record<CommandProcedureItemType, string> = {
  procedure: '절차',
  dispatch:  '출동',
  event:     '이벤트',
  message:   '메세지',
  fire:      '화재',
};

export function CommandProcedureTrainingBox() {
  const { commandProcedureConfigs, activeCommandProcedureLevel } = useSettings();
  const { checked, setChecked } = useChecklistProgress();
  const { addLog } = useTokens();

  const categories   = commandProcedureConfigs[activeCommandProcedureLevel] ?? [];
  const totalItems   = categories.reduce((n, c) => n + c.items.length, 0);
  const checkedCount = categories.reduce((n, c) => n + c.items.filter(it => checked.has(it.id)).length, 0);

  function toggle(item: CommandProcedureItem) {
    const wasChecked = checked.has(item.id);
    setChecked(prev => {
      const next = new Set(prev);
      if (wasChecked) next.delete(item.id);
      else            next.add(item.id);
      return next;
    });
    // setChecked 업데이터는 StrictMode 에서 두 번 호출될 수 있어 부수효과(addLog)는 밖에서 한 번만 실행한다
    if (!wasChecked) {
      addLog({ logType: 'checklist', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '', note: item.text });
    }
  }

  return (
    <div className="checklist-panel command-procedure-box">
      <div className="checklist-panel__header">
        <span className="checklist-panel__title">지휘절차</span>
        <span className="command-procedure-box__level-badge">{LEVEL_LABELS[activeCommandProcedureLevel]}</span>
        {totalItems > 0 && (
          <span className="checklist-panel__progress">{checkedCount}/{totalItems}</span>
        )}
      </div>
      <div className="checklist-panel__body">
        {categories.length === 0 ? (
          <span className="checklist-panel__empty">
            설정관리 → 지휘절차 관리에서<br />{LEVEL_LABELS[activeCommandProcedureLevel]} 항목을 추가하세요.
          </span>
        ) : (
          categories.map(cat => (
            <div key={cat.id} className="checklist-panel__section">
              <div className="checklist-panel__section-title command-procedure-box__section-title">
                {cat.categoryTitle}
              </div>
              <div className="checklist-panel__divider" />
              {cat.items.map(item => {
                const isChecked = checked.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`checklist-panel__item${isChecked ? ' checklist-panel__item--checked' : ''}`}
                    onClick={() => toggle(item)}
                  >
                    {/* 완료하면 앞쪽 종류 배지 자리가 체크표시가 된다 —
                        뒤에 표식을 덧붙이면 본문이 밀려 줄바꿈이 생긴다 */}
                    <span
                      className={`checklist-panel__item-badge ${
                        isChecked ? 'checklist-panel__item-badge--check' : `checklist-panel__item-badge--${item.type}`
                      }`}
                    >
                      {isChecked ? '✓' : (TYPE_LABELS[item.type] ?? item.type)}
                    </span>
                    <span className="checklist-panel__item-text">{item.text}</span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
