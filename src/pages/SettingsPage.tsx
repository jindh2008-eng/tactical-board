import { useEffect, useState }   from 'react';
import { useSettings }           from '../store/settingsStore';
import { BuildingConfigPanel }   from '../components/building/BuildingConfigPanel';
import type { BuildingConfigTab } from '../components/building/BuildingConfigPanel';
import { SettingsLibraryPanel }  from '../components/settings/SettingsLibraryPanel';
import { HydrantSetupPanel }     from '../components/settings/HydrantSetupPanel';
import { DispatchSetupPanel }    from '../components/settings/DispatchSetupPanel';
import { VictimSetupPanel }      from '../components/settings/VictimSetupPanel';
import { EventSetupPanel }       from '../components/settings/EventSetupPanel';
import { ChecklistSetupPanel }   from '../components/settings/ChecklistSetupPanel';
import { CommandProcedurePanel } from '../components/settings/CommandProcedurePanel';
import { UnitStatusPanel }       from '../components/settings/UnitStatusPanel';
import { TagPresetPanel }        from '../components/settings/TagPresetPanel';
import { ScenarioModal }         from '../components/overlays/ScenarioModal';
import { DispatchArrivalAside, VictimFloorAside, ChecklistLegendAside } from '../components/settings/ui/AsideContent';
import { computeReadiness, summarizeReadiness } from '../utils/scenarioReadiness';
import './SettingsPage.css';

/**
 * 설정 화면 구성 — 항목을 "무엇을 정의하는가"로 묶는다.
 *
 *   현장  건물·소방시설 / 현장요소 / 구조대상자
 *   자원  출동대 / 임무·상태 프리셋 / 상태 메시지
 *   진행  체크리스트 / 지휘절차
 *   검토  시나리오 예측
 *
 * 설정 파일 관리(저장·불러오기)는 시나리오 내용이 아니라 그 그릇이므로
 * 사이드바에서 빼고 상단 바에 고정한다 — 어느 화면에서 편집하다가도 저장할 수 있다.
 *
 * 통합한 항목
 *   타이밍 설정 → 출동대 화면의 "행동 시간" 카드
 *   소화전 설정 → 건물·소방시설 화면의 "소방시설" 탭
 *
 * 그룹에 붙은 숫자(1~4)는 저작 순서를 드러낸다 — "무엇을 정의하는가"만으로는
 * 처음 쓰는 사람이 어디서 시작할지 모른다(SETTINGS_MODE_UI_PLAN.md §4.1).
 */
type SettingsSection =
  | 'building' | 'event' | 'victim'
  | 'dispatch' | 'tagpreset' | 'unitstatus'
  | 'checklist' | 'commandprocedure'
  | 'predict';

interface NavGroup {
  step: number;
  label: string;
  items: { key: SettingsSection; label: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    step: 1,
    label: '현장',
    items: [
      { key: 'building', label: '건물 · 소방시설' },
      { key: 'event',    label: '현장요소' },
      { key: 'victim',   label: '구조대상자' },
    ],
  },
  {
    step: 2,
    label: '자원',
    items: [
      { key: 'dispatch',   label: '출동대' },
      { key: 'tagpreset',  label: '임무 · 상태 프리셋' },
      { key: 'unitstatus', label: '상태 메시지' },
    ],
  },
  {
    step: 3,
    label: '진행',
    items: [
      { key: 'checklist',        label: '체크리스트' },
      { key: 'commandprocedure', label: '지휘절차' },
    ],
  },
  {
    step: 4,
    label: '검토',
    items: [
      { key: 'predict', label: '시나리오 예측' },
    ],
  },
];

/** 준비도 계산에 쓰는 readiness map의 키. 시나리오 예측은 검토 화면이라 대상이 아니다 */
const READINESS_KEY: Partial<Record<SettingsSection, keyof ReturnType<typeof computeReadiness>>> = {
  building: 'building', event: 'event', victim: 'victim',
  dispatch: 'dispatch', tagpreset: 'tagpreset', unitstatus: 'unitstatus',
  checklist: 'checklist', commandprocedure: 'commandprocedure',
};

const BUILDING_TABS: { key: BuildingConfigTab; label: string }[] = [
  { key: 'structure', label: '건물 구조' },
  { key: 'fire',      label: '화재 설정' },
  { key: 'facility',  label: '소방시설' },
];

const SECTION_META: Record<SettingsSection, { title: string; hint: string }> = {
  building: {
    title: '건물 · 소방시설',
    hint: '대상 건물의 층수와 화재 상황, 그리고 건물에 딸린 소방시설을 함께 설정합니다.',
  },
  event: {
    title: '현장요소',
    hint: '시나리오에 배치할 현장요소(가스통·탱크로리·전신주 등)를 등록합니다. 체크된 항목만 실행창에 표시되며, 우클릭으로 상태(화재·초진·완진·폭발)를 전환할 수 있습니다.',
  },
  victim: {
    title: '구조대상자',
    hint: '실행 시 초기 배치할 구조대상자 목록을 사전에 입력합니다. 층 범위는 건물 정보의 층수 설정을 따릅니다.',
  },
  dispatch: {
    title: '출동대',
    hint: '출동대·차량 수량과 도착 순서, 그리고 출동대 행동에 적용되는 시간을 설정합니다. 펌프·구조차·구급차는 활동대 수량과 자동 연동됩니다.',
  },
  tagpreset: {
    title: '임무 · 상태 프리셋',
    hint: '출동대 유형별 임무·상태 태그를 사전에 등록합니다. 훈련창에서 출동대를 우클릭하면 여기서 설정한 항목이 표시됩니다.',
  },
  unitstatus: {
    title: '상태 메시지',
    hint: '출동대·장비별 상태메시지를 등록합니다. 훈련 중 무전 내용으로 사용됩니다.',
  },
  checklist: {
    title: '체크리스트',
    hint: '훈련창 "진행상황 관리"에서 체크할 절차 목록을 작성합니다. 섹션 제목을 클릭하면 수정할 수 있습니다.',
  },
  commandprocedure: {
    title: '지휘절차',
    hint: '초급·중급·고급 레벨별 지휘절차를 카테고리 단위로 등록합니다. 훈련 중 무플 화면 우측 패널에 선택한 레벨의 항목이 표시됩니다.',
  },
  predict: { title: '시나리오 예측', hint: '' },
};

export function SettingsPage() {
  const [section,     setSection]     = useState<SettingsSection>('building');
  const [buildingTab, setBuildingTab] = useState<BuildingConfigTab>('structure');

  const settings = useSettings();
  const {
    building,
    updateBuildingConfig,
    updateFireFloor,
    updateFireStatus,
    updateTargetName,
    timing,
    updateTiming,
    updateExtraFireFloors,
    updateSiamesePipe,
    updateIndoorHydrant,
    boardColumnRatio,
    updateBoardColumnRatio,
    dispatchRoster,
    victimSetup,
    checklistConfig,
    isDirty,
  } = settings;

  // 저장 안 된 변경이 있을 때만 이탈을 경고한다(§7.1 F-3).
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const readiness = computeReadiness(settings);
  const { done, total, firstWarning } = summarizeReadiness(readiness);
  const meta = SECTION_META[section];
  const checklistItemCount = checklistConfig.sections.reduce((n, s) => n + s.items.length, 0);

  const aside =
    section === 'dispatch' ? <DispatchArrivalAside roster={dispatchRoster} /> :
    section === 'victim'   ? <VictimFloorAside victims={victimSetup} /> :
    section === 'checklist'
      ? <ChecklistLegendAside sectionCount={checklistConfig.sections.length} itemCount={checklistItemCount} /> :
    null;

  const asideTitle =
    section === 'dispatch' ? '도착 순서' :
    section === 'victim'   ? '층별 분포' :
    section === 'checklist' ? '항목 타입' : '';

  return (
    <div className="settings-page">
      {/* ── 설정 파일 바 — 모든 화면에서 항상 보인다 ── */}
      <div className="settings-page__topbar">
        <SettingsLibraryPanel />
      </div>

      <div className="settings-page__layout">
        {/* ── 사이드바 ── */}
        <nav className="settings-page__sidebar">
          <div className="settings-page__nav-scroll">
            {NAV_GROUPS.map(group => (
              <div key={group.label} className="settings-page__nav-group">
                <div className="settings-page__nav-group-label">
                  <span className="settings-page__nav-step">{group.step}</span>
                  {group.label}
                </div>
                {group.items.map(item => {
                  const r = READINESS_KEY[item.key] && readiness[READINESS_KEY[item.key]!];
                  return (
                    <div key={item.key} className="settings-page__nav-row">
                      <button
                        className={`settings-page__nav-item${section === item.key ? ' settings-page__nav-item--active' : ''}`}
                        onClick={() => setSection(item.key)}
                      >
                        {item.label}
                      </button>
                      {/* 배지는 버튼 밖에 둔다 — 버튼 안에 넣으면 접근성 이름에 배지 문구까지
                          섞여(예: "출동대완료") 버튼의 목적이 흐려진다 */}
                      {r && (
                        <span
                          className={`settings-page__nav-badge${r.ok ? '' : ' settings-page__nav-badge--warn'}`}
                          aria-label={r.ok ? undefined : `${item.label}: ${r.badge}`}
                        >
                          {r.ok ? r.badge : <><span className="settings-page__nav-warn-dot" aria-hidden="true" />{r.badge}</>}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* ── 준비도 요약 — 사이드바 하단 고정(§4.1) ── */}
          <div className="settings-page__readiness">
            <div className="settings-page__readiness-row">
              <span className="settings-page__readiness-label">준비도</span>
              <span className={`settings-page__readiness-count${done === total ? ' settings-page__readiness-count--done' : ''}`}>
                {done} / {total}
              </span>
            </div>
            <div className="settings-page__readiness-bar">
              <div className="settings-page__readiness-bar-fill" style={{ width: `${(done / total) * 100}%` }} />
            </div>
            {firstWarning && <div className="settings-page__readiness-warn">{firstWarning}</div>}
          </div>
        </nav>

        {/* ── 메인 콘텐츠 ── */}
        <div className={`settings-page__main${section === 'predict' ? ' settings-page__main--predict' : ''}`}>
          {section !== 'predict' && (
            <div className="settings-page__main-head">
              <h3 className="settings-page__section-title">{meta.title}</h3>
              <p className="settings-page__hint">{meta.hint}</p>
            </div>
          )}

          <div className="settings-page__main-body">
            {section === 'building' && (
              <section className="settings-page__section">
                <div className="settings-page__tabs">
                  {BUILDING_TABS.map(t => (
                    <button
                      key={t.key}
                      className={`settings-page__tab${buildingTab === t.key ? ' settings-page__tab--active' : ''}`}
                      onClick={() => setBuildingTab(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <BuildingConfigPanel
                  tab={buildingTab}
                  config={building.config}
                  onChange={updateBuildingConfig}
                  fireFloor={building.fireFloor}
                  onFireFloorChange={updateFireFloor}
                  fireStatus={building.fireStatus}
                  onFireStatusChange={updateFireStatus}
                  targetName={building.targetName}
                  onTargetNameChange={updateTargetName}
                  extraFireFloors={building.extraFireFloors ?? []}
                  onExtraFireFloorsChange={updateExtraFireFloors}
                  hasSiamesePipe={building.hasSiamesePipe ?? false}
                  onSiamesePipeChange={updateSiamesePipe}
                  hasIndoorHydrant={building.hasIndoorHydrant ?? false}
                  onIndoorHydrantChange={updateIndoorHydrant}
                  boardColumnRatio={boardColumnRatio}
                  onBoardColumnRatioChange={updateBoardColumnRatio}
                />

                {/* 옥외소화전 — 예전 "소화전 설정" 화면이 여기로 들어왔다 */}
                {buildingTab === 'facility' && (
                  <div className="settings-page__card">
                    <div className="settings-page__card-head">
                      <span className="settings-page__card-title">옥외소화전</span>
                      <span className="settings-page__card-meta">실행 시 초기 배치</span>
                    </div>
                    <HydrantSetupPanel />
                  </div>
                )}
              </section>
            )}

            {section === 'event' && (
              <section className="settings-page__section">
                <EventSetupPanel />
              </section>
            )}

            {section === 'victim' && (
              <section className="settings-page__section">
                <VictimSetupPanel />
              </section>
            )}

            {section === 'dispatch' && (
              <section className="settings-page__section">
                {/* 행동 시간 — 예전 "타이밍 설정" 화면이 여기로 들어왔다 */}
                <div className="settings-page__card">
                  <div className="settings-page__card-head">
                    <span className="settings-page__card-title">행동 시간</span>
                    <span className="settings-page__card-meta">최소 1초</span>
                  </div>
                  <div className="settings-page__timing-row">
                    <label className="settings-page__timing-label">
                      구조 처리 시간(초)
                      <input
                        className="settings-page__timing-input"
                        type="number"
                        min={1}
                        value={timing.rescueTimeSec}
                        onChange={e => {
                          const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                          updateTiming({ rescueTimeSec: v });
                        }}
                      />
                    </label>
                    <label className="settings-page__timing-label">
                      이동 시간(초)
                      <input
                        className="settings-page__timing-input"
                        type="number"
                        min={1}
                        value={timing.moveTimeSec}
                        onChange={e => {
                          const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                          updateTiming({ moveTimeSec: v });
                        }}
                      />
                    </label>
                  </div>
                </div>

                <DispatchSetupPanel />
              </section>
            )}

            {section === 'tagpreset' && (
              <section className="settings-page__section">
                <TagPresetPanel />
              </section>
            )}

            {section === 'unitstatus' && (
              <section className="settings-page__section">
                <UnitStatusPanel />
              </section>
            )}

            {section === 'checklist' && (
              <section className="settings-page__section">
                <ChecklistSetupPanel />
              </section>
            )}

            {section === 'commandprocedure' && (
              <section className="settings-page__section">
                <CommandProcedurePanel />
              </section>
            )}

            {section === 'predict' && (
              <ScenarioModal standalone />
            )}
          </div>
        </div>

        {/* ── 보조 열 — ≥1800px 에서만 보인다. 내용 없는 화면은 렌더하지 않는다(§4.2) ── */}
        {aside && (
          <aside className="settings-page__aside">
            <div className="settings-page__aside-title">{asideTitle}</div>
            {aside}
          </aside>
        )}
      </div>
    </div>
  );
}
