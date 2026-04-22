import { useState } from 'react';
import type { TokenColor } from '../../types';
import { useTokens } from '../../context/TokenContext';
import './UnitStatus.css';

// ─── 활동대 ──────────────────────────────────────────
interface ActivityItem {
  name:     string;
  color:    TokenColor;
  unitType: string;
}

const ACTIVITY_ITEMS: ActivityItem[] = [
  { name: '진압대', color: 'red',    unitType: 'suppression' },
  { name: '구조대', color: 'yellow', unitType: 'rescue'      },
  { name: '구급대', color: 'green',  unitType: 'ems'         },
];

// ─── 차량 ────────────────────────────────────────────
interface VehicleItem {
  name:     string;
  unitType: string;
}

const VEHICLE_ITEMS: VehicleItem[] = [
  { name: '펌프',      unitType: 'pump'           },
  { name: '물탱크',    unitType: 'water_tank'     },
  { name: '구조차',    unitType: 'rescue_vehicle' },
  { name: '고가차',    unitType: 'aerial'         },
  { name: '굴절차',    unitType: 'ladder'         },
  { name: '배연차',    unitType: 'smoke_exhaust'  },
  { name: '화학차',    unitType: 'hazmat'         },
  { name: '산불진화차', unitType: 'wildfire'       },
];

// ─── 유관기관 ─────────────────────────────────────────
const AGENCY_ITEMS = ['지휘차', '시청', '경찰','보건소', '군부대', '한전', '가스'];

// ─────────────────────────────────────────────
// UnitStatus
// ─────────────────────────────────────────────

export function UnitStatus() {
  const { createToken } = useTokens();
  const [customText, setCustomText] = useState('');

  // 활동대: "진압대" → "진압1대"
  function makeActivity({ name, color, unitType }: ActivityItem) {
    createToken(name, 'activity', color, n => `${name.slice(0, -1)}${n}대`, unitType);
  }

  // 차량: "펌프" → "펌프1호"
  function makeVehicle({ name, unitType }: VehicleItem) {
    createToken(name, 'vehicle', 'vehicle', n => `${name}${n}호`, unitType);
  }

  // 유관기관: 번호 없이 이름 그대로
  function makeAgency(name: string) {
    createToken(name, 'agency', 'agency', () => name, 'agency');
  }

  // 직접입력
  function makeCustom() {
    const text = customText.trim();
    if (!text) return;
    createToken(text, 'custom', 'agency', () => text, 'general');
    setCustomText('');
  }

  return (
    <div className="panel unit-creator">
      <div className="panel__header">출동대 생성</div>
      <div className="unit-creator__body">

        {/* 활동대 */}
        <div className="creator-group creator-group--activity">
          <div className="creator-group__label creator-group__label--activity">활동대</div>
          <div className="creator-group__buttons">
            {ACTIVITY_ITEMS.map(item => (
              <button
                key={item.name}
                className={`creator-btn creator-btn--${item.color}`}
                type="button"
                title={`${item.name} 토큰 생성`}
                onClick={() => makeActivity(item)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>

        {/* 차량 */}
        <div className="creator-group creator-group--vehicle">
          <div className="creator-group__label creator-group__label--vehicle">차량</div>
          <div className="creator-group__buttons">
            {VEHICLE_ITEMS.map(item => (
              <button
                key={item.name}
                className="creator-btn creator-btn--vehicle"
                type="button"
                title={`${item.name} 토큰 생성`}
                onClick={() => makeVehicle(item)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>

        {/* 유관기관 */}
        <div className="creator-group creator-group--agency">
          <div className="creator-group__label creator-group__label--agency">유관기관</div>
          <div className="creator-group__buttons">
            {AGENCY_ITEMS.map(name => (
              <button
                key={name}
                className="creator-btn creator-btn--agency"
                type="button"
                title={`${name} 토큰 생성`}
                onClick={() => makeAgency(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* 직접입력 */}
        <div className="creator-group creator-group--agency">
          <div className="creator-group__label creator-group__label--agency">직접입력</div>
          <div className="creator-group__custom">
            <input
              className="creator-custom-input"
              type="text"
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && makeCustom()}
              placeholder="이름 입력..."
              maxLength={12}
            />
            <button
              className="creator-btn creator-btn--agency"
              type="button"
              onClick={makeCustom}
            >
              생성
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
