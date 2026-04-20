import { useTokens } from '../../context/TokenContext';
import './LogPanel.css';

// ─────────────────────────────────────────────
// 구역 키 → 한글 레이블 변환
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
  left:   '단위지휘관',
  center: '중앙',
  right:  '화재상황',
  stair:  '계단실',
};

function zoneLabel(zoneId: string): string {
  if (STATIC_LABELS[zoneId]) return STATIC_LABELS[zoneId];
  // "3F-left", "B1-center" 등 파싱
  const dashIdx = zoneId.lastIndexOf('-');
  if (dashIdx > 0) {
    const floor = zoneId.slice(0, dashIdx);
    const zone  = zoneId.slice(dashIdx + 1);
    if (ZONE_NAMES[zone]) return `${floor} ${ZONE_NAMES[zone]}`;
  }
  return zoneId;
}

// ─────────────────────────────────────────────
// LogPanel
// ─────────────────────────────────────────────

export function LogPanel() {
  const { logs } = useTokens();

  return (
    <div className="panel log-panel">
      <div className="panel__header">이동 로그</div>
      <div className="log-panel__body">
        {logs.length === 0 ? (
          <span className="log-panel__empty">로그가 없습니다.</span>
        ) : (
          logs.map(entry => (
            <div key={entry.id} className="log-panel__entry">
              <span className="log-panel__time">{entry.timestamp}</span>
              <span className={[
                'log-panel__token',
                entry.tokenColor ? `log-panel__token--${entry.tokenColor}` : '',
              ].filter(Boolean).join(' ')}>
                {entry.tokenName}
              </span>
              {entry.logType === 'rescue' ? (
                <span className="log-panel__rescue-note">{entry.note}</span>
              ) : (
                <>
                  <span className="log-panel__route">
                    {zoneLabel(entry.fromZoneId)} → {zoneLabel(entry.toZoneId)}
                  </span>
                  {entry.note && (
                    <span className="log-panel__note">{entry.note}</span>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
