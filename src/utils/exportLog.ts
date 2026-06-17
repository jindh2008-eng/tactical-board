import type { LogEntry, LogType } from '../types';

// ── 구역 키 → 한글 레이블 (LogPanel과 동일) ──────────────────────────────

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

// ── 로그 유형 → 한글 ─────────────────────────────────────────────────────

const LOG_TYPE_LABELS: Record<LogType, string> = {
  'move':        '이동',
  'assignment':  '부서',
  'rescue':      '구조',
  'fire-status': '화재',
  'status-tag':  '상태',
  'water-relay': '송수',
  'door':         '방화문',
  'smoke':        '연기',
  'event-status': '이벤트',
  'checklist':    '체크리스트',
};

// ── 로그 내용 → 한 줄 텍스트 ─────────────────────────────────────────────

function entryContent(entry: LogEntry): string {
  const { logType, tokenName, fromZoneId, toZoneId, note } = entry;

  if (logType === 'fire-status') return `${tokenName} ${note ?? ''}`.trim();
  if (logType === 'status-tag')  return `${tokenName} ${note ?? ''}`.trim();
  if (logType === 'rescue')      return `${tokenName} ${note ?? ''}`.trim();
  if (logType === 'water-relay') return `송수 ${note ?? ''}`.trim();
  if (logType === 'door')         return `${tokenName} ${note ?? ''}`.trim();
  if (logType === 'smoke')        return `${tokenName} ${note ?? ''}`.trim();
  if (logType === 'event-status') return `${tokenName}, ${note ?? ''}`.trim();

  // move / assignment
  const route = `${tokenName} ${zoneLabel(fromZoneId)} → ${zoneLabel(toZoneId)}`;
  return note ? `${route} (${note})` : route;
}

// ── CSV 셀 이스케이프 ─────────────────────────────────────────────────────

function escapeCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── PDF 인쇄(저장) 함수 ───────────────────────────────────────────────────

export function exportLogsAsPdf(logs: LogEntry[], targetName: string): void {
  if (logs.length === 0) return;

  const today   = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
  const title   = `이벤트 로그 — ${targetName || '훈련'} (${dateStr})`;

  const rows = [...logs].reverse().map(entry => {
    const typeLabel = LOG_TYPE_LABELS[entry.logType] ?? entry.logType;
    const content   = entryContent(entry);
    return `<tr><td class="col-time">${entry.timestamp}</td><td class="col-type">${typeLabel}</td><td class="col-content">${content}</td></tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:10pt;color:#111;background:#fff;padding:16mm 14mm}
h1{font-size:13pt;font-weight:700;margin-bottom:10px;border-bottom:2px solid #333;padding-bottom:6px}
table{width:100%;border-collapse:collapse;margin-top:8px}
thead th{background:#333;color:#fff;padding:5px 8px;text-align:left;font-size:9pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
tbody tr:nth-child(even){background:#f5f5f5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
tbody td{padding:4px 8px;border-bottom:1px solid #ddd;vertical-align:top}
.col-time{white-space:nowrap;width:76px;color:#444}
.col-type{white-space:nowrap;width:68px;font-weight:600}
</style>
</head>
<body>
<h1>${title}</h1>
<table>
<thead><tr><th class="col-time">시간</th><th class="col-type">유형</th><th class="col-content">내용</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=820,height=640');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 300);
}

// ── 메인 내보내기 함수 ────────────────────────────────────────────────────

export function exportLogsAsCsv(logs: LogEntry[], targetName: string): void {
  if (logs.length === 0) return;

  const header = '시간,유형,내용';

  // logs는 최신순(역순)이므로 시간순으로 뒤집어 출력
  const rows = [...logs].reverse().map(entry =>
    [
      escapeCell(entry.timestamp),
      escapeCell(LOG_TYPE_LABELS[entry.logType] ?? entry.logType),
      escapeCell(entryContent(entry)),
    ].join(',')
  );

  const csv = [header, ...rows].join('\n');

  // UTF-8 BOM: 엑셀에서 한글 깨짐 방지
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  const today    = new Date();
  const dateStr  = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const filename = `이벤트로그_${targetName || '훈련'}_${dateStr}.csv`;

  const a = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
