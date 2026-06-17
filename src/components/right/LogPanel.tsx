import type { LogEntry } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
import { exportLogsAsCsv, exportLogsAsPdf } from '../../utils/exportLog';
import './LogPanel.css';

// ─────────────────────────────────────────────
// 구역 키 → 한글 레이블
// ─────────────────────────────────────────────

const STATIC_LABELS: Record<string, string> = {
  pool:               '대기(풀)',
  'medical-post':     '임시의료소',
  'standby-resource': '자원대기소',
  'standby-standby1': '대기1단계',
  'standby-imminent': '직전대기',
  'face-A':           'A면',
  'face-B':           'B면',
  'face-C':           'C면',
  'face-D':           'D면',
};

const ZONE_NAMES: Record<string, string> = {
  left:   '단위',
  center: '내부',
  right:  '화재',
  stair:  '계단실',
};

function zoneLabel(zoneId: string): string {
  if (STATIC_LABELS[zoneId]) return STATIC_LABELS[zoneId];
  const dashIdx = zoneId.lastIndexOf('-');
  if (dashIdx > 0) {
    const floor = zoneId.slice(0, dashIdx);
    const zone  = zoneId.slice(dashIdx + 1);
    if (ZONE_NAMES[zone]) return `${floor} ${ZONE_NAMES[zone]}`;
  }
  return zoneId;
}

// ─────────────────────────────────────────────
// 개별 로그 항목 렌더
// ─────────────────────────────────────────────

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const { logType, tokenName, tokenColor, note } = entry;

  if (logType === 'fire-status') {
    const isRelease = note === '해제';
    return (
      <div className="log-panel__entry log-panel__entry--fire">
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className="log-panel__fire-floor">{tokenName}</span>
        <span className={`log-panel__fire-status${isRelease ? ' log-panel__fire-status--release' : ''}`}>
          {note}
        </span>
      </div>
    );
  }

  if (logType === 'door') {
    const isOpen = note === '개방';
    return (
      <div className={`log-panel__entry log-panel__entry--door${isOpen ? '' : ' log-panel__entry--door-close'}`}>
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className="log-panel__door-name">{tokenName}</span>
        <span className={`log-panel__door-state${isOpen ? '' : ' log-panel__door-state--close'}`}>{note}</span>
      </div>
    );
  }

  if (logType === 'smoke') {
    const isClear = note === '클린존';
    return (
      <div className={`log-panel__entry log-panel__entry--smoke${isClear ? ' log-panel__entry--smoke-clear' : ''}`}>
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className="log-panel__smoke-label">{tokenName}</span>
        <span className={`log-panel__smoke-note${isClear ? ' log-panel__smoke-note--clear' : ''}`}>{note}</span>
      </div>
    );
  }

  if (logType === 'event-status') {
    const isRelease = note === '해제';
    return (
      <div className={`log-panel__entry log-panel__entry--event${isRelease ? ' log-panel__entry--event-release' : ''}`}>
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className="log-panel__event-name">{tokenName}</span>
        <span className={`log-panel__event-status${isRelease ? ' log-panel__event-status--release' : ''}`}>{note}</span>
      </div>
    );
  }

  if (logType === 'water-relay') {
    const isRelease = note?.includes('해제');
    return (
      <div className={`log-panel__entry log-panel__entry--water${isRelease ? ' log-panel__entry--water-release' : ''}`}>
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className="log-panel__water-prefix">송수</span>
        <span className={`log-panel__water-note${isRelease ? ' log-panel__water-note--release' : ''}`}>{note}</span>
      </div>
    );
  }

  if (logType === 'status-tag') {
    const isRelease = note?.includes('해제');
    return (
      <div className="log-panel__entry log-panel__entry--status">
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className={[
          'log-panel__token',
          tokenColor ? `log-panel__token--${tokenColor}` : '',
        ].filter(Boolean).join(' ')}>
          {tokenName}
        </span>
        <span className={`log-panel__status-tag${isRelease ? ' log-panel__status-tag--release' : ''}`}>
          {note}
        </span>
      </div>
    );
  }

  if (logType === 'checklist') {
    return (
      <div className="log-panel__entry log-panel__entry--checklist">
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className="log-panel__checklist-note">{note}</span>
      </div>
    );
  }

  // move / assignment / rescue
  return (
    <div className="log-panel__entry">
      <span className="log-panel__time">{entry.timestamp}</span>
      <span className={[
        'log-panel__token',
        tokenColor ? `log-panel__token--${tokenColor}` : '',
      ].filter(Boolean).join(' ')}>
        {tokenName}
      </span>
      {logType === 'rescue' ? (
        <span className="log-panel__rescue-note">{note}</span>
      ) : (
        <>
          <span className="log-panel__route">
            {zoneLabel(entry.fromZoneId)} → {zoneLabel(entry.toZoneId)}
          </span>
          {note && <span className="log-panel__note">{note}</span>}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// LogPanel
// ─────────────────────────────────────────────

interface LogPanelProps {
  collapsed: boolean;
  onToggle:  () => void;
}

export function LogPanel({ collapsed, onToggle }: LogPanelProps) {
  const { logs }    = useTokens();
  const { building } = useSettings();

  function handleExport(e: React.MouseEvent) {
    e.stopPropagation();
    exportLogsAsCsv(logs, building.targetName ?? '');
  }

  function handlePdfExport(e: React.MouseEvent) {
    e.stopPropagation();
    exportLogsAsPdf(logs, building.targetName ?? '');
  }

  return (
    <div className={`panel log-panel${collapsed ? ' log-panel--collapsed' : ''}`}>
      <div className="panel__header panel__header--toggleable" onClick={onToggle}>
        이벤트 로그
        <div className="log-panel__header-right">
          {logs.length > 0 && (
            <>
              <button
                className="log-panel__export-btn"
                onClick={handlePdfExport}
                title="이벤트 로그를 PDF로 저장"
              >
                ↓ PDF
              </button>
              <button
                className="log-panel__export-btn"
                onClick={handleExport}
                title="이벤트 로그를 CSV로 저장"
              >
                ↓ CSV
              </button>
            </>
          )}
          <span className="panel__toggle-icon">{collapsed ? '▼' : '▲'}</span>
        </div>
      </div>
      {!collapsed && (
        <div className="log-panel__body">
          {logs.length === 0 ? (
            <span className="log-panel__empty">로그가 없습니다.</span>
          ) : (
            logs.map(entry => <LogEntryRow key={entry.id} entry={entry} />)
          )}
        </div>
      )}
    </div>
  );
}
