import type { LogEntry, LogPart, TokenColor } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
import { exportLogsAsCsv, exportLogsAsPdf } from '../../utils/exportLog';
import { zoneLabel } from '../../utils/logLabels';
import './LogPanel.css';

// ─────────────────────────────────────────────
// 출동대 칩 — 문장 안의 출동대명을 떼어, 판 위 토큰과 같은 색 계열로 그린다.
// 로그를 보고 판에서 그 대를 바로 찾게 하려는 것이다.
// docs/EVENT_LOG_PHRASING_PLAN.md §12
// ─────────────────────────────────────────────

function UnitChip({ text, color }: { text: string; color?: TokenColor }) {
  return <span className={`log-chip log-chip--${color ?? 'none'}`}>{text}</span>;
}

/** 조각이 있으면 출동대는 칩으로 그린다. 없으면(구버전·조각 없는 로그) note 그대로 */
function Sentence({ parts, fallback }: { parts?: LogPart[]; fallback?: string }) {
  if (!parts) return <>{fallback}</>;
  return (
    <>
      {parts.map((p, i) => (p.kind === 'unit'
        ? <UnitChip key={i} text={p.text} color={p.color} />
        : <span key={i}>{p.text}</span>
      ))}
    </>
  );
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
    // 새 형식은 문장이 곧 무전 멘트라(「물탱크1 44호 소화전 점령」) 「송수」 머리말을 붙이지 않는다.
    // 해제 판정도 문구가 아니라 payload 로 한다 — 구버전 저장분만 문자열로 본다
    const relay     = entry.payload?.kind === 'water-relay' ? entry.payload : null;
    const isRelease = relay ? !relay.connected : note?.includes('해제');
    return (
      <div className={`log-panel__entry log-panel__entry--water${isRelease ? ' log-panel__entry--water-release' : ''}`}>
        <span className="log-panel__time">{entry.timestamp}</span>
        {!relay && <span className="log-panel__water-prefix">송수</span>}
        <span className={`log-panel__water-note${isRelease ? ' log-panel__water-note--release' : ''}`}>
          <Sentence parts={entry.parts} fallback={note} />
        </span>
      </div>
    );
  }

  if (logType === 'status-tag') {
    const isRelease = note?.includes('해제');
    return (
      <div className="log-panel__entry log-panel__entry--status">
        <span className="log-panel__time">{entry.timestamp}</span>
        <UnitChip text={tokenName} color={tokenColor} />
        <span className={`log-panel__status-tag${isRelease ? ' log-panel__status-tag--release' : ''}`}>
          {note}
        </span>
      </div>
    );
  }

  if (logType === 'post') {
    return (
      <div className="log-panel__entry log-panel__entry--post">
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className="log-panel__post-note">
          <Sentence parts={entry.parts} fallback={note} />
        </span>
      </div>
    );
  }

  if (logType === 'victim-found') {
    return (
      <div className="log-panel__entry log-panel__entry--found">
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className="log-panel__found-name">{tokenName}</span>
        <span className="log-panel__found-note">{note}</span>
      </div>
    );
  }

  if (logType === 'search') {
    return (
      <div className="log-panel__entry log-panel__entry--search">
        <span className="log-panel__time">{entry.timestamp}</span>
        {tokenName && <span className="log-panel__search-name">{tokenName}</span>}
        <span className="log-panel__search-note">{note}</span>
      </div>
    );
  }

  if (logType === 'dispatch') {
    return (
      <div className="log-panel__entry log-panel__entry--dispatch">
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className="log-panel__dispatch-note">{note}</span>
      </div>
    );
  }

  if (logType === 'training') {
    return (
      <div className="log-panel__entry log-panel__entry--training">
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className="log-panel__training-note">{note}</span>
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

  // 도착·복귀 묶음 — 「대기1단계 도착: [진압1대], [구급1대], [물탱크1]」
  if (logType === 'arrival') {
    return (
      <div className="log-panel__entry log-panel__entry--arrival">
        <span className="log-panel__time">{entry.timestamp}</span>
        <span className="log-panel__sentence">
          <Sentence parts={entry.parts} fallback={note} />
        </span>
      </div>
    );
  }

  // 이동·임무지정 — 새 형식은 note 가 완성된 문장이다(payload.intent). 구버전은 아래에서 경로를 조립한다
  if (logType === 'move' && entry.payload?.kind === 'move' && entry.payload.intent) {
    return (
      <div className="log-panel__entry">
        <span className="log-panel__time">{entry.timestamp}</span>
        {entry.parts ? (
          // 조각이 있으면 이름은 칩이 색을 갖고, 나머지 문장은 중립색이다
          <span className="log-panel__sentence">
            <Sentence parts={entry.parts} />
          </span>
        ) : (
          // 칩 도입 전(2026-09-11) 저장분 — 문장 전체를 토큰 색으로 칠하던 모양 그대로
          <span className={[
            'log-panel__sentence',
            tokenColor ? `log-panel__token--${tokenColor}` : '',
          ].filter(Boolean).join(' ')}>
            {note}
          </span>
        )}
      </div>
    );
  }

  // move(구버전 저장분) / rescue
  return (
    <div className="log-panel__entry">
      <span className="log-panel__time">{entry.timestamp}</span>
      <UnitChip text={tokenName} color={tokenColor} />
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
