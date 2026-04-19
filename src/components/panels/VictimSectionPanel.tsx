import { VictimCreator } from '../left/VictimCreator';
import { VictimPanel }   from '../left/VictimPanel';
import '../left/LeftPanel.css';

/**
 * VictimSectionPanel — 구조대상자 패널
 *
 * 구조대상자 생성 + 현황을 하나로 묶는 컴포지션 컴포넌트.
 * 기존 left/VictimCreator·VictimPanel 을 그대로 조합.
 */
export function VictimSectionPanel() {
  return (
    <div className="left-panel__section left-panel__section--victim">
      <VictimCreator />
      <VictimPanel />
    </div>
  );
}
