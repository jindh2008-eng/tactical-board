import { useState } from 'react';
import { CommandInfo } from './CommandInfo';
import { LogPanel } from './LogPanel';
import './RightPanel.css';

interface RightPanelProps {
  visible: boolean;
  onToggle: () => void;
}

export function RightPanel({ visible, onToggle }: RightPanelProps) {
  const [showCommand, setShowCommand] = useState(true);
  const [showLog, setShowLog]         = useState(true);

  if (!visible) {
    return (
      <aside className="right-panel right-panel--collapsed">
        <button className="right-panel__expand-btn" onClick={onToggle} title="우측 패널 펼치기">
          ◀
        </button>
      </aside>
    );
  }

  return (
    <aside className="right-panel">
      <CommandInfo
        collapsed={!showCommand}
        onToggle={() => setShowCommand(v => !v)}
      />
      <LogPanel
        collapsed={!showLog}
        onToggle={() => setShowLog(v => !v)}
      />
      <button className="right-panel__collapse-btn" onClick={onToggle} title="우측 패널 접기">
        ▶
      </button>
    </aside>
  );
}
