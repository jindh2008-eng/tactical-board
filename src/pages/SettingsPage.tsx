import { useSettings }          from '../store/settingsStore';
import { BuildingConfigPanel }  from '../components/building/BuildingConfigPanel';
import { SettingsLibraryPanel } from '../components/settings/SettingsLibraryPanel';
import { HydrantSetupPanel }    from '../components/settings/HydrantSetupPanel';
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
    updateFireStatus,
    updateTargetName,
    timing,
    updateTiming,
    fireSuppressionConfig,
    updateFireSuppressionConfig,
    aerialSuppressionConfig,
    updateAerialSuppressionConfig,
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
          fireStatus={building.fireStatus}
          onFireStatusChange={updateFireStatus}
          targetName={building.targetName}
          onTargetNameChange={updateTargetName}
        />
      </section>

      {/* ── 소화전 설정 ───────────────────────── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">소화전 설정</h3>
        <p className="settings-page__hint">
          실행 시 초기 배치할 소화전 목록을 사전에 입력합니다.
        </p>
        <HydrantSetupPanel />
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

      {/* ── 화재 소화 설정 ────────────────────── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">화재 소화 설정</h3>
        <p className="settings-page__hint">
          진압대 방수 시 화재 단계 전환 임계치를 설정합니다.
          100% 방수 기준 초당 포인트가 누적되어 임계치 도달 시 다음 단계로 전환됩니다.
        </p>
        <div className="settings-page__timing-row">
          <label className="settings-page__timing-label">
            초당 소화포인트 (100% 방수)
            <input
              className="settings-page__timing-input"
              type="number"
              min={0.1}
              step={0.1}
              value={fireSuppressionConfig.ptsPerSec}
              onChange={e => {
                const v = Math.max(0.1, parseFloat(e.target.value) || 0.1);
                updateFireSuppressionConfig({ ptsPerSec: v });
              }}
            />
          </label>
        </div>
        <div className="settings-page__timing-row">
          <label className="settings-page__timing-label">
            연소확대 → 최성기 임계치 (pt)
            <input
              className="settings-page__timing-input"
              type="number"
              min={1}
              value={fireSuppressionConfig.thresholds['extension-peak']}
              onChange={e => {
                const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                updateFireSuppressionConfig({ thresholds: { ...fireSuppressionConfig.thresholds, 'extension-peak': v } });
              }}
            />
          </label>
          <label className="settings-page__timing-label">
            최성기 → 70% 임계치 (pt)
            <input
              className="settings-page__timing-input"
              type="number"
              min={1}
              value={fireSuppressionConfig.thresholds['peak']}
              onChange={e => {
                const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                updateFireSuppressionConfig({ thresholds: { ...fireSuppressionConfig.thresholds, 'peak': v } });
              }}
            />
          </label>
        </div>
        <div className="settings-page__timing-row">
          <label className="settings-page__timing-label">
            70% → 50% 임계치 (pt)
            <input
              className="settings-page__timing-input"
              type="number"
              min={1}
              value={fireSuppressionConfig.thresholds['seventy']}
              onChange={e => {
                const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                updateFireSuppressionConfig({ thresholds: { ...fireSuppressionConfig.thresholds, 'seventy': v } });
              }}
            />
          </label>
          <label className="settings-page__timing-label">
            50% → 초진 임계치 (pt)
            <input
              className="settings-page__timing-input"
              type="number"
              min={1}
              value={fireSuppressionConfig.thresholds['half']}
              onChange={e => {
                const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                updateFireSuppressionConfig({ thresholds: { ...fireSuppressionConfig.thresholds, 'half': v } });
              }}
            />
          </label>
        </div>
      </section>

      {/* ── 고가차/굴절차 소화포인트 설정 ──────────────── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">고가차/굴절차 소화포인트 설정</h3>
        <p className="settings-page__hint">
          고가차·굴절차 방수 시 진압대 소화포인트 대비 배율을 단계별로 설정합니다.
        </p>
        <div className="settings-page__timing-row">
          <label className="settings-page__timing-label">
            연소확대 → 최성기 배율
            <input className="settings-page__timing-input" type="number" min={0.01} step={0.1}
              value={aerialSuppressionConfig.multipliers['extension-peak']}
              onChange={e => {
                const v = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                updateAerialSuppressionConfig({ multipliers: { ...aerialSuppressionConfig.multipliers, 'extension-peak': v } });
              }} />
          </label>
          <label className="settings-page__timing-label">
            최성기 → 70% 배율
            <input className="settings-page__timing-input" type="number" min={0.01} step={0.1}
              value={aerialSuppressionConfig.multipliers['peak']}
              onChange={e => {
                const v = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                updateAerialSuppressionConfig({ multipliers: { ...aerialSuppressionConfig.multipliers, 'peak': v } });
              }} />
          </label>
        </div>
        <div className="settings-page__timing-row">
          <label className="settings-page__timing-label">
            70% → 50% 배율
            <input className="settings-page__timing-input" type="number" min={0.01} step={0.01}
              value={aerialSuppressionConfig.multipliers['seventy']}
              onChange={e => {
                const v = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                updateAerialSuppressionConfig({ multipliers: { ...aerialSuppressionConfig.multipliers, 'seventy': v } });
              }} />
          </label>
          <label className="settings-page__timing-label">
            50% → 초진 배율
            <input className="settings-page__timing-input" type="number" min={0.01} step={0.01}
              value={aerialSuppressionConfig.multipliers['half']}
              onChange={e => {
                const v = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                updateAerialSuppressionConfig({ multipliers: { ...aerialSuppressionConfig.multipliers, 'half': v } });
              }} />
          </label>
        </div>
      </section>
    </div>
  );
}
