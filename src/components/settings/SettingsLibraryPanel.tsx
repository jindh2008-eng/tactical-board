import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../store/settingsStore';
import { exportSettings, importSettings, exportScenario, importScenario } from '../../utils/settingsStorage';
import type { SettingsSet } from '../../utils/settingsStorage';
import {
  SetButton, SetMenu, SetMenuItem, SetMenuSeparator,
  SetStatusChip, SetToast, resolveSaveStatus,
  IconSave, IconCheck, IconChevronDown, IconChevronUp,
  IconExport, IconImport, IconTrash, IconReset,
} from './ui';
import './SettingsLibraryPanel.css';

/** 삭제 되돌리기 유예 시간(§7.4 F-4) */
const DELETE_UNDO_MS = 5000;

function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 설정 라이브러리 패널 — 상단 설정 파일 바.
 *
 * 상단에 노출하는 버튼은 **저장 / 다른 이름으로 / 저장 목록 / ⋯** 넷뿐이다.
 * 내보내기·가져오기·신규 작성은 ⋯ 안으로 넣었다 — 훈련 준비 중 오조작 경로를
 * 줄이는 것이 목적이다(SETTINGS_MODE_UI_PLAN.md §7.4 · Q-3).
 *
 * 이전에는 버튼 여섯 개가 각자 다른 색을 토큰 밖에서 썼고, 그중 **전체 초기화가
 * 초록이고 일상적인 저장이 보라**였다(§1.4 F-4). 지금은 CTA 가 저장 하나이고
 * 파괴적 동작은 위험색 + 메뉴 안 + 구분선 뒤로 세 겹 분리돼 있다.
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
    isDirty,
    isApplied,
    lastAppliedAt,
  } = useSettings();

  const [showList,    setShowList]    = useState(false);
  const [listQuery,   setListQuery]   = useState('');
  const switcherRef = useRef<HTMLDivElement>(null);
  const [showSaveAs,  setShowSaveAs]  = useState(false);
  const [saveAsName,  setSaveAsName]  = useState('');
  const [savedFlash,  setSavedFlash]  = useState(false);
  // 파일 입력을 둘로 나눈다 — 하나를 돌려 쓰면 백업 파일이 시나리오 경로로,
  // 시나리오 파일이 복원 경로로 들어가 조용히 엉뚱한 일이 벌어진다.
  const scenarioInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef   = useRef<HTMLInputElement>(null);

  // ── 삭제 되돌리기(§7.4 F-4) ──
  // 확인창을 통과하면 목록에서는 즉시 숨기되, 실제 삭제(deleteSettingsEntry)는
  // 5초 뒤로 미룬다. 그사이 "되돌리기"를 누르면 타이머만 취소하고 아무 일도
  // 일어나지 않는다 — settingsList 는 그동안 한 번도 바뀌지 않는다.
  // Map 인 이유는 연속으로 두 개를 삭제할 때 먼저 것의 타이머를 잃어버리지
  // 않기 위해서다 — 값 하나짜리 상태였다면 두 번째 요청이 첫 번째를 덮어써
  // 목록에 먼저 지운 항목이 다시 나타나는 깜빡임이 생긴다.
  const [pendingDeletes, setPendingDeletes] = useState<Map<string, SettingsSet>>(new Map());
  const deleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => () => { for (const t of deleteTimersRef.current.values()) clearTimeout(t); }, []);

  /*
   * 목록은 바깥을 누르거나 Esc 로 닫는다. 여는 컨트롤 옆에 붙어 뜨는 것은
   * 메뉴이지 화면이 아니므로, 닫는 길이 버튼 재클릭 하나뿐이면 갇힌 느낌이 난다.
   */
  useEffect(() => {
    if (!showList) return;
    const onDown = (e: MouseEvent) => {
      if (!switcherRef.current?.contains(e.target as Node)) setShowList(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowList(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showList]);

  function requestDelete(set: SettingsSet) {
    if (!window.confirm(`"${set.name}" 설정을 삭제하겠습니까?`)) return;
    setPendingDeletes(prev => new Map(prev).set(set.id, set));
    const timer = setTimeout(() => {
      deleteSettingsEntry(set.id);
      deleteTimersRef.current.delete(set.id);
      setPendingDeletes(prev => { const next = new Map(prev); next.delete(set.id); return next; });
    }, DELETE_UNDO_MS);
    deleteTimersRef.current.set(set.id, timer);
  }

  function undoDelete(id: string) {
    const timer = deleteTimersRef.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimersRef.current.delete(id);
    setPendingDeletes(prev => { const next = new Map(prev); next.delete(id); return next; });
  }

  function handleSave() {
    saveSettings();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
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

  /** 지금 편집 중인 시나리오를 파일 하나로 내보낸다 */
  function handleExportScenario() {
    // 저장된 적 없는 시나리오는 내보낼 실체가 없다 — 먼저 저장하게 한다.
    const set = activeSettingsId ? settingsList.find(s => s.id === activeSettingsId) : undefined;
    if (!set) {
      alert('먼저 저장해 주세요. 저장된 시나리오만 파일로 내보낼 수 있습니다.');
      return;
    }
    if (isDirty && !window.confirm('저장하지 않은 변경사항은 파일에 담기지 않습니다. 계속할까요?')) return;
    exportScenario(set);
  }

  async function handleScenarioFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      // 덮어쓰지 않고 목록에 새 항목으로 붙인다 — importScenario 주석 참고.
      const id = await importScenario(file);
      loadSettings(id);
      setShowList(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : '불러오기 실패');
    }
  }

  function handleRestoreClick() {
    if (!window.confirm(
      '백업에서 복원하면 저장된 시나리오 전부와 전체 설정이 파일 내용으로 바뀝니다.\n'
      + '지금 있는 내용은 사라집니다. 계속할까요?'
    )) return;
    backupInputRef.current?.click();
  }

  async function handleBackupFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      await importSettings(file);
      alert('백업을 복원했습니다.');
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : '복원 실패');
    }
  }

  /**
   * 시나리오 목록 — 이름칸 바로 아래로 열린다.
   *
   * 행 전체가 「불러오기」다. 예전에는 이름을 읽고 오른쪽 끝의 77×26 버튼까지
   * 가서 눌러야 했다 — 파일 목록에서 행 전체가 대상인 것이 관례다.
   * 삭제는 행 메뉴 안으로 넣었다. 목록에서 가장 흔한 동작(전환)과 가장 위험한
   * 동작(삭제)이 나란히 있으면 안 된다.
   */
  function renderList() {
    const visible = settingsList.filter(s => !pendingDeletes.has(s.id));
    // 검색칸은 항목이 많을 때만 그린다 — 세 줄짜리 목록 위의 검색칸은 방해다
    const showSearch = visible.length >= 8;
    const q = listQuery.trim().toLowerCase();
    const rows = q ? visible.filter(s => s.name.toLowerCase().includes(q)) : visible;

    return (
      <div className="slp__list-pop" role="listbox" aria-label="시나리오 목록">
        {showSearch && (
          <div className="slp__list-search">
            <input
              className="slp__list-search-input"
              placeholder="시나리오 검색…"
              aria-label="시나리오 검색"
              value={listQuery}
              onChange={e => setListQuery(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              autoFocus
            />
          </div>
        )}

        <div className="slp__list">
          {visible.length === 0 ? (
            <div className="slp__empty">저장된 시나리오가 없습니다. 먼저 저장해 주세요.</div>
          ) : rows.length === 0 ? (
            <div className="slp__empty">「{listQuery}」에 맞는 시나리오가 없습니다.</div>
          ) : rows.map(set => {
            const active = set.id === activeSettingsId;
            return (
              <div
                key={set.id}
                className={`slp__row${active ? ' slp__row--active' : ''}`}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className="slp__row-main"
                  disabled={active}
                  onClick={() => { loadSettings(set.id); setShowList(false); }}
                >
                  <span className="slp__row-dot" aria-hidden="true" />
                  <span className="slp__row-name">{set.name}</span>
                  <span className="slp__row-date">{set.updatedAt}</span>
                </button>
                <SetMenu label={`"${set.name}" 더보기`}>
                  {close => (
                    <SetMenuItem
                      icon={<IconTrash size={14} />}
                      danger
                      onClick={() => { close(); requestDelete(set); }}
                    >
                      삭제
                    </SetMenuItem>
                  )}
                </SetMenu>
              </div>
            );
          })}
        </div>

        {/*
          바닥 액션. 「다른 이름으로」가 여기 있는 이유는 Figma·Google Docs 가
          파일 메뉴에 두는 자리와 같다 — 툴바에는 일상 동작인 「저장」만 남긴다.
        */}
        <div className="slp__list-foot">
          <SetButton
            size="sm"
            variant="ghost"
            onClick={() => { setShowList(false); setShowSaveAs(true); setSaveAsName(''); }}
          >
            다른 이름으로 저장
          </SetButton>
        </div>
      </div>
    );
  }

  return (
    <div className="slp">
      {/* ── 현재 설정 이름 + 버튼 행 ── */}
      <div className="slp__bar">
        {/*
          시나리오 전환 — 이름이 곧 트리거다.
          ▾ 를 이름칸에 붙여 **한 컨트롤로** 보이게 한다. 이름 편집은 그대로
          인라인으로 남긴다(시나리오를 쓰면서 자주 고친다). 목록은 이 상자
          왼쪽 모서리에 맞춰 바로 아래로 열린다 — 예전에는 화면 오른쪽 끝에
          떠서 여는 버튼과 모서리조차 맞지 않았다.
        */}
        <div className="slp__switcher" ref={switcherRef}>
          <label className="slp__label" htmlFor="slp-name">현재 시나리오</label>
          {/*
            목록의 기준점은 **이름 상자**여야 한다. 바깥 .slp__switcher 에 걸면
            라벨 폭(88px)만큼 왼쪽으로 밀려 모서리가 어긋난다 — 실측으로 확인했다.
            상자 자신은 overflow: hidden 이라 기준점이 될 수 없어 한 겹 더 둔다.
          */}
          <div className="slp__switcher-anchor">
          <div className="slp__switcher-box">
            <input
              id="slp-name"
              className="slp__name-input"
              value={activeSettingsName}
              onChange={e => setActiveSettingsName(e.target.value)}
              placeholder="시나리오 이름"
              onKeyDown={e => e.stopPropagation()}
            />
            <button
              type="button"
              className="slp__switcher-toggle"
              aria-expanded={showList}
              aria-haspopup="listbox"
              aria-label={showList ? '시나리오 목록 닫기' : '시나리오 목록 열기'}
              title="다른 시나리오 열기"
              onClick={() => { setShowList(v => !v); setListQuery(''); }}
            >
              {showList ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
            </button>
          </div>

          {showList && renderList()}
          </div>
        </div>
        <SetStatusChip
          status={resolveSaveStatus(isDirty, isApplied)}
          appliedAtLabel={lastAppliedAt ? formatClock(lastAppliedAt) : undefined}
        />
        <div className="slp__actions">
          <SetButton
            variant={savedFlash ? 'ok' : 'primary'}
            icon={savedFlash ? <IconCheck /> : <IconSave />}
            onClick={handleSave}
          >
            {savedFlash ? '저장됨' : '저장'}
          </SetButton>

          {/*
            두 종류를 섞지 않는다 — 담는 것이 다르다(settingsStorage.ts «파일 입출력»).
              시나리오 …  지금 이 시나리오 하나. 남에게 건네주는 단위.
              백업     …  저장된 시나리오 전부 + 공통 설정. 기기 이전·복구용.
            예전 "내보내기/가져오기"는 실제로는 백업이었는데 이름이 그렇게 읽히지
            않아, 시나리오 하나를 주고받으려던 사람이 남의 설정을 통째로 덮었다.
          */}
          <SetMenu label="설정 파일 더보기">
            {close => (
              <>
                <SetMenuItem icon={<IconExport />} onClick={() => { close(); handleExportScenario(); }}>
                  이 시나리오 내보내기
                </SetMenuItem>
                <SetMenuItem icon={<IconImport />} onClick={() => { close(); scenarioInputRef.current?.click(); }}>
                  시나리오 가져오기
                </SetMenuItem>
                <SetMenuSeparator />
                <SetMenuItem icon={<IconExport />} onClick={() => { close(); exportSettings(); }}>
                  전체 백업 (시나리오 전부 + 전체 설정)
                </SetMenuItem>
                <SetMenuItem icon={<IconImport />} danger onClick={() => { close(); handleRestoreClick(); }}>
                  백업에서 복원 (현재 내용 대체)
                </SetMenuItem>
                <SetMenuSeparator />
                <SetMenuItem icon={<IconReset />} danger onClick={() => { close(); handleNew(); }}>
                  신규 작성 (전체 초기화)
                </SetMenuItem>
              </>
            )}
          </SetMenu>

          <input
            ref={scenarioInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleScenarioFile}
          />
          <input
            ref={backupInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleBackupFile}
          />
        </div>
      </div>

      {/* ── 다른 이름으로 저장 ── */}
      {showSaveAs && (
        <div className="slp__save-as-row">
          <input
            className="slp__name-input"
            placeholder="새 이름 입력"
            aria-label="새 설정 이름"
            value={saveAsName}
            onChange={e => setSaveAsName(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') handleSaveAs();
              if (e.key === 'Escape') setShowSaveAs(false);
            }}
            autoFocus
          />
          <SetButton variant="primary" onClick={handleSaveAs} disabled={!saveAsName.trim()}>
            저장
          </SetButton>
          <SetButton variant="ghost" onClick={() => setShowSaveAs(false)}>
            취소
          </SetButton>
        </div>
      )}

      {/* ── 삭제 되돌리기 토스트(§7.4 F-4). 여러 개면 아래에서부터 쌓는다 ── */}
      {pendingDeletes.size > 0 && (
        <div className="slp__toast-stack">
          {[...pendingDeletes.values()].map(set => (
            <SetToast
              key={set.id}
              text={`"${set.name}" 삭제됨`}
              actionLabel="되돌리기"
              onAction={() => undoDelete(set.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
