import { useVictims } from '../../context/VictimContext';
import type { VictimToken, VictimCondition } from '../../types/victim';
import './RescueStats.css';

// ─────────────────────────────────────────────
// 구조활동통계 — 임시의료소 내 구조대상자 요약
//
// props.victims 미지정 시 context에서 자동 필터링 (medical-post).
// 개별 목록 대신 증상별·구역별 숫자 요약만 표시.
// ─────────────────────────────────────────────

const SHOW_CONDITIONS: VictimCondition[] = ['경상', '중상', '사망', '의식없음', '고립'];

function condClass(c: VictimCondition | undefined): string {
  switch (c) {
    case '경상':    return 'alive';
    case '중상':    return 'serious';
    case '사망':    return 'dead';
    case '의식없음': return 'unconscious';
    case '고립':    return 'isolated';
    default:        return 'unknown';
  }
}

interface Props {
  victims?: VictimToken[];
}

export function RescueStats({ victims: propVictims }: Props) {
  const { victims: ctxVictims } = useVictims();
  const victims = propVictims ?? ctxVictims.filter(v => v.zoneKey === 'medical-post');

  const total = victims.length;

  // 증상별 집계 (0명 제외)
  const condCounts = SHOW_CONDITIONS
    .map(c => ({ cond: c, n: victims.filter(v => v.condition === c).length }))
    .filter(x => x.n > 0);

  // 구역별 집계: rescueLocation 기준, 없으면 location
  const locMap = new Map<string, number>();
  for (const v of victims) {
    const key = v.rescueLocation || v.location || '위치미상';
    locMap.set(key, (locMap.get(key) ?? 0) + 1);
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
