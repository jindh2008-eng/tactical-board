import { useRef, useState } from 'react';
import { useSettings } from '../../store/settingsStore';
import { exportSettings, importSettings } from '../../utils/settingsStorage';
import './SettingsLibraryPanel.css';

/**
 * 설정 라이브러리 패널
 * - 현재 설정 이름 표시/편집
 * - 저장 / 다른 이름으로 저장 / 신규 작성
 * - 저장된 설정 목록 표시 및 불러오기/삭제
 */
export function SettingsLibraryPanel() {
  const {
    settingsList,
    activeSettingsId,
    activeSettingsName,
    setActiveSettingsName,
    saveSettings,
    saveSettingsAs,
    loadSettings,
    deleteSettingsEntry,
    newSettings,
  } = useSettings();

  const [showList,   setShowList]   = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    saveSettings();
  }

  function handleSaveAs() {
    const name = saveAsName.trim();
    if (!name) return;
    saveSettingsAs(name);
    setSaveAsName('');
    setShowSaveAs(false);
  }

  function handleNew() {
    if (!window.confirm('현재 설정을 초기화하겠습니까? 저장되지 않은 변경사항은 사라집니다.')) return;
    newSettings();
  }

  function handleExport() {
    exportSettings();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      await importSettings(file);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : '불러오기 실패');
    }
  }

  return (
    <div className="slp">
      {/* ── 현재 설정 이름 + 버튼 행 ── */}
      <div className="slp__bar">
        <div className="slp__name-group">
          <label className="slp__label">현재 설정</label>
          <input
            className="slp__name-input"
            value={activeSettingsName}
            onChange={e => setActiveSettingsName(e.target.value)}
            placeholder="설정 이름"
            onKeyDown={e => e.stopPropagation()}
          />
        </div>
        <div className="slp__actions">
          <button className="slp__btn slp__btn--primary" onClick={handleSave}>
            저장
          </button>
          <button
            className="slp__btn"
            onClick={() => { setShowSaveAs(s => !s); setSaveAsName(''); }}
          >
            다른 이름으로
          </button>
          <button className="slp__btn slp__btn--new" onClick={handleNew}>
            신규 작성
          </button>
          <button
            className={`slp__btn ${showList ? 'slp__btn--active' : ''}`}
            onClick={() => setShowList(s => !s)}
          >
            저장 목록 {showList ? '▲' : '▼'}
          </button>
          <button className="slp__btn slp__btn--export" onClick={handleExport} title="설정을 JSON 파일로 저장합니다">
            내보내기
          </button>
          <button className="slp__btn slp__btn--export" onClick={() => fileInputRef.current?.click()} title="다른 기기에서 내보낸 JSON 파일을 불러옵니다">
            가져오기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>
      </div>

      {/* ── 다른 이름으로 저장 ── */}
      {showSaveAs && (
        <div className="slp__save-as-row">
          <input
            className="slp__name-input"
            placeholder="새 이름 입력"
            value={saveAsName}
            onChange={e => setSaveAsName(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') handleSaveAs();
              if (e.key === 'Escape') setShowSaveAs(false);
            }}
            autoFocus
          />
          <button
            className="slp__btn slp__btn--primary"
            onClick={handleSaveAs}
            disabled={!saveAsName.trim()}
          >
            저장
          </button>
          <button className="slp__btn" onClick={() => setShowSaveAs(false)}>
            취소
          </button>
        </div>
      )}

      {/* ── 저장 목록 ── */}
      {showList && (
        <div className="slp__list">
          {settingsList.length === 0 ? (
            <div className="slp__empty">
              저장된 설정이 없습니다. 위에서 저장해주세요.
            </div>
          ) : (
            settingsList.map(s => (
              <div
                key={s.id}
                className={`slp__list-item ${s.id === activeSettingsId ? 'slp__list-item--active' : ''}`}
              >
                <div className="slp__item-info">
                  <span className="slp__item-name">{s.name}</span>
                  <span className="slp__item-date">{s.updatedAt}</span>
                </div>
                <div className="slp__item-actions">
                  <button
                    className="slp__btn slp__btn--sm"
                    onClick={() => loadSettings(s.id)}
                    disabled={s.id === activeSettingsId}
                  >
                    불러오기
                  </button>
                  <button
                    className="slp__btn slp__btn--sm slp__btn--danger"
                    onClick={() => {
                      if (window.confirm(`"${s.name}" 설정을 삭제하겠습니까?`)) {
                        deleteSettingsEntry(s.id);
                      }
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
