import { UnitStatus }      from './UnitStatus';
import { UnitStatusPanel } from './UnitStatusPanel';
import { StandbyZone }     from './StandbyZone';
import { VictimCreator }   from './VictimCreator';
import { VictimPanel }     from './VictimPanel';
import './LeftPanel.css';

export function LeftPanel() {
  return (
    <aside className="left-panel">
      {/* ── 출동대 섹션 ───────────────────────── */}
      <div className="left-panel__section left-panel__section--unit">
        {/* 1. 출동대 생성 */}
        <UnitStatus />
        {/* 2. 출동대현황 */}
        <UnitStatusPanel />
        {/* 3. 자원대기소 / 대기1단계 / 직전대기 */}
        <StandbyZone />
      </div>

      {/* ── 구조대상자 섹션 ────────────────────── */}
      <div className="left-panel__section left-panel__section--victim">
        {/* 4. 구조대상자 생성 */}
        <VictimCreator />
        {/* 5. 구조대상자 현황 */}
        <VictimPanel />
      </div>
    </aside>
  );
}
