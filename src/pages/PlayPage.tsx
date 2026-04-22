import { useSettings }        from '../store/settingsStore';
import { useTraining }        from '../context/TrainingContext';
import { TokenProvider }      from '../context/TokenContext';
import { VictimProvider }     from '../context/VictimContext';
import { EventProvider }      from '../context/EventContext';
import { DispatchPanel }      from '../components/panels/DispatchPanel';
import { VictimSectionPanel } from '../components/panels/VictimSectionPanel';
import { TacticalArea }       from '../components/building/TacticalArea';
import { RightPanel }         from '../components/right/RightPanel';
import './PlayPage.css';

/**
 * PlayPage — 전술 상황 실행 페이지 (/play)
 *
 * [runKey] 는 TrainingContext 에서 관리한다.
 *   - "훈련 세팅" 버튼 → TrainingContext.loadSettings() → runKey 증가
 *   → TokenProvider + VictimProvider 완전 재마운트 → clean 상태로 초기화
 *
 * [started] prop:
 *   - false (idle): 출동대 전원 pool 대기, 도착 타이머 미작동
 *   - true (running): 도착 타이머 작동, arrivalSec 경과 시 대기1단계 자동 이동
 */
export function PlayPage() {
  const { building, timing, dispatchRoster, victimSetup, arrivalMode } = useSettings();
  const { runKey, status } = useTraining();

  const started = status === 'running';

  return (
    <div className="play-page">
      {/* ── 본문: Provider 감싸기 — key 변경 시 완전 재마운트 ── */}
      <EventProvider key={runKey}>
      <TokenProvider
        key={runKey}
        timingConfig={{ rescueTimeSec: timing.rescueTimeSec, moveTimeSec: timing.moveTimeSec }}
        initialRoster={dispatchRoster}
        started={started}
        arrivalMode={arrivalMode}
      >
        <VictimProvider
          key={runKey}
          initialVictimSetup={victimSetup}
          buildingConfig={building.config}
          fireFloor={building.fireFloor}
        >
          <div className="app">
            {/* ── 좌측: 출동대 + 구조대상자 ── */}
            <aside className="left-panel">
              <DispatchPanel />
              <VictimSectionPanel />
            </aside>

            {/* ── 중앙: 전술상황판 ── */}
            <div className="center-column">
              <TacticalArea
                config={building.config}
                fireFloor={building.fireFloor}
                stairSmokeStartFloor={building.stairSmokeStartFloor}
              />
            </div>

            {/* ── 우측: 로그·지휘정보 ── */}
            <RightPanel />
          </div>
        </VictimProvider>
      </TokenProvider>
      </EventProvider>
    </div>
  );
}
