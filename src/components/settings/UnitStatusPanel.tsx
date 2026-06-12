import { useState } from 'react';
import { useSettings } from '../../store/settingsStore';
import './UnitStatusPanel.css';

// ── 출동대 상태메시지 그룹 ────────────────────────
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
      { key: 'water_tank',     label: '물탱크' },
    ],
  },
];

// ── 기타 장비 상태메시지 항목 ─────────────────────
const EQUIPMENT_TYPES: { key: string; label: string }[] = [
  { key: 'hydrant',        label: '소화전'     },
  { key: 'indoor_hydrant', label: '옥내소화전' },
  { key: 'siamese_pipe',   label: '연결송수구' },
];

// ── 재사용 가능한 타입 블록 컴포넌트 ──────────────

interface TypeBlockProps {
  typeKey:   string;
  label:     string;
  messages:  string[];
  draft:     string;
  onDraftChange: (val: string) => void;
  onAdd:     () => void;
  onRemove:  (i: number) => void;
}

function TypeBlock({ typeKey, label, messages, draft, onDraftChange, onAdd, onRemove }: TypeBlockProps) {
  return (
    <div key={typeKey} className="unit-status-panel__type-block">
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
                onClick={() => onRemove(i)}
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
          value={draft}
          onChange={e => onDraftChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onAdd(); }}
        />
        <button
          className="unit-status-panel__add-btn"
          onClick={onAdd}
          disabled={!draft.trim()}
        >추가</button>
      </div>
    </div>
  );
}

// ── 메인 패널 ─────────────────────────────────────

export function UnitStatusPanel() {
  const { unitStatusConfig, updateUnitStatusMessages } = useSettings();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function getDraft(key: string) { return drafts[key] ?? ''; }
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

      {/* ── 출동대 상태메시지 ── */}
      <div className="unit-status-panel__section-title">출동대 상태메시지</div>
      {UNIT_TYPE_GROUPS.map(group => (
        <div key={group.groupLabel} className="unit-status-panel__group">
          <div className="unit-status-panel__group-label">{group.groupLabel}</div>
          <div className="unit-status-panel__types">
            {group.types.map(({ key, label }) => (
              <TypeBlock
                key={key}
                typeKey={key}
                label={label}
                messages={unitStatusConfig[key] ?? []}
                draft={getDraft(key)}
                onDraftChange={val => setDraft(key, val)}
                onAdd={() => handleAdd(key)}
                onRemove={i => handleRemove(key, i)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* ── 기타 상태메시지 ── */}
      <div className="unit-status-panel__section-divider" />
      <div className="unit-status-panel__section-title">기타 상태메시지</div>
      <div className="unit-status-panel__types">
        {EQUIPMENT_TYPES.map(({ key, label }) => (
          <TypeBlock
            key={key}
            typeKey={key}
            label={label}
            messages={unitStatusConfig[key] ?? []}
            draft={getDraft(key)}
            onDraftChange={val => setDraft(key, val)}
            onAdd={() => handleAdd(key)}
            onRemove={i => handleRemove(key, i)}
          />
        ))}
      </div>

    </div>
  );
}
