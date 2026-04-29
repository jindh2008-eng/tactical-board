import { useState } from 'react';
import { useSettings } from '../../store/settingsStore';
import { EVENT_ICON_FILES, EVENT_TYPE_LABELS, type EventType } from '../../types/events';
import './EventSetupPanel.css';

const EVENT_TYPES: EventType[] = ['fire', 'gas', 'electric'];

// 파일명 → 표시 이름 (확장자 제거)
function baseName(filename: string) {
  return filename.replace(/\.[^.]+$/, '');
}

export function EventSetupPanel() {
  const { eventSetup, addEventSetupItem, updateEventSetupItem, removeEventSetupItem } = useSettings();

  // ── 추가 폼 상태 ──────────────────────────────
  const [newIcon,  setNewIcon]  = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType,  setNewType]  = useState<EventType>('fire');

  // 아이콘 선택 시 이름 자동입력 (비어 있거나 이전 아이콘 이름과 같을 때만)
  function handleSelectNewIcon(filename: string) {
    const prevName = newIcon ? baseName(newIcon) : '';
    setNewIcon(filename);
    setNewLabel(prev => (prev === '' || prev === prevName) ? baseName(filename) : prev);
  }

  function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    addEventSetupItem(label, newIcon || undefined, newType);
    setNewIcon('');
    setNewLabel('');
    setNewType('fire');
  }

  // ── 기존 항목 아이콘 피커 ─────────────────────
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null);

  function handleSelectIcon(itemId: string, filename: string) {
    const current = eventSetup.find(e => e.id === itemId)?.icon ?? '';
    updateEventSetupItem(itemId, { icon: current === filename ? '' : filename });
    setPickerOpenId(null);
  }

  return (
    <div className="esp">

      {/* ── 새 이벤트 추가 영역 ── */}
      <div className="esp__add-section">
        <p className="esp__add-title">아이콘 선택</p>

        {/* 아이콘 그리드 */}
        <div className="esp__add-icon-grid">
          {EVENT_ICON_FILES.map(filename => (
            <button
              key={filename}
              type="button"
              className={['esp__icon-cell', newIcon === filename ? 'esp__icon-cell--active' : ''].filter(Boolean).join(' ')}
              onClick={() => handleSelectNewIcon(filename)}
              title={baseName(filename)}
            >
              <img src={`/event-icon/${filename}`} alt={filename} className="esp__icon-cell-img" draggable={false} />
              <span className="esp__icon-cell-name">{baseName(filename)}</span>
            </button>
          ))}
        </div>

        {/* 이름 + 종류 + 추가 버튼 행 */}
        <div className="esp__add-row">
          {/* 선택된 아이콘 미리보기 */}
          <div className="esp__add-preview" title={newIcon ? baseName(newIcon) : '아이콘 미선택'}>
            {newIcon
              ? <img src={`/event-icon/${newIcon}`} alt={newIcon} className="esp__add-preview-img" draggable={false} />
              : <span className="esp__add-preview-placeholder">?</span>
            }
          </div>

          {/* 이름 입력 */}
          <input
            className="esp__add-input"
            type="text"
            placeholder="이름"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            maxLength={20}
          />

          {/* 종류 선택 */}
          <div className="esp__type-seg">
            {EVENT_TYPES.map(t => (
              <button
                key={t}
                type="button"
                className={[
                  'esp__type-btn',
                  `esp__type-btn--${t}`,
                  newType === t ? 'esp__type-btn--active' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setNewType(t)}
                title={EVENT_TYPE_LABELS[t]}
              >
                {EVENT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {/* 추가 버튼 */}
          <button
            className="esp__add-btn"
            type="button"
            onClick={handleAdd}
            disabled={!newLabel.trim()}
          >
            추가
          </button>
        </div>
      </div>

      {/* ── 등록된 이벤트 목록 ── */}
      {eventSetup.length === 0 ? (
        <div className="esp__empty">등록된 이벤트가 없습니다.</div>
      ) : (
        <div className="esp__list">
          {/* 헤더 */}
          <div className="esp__list-head">
            <span className="esp__lh esp__lh--check">표시</span>
            <span className="esp__lh esp__lh--label">이름</span>
            <span className="esp__lh esp__lh--type">종류</span>
            <span className="esp__lh esp__lh--icon">아이콘</span>
            <span className="esp__lh esp__lh--del" />
          </div>

          {eventSetup.map(item => {
            const currentType: EventType = item.eventType ?? 'fire';
            return (
              <div
                key={item.id}
                className={['esp__item', pickerOpenId === item.id ? 'esp__item--picker-open' : ''].filter(Boolean).join(' ')}
              >
                {/* ── 메인 행 ── */}
                <div className="esp__item-row">
                  {/* 활성화 체크박스 */}
                  <label className="esp__check-wrap">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={e => updateEventSetupItem(item.id, { enabled: e.target.checked })}
                    />
                  </label>

                  {/* 이름 편집 */}
                  <input
                    className="esp__label-input"
                    type="text"
                    value={item.label}
                    onChange={e => updateEventSetupItem(item.id, { label: e.target.value })}
                    maxLength={20}
                  />

                  {/* 이벤트 종류 선택 — 세그먼트 버튼 */}
                  <div className="esp__type-seg">
                    {EVENT_TYPES.map(t => (
                      <button
                        key={t}
                        type="button"
                        className={[
                          'esp__type-btn',
                          `esp__type-btn--${t}`,
                          currentType === t ? 'esp__type-btn--active' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => updateEventSetupItem(item.id, { eventType: t })}
                        title={EVENT_TYPE_LABELS[t]}
                      >
                        {EVENT_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>

                  {/* 아이콘 선택 버튼 */}
                  <button
                    className={['esp__icon-btn', item.icon ? 'esp__icon-btn--has-icon' : ''].filter(Boolean).join(' ')}
                    type="button"
                    onClick={() => setPickerOpenId(prev => prev === item.id ? null : item.id)}
                    title={item.icon ? `아이콘: ${item.icon} (클릭하여 변경)` : '아이콘 선택'}
                  >
                    {item.icon
                      ? <img src={`/event-icon/${item.icon}`} alt={item.icon} className="esp__icon-thumb" />
                      : <span className="esp__icon-placeholder">+</span>
                    }
                  </button>

                  {/* 삭제 */}
                  <button
                    className="esp__del-btn"
                    type="button"
                    onClick={() => removeEventSetupItem(item.id)}
                    title="삭제"
                  >
                    ×
                  </button>
                </div>

                {/* ── 아이콘 피커 (토글) ── */}
                {pickerOpenId === item.id && (
                  <div className="esp__icon-picker">
                    <button
                      className={['esp__icon-cell', !item.icon ? 'esp__icon-cell--active' : ''].filter(Boolean).join(' ')}
                      type="button"
                      onClick={() => { updateEventSetupItem(item.id, { icon: '' }); setPickerOpenId(null); }}
                      title="아이콘 없음"
                    >
                      <span className="esp__icon-cell-none">없음</span>
                    </button>

                    {EVENT_ICON_FILES.map(filename => (
                      <button
                        key={filename}
                        className={['esp__icon-cell', item.icon === filename ? 'esp__icon-cell--active' : ''].filter(Boolean).join(' ')}
                        type="button"
                        onClick={() => handleSelectIcon(item.id, filename)}
                        title={baseName(filename)}
                      >
                        <img src={`/event-icon/${filename}`} alt={filename} className="esp__icon-cell-img" draggable={false} />
                        <span className="esp__icon-cell-name">{baseName(filename)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="esp__hint">
        체크된 항목만 실행창에 표시됩니다. 종류에 따라 세부 상태 메뉴가 달라집니다.
      </p>
    </div>
  );
}
