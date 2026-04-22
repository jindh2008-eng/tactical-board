import { useState }           from 'react';
import { useSettings }        from '../store/settingsStore';
import { TokenProvider }      from '../context/TokenContext';
import { VictimProvider }     from '../context/VictimContext';
import { DispatchPanel }      from '../components/panels/DispatchPanel';
import { VictimSectionPanel } from '../components/panels/VictimSectionPanel';
import { TacticalArea }       from '../components/building/TacticalArea';
import { RightPanel }         from '../components/right/RightPanel';
import { clearRuntimeSession } from '../utils/runtimeSession';
import './PlayPage.css';

/**
 * PlayPage — 전술 상황 실행 페이지 (/play)
 *
 * [runKey] 를 바꾸면 TokenProvider + VictimProvider 가 완전히 언마운트·재마운트되어
 * sessionStorage 없는 clean 상태로 다시 초기화된다.
 * "새 훈련 시작" 버튼은 sessionStorage를 지운 뒤 runKey 를 증가시킨다.
 */
export function PlayPage() {
  const { building, timing, dispatchRoster, victimSetup } = useSettings();
  const [runKey, setRunKey] = useState(0);

  function handleNewTraining() {
    if (!window.confirm(
      '현재 진행 중인 훈련 상태를 초기화하고 새로 시작하시겠습니까?\n\n' +
      '(설정에 저장된 내용은 유지됩니다.)',
    )) return;
    clearRuntimeSession();
    setRunKey(k => k + 1);
  }

  return (
    <div className="play-page">
      {/* ── 상단 바 ── */}
      <header className="play-topbar">
        <span className="play-topbar__title">
          {building.targetName || '전술상황판'}
        </span>
        <button
          className="play-topbar__reset-btn"
          type="button"
          onClick={handleNewTraining}
          title="진행 상태를 초기화하고 설정 기준으로 새 훈련을 시작"
        >
          새 훈련 시작
        </button>
      </header>

      {/* ── 본문: Provider 감싸기 — key 변경 시 완전 재마운트 ── */}
      <TokenProvider
        key={runKey}
        timingConfig={{ rescueTimeSec: timing.rescueTimeSec, moveTimeSec: timing.moveTimeSec }}
        initialRoster={dispatchRoster}
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
    </div>
  );
}
