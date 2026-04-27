import { DispatchPanel }      from '../panels/DispatchPanel';
import { VictimSectionPanel } from '../panels/VictimSectionPanel';
import './LeftPanel.css';

interface LeftPanelProps {
  visible: boolean;
  onToggle: () => void;
}

export function LeftPanel({ visible, onToggle }: LeftPanelProps) {
  if (!visible) {
    return (
      <aside className="left-panel left-panel--collapsed">
        <button className="left-panel__expand-btn" onClick={onToggle} title="좌측 패널 펼치기">
          ▶
        </button>
      </aside>
    );
  }

  return (
    <aside className="left-panel">
      <DispatchPanel />
      <VictimSectionPanel />
      <button className="left-panel__collapse-btn" onClick={onToggle} title="좌측 패널 접기">
        ◀
      </button>
    </aside>
  );
}
