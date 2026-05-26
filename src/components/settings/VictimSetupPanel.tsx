import { useSettings } from '../../store/settingsStore';
import { VICTIM_GENDERS, VICTIM_AGE_GROUPS, VICTIM_CONDITIONS } from '../../types/victim';
import type { VictimGender, VictimAgeGroup, VictimCondition, VictimFace } from '../../types/victim';
import { VICTIM_FACES } from '../../types/settings';
import { buildPlaceableFloors } from '../../data/buildingData';
import { placeableFloorLabel } from '../../utils/floorOptions';
import './VictimSetupPanel.css';

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

          {/* 컬럼 헤더 — [#, 성별, 나이, 상태, 면, 층, 상세위치, X] */}
          <div className="vsp__thead">
            <span className="vsp__th vsp__th--idx">#</span>
            <span className="vsp__th">성별</span>
            <span className="vsp__th">나이</span>
            <span className="vsp__th">상태</span>
            <span className="vsp__th vsp__th--sm">면</span>
            <span className="vsp__th vsp__th--sm">층</span>
            <span className="vsp__th">상세위치</span>
            <span className="vsp__th vsp__th--del"></span>
          </div>

          {/* 데이터 행 */}
          {victimSetup.map((item, idx) => (
            <div key={item.id} className="vsp__row">
              <span className="vsp__cell vsp__cell--idx">{idx + 1}</span>

              <span className="vsp__cell">
                <select
                  className="vsp__select"
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
                  className="vsp__select"
                  value={item.condition}
                  onChange={e => updateVictimSetupItem(item.id, { condition: e.target.value as VictimCondition })}
                >
                  {VICTIM_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </span>

              {/* 면 — "없음" 포함 */}
              <span className="vsp__cell vsp__cell--sm">
                <select
                  className="vsp__select"
                  value={item.face ?? ''}
                  onChange={e => updateVictimSetupItem(item.id, {
                    face: (e.target.value as VictimFace) || null,
                  })}
                >
                  <option value="">없음</option>
                  {VICTIM_FACES.map(f => <option key={f} value={f}>{f}면</option>)}
                </select>
              </span>

              {/* 층 — "없음", 옥상, 개별 층만 표시 (요약 행 제외) */}
              <span className="vsp__cell vsp__cell--sm">
                <select
                  className="vsp__select"
                  value={item.floor ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    updateVictimSetupItem(item.id, {
                      floor: v === '' ? null : v === 'RF' ? 'RF' : Number(v),
                    });
                  }}
                >
                  <option value="">없음</option>
                  {placeableFloors.map(f => (
                    <option key={String(f)} value={String(f)}>
                      {placeableFloorLabel(f)}
                    </option>
                  ))}
                </select>
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
