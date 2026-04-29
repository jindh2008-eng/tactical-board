import { useSettings } from '../../store/settingsStore';
import type { HydrantSide } from '../../types/settings';
import './HydrantSetupPanel.css';

const SIDES: HydrantSide[] = ['A', 'B', 'C', 'D'];

export function HydrantSetupPanel() {
  const {
    hydrantSetup,
    addHydrantSetupItem,
    updateHydrantSetupItem,
    removeHydrantSetupItem,
  } = useSettings();

  return (
    <div className="hsp">
      {hydrantSetup.length === 0 ? (
        <p className="hsp__empty">등록된 소화전이 없습니다.</p>
      ) : (
        <ul className="hsp__list">
          {hydrantSetup.map(item => (
            <li key={item.id} className="hsp__item">
              {/* 이름 */}
              <input
                className="hsp__input hsp__input--name"
                type="text"
                value={item.name}
                onChange={e => updateHydrantSetupItem(item.id, { name: e.target.value })}
                placeholder="예: 59호"
                maxLength={16}
              />

              {/* 방면 */}
              <select
                className="hsp__select"
                value={item.side}
                onChange={e => updateHydrantSetupItem(item.id, { side: e.target.value as HydrantSide })}
              >
                {SIDES.map(s => (
                  <option key={s} value={s}>{s}면</option>
                ))}
              </select>

              {/* 거리 */}
              <input
                className="hsp__input hsp__input--dist"
                type="number"
                min={0}
                step={10}
                value={item.distanceM}
                onChange={e => {
                  const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                  updateHydrantSetupItem(item.id, { distanceM: v });
                }}
              />
              <span className="hsp__unit">m</span>

              {/* 삭제 */}
              <button
                className="hsp__del-btn"
                type="button"
                onClick={() => removeHydrantSetupItem(item.id)}
                title="삭제"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        className="hsp__add-btn"
        type="button"
        onClick={addHydrantSetupItem}
      >
        + 소화전 추가
      </button>
    </div>
  );
}
