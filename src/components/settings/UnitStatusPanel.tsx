import { useState } from 'react';
import { useSettings } from '../../store/settingsStore';
import './UnitStatusPanel.css';

const UNIT_TYPE_GROUPS: { groupLabel: string; types: { key: string; label: string }[] }[] = [
  {
    groupLabel: '활동대',
    types: [
      { key: 'suppression',    label: '진압대' },
      { key: 'rescue',         label: '구조대' },
      { key: 'ems',            label: '구급대' },
    ],
  },
  {
    groupLabel: '차량',
    types: [
      { key: 'pump',           label: '펌프'   },
      { key: 'rescue_vehicle', label: '구조차' },
      { key: 'aerial',         label: '고가차' },
      { key: 'ladder',         label: '굴절차' },
      { key: 'smokeExhaust',   label: '배연차' },
      { key: 'command',        label: '지휘차' },
      { key: 'waterTank',      label: '물탱크' },
    ],
  },
];

export function UnitStatusPanel() {
  const { unitStatusConfig, updateUnitStatusMessages } = useSettings();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function getDraft(key: string): string {
    return drafts[key] ?? '';
  }

  function setDraft(key: string, val: string) {
    setDrafts(prev => ({ ...prev, [key]: val }));
  }

  function handleAdd(unitType: string) {
    const text = getDraft(unitType).trim();
    if (!text) return;
    const current = unitStatusConfig[unitType] ?? [];
    if (current.includes(text)) return;
    updateUnitStatusMessages(unitType, [...current, text]);
    setDraft(unitType, '');
  }

  function handleRemove(unitType: string, index: number) {
    const current = unitStatusConfig[unitType] ?? [];
    updateUnitStatusMessages(unitType, current.filter((_, i) => i !== index));
  }

  return (
    <div className="unit-status-panel">
      {UNIT_TYPE_GROUPS.map(group => (
        <div key={group.groupLabel} className="unit-status-panel__group">
          <div className="unit-status-panel__group-label">{group.groupLabel}</div>
          <div className="unit-status-panel__types">
            {group.types.map(({ key, label }) => {
              const messages = unitStatusConfig[key] ?? [];
              return (
                <div key={key} className="unit-status-panel__type-block">
                  <div className="unit-status-panel__type-header">{label}</div>
                  <div className="unit-status-panel__messages">
                    {messages.length === 0 ? (
                      <span className="unit-status-panel__empty">등록된 상태메세지 없음</span>
                    ) : (
                      messages.map((msg, i) => (
                        <div key={i} className="unit-status-panel__message-row">
                          <span className="unit-status-panel__message-text">{msg}</span>
                          <button
                            className="unit-status-panel__remove-btn"
                            onClick={() => handleRemove(key, i)}
                            title="삭제"
                          >✕</button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="unit-status-panel__add-row">
                    <input
                      className="unit-status-panel__add-input"
                      placeholder="상태메세지 추가..."
                      value={getDraft(key)}
                      onChange={e => setDraft(key, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAdd(key); }}
                    />
                    <button
                      className="unit-status-panel__add-btn"
                      onClick={() => handleAdd(key)}
                      disabled={!getDraft(key).trim()}
                    >추가</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
