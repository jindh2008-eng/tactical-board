import { CommandInfo } from './CommandInfo';
import { LogPanel } from './LogPanel';
import './RightPanel.css';

export function RightPanel() {
  return (
    <aside className="right-panel">
      <CommandInfo />
      <LogPanel />
    </aside>
  );
}
