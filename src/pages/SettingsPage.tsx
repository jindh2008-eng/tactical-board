import { useEffect, useState }   from 'react';
import { useSettings }           from '../store/settingsStore';
import { BuildingConfigPanel }   from '../components/building/BuildingConfigPanel';
import { BuildingPreview }       from '../components/building/BuildingPreview';
import { SetCard }               from '../components/settings/ui';
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

interface NavItem {
  key: SettingsSection;
  label: string;
  /** 위쪽에 구분선을 긋는다 — 성격이 바뀌는 지점에만 쓴다 */
  divider?: boolean;
}

/**
 * 시나리오 — 파일 하나로 저장되는 내용.
 * 상단 파일 바가 관장하는 범위가 정확히 여기까지다.
 *
 * 그룹 라벨(현장 / 자원 / 진행 / 검토)은 걷어냈다. 공통 설정을 아래로
 * 내보내고 나니 여섯 항목이 3 / 1 / 1 / 1 로 남았는데, **한 개짜리 묶음은
 * 묶음이 아니다** — 라벨이 정보를 주지 않고 자리만 먹었다.
 * 위아래 순서가 이미 권장 작업 순서를 말해 주므로 번호도 함께 뺐다.
 */
const SCENARIO_ITEMS: NavItem[] = [
  { key: 'building',  label: '건물 · 소방시설' },
  { key: 'event',     label: '현장요소' },
  { key: 'victim',    label: '구조대상자' },
  { key: 'dispatch',  label: '출동대' },
  // 체크리스트는 여기 없다 — 우측 고정 레일로 옮겼다. 화면 하나가 아니라
  // 시나리오 작성의 축이라, 다른 화면을 편집하는 내내 옆에 떠 있어야 한다.
  // 항목 타입(도착·화재·출동대·구조대상자)이 바로 그 화면들을 참조하기 때문이다.
  //
  // 여기서 성격이 바뀐다 — 위 넷은 입력 화면이고 준비도 집계 대상이지만
  // 시나리오 예측은 읽기 전용 검토 화면이라 집계에서 빠진다(SCENARIO_KEYS).
  { key: 'predict',   label: '시나리오 예측', divider: true },
];

/**
 * 공통 설정 — 모든 시나리오에 적용되고 파일에 저장되지 않는다.
 *
 * 코드는 이미 이렇게 동작하고 있었다. `settingsStore.tsx` 의 `loadSettings`·
 * `newSettings` 가 이 셋만 건드리지 않는다 — 시나리오를 바꿔도 유지된다는 뜻이다.
 * 그런데 사이드바에서는 시나리오 화면들과 한 줄로 섞여 있어서, 파일에 저장되는
 * 것처럼 보였다. 위치로 구분한다.
 *
 * 이쪽에는 라벨을 남겼다 — 시나리오 쪽 그룹 라벨과 달리 이 라벨은 묶음 이름이
 * 아니라 **규칙**을 말한다("모든 시나리오 공통"). 없으면 왜 따로 떨어져 있는지
 * 알 방법이 없다.
 */
const GLOBAL_ITEMS: NavItem[] = [
  { key: 'commandprocedure', label: '지휘절차' },
  { key: 'unitstatus',       label: '상태 메시지' },
  { key: 'tagpreset',        label: '임무 · 상태 프리셋' },
];

/** 준비도 계산에 쓰는 readiness map의 키. 시나리오 예측은 검토 화면이라 대상이 아니다 */
const READINESS_KEY: Partial<Record<SettingsSection, keyof ReturnType<typeof computeReadiness>>> = {
  building: 'building', event: 'event', victim: 'victim',
  dispatch: 'dispatch', tagpreset: 'tagpreset', unitstatus: 'unitstatus',
  checklist: 'checklist', commandprocedure: 'commandprocedure',
};

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
  const [section, setSection] = useState<SettingsSection>('building');

  /*
   * 레일 펼침 상태.
   *
   * 초기값을 matchMedia 로 잡는다 — 1850px 미만에서는 레일이 본문 위에 겹쳐
   * 뜨므로 처음부터 펼쳐 두면 편집 화면을 가린다. 이펙트로 처리하지 않는 이유는
   * 첫 렌더에 펼쳐졌다가 접히는 깜빡임을 만들지 않기 위해서다.
   */
  const [railOpen, setRailOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 1850px)').matches,
  );

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
    arrivalMode,
    updateArrivalMode,
    updateRosterArrival,
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

  const renderItem = (item: NavItem) => {
    const r = READINESS_KEY[item.key] && readiness[READINESS_KEY[item.key]!];
    return (
      <div
        key={item.key}
        className={`settings-page__nav-row${item.divider ? ' settings-page__nav-row--divided' : ''}`}
      >
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
  };

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
            {SCENARIO_ITEMS.map(item => renderItem(item))}
          </div>

          {/*
            준비도는 공통 설정 **위**에 둔다. 이 숫자는 시나리오 화면 5개만
            세므로(scenarioReadiness.SCENARIO_KEYS), 공통 설정 아래에 두면
            어느 쪽을 요약한 값인지 읽히지 않는다.
          */}
          <div className="settings-page__readiness">
            <div className="settings-page__readiness-row">
              <span className="settings-page__readiness-label">시나리오 준비도</span>
              <span className={`settings-page__readiness-count${done === total ? ' settings-page__readiness-count--done' : ''}`}>
                {done} / {total}
              </span>
            </div>
            <div className="settings-page__readiness-bar">
              <div className="settings-page__readiness-bar-fill" style={{ width: `${(done / total) * 100}%` }} />
            </div>
            {firstWarning && <div className="settings-page__readiness-warn">{firstWarning}</div>}
          </div>

          <div className="settings-page__nav-global">
            <div className="settings-page__nav-global-label">
              전체 설정
              <span className="settings-page__nav-global-note">모든 시나리오 공통</span>
            </div>
            {GLOBAL_ITEMS.map(item => renderItem(item))}
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
                <BuildingConfigPanel
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
                  /* 옥외소화전 — 예전 "소화전 설정" 화면. 소방시설 열 안에 들어간다 */
                  facilityExtra={<HydrantSetupPanel />}
                />
              </section>
            )}

            {/* 2열 배치는 패널이 스스로 한다(.esp) — 격자와 폼이 서로 상태를 공유해서다 */}
            {section === 'event' && (
              <section className="settings-page__section">
                <EventSetupPanel />
              </section>
            )}

            {/*
              건물 · 소방시설과 같은 2열 골격이다 — 좌: 입력 표 / 우: 요약 + 미리보기.
              같은 성격의 화면(무언가를 등록하고 그 결과를 확인)이라 골격을 맞춘다.
            */}
            {section === 'victim' && (
              <section className="settings-page__section settings-page__section--split">
                <div className="settings-page__split-main">
                  <VictimSetupPanel />
                </div>
                <div className="settings-page__split-side">
                  <SetCard title="미리보기" meta="훈련 상황판 배치">
                    <BuildingPreview
                      config={building.config}
                      fireFloor={building.fireFloor}
                      fireStatus={building.fireStatus}
                      extraFireFloors={building.extraFireFloors ?? []}
                      hasSiamesePipe={building.hasSiamesePipe ?? false}
                      hasIndoorHydrant={building.hasIndoorHydrant ?? false}
                      boardColumnRatio={boardColumnRatio}
                      victims={victimSetup}
                    />
                  </SetCard>
                  <SetCard title="배치 현황" meta={`${victimSetup.length}명`}>
                    <VictimFloorAside victims={victimSetup} />
                  </SetCard>
                </div>
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

                {/*
                  도착 순서 — 방식 선택을 이 카드 머리에 둔다.
                  방식이 바꾸는 것이 이 카드의 내용(착대만 보일지, 시간까지
                  고를지)이라 여기 있어야 무엇을 바꾸는 스위치인지 보인다.
                  예전에는 화면 맨 위에 있어서 한참 아래의 이 목록과 이어지지 않았다.
                */}
                <div className="settings-page__card">
                  <div className="settings-page__card-head">
                    <span className="settings-page__card-title">도착 순서</span>
                    <div className="settings-page__arrival-mode">
                      {(['order', 'time'] as const).map(m => (
                        <label key={m} className="settings-page__arrival-radio">
                          <input
                            type="radio"
                            name="arrivalMode"
                            value={m}
                            checked={arrivalMode === m}
                            onChange={() => updateArrivalMode(m)}
                          />
                          {m === 'order' ? '착대설정' : '시간설정'}
                        </label>
                      ))}
                    </div>
                  </div>
                  <DispatchArrivalAside
                    roster={dispatchRoster}
                    arrivalMode={arrivalMode}
                    onOrderTime={(order, minutes) => {
                      // 같은 착대는 함께 오는 것이 정의라 그 착대 전부에 같은 값을 쓴다
                      for (const item of dispatchRoster) {
                        if ((item.arrivalOrder ?? 1) === order) {
                          updateRosterArrival(item.id, minutes * 60);
                        }
                      }
                    }}
                  />
                </div>
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

        {/*
          ── 시나리오 레일 (체크리스트) ──────────────────────────────

          **조건부 렌더가 아니다.** `section` 이 무엇이든 이 자리에 항상 같은
          모양으로 남는다 — 언마운트되는 순간 스크롤 위치가 사라지기 때문이다.
          체크리스트를 쓰다가 출동대를 눌러 확인하고 돌아왔을 때 보고 있던
          항목이 그대로여야 한다는 것이 이 레일의 존재 이유 자체다.

          접기도 같은 이유로 `display:none` 이 아니라 **바깥 폭을 줄이고
          overflow 로 자르는** 방식이다. display:none 은 스크롤 컨테이너의
          scrollTop 을 날린다. 안쪽(--body)은 항상 같은 폭으로 살아 있다.

          시나리오 예측일 때도 마찬가지로 접기만 한다(언마운트하지 않는다).
        */}
        <aside
          className={`settings-page__rail${railOpen && section !== 'predict' ? '' : ' settings-page__rail--collapsed'}`}
        >
          <button
            className="settings-page__rail-toggle"
            onClick={() => setRailOpen(o => !o)}
            aria-expanded={railOpen && section !== 'predict'}
            aria-label={railOpen ? '시나리오 패널 접기' : '시나리오 패널 펼치기'}
            disabled={section === 'predict'}
            title={section === 'predict' ? '시나리오 예측 화면에서는 사용할 수 없습니다' : undefined}
          >
            <span className="settings-page__rail-toggle-icon" aria-hidden="true">
              {railOpen && section !== 'predict' ? '›' : '‹'}
            </span>
            <span className="settings-page__rail-toggle-label" aria-hidden="true">시나리오</span>
          </button>

          <div className="settings-page__rail-body">
            <div className="settings-page__rail-head">
              <span className="settings-page__rail-title">시나리오</span>
              <span className="settings-page__rail-meta">
                {checklistConfig.sections.length}개 절 · {checklistItemCount}개 항목
              </span>
            </div>
            <div className="settings-page__rail-scroll">
              {/* 예전 보조 열의 「항목 타입」 범례 — 체크리스트 옆이 원래 자리다 */}
              <ChecklistLegendAside
                sectionCount={checklistConfig.sections.length}
                itemCount={checklistItemCount}
              />
              <ChecklistSetupPanel />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
