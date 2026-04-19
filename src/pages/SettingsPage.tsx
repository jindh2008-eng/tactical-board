import { useSettings }          from '../store/settingsStore';
import { BuildingConfigPanel }  from '../components/building/BuildingConfigPanel';
import { SettingsLibraryPanel } from '../components/settings/SettingsLibraryPanel';
import { SharedPresetPanel }    from '../components/settings/SharedPresetPanel';
import { UnitPresetPanel }      from '../components/settings/UnitPresetPanel';
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

      {/* ── 출동대 기본 설정 ──────────────────── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">출동대 기본 설정</h3>
        <p className="settings-page__placeholder">추후 확장 예정 — 진압/구조/구급 기본 생성 옵션</p>
      </section>

      {/* ── 구조대상자 설정 ───────────────────── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">구조대상자 설정</h3>
        <p className="settings-page__placeholder">추후 확장 예정 — 랜덤 생성 옵션 · 상태 목록 관리</p>
      </section>
    </div>
  );
}
