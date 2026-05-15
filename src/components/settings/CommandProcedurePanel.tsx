import { useState, useRef } from 'react';
import { useSettings } from '../../store/settingsStore';
import type { CommandProcedureItemType, CommandProcedureLevel, CommandProcedureCategory } from '../../types/settings';
import { generateId } from '../../utils/settingsStorage';
import './CommandProcedurePanel.css';

const LEVELS: CommandProcedureLevel[] = ['beginner', 'intermediate', 'advanced'];

const LEVEL_LABELS: Record<CommandProcedureLevel, string> = {
  beginner:     '초급',
  intermediate: '중급',
  advanced:     '고급',
};

const TYPE_LABELS: Record<CommandProcedureItemType, string> = {
  procedure: '절차',
  dispatch:  '출동대',
  event:     '이벤트',
  message:   '메세지',
  fire:      '화재',
};

export function CommandProcedurePanel() {
  const { commandProcedureConfigs, updateCommandProcedureLevel } = useSettings();

  const [selectedLevel, setSelectedLevel] = useState<CommandProcedureLevel>('beginner');
  const categories = commandProcedureConfigs[selectedLevel] ?? [];

  const [newCategoryTitle,    setNewCategoryTitle]    = useState('');
  const [editingCategoryId,   setEditingCategoryId]   = useState<string | null>(null);
  const [editingCategoryTitle,setEditingCategoryTitle]= useState('');
  const [newItemTypes, setNewItemTypes] = useState<Record<string, CommandProcedureItemType>>({});

  // 드래그 상태
  const dragCategory = useRef<number | null>(null);
  const dragItem     = useRef<{ categoryId: string; index: number } | null>(null);
  const [overCategoryIndex, setOverCategoryIndex] = useState<number | null>(null);
  const [overItemKey,       setOverItemKey]        = useState<string | null>(null);

  function commit(cats: CommandProcedureCategory[]) {
    updateCommandProcedureLevel(selectedLevel, cats);
  }

  function handleLevelChange(level: CommandProcedureLevel) {
    setSelectedLevel(level);
    setEditingCategoryId(null);
  }

  function getNewItemType(categoryId: string): CommandProcedureItemType {
    return newItemTypes[categoryId] ?? 'procedure';
  }

  // ── 카테고리 CRUD ──────────────────────────────

  function handleAddCategory() {
    const title = newCategoryTitle.trim();
    if (!title) return;
    commit([...categories, { id: generateId(), categoryTitle: title, items: [] }]);
    setNewCategoryTitle('');
  }

  function startEditCategory(id: string, title: string) {
    setEditingCategoryId(id);
    setEditingCategoryTitle(title);
  }

  function commitEditCategory() {
    if (!editingCategoryId) return;
    const title = editingCategoryTitle.trim();
    if (title) commit(categories.map(c => c.id === editingCategoryId ? { ...c, categoryTitle: title } : c));
    setEditingCategoryId(null);
  }

  function removeCategory(id: string) {
    commit(categories.filter(c => c.id !== id));
  }

  // ── 항목 CRUD ─────────────────────────────────

  function addItem(categoryId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const type = getNewItemType(categoryId);
    commit(categories.map(c =>
      c.id === categoryId
        ? { ...c, items: [...c.items, { id: generateId(), type, text: trimmed }] }
        : c
    ));
  }

  function updateItemText(categoryId: string, itemId: string, text: string) {
    commit(categories.map(c =>
      c.id === categoryId
        ? { ...c, items: c.items.map(it => it.id === itemId ? { ...it, text } : it) }
        : c
    ));
  }

  function removeItem(categoryId: string, itemId: string) {
    commit(categories.map(c =>
      c.id === categoryId
        ? { ...c, items: c.items.filter(it => it.id !== itemId) }
        : c
    ));
  }

  // ── 순서 변경 ──────────────────────────────────

  function reorderCategories(from: number, to: number) {
    const next = [...categories];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
  }

  function reorderItems(categoryId: string, from: number, to: number) {
    commit(categories.map(c => {
      if (c.id !== categoryId) return c;
      const items = [...c.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...c, items };
    }));
  }

  // ── 카테고리 드래그 ────────────────────────────

  function onCategoryDragStart(e: React.DragEvent, index: number) {
    dragCategory.current = index;
    dragItem.current     = null;
    e.dataTransfer.effectAllowed = 'move';
  }

  function onCategoryDragOver(e: React.DragEvent, index: number) {
    if (dragCategory.current === null) return;
    e.preventDefault();
    setOverCategoryIndex(index);
  }

  function onCategoryDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault();
    if (dragCategory.current !== null && dragCategory.current !== toIndex) {
      reorderCategories(dragCategory.current, toIndex);
    }
    dragCategory.current = null;
    setOverCategoryIndex(null);
  }

  // ── 항목 드래그 ────────────────────────────────

  function onItemDragStart(e: React.DragEvent, categoryId: string, index: number) {
    dragItem.current     = { categoryId, index };
    dragCategory.current = null;
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }

  function onItemDragOver(e: React.DragEvent, categoryId: string, index: number) {
    if (!dragItem.current || dragItem.current.categoryId !== categoryId) return;
    e.preventDefault();
    e.stopPropagation();
    setOverItemKey(`${categoryId}:${index}`);
  }

  function onItemDrop(e: React.DragEvent, categoryId: string, toIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    if (
      dragItem.current &&
      dragItem.current.categoryId === categoryId &&
      dragItem.current.index !== toIndex
    ) {
      reorderItems(categoryId, dragItem.current.index, toIndex);
    }
    dragItem.current = null;
    setOverItemKey(null);
  }

  function onDragEnd() {
    dragCategory.current = null;
    dragItem.current     = null;
    setOverCategoryIndex(null);
    setOverItemKey(null);
  }

  return (
    <div className="cp-panel">
      {/* 레벨 탭 */}
      <div className="cp-panel__level-tabs">
        {LEVELS.map(level => (
          <button
            key={level}
            className={`cp-panel__level-tab${selectedLevel === level ? ' cp-panel__level-tab--active' : ''}`}
            onClick={() => handleLevelChange(level)}
          >
            {LEVEL_LABELS[level]}
          </button>
        ))}
      </div>

      {/* 카테고리 목록 */}
      <div className="cp-panel__categories">
        {categories.map((category, catIndex) => {
          const curItemType = getNewItemType(category.id);
          return (
            <div
              key={category.id}
              className={`cp-panel__category${overCategoryIndex === catIndex && dragCategory.current !== catIndex ? ' cp-panel__category--drag-over' : ''}`}
              onDragOver={e => onCategoryDragOver(e, catIndex)}
              onDrop={e => onCategoryDrop(e, catIndex)}
            >
              {/* 카테고리 헤더 */}
              <div className="cp-panel__category-header">
                <span
                  className="cp-panel__drag-handle"
                  draggable
                  onDragStart={e => onCategoryDragStart(e, catIndex)}
                  onDragEnd={onDragEnd}
                  title="드래그하여 순서 변경"
                >
                  ⠿
                </span>

                {editingCategoryId === category.id ? (
                  <input
                    className="cp-panel__category-title-input"
                    value={editingCategoryTitle}
                    onChange={e => setEditingCategoryTitle(e.target.value)}
                    onBlur={commitEditCategory}
                    onKeyDown={e => { if (e.key === 'Enter') commitEditCategory(); }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="cp-panel__category-title"
                    onClick={() => startEditCategory(category.id, category.categoryTitle)}
                    title="클릭하여 수정"
                  >
                    {category.categoryTitle}
                  </span>
                )}

                <button
                  className="cp-panel__delete-btn"
                  onClick={() => removeCategory(category.id)}
                  title="카테고리 삭제"
                >
                  ✕
                </button>
              </div>

              {/* 항목 목록 */}
              <div className="cp-panel__items">
                {category.items.map((item, itemIndex) => {
                  const itemKey = `${category.id}:${itemIndex}`;
                  return (
                    <div
                      key={item.id}
                      className={`cp-panel__item${overItemKey === itemKey && dragItem.current?.index !== itemIndex ? ' cp-panel__item--drag-over' : ''}`}
                      onDragOver={e => onItemDragOver(e, category.id, itemIndex)}
                      onDrop={e => onItemDrop(e, category.id, itemIndex)}
                    >
                      <span
                        className="cp-panel__drag-handle cp-panel__drag-handle--item"
                        draggable
                        onDragStart={e => onItemDragStart(e, category.id, itemIndex)}
                        onDragEnd={onDragEnd}
                        title="드래그하여 순서 변경"
                      >
                        ⠿
                      </span>
                      <span className={`cp-panel__type-badge cp-panel__type-badge--${item.type}`}>
                        {TYPE_LABELS[item.type]}
                      </span>
                      <input
                        className="cp-panel__item-input"
                        value={item.text}
                        onChange={e => updateItemText(category.id, item.id, e.target.value)}
                      />
                      <button
                        className="cp-panel__delete-btn"
                        onClick={() => removeItem(category.id, item.id)}
                        title="항목 삭제"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* 항목 추가 행 */}
              <div className="cp-panel__add-item-row">
                <select
                  className="cp-panel__type-select"
                  value={curItemType}
                  onChange={e => setNewItemTypes(prev => ({ ...prev, [category.id]: e.target.value as CommandProcedureItemType }))}
                >
                  <option value="procedure">절차</option>
                  <option value="dispatch">출동대</option>
                  <option value="event">이벤트</option>
                  <option value="message">메세지</option>
                  <option value="fire">화재</option>
                </select>
                <input
                  className="cp-panel__add-item-input"
                  placeholder="항목 추가..."
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value;
                      addItem(category.id, val);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
                <button
                  className="cp-panel__add-item-btn"
                  onClick={e => {
                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                    addItem(category.id, input.value);
                    input.value = '';
                  }}
                >
                  추가
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 카테고리 추가 행 */}
      <div className="cp-panel__add-category-row">
        <input
          className="cp-panel__add-category-input"
          placeholder="새 카테고리 제목..."
          value={newCategoryTitle}
          onChange={e => setNewCategoryTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }}
        />
        <button
          className="cp-panel__add-category-btn"
          onClick={handleAddCategory}
        >
          + 카테고리 추가
        </button>
      </div>
    </div>
  );
}
