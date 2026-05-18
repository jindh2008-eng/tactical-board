import { useState } from 'react';
import { useSettings } from '../../store/settingsStore';
import type { TagPreset } from '../../types/settings';
import './TagPresetPanel.css';

// ─── 색상 팔레트 ──────────────────────────────────────────────────────

const TAG_COLORS: { value: string; label: string; swatch: string }[] = [
  { value: 'blue',   label: '파랑', swatch: '#88bbff' },
  { value: 'yellow', label: '노랑', swatch: '#ffcc44' },
  { value: 'red',    label: '빨강', swatch: '#ff7777' },
  { value: 'green',  label: '초록', swatch: '#55cc88' },
  { value: 'white',  label: '흰색', swatch: '#dddddd' },
];

// ─── 유닛타입 그룹 ────────────────────────────────────────────────────

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

// ─── 단일 유닛타입 블록 ───────────────────────────────────────────────

interface TypeBlockProps {
  unitKey:  string;
  label:    string;
  missions: TagPreset[];
  statuses: TagPreset[];
  onChange: (missions: TagPreset[], statuses: TagPreset[]) => void;
}

function TypeBlock({ unitKey, label, missions, statuses, onChange }: TypeBlockProps) {
  const [mDraft,      setMDraft]      = useState('');
  const [mColor,      setMColor]      = useState('blue');
  const [sDraft,      setSDraft]      = useState('');
  const [sColor,      setSColor]      = useState('red');

  function addMission() {
    const text = mDraft.trim();
    if (!text) return;
    onChange([...missions, { label: text, color: mColor }], statuses);
    setMDraft('');
  }

  function addStatus() {
    const text = sDraft.trim();
    if (!text) return;
    onChange(missions, [...statuses, { label: text, color: sColor }]);
    setSDraft('');
  }

  function removeMission(i: number) {
    onChange(missions.filter((_, idx) => idx !== i), statuses);
  }

  function removeStatus(i: number) {
    onChange(missions, statuses.filter((_, idx) => idx !== i));
  }

  return (
    <div className="tag-preset-panel__type-block">
      <div className="tag-preset-panel__type-header">{label}</div>

      {/* 임무 섹션 */}
      <div className="tag-preset-panel__sub-label">임무</div>
      <div className="tag-preset-panel__items">
        {missions.length === 0 ? (
          <span className="tag-preset-panel__empty">없음</span>
        ) : (
          missions.map((p, i) => {
            const sw = TAG_COLORS.find(c => c.value === p.color)?.swatch ?? '#dddddd';
            return (
              <div key={`${unitKey}-m-${i}`} className="tag-preset-panel__item-row">
                <span className="tag-preset-panel__color-dot" style={{ background: sw }} />
                <span className="tag-preset-panel__item-text">{p.label}</span>
                <button
                  className="tag-preset-panel__remove-btn"
                  onClick={() => removeMission(i)}
                  title="삭제"
                >✕</button>
              </div>
            );
          })
        )}
      </div>
      <div className="tag-preset-panel__add-row">
        <input
          className="tag-preset-panel__add-input"
          placeholder="임무 추가..."
          value={mDraft}
          onChange={e => setMDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addMission(); }}
        />
        <div className="tag-preset-panel__color-swatches">
          {TAG_COLORS.map(c => (
            <button
              key={c.value}
              className={`tag-preset-panel__swatch-btn${mColor === c.value ? ' tag-preset-panel__swatch-btn--active' : ''}`}
              style={{ background: c.swatch }}
              title={c.label}
              onClick={() => setMColor(c.value)}
            />
          ))}
        </div>
        <button
          className="tag-preset-panel__add-btn"
          onClick={addMission}
          disabled={!mDraft.trim()}
        >추가</button>
      </div>

      <div className="tag-preset-panel__section-sep" />

      {/* 상태 섹션 */}
      <div className="tag-preset-panel__sub-label">상태</div>
      <div className="tag-preset-panel__items">
        {statuses.length === 0 ? (
          <span className="tag-preset-panel__empty">없음</span>
        ) : (
          statuses.map((p, i) => {
            const sw = TAG_COLORS.find(c => c.value === p.color)?.swatch ?? '#dddddd';
            return (
              <div key={`${unitKey}-s-${i}`} className="tag-preset-panel__item-row">
                <span className="tag-preset-panel__color-dot" style={{ background: sw }} />
                <span className="tag-preset-panel__item-text">{p.label}</span>
                <button
                  className="tag-preset-panel__remove-btn"
                  onClick={() => removeStatus(i)}
                  title="삭제"
                >✕</button>
              </div>
            );
          })
        )}
      </div>
      <div className="tag-preset-panel__add-row">
        <input
          className="tag-preset-panel__add-input"
          placeholder="상태 추가..."
          value={sDraft}
          onChange={e => setSDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addStatus(); }}
        />
        <div className="tag-preset-panel__color-swatches">
          {TAG_COLORS.map(c => (
            <button
              key={c.value}
              className={`tag-preset-panel__swatch-btn${sColor === c.value ? ' tag-preset-panel__swatch-btn--active' : ''}`}
              style={{ background: c.swatch }}
              title={c.label}
              onClick={() => setSColor(c.value)}
            />
          ))}
        </div>
        <button
          className="tag-preset-panel__add-btn"
          onClick={addStatus}
          disabled={!sDraft.trim()}
        >추가</button>
      </div>
    </div>
  );
}

// ─── 메인 패널 ────────────────────────────────────────────────────────

export function TagPresetPanel() {
  const { unitTagPresetConfig, updateUnitTagPresets } = useSettings();

  function handleChange(unitType: string, missions: TagPreset[], statuses: TagPreset[]) {
    updateUnitTagPresets(unitType, { missions, statuses });
  }

  return (
    <div className="tag-preset-panel">
      {UNIT_TYPE_GROUPS.map(group => (
        <div key={group.groupLabel} className="tag-preset-panel__group">
          <div className="tag-preset-panel__group-label">{group.groupLabel}</div>
          <div className="tag-preset-panel__types">
            {group.types.map(({ key, label }) => {
              const presets = unitTagPresetConfig[key] ?? { missions: [], statuses: [] };
              return (
                <TypeBlock
                  key={key}
                  unitKey={key}
                  label={label}
                  missions={presets.missions}
                  statuses={presets.statuses}
                  onChange={(m, s) => handleChange(key, m, s)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
