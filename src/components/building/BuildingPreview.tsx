import type { BuildingConfig, FireStatus } from '../../types';
import type { ExtraFireFloor, HydrantSetupItem, VictimSetupItem } from '../../types/settings';
import { PersonIcon } from '../settings/ui/PersonIcon';
import { buildDisplayFloors } from '../../data/buildingData';
import './BuildingPreview.css';

/**
 * 건물 미리보기 (설정창 전용).
 *
 * 훈련모드의 `TacticalArea` 를 그대로 쓰지 않는 이유는 의존성이다. 그쪽은
 * BuildingState · Token · Victim · Event · DisplayOptions · FireLine ·
 * FireCommand · Training 여덟 Context 를 요구해서, 설정모드에 올리려면 훈련용
 * Provider 를 통째로 들여와야 한다. 미리보기는 편집 중인 값이 어떤 모양이
 * 되는지만 보여주면 되므로 **표로 그린다**.
 *
 * 다만 층 모델은 훈련모드와 **같은 `buildDisplayFloors`** 를 쓴다. 층 압축
 * (예: 7~6F) 규칙을 여기서 다시 구현하면 언젠가 반드시 어긋나기 때문이다.
 *
 * 읽기 전용이다 — 클릭·드래그가 없다. 값은 왼쪽 폼에서만 바꾼다.
 */

const STATUS_LABEL: Record<FireStatus, string> = {
  'extension-peak': '연소확대',
  peak:             '최성기',
  seventy:          '큰불잡음',
  half:             '50%',
  initial:          '초진',
  complete:         '완진',
};

/** 화재 단계별 강조 세기 — 연소확대가 가장 강하고 완진이 가장 약하다 */
const STATUS_RANK: Record<FireStatus, 'hot' | 'warm' | 'cool'> = {
  'extension-peak': 'hot',
  peak:             'hot',
  seventy:          'warm',
  half:             'warm',
  initial:          'cool',
  complete:         'cool',
};

interface Props {
  config:           BuildingConfig;
  fireFloor:        number;
  fireStatus:       FireStatus | null;
  extraFireFloors:  ExtraFireFloor[];
  hasSiamesePipe:   boolean;
  hasIndoorHydrant: boolean;
  boardColumnRatio: number;
  /**
   * 옥외소화전 — 건물 · 소방시설 화면에서만 넘긴다.
   * 구조대상자 화면에서는 소방시설이 편집 대상이 아니라 소음이므로 뺀다.
   */
  hydrants?:        HydrantSetupItem[];
  /** 구조대상자 — 넘기면 층·면 자리에 사람 아이콘을 그린다. 건물 화면에서는 안 넘긴다 */
  victims?:         VictimSetupItem[];
}

export function BuildingPreview({
  config, fireFloor, fireStatus, extraFireFloors,
  hasSiamesePipe, hasIndoorHydrant, boardColumnRatio, hydrants = [], victims = [],
}: Props) {
  const floors = buildDisplayFloors(config, fireFloor);

  /** 층번호 → 화재상태. 화점층과 확대층을 한 맵으로 합친다 */
  const fireByFloor = new Map<number, FireStatus>();
  if (fireStatus) fireByFloor.set(fireFloor, fireStatus);
  for (const e of extraFireFloors) fireByFloor.set(e.floor, e.status);

  /** 압축 행(7~6F)은 그 범위에 걸친 화재 중 가장 센 것을 대표로 보여준다 */
  const statusOfRow = (startFloor: number, endFloor: number): FireStatus | null => {
    const lo = Math.min(startFloor, endFloor);
    const hi = Math.max(startFloor, endFloor);
    let best: FireStatus | null = null;
    for (const [floor, status] of fireByFloor) {
      if (floor < lo || floor > hi) continue;
      if (best === null || STATUS_RANK[status] === 'hot') best = status;
    }
    return best;
  };

  /*
   * 옥외소화전은 **자기 면 안에** 놓는다.
   *
   *   B면 → B 열 하단 (좌측 정렬)
   *   D면 → D 열 하단 (우측 정렬)
   *   C면 → C 띠 우측
   *   A면 → A 띠, 첫 번째는 좌측 · 그 다음부터 우측
   *
   * 처음엔 보드 좌·우 하단 두 자리로만 나눴는데, 그러면 D면 소화전이 B면
   * 소화전 옆에 놓이는 일이 생겨 어느 면 것인지 자리로는 알 수 없었다.
   * 면마다 자기 구역이 있으므로 그 안에 두는 편이 읽힌다.
   * A 만 좌·우로 갈리는데, 앞면이라 양쪽 어디든 설 수 있기 때문이다.
   */
  const hydrantsB: HydrantSetupItem[] = [];
  const hydrantsD: HydrantSetupItem[] = [];
  const hydrantsC: HydrantSetupItem[] = [];
  const hydrantsALeft: HydrantSetupItem[] = [];
  const hydrantsARight: HydrantSetupItem[] = [];
  for (const h of hydrants) {
    if (h.side === 'B') hydrantsB.push(h);
    else if (h.side === 'D') hydrantsD.push(h);
    else if (h.side === 'C') hydrantsC.push(h);
    else (hydrantsALeft.length === 0 ? hydrantsALeft : hydrantsARight).push(h);
  }

  /*
   * 구조대상자 배치.
   *
   * 면과 층은 배타 선택이다(VictimSetupPanel 주석) — 면을 고른 사람은 건물
   * 바깥 그 면에 서 있어 층이 없고, 층을 고른 사람은 건물 안이라 면이 없다.
   * 그래서 자리도 둘로 갈린다.
   *
   *   층 있음 → 건물 칸의 그 층
   *   면 A/C  → 그 띠 (열이 없는 앞·뒤 면)
   *   면 B/D  → 그 열의 1층 칸 (열은 있으나 층이 없어 지상에 세운다)
   *   둘 다 없음 → 표에 자리가 없어 캡션에서 인원만 센다
   */
  const victimsByFloor = new Map<string, number>();
  const victimsByFace: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 0, C: 0, D: 0 };
  let victimUnplaced = 0;
  for (const v of victims) {
    if (v.face) victimsByFace[v.face] += 1;
    else if (v.floor !== null) {
      const k = String(v.floor);
      victimsByFloor.set(k, (victimsByFloor.get(k) ?? 0) + 1);
    } else victimUnplaced += 1;
  }

  /** 압축 행(7~6F)은 그 범위 층을 다 합친다 */
  const victimsOnFloor = (f: { id: string; startFloor: number; endFloor: number }): number => {
    if (f.id === 'RF') return victimsByFloor.get('RF') ?? 0;
    const lo = Math.min(f.startFloor, f.endFloor);
    const hi = Math.max(f.startFloor, f.endFloor);
    let n = 0;
    for (let i = lo; i <= hi; i += 1) n += victimsByFloor.get(String(i)) ?? 0;
    return n;
  };

  const people = (n: number) =>
    n === 0 ? null : (
      <span className="bpv__people" title={`구조대상자 ${n}명`}>
        {Array.from({ length: Math.min(n, 6) }, (_, i) => <PersonIcon key={i} size={13} />)}
        {n > 6 && <span className="bpv__people-more">+{n - 6}</span>}
      </span>
    );

  const chip = (h: HydrantSetupItem) => (
    <span key={h.id} className="bpv__hydrant">
      {h.name || '이름없음'} · {h.side}면 · {h.distanceM}m
    </span>
  );

  return (
    <div className="bpv">
      <div className="bpv__board">
        {/*
          네 면을 모두 그린다.
            B · D — 표의 열이라 머리글이 곧 라벨이다(따로 안 적는다)
            C · A — 열이 없는 앞·뒤 면이라 표 위아래에 띠로 그린다
          예전에는 B/D 를 보드 가장자리에 절대배치로 한 번 더 적었는데,
          열 머리글에 이미 "B면 / D면" 이 있어 같은 말을 두 번 하고 있었다.
        */}
        <div className="bpv__band bpv__band--c">
          <span className="bpv__band-slot" />
          <span className="bpv__band-label">C면</span>
          <span className="bpv__band-slot bpv__band-slot--right">
            {people(victimsByFace.C)}
            {hydrantsC.map(chip)}
          </span>
        </div>

        <table className="bpv__table">
          {/*
            열 폭이 상황판 구역 비율을 그대로 따른다 — 오른쪽 슬라이더를
            움직이면 이 표의 가운데 칸이 같이 넓어진다. 비율 설정이 실제로
            무엇을 바꾸는지 숫자 대신 모양으로 보여주는 것이 이 표의 몫이다.
          */}
          {/*
            열은 셋뿐이고 폭이 곧 구역 비율이다.
            층 라벨은 따로 열을 쓰지 않고 **건물 칸 왼쪽 안**에 넣는다 —
            훈련 상황판이 층 이름을 건물 안쪽에 그리기 때문이고, 전용 열을
            두면 그만큼 표가 밀려 위쪽 비율 바와 경계가 어긋난다.
          */}
          <colgroup>
            <col style={{ width: `${(1 / (2 + boardColumnRatio)) * 100}%` }} />
            <col style={{ width: `${(boardColumnRatio / (2 + boardColumnRatio)) * 100}%` }} />
            <col style={{ width: `${(1 / (2 + boardColumnRatio)) * 100}%` }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="bpv__th bpv__th--side">B면</th>
              <th scope="col" className="bpv__th bpv__th--center">건물</th>
              <th scope="col" className="bpv__th bpv__th--side">D면</th>
            </tr>
          </thead>
          <tbody>
            {floors.map(f => {
              const status = f.id === 'RF' ? null : statusOfRow(f.startFloor, f.endFloor);
              const isGround = !f.isBasement && f.startFloor <= 1 && f.endFloor >= 1;
              return (
                <tr
                  key={f.id}
                  className={`bpv__row${f.isBasement ? ' bpv__row--basement' : ''}${status ? ` bpv__row--${STATUS_RANK[status]}` : ''}`}
                >
                  {/*
                    B·D 면 소화전은 **1층 행의 그 면 칸**에 넣는다.
                    옥외소화전은 지상에 있으니 1층이 맞는 자리이고, 열 안에
                    들어가야 어느 면 것인지 자리로 읽힌다. 처음엔 표 맨 아래에
                    전용 행을 하나 더 뒀는데, 층이 아닌 행이 섞여 층 목록이
                    끊겨 보였다.
                  */}
                  <td className="bpv__cell bpv__cell--side">
                    <div className="bpv__cell-inner">
                      {isGround && people(victimsByFace.B)}
                      {isGround && hydrantsB.map(chip)}
                    </div>
                  </td>

                  {/*
                    소방시설이 왼쪽, 화재상태가 오른쪽 끝이다(--fire 의 margin-left:auto).
                    훈련 상황판이 층 오른쪽 끝에 화재를 표시하므로 그 위치를 따른다.
                  */}
                  <td className="bpv__cell bpv__cell--center">
                    <div className="bpv__cell-inner">
                      {/* 층 이름 — 전용 열 대신 건물 칸 왼쪽에 붙는다 */}
                      <span className="bpv__floor">{f.label}</span>
                      {hasIndoorHydrant && f.id !== 'RF' && (
                        <span className="bpv__mark" title="옥내소화전">옥내</span>
                      )}
                      {hasSiamesePipe && isGround && (
                        <span className="bpv__mark" title="연결송수구 — 1층 좌측 하단">송수구</span>
                      )}
                      {people(victimsOnFloor(f))}
                      {status && (
                        <span className={`bpv__fire bpv__fire--${STATUS_RANK[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="bpv__cell bpv__cell--side">
                    <div className="bpv__cell-inner bpv__cell-inner--right">
                      {isGround && hydrantsD.map(chip)}
                      {isGround && people(victimsByFace.D)}
                    </div>
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>

        <div className="bpv__band bpv__band--a">
          <span className="bpv__band-slot">
            {people(victimsByFace.A)}
            {hydrantsALeft.map(chip)}
          </span>
          <span className="bpv__band-label">A면</span>
          <span className="bpv__band-slot bpv__band-slot--right">{hydrantsARight.map(chip)}</span>
        </div>

        <p className="bpv__caption">
          층 구성과 화재 상태 · 구역 비율 1 : {boardColumnRatio.toFixed(2)} : 1
          {victimUnplaced > 0 && ` · 위치 미지정 구조대상자 ${victimUnplaced}명`}
        </p>

      </div>
    </div>
  );
}
