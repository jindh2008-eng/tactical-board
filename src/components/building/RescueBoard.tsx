import { useVictims } from '../../context/VictimContext';
import { useUIOverlay } from '../../context/UIOverlayContext';
import { parseZoneKey } from '../../utils/logLabels';
import { MaleIcon, FemaleIcon } from '../shared/victimIcons';
import type { VictimToken } from '../../types/victim';
import './RescueBoard.css';

// ─────────────────────────────────────────────
// 구조 현황판 — A면 밴드 오른쪽 끝
//
// 「어느 층·어느 면에 몇 명이 있고, 그중 몇이 구조됐는가」를 한눈에 본다.
//
// ## 집계 기준은 **최초 배치 위치**다 (originZoneKey)
//
// 구조대상자는 훈련 중 자리를 옮긴다. 특히 건물 내부에서 방면으로 「추락」하는
// 개념이 있어, 옥상에 둔 사람이 A면으로 내려간 뒤 구조되는 흐름이 흔하다.
// 그때 구조 성과는 **원래 있던 옥상** 것으로 세어야 한다 — 현재 zoneKey 로
// 세면 구조된 사람은 전부 임시의료소로 몰리고, 그 전에도 A면으로 옮겨 가
// 옥상 인원이 훈련 도중 슬금슬금 줄어든다.
//
// ## 하단 띠는 구조활동통계로 가는 문이다
//
// 이 판은 「누가 어디서 아직 안 나왔나」를 형상으로 본다. 중증도·연령 같은
// 표 형태의 상세는 구조활동통계(RescueStatsModal)가 맡는다 — 이 좁은 칸에
// 표를 넣으면 글씨를 줄여야 하고, 그러면 둘 다 못 읽는다.
//
// 그 팝업을 여는 자리를 임시의료소 헤더에서 여기로 옮겼다(2026-08-28).
// 통계의 대상은 구조대상자지 임시의료소가 아니라서, 구조 현황판 옆에 두는 것이
// 눈이 가는 순서와 맞는다. 접기 기능은 이 클릭에 자리를 내주고 없앴다 —
// 하나의 띠에 두 동작을 얹으면 어느 쪽도 예측되지 않는다.
//
// ## 구조 판정은 임시의료소 진입이다
//
// 인명검색으로 「발견」한 것과 구조를 마친 것은 다른 단계다. 이 판에서 색이
// 바뀌는 시점은 임시의료소에 도착한 순간이다(zoneKey === 'medical-post').
// ─────────────────────────────────────────────

const MEDICAL_POST = 'medical-post';
const FACES = ['A', 'B', 'C', 'D'] as const;

/** 왼쪽 열이 담는 줄 수. 넘치는 층은 오른쪽 열 위로 흘러간다 */
const LEFT_COL_ROWS = 4;

/** 이 사람은 구조됐는가 — 임시의료소에 도착했으면 구조 완료 */
function isRescued(v: VictimToken): boolean {
  return v.zoneKey === MEDICAL_POST;
}

/**
 * 층 정렬 — 옥상이 맨 위, 그다음 높은 층부터.
 *
 * floorId 는 'RF' · '10F' · 'B1' 같은 문자열이라 숫자 비교가 그대로 안 된다.
 * 정렬용 점수로 바꿔 비교한다(옥상이 가장 큼, 지하가 음수).
 */
function floorRank(floorId: string): number {
  if (floorId === 'RF') return 10_000;
  const basement = /^B(\d+)/.exec(floorId);
  if (basement) return -Number(basement[1]);
  const above = /^(\d+)/.exec(floorId);
  return above ? Number(above[1]) : 0;
}

function floorLabel(floorId: string): string {
  if (floorId === 'RF') return '옥상';
  // '10F-5F' 처럼 묶인 층은 그대로 둔다 — 압축 표시 이름이 이미 사람이 읽는 형태다
  return floorId.replace(/F$/, '층');
}

/** 한 줄 — 이름 + 사람 아이콘들 */
function Row({ label, people }: { label: string; people: VictimToken[] }) {
  return (
    <div className="rescue-board__row">
      <span className="rescue-board__row-label">{label}</span>
      <span className="rescue-board__row-icons">
        {people.map(v => {
          const rescued = isRescued(v);
          const gender  = v.gender === '여' ? 'female' : 'male';
          const Icon    = v.gender === '여' ? FemaleIcon : MaleIcon;
          return (
            <span
              key={v.id}
              className={[
                'rescue-board__person',
                `rescue-board__person--${gender}`,
                rescued ? 'rescue-board__person--rescued' : '',
              ].filter(Boolean).join(' ')}
              title={rescued ? '구조 완료' : '미구조'}
            >
              <Icon className="rescue-board__person-svg" />
            </span>
          );
        })}
      </span>
    </div>
  );
}

export function RescueBoard() {
  const { victims }     = useVictims();
  const { openOverlay } = useUIOverlay();

  // 최초 배치 위치로 묶는다. originZoneKey 가 없는 옛 저장분은 현재 위치로 대신한다.
  const byFloor = new Map<string, VictimToken[]>();
  const byFace  = new Map<string, VictimToken[]>();

  for (const v of victims) {
    const ref = parseZoneKey(v.originZoneKey ?? v.zoneKey);
    if (ref.floorId) {
      const list = byFloor.get(ref.floorId) ?? [];
      list.push(v);
      byFloor.set(ref.floorId, list);
    } else if (ref.face) {
      const list = byFace.get(ref.face) ?? [];
      list.push(v);
      byFace.set(ref.face, list);
    }
    // 그 밖(대기·임시의료소에서 만들어져 배치된 적 없는 경우)은 셀 자리가 없다
  }

  const floors = [...byFloor.entries()].sort((a, b) => floorRank(b[0]) - floorRank(a[0]));

  /*
   * 두 열에 나눠 담는다.
   *
   *   왼쪽  층 — 위에서부터 최대 4줄
   *   오른쪽 남은 층 + 구조대상자가 있는 면
   *
   * 층수는 시나리오마다 다르고 방면은 최대 4개뿐이라, 층이 많으면 왼쪽만
   * 길어지고 오른쪽은 비었다. 넘치는 층을 오른쪽으로 흘려 두 열을 고르게 쓴다.
   * 면은 **구조대상자가 있는 면만** 그린다 — 빈 A~D 네 줄이 늘 자리를
   * 차지하면 정작 층이 밀린다.
   */
  const faceRows: [string, VictimToken[]][] =
    FACES.filter(f => (byFace.get(f)?.length ?? 0) > 0).map(f => [f, byFace.get(f)!]);

  const allRows: [string, VictimToken[]][] = [
    ...floors.map(([id, people]) => [floorLabel(id), people] as [string, VictimToken[]]),
    ...faceRows,
  ];
  const leftRows  = allRows.slice(0, LEFT_COL_ROWS);
  const rightRows = allRows.slice(LEFT_COL_ROWS);

  const total    = victims.length;
  const rescued  = victims.filter(isRescued).length;

  return (
    <div className="a-face-band__zone a-face-band__zone--rescue">
      <div className="rescue-board__body">
        <div className="rescue-board__col">
          {leftRows.length === 0
            ? <p className="rescue-board__empty">—</p>
            : leftRows.map(([label, people]) => (
                <Row key={label} label={label} people={people} />
              ))}
        </div>

        <div className="rescue-board__col">
          {rightRows.map(([label, people]) => (
            <Row key={label} label={label} people={people} />
          ))}
        </div>
      </div>

      {/*
        명칭 띠 = 구조활동통계를 여는 버튼 + 인원 표시.
        구조/전체를 여기 붙여, 판을 훑기 전에 진척이 먼저 읽힌다.
      */}
      <button
        type="button"
        className="a-face-zone__label a-face-zone__label--bottom rescue-board__toggle"
        title="구조활동통계 보기"
        onClick={() => openOverlay('rescue-stats')}
      >
        구조 현황
        <span className="rescue-board__count">{rescued} / {total}</span>
      </button>
    </div>
  );
}
