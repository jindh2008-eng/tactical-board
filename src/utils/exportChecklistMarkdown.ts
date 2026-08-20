import type { ChecklistConfig, ChecklistItem, ChecklistItemType, DispatchRosterItem, ArrivalMode } from '../types/settings';
import { computeRosterDisplayName } from './dispatchRoster';

// ─────────────────────────────────────────────
// 시나리오/체크리스트 → 마크다운 내보내기
// AI 검토·전체 흐름 요약용. 섹션·항목 순서는 저장된 배열 순서를 그대로 따른다.
// ─────────────────────────────────────────────

const TYPE_LABELS: Record<ChecklistItemType, string> = {
  procedure: '절차',
  event:     '이벤트',
  arrival:   '도착',
  message:   '메세지',
  fire:      '화재',
  xvr:       'XVR',
  unit:      '출동대',
  incident:  '현장요소',
  victim:    '구조대상자',
};

export interface ChecklistMarkdownContext {
  checklistConfig: ChecklistConfig;
  dispatchRoster:  DispatchRosterItem[];
  targetName:      string;
  fireFloor:       number;
  arrivalMode:     ArrivalMode;
}

// 도착 항목은 텍스트에 착대 순서만 있고 실제 출동대명은 없음 —
// ChecklistPanel.tsx의 실시간 표시와 동일한 방식으로 매번 로스터에서 다시 계산한다.
function arrivalUnitsText(order: number, dispatchRoster: DispatchRosterItem[]): string {
  const units = dispatchRoster
    .filter(r => r.arrivalOrder === order && r.linkedTo === null)
    .map(computeRosterDisplayName);
  return units.length > 0 ? units.join(', ') : '배정된 출동대 없음';
}

function renderItemLines(item: ChecklistItem, dispatchRoster: DispatchRosterItem[], indent: string): string[] {
  const typeLabel = TYPE_LABELS[item.itemType] ?? item.itemType;
  const linkedTag = item.linkedParentId ? ' _(연동)_' : '';

  if (item.itemType === 'arrival') {
    const order = item.arrivalOrder ?? 1;
    const units = arrivalUnitsText(order, dispatchRoster);
    return [`${indent}- [ ] **${typeLabel}**${linkedTag} ${item.text} (${units})`];
  }

  if (item.itemType === 'message') {
    // item.text는 40자로 잘린 제목 요약본 — 실제 전체 내용은 messageTitle/messageBody에 있음
    const title = item.messageTitle ?? item.text;
    const loc   = item.messageLocation ? ` — ${item.messageLocation}` : '';
    const lines = [`${indent}- [ ] **${typeLabel}**${linkedTag} ${title}${loc}`];
    const body = (item.messageBody ?? '').split('\n');
    for (const bodyLine of body) {
      lines.push(`${indent}  > ${bodyLine}`);
    }
    return lines;
  }

  // procedure/event/fire/xvr/unit/incident/victim — 생성 시점에 이미 사람이 읽을 수 있는
  // 형태로 완성된 문자열이 item.text에 저장되어 있으므로 추가 조회 없이 그대로 사용한다.
  return [`${indent}- [ ] **${typeLabel}**${linkedTag} ${item.text}`];
}

export function buildChecklistMarkdown(ctx: ChecklistMarkdownContext): string {
  const totalItems = ctx.checklistConfig.sections.reduce((sum, s) => sum + s.items.length, 0);
  const dateStr = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push(`# 시나리오/체크리스트 — ${dateStr}`);
  lines.push('');
  lines.push('## 시나리오 개요');
  lines.push('');
  lines.push(`- 대상 시설: ${ctx.targetName || '(미지정)'}`);
  lines.push(`- 화재 발생층: ${ctx.fireFloor}층`);
  lines.push(`- 착대 방식: ${ctx.arrivalMode === 'time' ? '시간순' : '착대순서'}`);
  lines.push(`- 총 섹션: ${ctx.checklistConfig.sections.length}개 / 총 항목: ${totalItems}개`);
  lines.push('');

  for (const section of ctx.checklistConfig.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    if (section.items.length === 0) {
      lines.push('_(항목 없음)_');
      lines.push('');
      continue;
    }
    for (const item of section.items) {
      const indent = item.linkedParentId ? '  ' : '';
      lines.push(...renderItemLines(item, ctx.dispatchRoster, indent));
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadChecklistMarkdown(ctx: ChecklistMarkdownContext): void {
  const md   = buildChecklistMarkdown(ctx);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tactical-board-scenario-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
