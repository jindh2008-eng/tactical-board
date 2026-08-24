/**
 * 보조 열(≥1800px) 내용 — 화면마다 다르다(SETTINGS_MODE_UI_PLAN.md §4.2).
 *
 * 화면 셋만 채웠다 — 나머지(건물·상태 프리셋·상태 메시지·지휘절차·시나리오 예측)는
 * §4.2가 이미 허용한 대로 **보조 열 자체를 숨긴다.** 없는 내용을 채우기보다
 * 열을 안 그리는 쪽이 낫다. 건물의 "단면 축소 미리보기"는 BuildingConfigPanel의
 * SVG 렌더를 그대로 복제해야 해서 규모가 크다 — S-5 이후로 남겨 둔다.
 */
import type { DispatchRosterItem, VictimSetupItem } from '../../../types/settings';
import { computeRosterDisplayName } from '../../../utils/dispatchRoster';

/* ── 출동대 : 도착 순서 타임라인 ─────────────────────────── */

export function DispatchArrivalAside({ roster }: { roster: DispatchRosterItem[] }) {
  if (roster.length === 0) {
    return <p className="set-aside__empty">등록된 출동대가 없습니다.</p>;
  }
  const groups = new Map<number, DispatchRosterItem[]>();
  for (const item of roster) {
    const order = item.arrivalOrder ?? 1;
    const bucket = groups.get(order);
    if (bucket) bucket.push(item);
    else groups.set(order, [item]);
  }
  const orders = [...groups.keys()].sort((a, b) => a - b);
  const VISIBLE = 4;
  const shown = orders.slice(0, VISIBLE);
  const restCount = orders.slice(VISIBLE).reduce((n, o) => n + groups.get(o)!.length, 0);

  return (
    <ol className="set-aside__timeline">
      {shown.map(order => {
        const items = groups.get(order)!;
        return (
          <li key={order} className="set-aside__timeline-row">
            <div className="set-aside__timeline-dot" />
            <div>
              <div className="set-aside__timeline-title">{order}착대</div>
              <div className="set-aside__timeline-desc">
                {items.map(computeRosterDisplayName).join(' · ')}
              </div>
            </div>
          </li>
        );
      })}
      {restCount > 0 && (
        <li className="set-aside__timeline-row set-aside__timeline-row--more">
          <div className="set-aside__timeline-dot set-aside__timeline-dot--dim" />
          <div className="set-aside__timeline-desc">
            {orders.length - VISIBLE}착대 이후 · {restCount}개 대
          </div>
        </li>
      )}
    </ol>
  );
}

/* ── 구조대상자 : 층별 분포 ──────────────────────────────── */

export function VictimFloorAside({ victims }: { victims: VictimSetupItem[] }) {
  if (victims.length === 0) {
    return <p className="set-aside__empty">등록된 구조대상자가 없습니다.</p>;
  }
  const byFloor = new Map<string, number>();
  for (const v of victims) {
    const key = v.floor === null ? '미지정' : String(v.floor);
    byFloor.set(key, (byFloor.get(key) ?? 0) + 1);
  }
  const floors = [...byFloor.entries()].sort((a, b) => {
    if (a[0] === '미지정') return 1;
    if (b[0] === '미지정') return -1;
    if (a[0] === 'RF') return -1;
    if (b[0] === 'RF') return 1;
    return Number(b[0]) - Number(a[0]); // 높은 층부터
  });
  const max = Math.max(...floors.map(([, n]) => n));

  return (
    <div className="set-aside__bars">
      {floors.map(([floor, n]) => (
        <div key={floor} className="set-aside__bar-row">
          <div className="set-aside__bar-label">{floor === 'RF' ? '옥상' : floor === '미지정' ? floor : `${floor}층`}</div>
          <div className="set-aside__bar-track">
            <div className="set-aside__bar-fill" style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <div className="set-aside__bar-num">{n}</div>
        </div>
      ))}
    </div>
  );
}

/* ── 체크리스트 : 항목 타입 설명 ─────────────────────────── */

const CHECKLIST_TYPE_LEGEND: { label: string; token: string; desc: string }[] = [
  { label: '절차',  token: '--set-text-dim',      desc: '수행 확인용 체크 항목' },
  { label: '메시지', token: '--set-type-message',  desc: '무전 메시지 발신 시 자동 체크' },
  { label: '도착',  token: '--set-type-arrival',   desc: '출동대 도착 시 자동 체크' },
  { label: '화재',  token: '--set-type-fire',      desc: '화재 상태 전환 시 자동 체크' },
  { label: 'XVR',  token: '--set-type-xvr',        desc: '구조대상자 발견 시 자동 체크' },
  { label: '이벤트', token: '--set-type-event',    desc: '현장요소 상태 전환 시 자동 체크' },
];

export function ChecklistLegendAside({ sectionCount, itemCount }: { sectionCount: number; itemCount: number }) {
  return (
    <div className="set-aside__legend">
      <div className="set-aside__legend-summary">{sectionCount}개 절 · {itemCount}개 항목</div>
      <ul className="set-aside__legend-list">
        {CHECKLIST_TYPE_LEGEND.map(t => (
          <li key={t.label} className="set-aside__legend-row">
            <span className="set-aside__legend-dot" style={{ background: `var(${t.token})` }} />
            <span className="set-aside__legend-label">{t.label}</span>
            <span className="set-aside__legend-desc">{t.desc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
