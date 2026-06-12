import { useState }              from 'react';
import { useSettings }           from '../store/settingsStore';
import { BuildingConfigPanel }   from '../components/building/BuildingConfigPanel';
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
import './SettingsPage.css';

type SettingsSection =
  | 'library' | 'building' | 'hydrant' | 'timing' | 'dispatch' | 'victim' | 'event'
  | 'commandprocedure'
  | 'unitstatus'
  | 'tagpreset'
  | 'checklist'
  | 'predict';

const TRAINING_ITEMS: { key: SettingsSection; label: string }[] = [
  { key: 'library',  label: '설정 관리' },
  { key: 'building', label: '건물 정보' },
  { key: 'hydrant',  label: '소화전 설정' },
  { key: 'timing',   label: '타이밍 설정' },
  { key: 'dispatch', label: '출동대 설정' },
  { key: 'victim',   label: '구조대상자 설정' },
  { key: 'event',    label: '돌발상황' },
];

export function SettingsPage() {
  const [section,          setSection]          = useState<SettingsSection>('library');
  const [trainingExpanded, setTrainingExpanded] = useState(true);

  const {
    building,
    updateBuildingConfig,
    updateFireFloor,
    updateFireStatus,
    updateTargetName,
    timing,
    updateTiming,
    updateExtraFireFloors,
    updateSiamesePipeFaces,
    updateIndoorHydrant,
  } = useSettings();

  return (
    <div className="settings-page">
      <div className="settings-page__layout">
        {/* ── 사이드바 ── */}
        <nav className="settings-page__sidebar">
          {/* 훈련설정 그룹 */}
          <button
            className="settings-page__sidebar-group-header"
            onClick={() => setTrainingExpanded(v => !v)}
          >
            <span className="settings-page__sidebar-group-caret">
              {trainingExpanded ? '▾' : '▸'}
            </span>
            훈련설정
          </button>
          {trainingExpanded && (
            <div className="settings-page__sidebar-group-items">
              {TRAINING_ITEMS.map(item => (
                <button
                  key={item.key}
                  className={`settings-page__sidebar-sub-item${section === item.key ? ' settings-page__sidebar-sub-item--active' : ''}`}
                  onClick={() => setSection(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div className="settings-page__sidebar-divider" />

          <button
            className={`settings-page__sidebar-top-item${section === 'commandprocedure' ? ' settings-page__sidebar-top-item--active' : ''}`}
            onClick={() => setSection('commandprocedure')}
          >
            지휘절차 관리
          </button>

          <button
            className={`settings-page__sidebar-top-item${section === 'unitstatus' ? ' settings-page__sidebar-top-item--active' : ''}`}
            onClick={() => setSection('unitstatus')}
          >
            이벤트 메세지
          </button>

          <button
            className={`settings-page__sidebar-top-item${section === 'tagpreset' ? ' settings-page__sidebar-top-item--active' : ''}`}
            onClick={() => setSection('tagpreset')}
          >
            임무/상태 프리셋
          </button>

          <button
            className={`settings-page__sidebar-top-item${section === 'checklist' ? ' settings-page__sidebar-top-item--active' : ''}`}
            onClick={() => setSection('checklist')}
          >
            시나리오/체크리스트
          </button>

          <button
            className={`settings-page__sidebar-top-item${section === 'predict' ? ' settings-page__sidebar-top-item--active' : ''}`}
            onClick={() => setSection('predict')}
          >
            시나리오 예측
          </button>
        </nav>

        {/* ── 메인 콘텐츠 ── */}
        <div className={`settings-page__main${section === 'predict' ? ' settings-page__main--predict' : ''}`}>

          {section === 'library' && (
            <section className="settings-page__section">
              <h3 className="settings-page__section-title">설정 관리</h3>
              <SettingsLibraryPanel />
            </section>
          )}

          {section === 'building' && (
            <section className="settings-page__section">
              <h3 className="settings-page__section-title">건물 정보</h3>
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
                siamesePipeFaces={building.siamesePipeFaces ?? []}
                onSiamesePipeFacesChange={updateSiamesePipeFaces}
                hasIndoorHydrant={building.hasIndoorHydrant ?? false}
                onIndoorHydrantChange={updateIndoorHydrant}
              />
            </section>
          )}

          {section === 'hydrant' && (
            <section className="settings-page__section">
              <h3 className="settings-page__section-title">소화전 설정</h3>
              <p className="settings-page__hint">
                실행 시 초기 배치할 소화전 목록을 사전에 입력합니다.
              </p>
              <HydrantSetupPanel />
            </section>
          )}

          {section === 'timing' && (
            <section className="settings-page__section">
              <h3 className="settings-page__section-title">타이밍 설정</h3>
              <p className="settings-page__hint">
                출동대 행동에 적용되는 시간(초)입니다. 최소 1초.
              </p>
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
            </section>
          )}

          {section === 'dispatch' && (
            <section className="settings-page__section">
              <h3 className="settings-page__section-title">출동대 설정</h3>
              <p className="settings-page__hint">
                출동대·차량 수량 및 도착 순서를 설정합니다.
                펌프·구조차·구급차는 활동대 수량과 자동 연동됩니다.
              </p>
              <DispatchSetupPanel />
            </section>
          )}


          {section === 'victim' && (
            <section className="settings-page__section">
              <h3 className="settings-page__section-title">구조대상자 설정</h3>
              <p className="settings-page__hint">
                실행 시 초기 배치할 구조대상자 목록을 사전에 입력합니다.
                층 범위는 건물 정보의 층수 설정을 따릅니다.
              </p>
              <VictimSetupPanel />
            </section>
          )}

          {section === 'event' && (
            <section className="settings-page__section">
              <h3 className="settings-page__section-title">돌발상황</h3>
              <p className="settings-page__hint">
                실행창에 표시할 돌발상황 이벤트를 등록합니다. 체크된 항목만 실행창에 표시되며,
                클릭으로 상태(화재·초진·완진·폭발)를 전환할 수 있습니다.
              </p>
              <EventSetupPanel />
            </section>
          )}

          {section === 'commandprocedure' && (
            <section className="settings-page__section">
              <h3 className="settings-page__section-title">지휘절차 관리</h3>
              <p className="settings-page__hint">
                초급·중급·고급 레벨별 지휘절차를 카테고리 단위로 등록합니다.
                훈련창 체크리스트에서 활용됩니다.
              </p>
              <CommandProcedurePanel />
            </section>
          )}

          {section === 'unitstatus' && (
            <section className="settings-page__section">
              <h3 className="settings-page__section-title">이벤트 메세지</h3>
              <UnitStatusPanel />
            </section>
          )}

          {section === 'tagpreset' && (
            <section className="settings-page__section">
              <h3 className="settings-page__section-title">임무/상태 프리셋</h3>
              <p className="settings-page__hint">
                출동대 유형별 임무·상태 태그를 사전에 등록합니다.
                훈련창에서 출동대를 우클릭하면 여기서 설정한 항목이 표시됩니다.
              </p>
              <TagPresetPanel />
            </section>
          )}

          {section === 'checklist' && (
            <section className="settings-page__section">
              <h3 className="settings-page__section-title">시나리오/체크리스트</h3>
              <p className="settings-page__hint">
                훈련창 "진행상황 관리"에서 체크할 절차 목록을 작성합니다.
                섹션 제목을 클릭하면 수정할 수 있습니다.
              </p>
              <ChecklistSetupPanel />
            </section>
          )}

          {section === 'predict' && (
            <ScenarioModal standalone />
          )}
        </div>
      </div>
    </div>
  );
}
