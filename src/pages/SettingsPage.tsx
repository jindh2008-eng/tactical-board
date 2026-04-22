import { useSettings }          from '../store/settingsStore';
import { BuildingConfigPanel }  from '../components/building/BuildingConfigPanel';
import { SettingsLibraryPanel } from '../components/settings/SettingsLibraryPanel';
import { SharedPresetPanel }    from '../components/settings/SharedPresetPanel';
import { UnitPresetPanel }      from '../components/settings/UnitPresetPanel';
import { DispatchSetupPanel }   from '../components/settings/DispatchSetupPanel';
import { VictimSetupPanel }     from '../components/settings/VictimSetupPanel';
import { EventSetupPanel }      from '../components/settings/EventSetupPanel';
import './SettingsPage.css';

/**
 * SettingsPage — 설정 편집 전용 페이지 (/settings)
 *
 * 섹션 구성:
 * 1. 설정 관리  — 저장/불러오기/신규작성
 * 2. 건물 정보  — 층수, 화점층, 연기층
 * 3. 출동대 상태 프리셋
 *    A. 공통 프리셋  — 여러 출동대에 공통 적용
 *    B. 출동대별 전용 프리셋 — 종류별 고유 프리셋
 */
export function SettingsPage() {
  const {
    building,
    updateBuildingConfig,
    updateFireFloor,
    updateStairSmoke,
    updateTargetName,
    timing,
    updateTiming,
  } = useSettings();

  return (
    <div className="settings-page">
      <h2 className="settings-page__title">설정</h2>

      {/* ── 설정 관리 ───────────────────────────── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">설정 관리</h3>
        <SettingsLibraryPanel />
      </section>

      {/* ── 건물 정보 ───────────────────────────── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">건물 정보</h3>
        <BuildingConfigPanel
          config={building.config}
          onChange={updateBuildingConfig}
          fireFloor={building.fireFloor}
          onFireFloorChange={updateFireFloor}
          stairSmokeStartFloor={building.stairSmokeStartFloor}
          onStairSmokeChange={updateStairSmoke}
          targetName={building.targetName}
          onTargetNameChange={updateTargetName}
        />
      </section>

      {/* ── 출동대 상태 프리셋 ──────────────────── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">출동대 상태 프리셋</h3>
        <p className="settings-page__hint">
          실행창에서 토큰 우클릭 시 여기서 등록한 프리셋을 선택할 수 있습니다.
          직접 입력한 임시 상태는 이곳에 저장되지 않습니다.
        </p>

        {/* A. 공통 프리셋 */}
        <div className="settings-page__preset-block">
          <h4 className="settings-page__sub-title">A. 공통 프리셋</h4>
          <p className="settings-page__sub-hint">
            여러 출동대에 공통으로 표시할 프리셋입니다. 적용 대상을 체크하거나, 미선택 시 모든 출동대에 표시됩니다.
          </p>
          <SharedPresetPanel />
        </div>

        {/* B. 출동대별 고유 프리셋 */}
        <div className="settings-page__preset-block">
          <h4 className="settings-page__sub-title">B. 출동대별 전용 프리셋</h4>
          <p className="settings-page__sub-hint">
            특정 출동대 종류에만 표시되는 전용 프리셋입니다. 좌측에서 종류를 선택하고 추가하세요.
          </p>
          <UnitPresetPanel />
        </div>
      </section>

      {/* ── 타이밍 설정 ───────────────────────── */}
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

      {/* ── 출동대 생성 설정 ──────────────────── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">출동대 생성 설정</h3>
        <p className="settings-page__hint">
          실행 시 초기 배치할 출동대 수량을 사전에 설정합니다.
          펌프·구조차·구급차는 활동대 수량과 자동 연동됩니다.
        </p>
        <DispatchSetupPanel />
      </section>

      {/* ── 구조대상자 생성 설정 ──────────────── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">구조대상자 생성 설정</h3>
        <p className="settings-page__hint">
          실행 시 초기 배치할 구조대상자 목록을 사전에 입력합니다.
          층 범위는 건물 정보의 층수 설정을 따릅니다.
        </p>
        <VictimSetupPanel />
      </section>

      {/* ── 이벤트 토큰 설정 ──────────────────── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">이벤트 토큰 설정</h3>
        <p className="settings-page__hint">
          실행창에 표시할 이벤트를 등록합니다. 체크된 항목만 실행창에 표시되며,
          클릭으로 상태(화재·초진·완진·폭발)를 전환할 수 있습니다.
        </p>
        <EventSetupPanel />
      </section>
    </div>
  );
}
