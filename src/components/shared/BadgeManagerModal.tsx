import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { BadgePreset } from '../../types';
import './BadgeManagerModal.css';
import { stagePortalTarget } from '../../utils/stagePortal';

interface Props {
  presets:  BadgePreset[];
  onAdd:    (preset: Omit<BadgePreset, 'id'>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, data: Omit<BadgePreset, 'id'>) => void;
  onClose:  () => void;
}

export function BadgeManagerModal({ presets, onAdd, onRemove, onUpdate, onClose }: Props) {
  const [newLine1, setNewLine1] = useState('');
  const [newLine2, setNewLine2] = useState('');
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editL1,   setEditL1]   = useState('');
  const [editL2,   setEditL2]   = useState('');

  function handleAdd() {
    const l1 = newLine1.trim();
    if (!l1) return;
    onAdd({ line1: l1, line2: newLine2.trim() || undefined });
    setNewLine1('');
    setNewLine2('');
  }

  function startEdit(p: BadgePreset) {
    setEditId(p.id);
    setEditL1(p.line1);
    setEditL2(p.line2 ?? '');
  }

  function handleSaveEdit() {
    if (!editId || !editL1.trim()) return;
    onUpdate(editId, { line1: editL1.trim(), line2: editL2.trim() || undefined });
    setEditId(null);
  }

  function cancelEdit() {
    setEditId(null);
  }

  return createPortal(
    <div
      className="bmm-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bmm" onMouseDown={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="bmm__header">
          <span className="bmm__title">상태 배지 관리</span>
          <button className="bmm__close-btn" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {/* 새 프리셋 추가 */}
        <div className="bmm__section">
          <div className="bmm__section-title">새 프리셋 추가</div>
          <div className="bmm__add-row">
            <input
              className="bmm__input"
              placeholder="윗줄 *"
              value={newLine1}
              onChange={e => setNewLine1(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <input
              className="bmm__input"
              placeholder="아랫줄 (선택)"
              value={newLine2}
              onChange={e => setNewLine2(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button
              className="bmm__btn bmm__btn--primary"
              onClick={handleAdd}
              disabled={!newLine1.trim()}
            >
              추가
            </button>
          </div>
        </div>

        {/* 저장된 프리셋 목록 */}
        <div className="bmm__section bmm__section--list">
          <div className="bmm__section-title">
            저장된 프리셋 <span className="bmm__count">{presets.length}</span>
          </div>

          {presets.length === 0 && (
            <div className="bmm__empty">저장된 프리셋이 없습니다.<br />위에서 새 프리셋을 추가하세요.</div>
          )}

          <div className="bmm__list">
            {presets.map(p => (
              <div key={p.id} className="bmm__preset-row">
                {editId === p.id ? (
                  /* 수정 모드 */
                  <>
                    <div className="bmm__edit-fields">
                      <input
                        className="bmm__input"
                        value={editL1}
                        onChange={e => setEditL1(e.target.value)}
                        placeholder="윗줄 *"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      />
                      <input
                        className="bmm__input"
                        value={editL2}
                        onChange={e => setEditL2(e.target.value)}
                        placeholder="아랫줄 (선택)"
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      />
                    </div>
                    <div className="bmm__row-actions">
                      <button
                        className="bmm__btn bmm__btn--primary"
                        onClick={handleSaveEdit}
                        disabled={!editL1.trim()}
                      >
                        저장
                      </button>
                      <button className="bmm__btn" onClick={cancelEdit}>취소</button>
                    </div>
                  </>
                ) : (
                  /* 표시 모드 */
                  <>
                    <div className="bmm__preset-preview">
                      <span className="bmm__preview-line1">{p.line1}</span>
                      {p.line2 && <span className="bmm__preview-line2">{p.line2}</span>}
                    </div>
                    <div className="bmm__row-actions">
                      <button className="bmm__btn" onClick={() => startEdit(p)}>수정</button>
                      <button
                        className="bmm__btn bmm__btn--danger"
                        onClick={() => onRemove(p.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    stagePortalTarget()
  );
}
