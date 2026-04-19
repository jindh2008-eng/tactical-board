import { useState } from 'react';
import { useSettings } from '../../store/settingsStore';
import type { SharedBadgePreset } from '../../types/presets';
import { UNIT_TYPES } from '../../types/presets';
import './SharedPresetPanel.css';

/**
 * 공통 프리셋 관리 패널
 * - 여러 출동대 종류에 공통 적용되는 프리셋
 * - targetTypes 체크박스로 적용 대상 선택
 * - 빈 targetTypes = 모든 출동대에 표시
 */
export function SharedPresetPanel() {
  const { sharedBadgePresets, addSharedPreset, updateSharedPreset, removeSharedPreset } = useSettings();

  // ── 추가 폼 ────────────────────────────────
  const [newTop,     setNewTop]     = useState('');
  const [newBottom,  setNewBottom]  = useState('');
  const [newTargets, setNewTargets] = useState<string[]>([]);
  const [showForm,   setShowForm]   = useState(false);

  // ── 수정 상태 ──────────────────────────────
  const [editId,      setEditId]      = useState<string | null>(null);
  const [editTop,     setEditTop]     = useState('');
  const [editBottom,  setEditBottom]  = useState('');
  const [editTargets, setEditTargets] = useState<string[]>([]);

  function toggleTarget(key: string, targets: string[], setTargets: (t: string[]) => void) {
    setTargets(targets.includes(key) ? targets.filter(t => t !== key) : [...targets, key]);
  }

  // ── 추가 ───────────────────────────────────
  function handleAdd() {
    const top = newTop.trim();
    if (!top) return;
    addSharedPreset({
      topText:     top,
      bottomText:  newBottom.trim() || undefined,
      targetTypes: newTargets,
    });
    setNewTop('');
    setNewBottom('');
    setNewTargets([]);
    setShowForm(false);
  }

  // ── 수정 ───────────────────────────────────
  function startEdit(p: SharedBadgePreset) {
    setEditId(p.id);
    setEditTop(p.topText);
    setEditBottom(p.bottomText ?? '');
    setEditTargets([...p.targetTypes]);
  }

  function saveEdit() {
    if (!editId || !editTop.trim()) return;
    updateSharedPreset(editId, {
      topText:     editTop.trim(),
      bottomText:  editBottom.trim() || undefined,
      targetTypes: editTargets,
    });
    setEditId(null);
  }

  function cancelEdit() { setEditId(null); }

  return (
    <div className="spp">
      {/* 헤더 */}
      <div className="spp__header">
        <div className="spp__header-left">
          <span className="spp__title">공통 프리셋</span>
          <span className="spp__count">{sharedBadgePresets.length}개</span>
        </div>
        <button
          className={`spp__add-toggle ${showForm ? 'spp__add-toggle--active' : ''}`}
          onClick={() => { setShowForm(s => !s); setNewTop(''); setNewBottom(''); setNewTargets([]); }}
        >
          {showForm ? '취소' : '+ 추가'}
        </button>
      </div>

      {/* 추가 폼 */}
      {showForm && (
        <div className="spp__form spp__form--add">
          <div className="spp__form-row">
            <input
              className="spp__input"
              placeholder="윗줄 *"
              value={newTop}
              onChange={e => setNewTop(e.target.value)}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowForm(false); }}
              autoFocus
            />
            <input
              className="spp__input"
              placeholder="아랫줄 (선택)"
              value={newBottom}
              onChange={e => setNewBottom(e.target.value)}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleAdd(); }}
            />
          </div>
          <div className="spp__targets-label">
            적용 대상 <span className="spp__targets-hint">(미선택 = 모든 출동대)</span>
          </div>
          <div className="spp__targets-grid">
            {UNIT_TYPES.map(u => (
              <label key={u.key} className="spp__check-label">
                <input
                  type="checkbox"
                  checked={newTargets.includes(u.key)}
                  onChange={() => toggleTarget(u.key, newTargets, setNewTargets)}
                  className="spp__checkbox"
                />
                <span>{u.label}</span>
              </label>
            ))}
          </div>
          <div className="spp__form-actions">
            <button className="spp__btn spp__btn--primary" onClick={handleAdd} disabled={!newTop.trim()}>추가</button>
            <button className="spp__btn" onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}

      {/* 프리셋 목록 */}
      {sharedBadgePresets.length === 0 && !showForm && (
        <div className="spp__empty">
          공통 프리셋이 없습니다. + 추가 버튼으로 등록하세요.
        </div>
      )}

      <div className="spp__list">
        {sharedBadgePresets.map(p => (
          <div key={p.id} className="spp__row">
            {editId === p.id ? (
              /* ── 수정 모드 ── */
              <div className="spp__form spp__form--edit">
                <div className="spp__form-row">
                  <input
                    className="spp__input"
                    value={editTop}
                    onChange={e => setEditTop(e.target.value)}
                    placeholder="윗줄 *"
                    autoFocus
                    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                  />
                  <input
                    className="spp__input"
                    value={editBottom}
                    onChange={e => setEditBottom(e.target.value)}
                    placeholder="아랫줄 (선택)"
                    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') saveEdit(); }}
                  />
                </div>
                <div className="spp__targets-label">
                  적용 대상 <span className="spp__targets-hint">(미선택 = 모든 출동대)</span>
                </div>
                <div className="spp__targets-grid">
                  {UNIT_TYPES.map(u => (
                    <label key={u.key} className="spp__check-label">
                      <input
                        type="checkbox"
                        checked={editTargets.includes(u.key)}
                        onChange={() => toggleTarget(u.key, editTargets, setEditTargets)}
                        className="spp__checkbox"
                      />
                      <span>{u.label}</span>
                    </label>
                  ))}
                </div>
                <div className="spp__form-actions">
                  <button className="spp__btn spp__btn--primary" onClick={saveEdit} disabled={!editTop.trim()}>저장</button>
                  <button className="spp__btn" onClick={cancelEdit}>취소</button>
                </div>
              </div>
            ) : (
              /* ── 표시 모드 ── */
              <>
                <div className="spp__preview">
                  <div className="spp__preview-text">
                    <span className="spp__preview-top">{p.topText}</span>
                    {p.bottomText && <span className="spp__preview-bottom">{p.bottomText}</span>}
                  </div>
                  <div className="spp__target-chips">
                    {p.targetTypes.length === 0 ? (
                      <span className="spp__chip spp__chip--all">전체</span>
                    ) : (
                      p.targetTypes.map(key => {
                        const label = UNIT_TYPES.find(u => u.key === key)?.label ?? key;
                        return <span key={key} className="spp__chip">{label}</span>;
                      })
                    )}
                  </div>
                </div>
                <div className="spp__row-actions">
                  <button className="spp__btn" onClick={() => startEdit(p)}>수정</button>
                  <button className="spp__btn spp__btn--danger" onClick={() => removeSharedPreset(p.id)}>삭제</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
