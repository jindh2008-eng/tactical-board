import { useState } from 'react';
import { useSettings } from '../../store/settingsStore';
import './EventSetupPanel.css';

// ─────────────────────────────────────────────
// 이벤트 토큰 설정 패널
// — 설정창에서 이벤트 생성·선택·삭제
// ─────────────────────────────────────────────

export function EventSetupPanel() {
  const { eventSetup, addEventSetupItem, updateEventSetupItem, removeEventSetupItem } = useSettings();
  const [newLabel, setNewLabel] = useState('');

  function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    addEventSetupItem(label);
    setNewLabel('');
  }

  return (
    <div className="esp">

      {/* 추가 입력 */}
      <div className="esp__add-row">
        <input
          className="esp__add-input"
          type="text"
          placeholder="이벤트 이름 입력 (예: 화재1, 폭발지점)"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          maxLength={20}
        />
        <button
          className="esp__add-btn"
          type="button"
          onClick={handleAdd}
          disabled={!newLabel.trim()}
        >
          추가
        </button>
      </div>

      {/* 이벤트 목록 */}
      {eventSetup.length === 0 ? (
        <div className="esp__empty">등록된 이벤트가 없습니다.</div>
      ) : (
        <div className="esp__list">
          {/* 헤더 */}
          <div className="esp__list-head">
            <span className="esp__lh esp__lh--check">표시</span>
            <span className="esp__lh esp__lh--label">이름</span>
            <span className="esp__lh esp__lh--del" />
          </div>

          {eventSetup.map(item => (
            <div key={item.id} className="esp__item">
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
          ))}
        </div>
      )}

      <p className="esp__hint">
        체크된 항목만 실행창에 표시됩니다. 실행창에서는 이동 및 상태 변경만 가능합니다.
      </p>
    </div>
  );
}
