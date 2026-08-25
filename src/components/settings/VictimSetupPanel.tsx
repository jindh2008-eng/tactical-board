import { useSettings } from '../../store/settingsStore';
import { VICTIM_GENDERS, VICTIM_AGE_GROUPS, VICTIM_CONDITIONS } from '../../types/victim';
import type { VictimGender, VictimAgeGroup, VictimCondition, VictimFace } from '../../types/victim';
import { VICTIM_FACES } from '../../types/settings';
import { buildPlaceableFloors } from '../../data/buildingData';
import { placeableFloorLabel } from '../../utils/floorOptions';
import './VictimSetupPanel.css';

/*
 * 값에 색을 입힌다 — 훈련모드 VictimCard 와 같은 체계(CSS 주석 참고).
 * 색만으로 뜻을 전하지 않는다. 글자가 그대로 남아 있고 색은 스캔용 보조다.
 */
const GENDER_CLASS: Record<VictimGender, string> = {
  '남': 'vsp__select--male',
  '여': 'vsp__select--female',
};

const CONDITION_CLASS: Record<VictimCondition, string> = {
  '경상': 'vsp__select--minor',
  '중상': 'vsp__select--critical',
  '사망': 'vsp__select--dead',
};

export function VictimSetupPanel() {
  const {
    victimSetup,
    addVictimSetupItem,
    updateVictimSetupItem,
    removeVictimSetupItem,
    building,
  } = useSettings();

  // 현재 건물 설정·화점층 기준으로 실제 배치 가능한 층만 표시
  // (요약 행으로 묶인 층은 제외, 옥상 포함)
  const placeableFloors = buildPlaceableFloors(building.config, building.fireFloor);

  return (
    <div className="vsp">

      {/* 헤더 */}
      <div className="vsp__header">
        <span className="vsp__count">{victimSetup.length}명 등록됨</span>
        <button className="vsp__add-btn" type="button" onClick={addVictimSetupItem}>
          + 구조대상자 추가
        </button>
      </div>

      {victimSetup.length === 0 ? (
        <div className="vsp__empty">
          구조대상자를 추가하면 이곳에 표시됩니다.
        </div>
      ) : (
        <div className="vsp__table">

          {/* 컬럼 헤더 — [#, 성별, 나이, 상태, 면, 층, 계단실, 상세위치, 바로보임, X] */}
          <div className="vsp__thead">
            <span className="vsp__th vsp__th--idx">#</span>
            <span className="vsp__th">성별</span>
            <span className="vsp__th">나이</span>
            <span className="vsp__th">상태</span>
            <span className="vsp__th vsp__th--sm">면</span>
            <span className="vsp__th vsp__th--sm">층</span>
            <span className="vsp__th vsp__th--stair" title="층 선택 시 해당 층 계단실에 배치">계단실</span>
            <span className="vsp__th">상세위치</span>
            <span className="vsp__th vsp__th--visible" title="인명검색 없이 처음부터 화면에 표시">바로보임</span>
            <span className="vsp__th vsp__th--del"></span>
          </div>

          {/* 데이터 행 */}
          {victimSetup.map((item, idx) => (
            <div key={item.id} className="vsp__row">
              <span className="vsp__cell vsp__cell--idx">{idx + 1}</span>

              <span className="vsp__cell">
                <select
                  className={`vsp__select ${GENDER_CLASS[item.gender] ?? ''}`}
                  value={item.gender}
                  onChange={e => updateVictimSetupItem(item.id, { gender: e.target.value as VictimGender })}
                >
                  {VICTIM_GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </span>

              <span className="vsp__cell">
                <select
                  className="vsp__select"
                  value={item.ageGroup}
                  onChange={e => updateVictimSetupItem(item.id, { ageGroup: e.target.value as VictimAgeGroup })}
                >
                  {VICTIM_AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </span>

              <span className="vsp__cell">
                <select
                  className={`vsp__select ${CONDITION_CLASS[item.condition] ?? ''}`}
                  value={item.condition}
                  onChange={e => updateVictimSetupItem(item.id, { condition: e.target.value as VictimCondition })}
                >
                  {VICTIM_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </span>

              {/*
                면과 층은 **둘 중 하나만** 고른다.

                면을 고르면 그 사람은 건물 바깥 A~D 면에 서 있는 것이라 층이 없고,
                층을 고르면 건물 안이라 면이 없다. 예전에는 둘 다 고를 수 있어서
                "3층인데 B면" 같은 값이 만들어졌고, 미리보기에서 어느 칸에 그릴지
                규칙으로 때워야 했다.

                한쪽을 고르면 다른 쪽을 **비우고 잠근다** — 잠그기만 하면 이미 들어간
                반대쪽 값이 남아 같은 모순이 유지된다.
              */}
              <span className="vsp__cell vsp__cell--sm">
                <select
                  className={`vsp__select${item.face === null ? ' vsp__select--empty' : ''}`}
                  value={item.face ?? ''}
                  disabled={item.floor !== null}
                  title={item.floor !== null ? '층을 선택한 대상자는 면을 지정하지 않습니다' : undefined}
                  onChange={e => {
                    const face = (e.target.value as VictimFace) || null;
                    updateVictimSetupItem(item.id, face === null
                      ? { face: null }
                      // 면을 고르면 층·계단실을 비운다 — 건물 바깥이라 층이 없다
                      : { face, floor: null, isStair: false });
                  }}
                >
                  <option value="">-</option>
                  {VICTIM_FACES.map(f => <option key={f} value={f}>{f}면</option>)}
                </select>
              </span>

              {/* 층 — "없음", 옥상, 개별 층만 표시 (요약 행 제외) */}
              <span className="vsp__cell vsp__cell--sm">
                <select
                  className={`vsp__select${item.floor === null ? ' vsp__select--empty' : ''}`}
                  value={item.floor ?? ''}
                  disabled={item.face !== null}
                  title={item.face !== null ? '면을 선택한 대상자는 층을 지정하지 않습니다' : undefined}
                  onChange={e => {
                    const v = e.target.value;
                    const floor = v === '' ? null : v === 'RF' ? 'RF' : Number(v);
                    updateVictimSetupItem(item.id, floor === null
                      // 층을 비우면 계단실도 함께 비운다 — 층 없는 계단실은 성립하지 않는다
                      ? { floor: null, isStair: false }
                      : { floor, face: null });
                  }}
                >
                  <option value="">-</option>
                  {placeableFloors.map(f => (
                    <option key={String(f)} value={String(f)}>
                      {placeableFloorLabel(f)}
                    </option>
                  ))}
                </select>
              </span>

              <span className="vsp__cell vsp__cell--stair">
                <input
                  className="vsp__stair-cb"
                  type="checkbox"
                  checked={item.isStair ?? false}
                  disabled={item.floor === null}
                  title={
                    item.face !== null ? '면을 선택한 대상자는 계단실을 지정할 수 없습니다'
                      : item.floor === null ? '층을 먼저 선택하세요'
                      : '해당 층 계단실에 배치'
                  }
                  onChange={e => updateVictimSetupItem(item.id, { isStair: e.target.checked })}
                />
              </span>

              <span className="vsp__cell">
                <input
                  className="vsp__text-input"
                  type="text"
                  placeholder="상세위치"
                  value={item.detailLocation}
                  onChange={e => updateVictimSetupItem(item.id, { detailLocation: e.target.value })}
                />
              </span>

              <span className="vsp__cell vsp__cell--visible">
                <input
                  className="vsp__visible-cb"
                  type="checkbox"
                  checked={item.immediatelyVisible ?? false}
                  title="인명검색 없이 처음부터 화면에 표시"
                  onChange={e => updateVictimSetupItem(item.id, { immediatelyVisible: e.target.checked })}
                />
              </span>

              <span className="vsp__cell vsp__cell--del">
                <button
                  className="vsp__del-btn"
                  type="button"
                  title="삭제"
                  onClick={() => removeVictimSetupItem(item.id)}
                >×</button>
              </span>
            </div>
          ))}

          {/* 요약 */}
          <div className="vsp__summary">
            위치 형식: 층/면/상세위치 조합  예) 3층/A면/205호  (면·층은 없음 선택 가능)
          </div>

        </div>
      )}

    </div>
  );
}
