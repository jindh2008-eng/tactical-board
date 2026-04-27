import { useVictims } from '../../context/VictimContext';
import type { VictimToken, VictimCondition } from '../../types/victim';
import { zoneKeyToLabel } from '../../utils/victimUtils';
import './RescueStats.css';

// ─────────────────────────────────────────────
// 구조활동통계 — 임시의료소 내 구조대상자 요약
//
// props.victims 미지정 시 context에서 자동 필터링 (medical-post).
// 개별 목록 대신 증상별·구역별 숫자 요약만 표시.
// ─────────────────────────────────────────────

const SHOW_CONDITIONS: VictimCondition[] = ['경상', '중상', '사망'];

function condClass(c: VictimCondition | undefined): string {
  switch (c) {
    case '경상': return 'alive';
    case '중상': return 'serious';
    case '사망': return 'dead';
    default:     return 'unknown';
  }
}

/** 그룹 토큰은 groupCount 실인원으로, 개별은 1명으로 계산 */
function tokenCount(v: VictimToken): number {
  return v.kind === 'group' ? (v.groupCount ?? 2) : 1;
}

interface Props {
  victims?: VictimToken[];
}

export function RescueStats({ victims: propVictims }: Props) {
  const { victims: ctxVictims } = useVictims();
  const victims = propVictims ?? ctxVictims.filter(v => v.zoneKey === 'medical-post');

  // 실인원 합산 (그룹은 groupCount 기준)
  const total = victims.reduce((sum, v) => sum + tokenCount(v), 0);

  // 증상별 집계 — 그룹은 groupCount 만큼 합산, 0명 제외
  const condCounts = SHOW_CONDITIONS
    .map(c => ({
      cond: c,
      n: victims
        .filter(v => v.condition === c)
        .reduce((sum, v) => sum + tokenCount(v), 0),
    }))
    .filter(x => x.n > 0);

  // 구역별 집계: rescueLocation 기준, 없으면 location — 실인원 합산
  const locMap = new Map<string, number>();
  for (const v of victims) {
    const key = v.rescueLocation || zoneKeyToLabel(v.zoneKey) || '위치미상';
    locMap.set(key, (locMap.get(key) ?? 0) + tokenCount(v));
  }
  const locEntries = [...locMap.entries()];

  return (
    <div className="rescue-stats">
      <div className="rescue-stats__header">
        <span className="rescue-stats__title">구조활동통계</span>
        <span className="rescue-stats__total">{total}명</span>
      </div>

      <div className="rescue-stats__body">
        {total === 0 ? (
          <div className="rescue-stats__empty">구조된 대상자 없음</div>
        ) : (
          <>
            {/* ── 증상별 배지 ── */}
            {condCounts.length > 0 && (
              <div className="rescue-stats__cond-row">
                {condCounts.map(({ cond, n }) => (
                  <span
                    key={cond}
                    className={`rescue-stats__cond rescue-stats__cond--${condClass(cond)}`}
                  >
                    {cond} {n}
                  </span>
                ))}
              </div>
            )}

            {/* ── 구역별 요약 ── */}
            {locEntries.length > 0 && (
              <div className="rescue-stats__loc-summary">
                {locEntries.map(([loc, n]) => (
                  <div key={loc} className="rescue-stats__loc-item">
                    <span className="rescue-stats__loc-name">{loc}</span>
                    {' '}{n}명
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
