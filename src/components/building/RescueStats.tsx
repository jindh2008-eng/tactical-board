import type { ReactNode } from 'react';
import { useVictims } from '../../context/VictimContext';
import type { VictimToken, VictimCondition } from '../../types/victim';
import { zoneKeyToLabel } from '../../utils/victimUtils';
import './RescueStats.css';

// ─────────────────────────────────────────────
// 구조활동통계 — 임시의료소 내 구조대상자 요약
// 구역(층/방면) × 증상 교차표로 표시.
//
// props.victims 미지정 시 context에서 자동 필터링 (medical-post).
// ─────────────────────────────────────────────

// 열 순서 — 존재하는 증상만 이 순서대로 표시
const CONDITION_ORDER: VictimCondition[] = ['중상', '경상', '사망'];

/** 그룹 토큰은 groupCount 실인원으로, 개별은 1명으로 계산 */
function tokenCount(v: VictimToken): number {
  return v.kind === 'group' ? (v.groupCount ?? 2) : 1;
}

// 저장된 위치 문자열("1F 중앙", "B1 계단", "옥상", "A면 / 상세위치" 등)에서
// 표 행 라벨("1층", "B1층", "옥상", "A면")만 추출
function rowLabelFromLocation(location: string): string {
  const floorM = location.match(/^(\d+)F\b/);
  if (floorM) return `${floorM[1]}층`;
  const basementM = location.match(/^B(\d+)\b/);
  if (basementM) return `B${basementM[1]}층`;
  if (location.startsWith('옥상')) return '옥상';
  const faceM = location.match(/^([A-D])면\b/);
  if (faceM) return `${faceM[1]}면`;
  return location;
}

// 행 정렬: 지하(내림차순 깊이) → 지상층(오름차순) → 옥상 → A/B/C/D면 → 기타
function rowSortKey(label: string): number {
  const floorM = label.match(/^(\d+)층$/);
  if (floorM) return Number(floorM[1]);
  const basementM = label.match(/^B(\d+)층$/);
  if (basementM) return -Number(basementM[1]);
  if (label === '옥상') return 9000;
  const faceM = label.match(/^([A-D])면$/);
  if (faceM) return 9100 + faceM[1].charCodeAt(0);
  return 9999;
}

interface Props {
  victims?: VictimToken[];
  extraHeaderAction?: ReactNode;
}

export function RescueStats({ victims: propVictims, extraHeaderAction }: Props) {
  const { victims: ctxVictims } = useVictims();
  const victims = propVictims ?? ctxVictims.filter(v => v.zoneKey === 'medical-post');

  const total = victims.reduce((sum, v) => sum + tokenCount(v), 0);

  // 행(위치) × 열(증상) 교차 집계
  const table = new Map<string, Map<VictimCondition, number>>();
  const colTotals = new Map<VictimCondition, number>();
  for (const v of victims) {
    if (!v.condition) continue; // 증상 미지정 — 교차표에서 제외(기존 동작과 동일)
    const rawLocation = v.rescueLocation || zoneKeyToLabel(v.zoneKey) || '위치미상';
    const rowLabel     = rowLabelFromLocation(rawLocation);
    const cond          = v.condition;
    const n              = tokenCount(v);

    if (!table.has(rowLabel)) table.set(rowLabel, new Map());
    const row = table.get(rowLabel)!;
    row.set(cond, (row.get(cond) ?? 0) + n);
    colTotals.set(cond, (colTotals.get(cond) ?? 0) + n);
  }

  const columns = CONDITION_ORDER.filter(c => (colTotals.get(c) ?? 0) > 0);
  const rows = [...table.keys()].sort((a, b) => rowSortKey(a) - rowSortKey(b));

  return (
    <div className="rescue-stats">
      <div className="rescue-stats__header">
        <span className="rescue-stats__title">구조활동통계</span>
        <span className="rescue-stats__total">{total}명</span>
        {extraHeaderAction}
      </div>

      <div className="rescue-stats__body">
        {total === 0 ? (
          <div className="rescue-stats__empty">구조된 대상자 없음</div>
        ) : (
          <table className="rescue-stats__table">
            <thead>
              <tr>
                <th className="rescue-stats__th rescue-stats__th--loc">층구분</th>
                {columns.map(c => (
                  <th key={c} className="rescue-stats__th">{c}</th>
                ))}
                <th className="rescue-stats__th">합계</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(rowLabel => {
                const row      = table.get(rowLabel)!;
                const rowTotal = columns.reduce((sum, c) => sum + (row.get(c) ?? 0), 0);
                return (
                  <tr key={rowLabel}>
                    <td className="rescue-stats__td rescue-stats__td--loc">{rowLabel}</td>
                    {columns.map(c => (
                      <td key={c} className="rescue-stats__td">{row.get(c) ?? 0}</td>
                    ))}
                    <td className="rescue-stats__td rescue-stats__td--total">{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="rescue-stats__td rescue-stats__td--loc rescue-stats__td--total">총계</td>
                {columns.map(c => (
                  <td key={c} className="rescue-stats__td rescue-stats__td--total">{colTotals.get(c) ?? 0}</td>
                ))}
                <td className="rescue-stats__td rescue-stats__td--total">{total}명</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
