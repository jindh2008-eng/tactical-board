/**
 * 보조 열(≥1800px) 내용 — 화면마다 다르다(SETTINGS_MODE_UI_PLAN.md §4.2).
 *
 * 화면 셋만 채웠다 — 나머지(건물·상태 프리셋·상태 메시지·지휘절차·시나리오 예측)는
 * §4.2가 이미 허용한 대로 **보조 열 자체를 숨긴다.** 없는 내용을 채우기보다
 * 열을 안 그리는 쪽이 낫다. 건물의 "단면 축소 미리보기"는 BuildingConfigPanel의
 * SVG 렌더를 그대로 복제해야 해서 규모가 크다 — S-5 이후로 남겨 둔다.
 */
import { useState } from 'react';
import type { DispatchRosterItem, VictimSetupItem } from '../../../types/settings';
import type { VictimFace } from '../../../types/victim';
import { VICTIM_FACES } from '../../../types/victim';
import type { ArrivalMode } from '../../../types/settings';
import { computeRosterDisplayName } from '../../../utils/dispatchRoster';
import { unitTone } from './unitTone';
import type { EventType } from '../../../types/events';
import { EVENT_TYPE_STATUSES, EVENT_TYPE_LABELS } from '../../../types/events';
import { PersonIcon } from './PersonIcon';

/* ── 출동대 : 도착 순서 타임라인 ─────────────────────────── */

/**
 * 도착 순서 — 착대별로 어떤 출동대가 함께 오는지.
 *
 * 이름을 `·` 로 이어 붙이던 것을 **실제 토큰 색 칩**으로 바꿨다. 훈련 화면에
 * 나올 모습 그대로라, 어느 대가 언제 오는지를 글자가 아니라 색 덩어리로 읽는다.
 *
 * 시간설정 모드에서는 착대 라벨 옆에 「N분후」 를 고른다. **착대 단위**로 정한다 —
 * 같은 착대는 함께 오는 것이 정의라 대마다 따로 시간을 주면 착대가 뜻을 잃는다.
 * 저장은 기존대로 항목별 `arrivalSec` 이고, 한 착대의 항목 전부에 같은 값을 쓴다.
 */
const ARRIVAL_MINUTES = Array.from({ length: 30 }, (_, i) => i + 1);

export function DispatchArrivalAside({
  roster, arrivalMode = 'order', onOrderTime, onMoveOrder, showPumps = false,
}: {
  roster: DispatchRosterItem[];
  /** 진단용 — 연동 펌프를 착대 목록에 함께 그린다 */
  showPumps?: boolean;
  arrivalMode?: ArrivalMode;
  /** 착대 하나의 시간을 정한다(분). 시간설정 모드에서만 쓴다 */
  onOrderTime?: (order: number, minutes: number) => void;
  /** 대 하나를 다른 착대로 옮긴다. 없으면 드래그가 꺼진다 */
  onMoveOrder?: (id: string, order: number) => void;
}) {
  const [overOrder, setOverOrder] = useState<number | null>(null);

  if (roster.length === 0) {
    return <p className="set-aside__empty">등록된 출동대가 없습니다.</p>;
  }

  const groups = new Map<number, DispatchRosterItem[]>();
  for (const item of roster) {
    // 연동 펌프는 그리지 않는다 — 생성 칸과 같은 규칙이다. 진압대를 따라
    // 같은 착대로 오므로 여기 적어도 정할 것이 없고, 줄만 두 배로 길어진다.
    if (!showPumps && item.linkedTo !== null) continue;
    const order = item.arrivalOrder ?? 1;
    const bucket = groups.get(order);
    if (bucket) bucket.push(item);
    else groups.set(order, [item]);
  }

  /*
   * 1..max 를 **연속으로** 그린다. 있는 착대만 그리면 빈 착대가 목록에서
   * 사라져 끌어다 놓을 자리가 없어진다. 압축이 빈 착대를 없애 주므로
   * 보통은 빈 줄이 생기지 않지만, 연동 펌프만 남은 착대처럼 예외가 있다.
   */
  const maxOrder = Math.max(0, ...groups.keys());
  const orders = Array.from({ length: maxOrder }, (_, i) => i + 1);

  /** 그 착대의 대표 시간(분) — 같은 착대는 값이 같으므로 첫 항목을 본다 */
  const minutesOf = (order: number) => {
    const first = groups.get(order)?.[0];
    return Math.max(1, Math.round((first?.arrivalSec || 60) / 60));
  };

  const dropProps = (order: number) => onMoveOrder && {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();                    // 없으면 drop 이 조용히 안 걸린다
      e.dataTransfer.dropEffect = 'move';
      setOverOrder(order);
    },
    onDragLeave: () => setOverOrder(o => (o === order ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOverOrder(null);
      const id = e.dataTransfer.getData('text/plain');
      if (id) onMoveOrder(id, order);
    },
  };

  const row = (order: number, isNew = false) => (
    <li
      key={isNew ? 'new' : order}
      className={[
        'set-arrival__row',
        isNew ? 'set-arrival__row--new' : '',
        overOrder === order ? 'set-arrival__row--over' : '',
      ].filter(Boolean).join(' ')}
      {...dropProps(order)}
    >
      <div className="set-arrival__head">
        <span className="set-arrival__order">{order}착대</span>
        {!isNew && arrivalMode === 'time' && onOrderTime && (
          <select
            className="set-arrival__time"
            value={minutesOf(order)}
            onChange={e => onOrderTime(order, Number(e.target.value))}
            aria-label={`${order}착대 도착 시간`}
          >
            {ARRIVAL_MINUTES.map(m => <option key={m} value={m}>{m}분후</option>)}
          </select>
        )}
      </div>
      <div className="set-arrival__units">
        {isNew
          ? <span className="set-arrival__hint">여기로 끌어다 놓으면 착대가 하나 늘어납니다</span>
          : (groups.get(order) ?? []).map(item => (
              <span
                key={item.id}
                className={`set-arrival__unit set-arrival__unit--${unitTone(item.unitType)}`}
                draggable={Boolean(onMoveOrder)}
                onDragStart={e => {
                  e.dataTransfer.setData('text/plain', item.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => setOverOrder(null)}
                title={onMoveOrder ? '끌어서 다른 착대로 옮깁니다' : undefined}
              >
                {computeRosterDisplayName(item)}
              </span>
            ))}
      </div>
    </li>
  );

  return (
    <ol className="set-arrival">
      {orders.map(o => row(o))}
      {/* 착대 추가 — 마지막 다음 자리. 끌어다 놓으면 그 번호가 생긴다 */}
      {onMoveOrder && row(maxOrder + 1, true)}
    </ol>
  );
}

/* ── 구조대상자 : 층별 분포 ──────────────────────────────── */

/**
 * 배치 현황 — 좌: 건물(층별) / 우: 방면.
 *
 * 면과 층은 배타 선택이라(VictimSetupPanel 주석) 한 사람은 둘 중 하나에만 속한다.
 * 그러니 집계도 두 갈래로 갈리는 것이 맞고, 한 줄에 섞으면 "3층과 B면이
 * 같은 종류의 자리"라는 인상을 준다.
 *
 * 막대 그래프가 아니라 **사람 아이콘 개수**로 센다. 막대는 "가장 많은 층 대비
 * 몇 %" 를 보여줄 뿐이라 3명인지 4명인지 알려면 옆 숫자를 따로 읽어야 했다.
 * 구조대상자는 한 자릿수가 대부분이라 아이콘을 그 수만큼 늘어놓는 편이 세어진다.
 * 8명을 넘으면 아이콘 8개 + "+N" 으로 접는다 — 줄바꿈되면 세는 이득이 사라진다.
 */
const VICTIM_ICON_MAX = 8;

function PeopleRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="set-aside__people-row">
      <div className="set-aside__people-label">{label}</div>
      <div className="set-aside__people-icons">
        {Array.from({ length: Math.min(count, VICTIM_ICON_MAX) }, (_, i) => (
          <PersonIcon key={i} />
        ))}
        {count > VICTIM_ICON_MAX && (
          <span className="set-aside__people-more">+{count - VICTIM_ICON_MAX}</span>
        )}
      </div>
      <div className="set-aside__people-num">{count}명</div>
    </div>
  );
}

export function VictimFloorAside({ victims }: { victims: VictimSetupItem[] }) {
  if (victims.length === 0) {
    return <p className="set-aside__empty">등록된 구조대상자가 없습니다.</p>;
  }

  const byFloor = new Map<string, number>();
  const byFace = new Map<VictimFace, number>();
  let unplaced = 0;
  for (const v of victims) {
    if (v.face) byFace.set(v.face, (byFace.get(v.face) ?? 0) + 1);
    else if (v.floor !== null) {
      const k = String(v.floor);
      byFloor.set(k, (byFloor.get(k) ?? 0) + 1);
    } else unplaced += 1;
  }

  const floors = [...byFloor.entries()].sort((a, b) => {
    if (a[0] === 'RF') return -1;
    if (b[0] === 'RF') return 1;
    return Number(b[0]) - Number(a[0]);   // 높은 층부터
  });

  return (
    <div className="set-aside__placement">
      <div className="set-aside__placement-col">
        <div className="set-aside__placement-head">건물</div>
        {floors.length === 0
          ? <p className="set-aside__empty">없음</p>
          : floors.map(([floor, n]) => (
              <PeopleRow key={floor} label={floor === 'RF' ? '옥상' : `${floor}층`} count={n} />
            ))}
      </div>

      {/*
        방면은 넷이 고정이라 인원이 0 이어도 줄을 남긴다 — 층과 달리 "없는 면"
        이라는 것이 없어서, 빈 줄이 곧 "그 면에는 아무도 없다"는 정보가 된다.
      */}
      <div className="set-aside__placement-col">
        <div className="set-aside__placement-head">방면</div>
        {VICTIM_FACES.map(f => (
          <PeopleRow key={f} label={`${f}면`} count={byFace.get(f) ?? 0} />
        ))}
      </div>

      {unplaced > 0 && (
        <p className="set-aside__placement-note">
          면·층을 정하지 않은 대상자 {unplaced}명
        </p>
      )}
    </div>
  );
}

/* ── 현장요소 : 종류별 세부 상태 ──────────────────────────── */

/**
 * 종류(화재 · 가스 · 전기)를 고르면 훈련 중 우클릭 메뉴에 어떤 상태가 나오는지
 * 보여준다. 고를 때는 이름 셋만 보이고 **그 선택이 무엇을 정하는지는 안 보였다** —
 * 화재를 고르면 6단계, 가스는 4가지, 전기는 4가지로 메뉴가 통째로 달라진다.
 *
 * 목록을 여기 다시 적지 않고 `EVENT_TYPE_STATUSES` 를 그대로 읽는다.
 * 상태를 추가하면 범례가 저절로 따라온다 — 옮겨 적으면 반드시 어긋난다.
 * 색도 같은 출처라 훈련 중 토큰 색과 정확히 일치한다.
 */
export function EventTypeLegendAside() {
  return (
    <div className="set-aside__evt">
      {(Object.keys(EVENT_TYPE_STATUSES) as EventType[]).map(type => {
        // '-'(없음)는 상태가 아니라 해제라 범례에서 뺀다
        const items = EVENT_TYPE_STATUSES[type].filter(s => s.value !== '-');
        return (
          <div key={type} className="set-aside__evt-group">
            <div className="set-aside__evt-head">
              {EVENT_TYPE_LABELS[type]}
              <span className="set-aside__evt-count">{items.length}단계</span>
            </div>
            <ul className="set-aside__evt-list">
              {items.map(st => (
                <li key={st.value} className="set-aside__evt-row">
                  <span className="set-aside__evt-swatch" style={{ background: st.color }} />
                  <span className="set-aside__evt-icon" aria-hidden="true">{st.icon}</span>
                  <span className="set-aside__evt-label">{st.label}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="set-aside__evt-note">
        훈련 중 현장요소를 우클릭하면 이 상태들이 원형 메뉴로 나옵니다.
      </p>
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

/**
 * 항목 타입 범례.
 *
 * `summary` 는 기본으로 끈다 — 시나리오 레일 머리줄이 이미 "N개 절 · M개 항목"을
 * 보여주고 있어서, 켜면 같은 문장이 두 줄 연속으로 나온다.
 */
export function ChecklistLegendAside(
  { sectionCount, itemCount, summary = false }:
  { sectionCount: number; itemCount: number; summary?: boolean },
) {
  return (
    <div className="set-aside__legend">
      {summary && (
        <div className="set-aside__legend-summary">{sectionCount}개 절 · {itemCount}개 항목</div>
      )}
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
