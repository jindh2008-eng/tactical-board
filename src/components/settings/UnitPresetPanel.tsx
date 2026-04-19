import { useState, useEffect } from 'react';
import { useSettings } from '../../store/settingsStore';
import type { UnitSpecificBadgePreset } from '../../types/presets';
import { UNIT_TYPES } from '../../types/presets';
import './UnitPresetPanel.css';

/**
 * 출동대별 고유 프리셋 관리 패널 (2-column)
 * - 좌측: 출동대 종류 목록
 * - 우측: 선택된 종류의 프리셋 + 추가/수정/삭제
 */
export function UnitPresetPanel() {
  const { unitBadgePresets, addUnitPreset, updateUnitPreset, removeUnitPreset } = useSettings();

  const [selectedType, setSelectedType] = useState<string | null>(UNIT_TYPES[0]?.key ?? null);

  // ── 프리셋 추가 ────────────────────────────
  const [newTop,    setNewTop]    = useState('');
  const [newBottom, setNewBottom] = useState('');

  // ── 프리셋 수정 ────────────────────────────
  const [editId,     setEditId]     = useState<string | null>(null);
  const [editTop,    setEditTop]    = useState('');
  const [editBottom, setEditBottom] = useState('');

  // 선택된 종류의 프리셋만 필터
  const currentPresets = unitBadgePresets.filter(p => p.unitType === selectedType);

  // 편집 중 타입 변경 시 편집 취소
  useEffect(() => { setEditId(null); }, [selectedType]);

  const selectedLabel = UNIT_TYPES.find(u => u.key === selectedType)?.label ?? selectedType;

  function handleAdd() {
    const top = newTop.trim();
    if (!top || !selectedType) return;
    addUnitPreset({ unitType: selectedType, topText: top, bottomText: newBottom.trim() || undefined });
    setNewTop('');
    setNewBottom('');
  }

  function startEdit(p: UnitSpecificBadgePreset) {
    setEditId(p.id);
    setEditTop(p.topText);
    setEditBottom(p.bottomText ?? '');
  }

  function saveEdit() {
    if (!editId || !selectedType || !editTop.trim()) return;
    updateUnitPreset(editId, {
      unitType:   selectedType,
      topText:    editTop.trim(),
      bottomText: editBottom.trim() || undefined,
    });
    setEditId(null);
  }

  // 각 출동대 종류별 등록된 프리셋 수
  function countFor(key: string) {
    return unitBadgePresets.filter(p => p.unitType === key).length;
  }

  return (
    <div className="upp">
      {/* ══ 좌측: 출동대 종류 목록 ════════════════ */}
      <div className="upp__unit-list">
        <div className="upp__panel-header">
          <span className="upp__panel-title">출동대 종류</span>
        </div>
        <div className="upp__unit-scroll">
          {UNIT_TYPES.map(u => {
            const count = countFor(u.key);
            return (
              <button
                key={u.key}
                className={`upp__unit-item ${u.key === selectedType ? 'upp__unit-item--active' : ''}`}
                onClick={() => setSelectedType(u.key)}
              >
                <span className="upp__unit-label">{u.label}</span>
                {count > 0 && <span className="upp__unit-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ 우측: 프리셋 목록 ════════════════════════ */}
      <div className="upp__presets">
        <div className="upp__panel-header">
          <span className="upp__panel-title">{selectedLabel} 전용 프리셋</span>
          <span className="upp__count-badge">{currentPresets.length}개</span>
        </div>

        {/* 추가 폼 */}
        <div className="upp__add-form">
          <input
            className="upp__input upp__input--flex"
            placeholder="윗줄 *"
            value={newTop}
            onChange={e => setNewTop(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleAdd(); }}
          />
          <input
            className="upp__input upp__input--flex"
            placeholder="아랫줄 (선택)"
            value={newBottom}
            onChange={e => setNewBottom(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleAdd(); }}
          />
          <button
            className="upp__btn upp__btn--primary"
            onClick={handleAdd}
            disabled={!newTop.trim() || !selectedType}
          >
            추가
          </button>
        </div>

        {/* 프리셋 목록 */}
        <div className="upp__preset-list">
          {currentPresets.length === 0 && (
            <div className="upp__empty">
              {selectedLabel} 전용 프리셋이 없습니다.<br />위에서 추가하세요.
            </div>
          )}
          {currentPresets.map(p => (
            <div key={p.id} className="upp__preset-row">
              {editId === p.id ? (
                /* 수정 모드 */
                <>
                  <div className="upp__edit-fields">
                    <input
                      className="upp__input"
                      value={editTop}
                      onChange={e => setEditTop(e.target.value)}
                      placeholder="윗줄 *"
                      autoFocus
                      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null); }}
                    />
                    <input
                      className="upp__input"
                      value={editBottom}
                      onChange={e => setEditBottom(e.target.value)}
                      placeholder="아랫줄 (선택)"
                      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') saveEdit(); }}
                    />
                  </div>
                  <div className="upp__row-actions">
                    <button className="upp__btn upp__btn--primary" onClick={saveEdit} disabled={!editTop.trim()}>저장</button>
                    <button className="upp__btn" onClick={() => setEditId(null)}>취소</button>
                  </div>
                </>
              ) : (
                /* 표시 모드 */
                <>
                  <div className="upp__preset-preview">
                    <span className="upp__preview-top">{p.topText}</span>
                    {p.bottomText && <span className="upp__preview-bottom">{p.bottomText}</span>}
                  </div>
                  <div className="upp__row-actions">
                    <button className="upp__btn" onClick={() => startEdit(p)}>수정</button>
                    <button className="upp__btn upp__btn--danger" onClick={() => removeUnitPreset(p.id)}>삭제</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
