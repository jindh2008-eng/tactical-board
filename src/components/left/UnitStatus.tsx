import { useState } from 'react';
import type { TokenColor } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { generateId } from '../../utils/settingsStorage';
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

/*
 * 펌프는 여기 없다 — makeActivity() 가 진압대를 만들 때 자동으로 짝지어
 * 만든다(설정모드 buildRoster 의 자동 연동과 같은 규칙). 여기 목록에도 있으면
 * 진압대 하나에 펌프가 두 대(자동 1 + 수동 1) 생기는 경로가 열린다.
 */
const VEHICLE_ITEMS: VehicleItem[] = [
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

  // 활동대: "진압대" → "진압1"
  //
  // 진압대는 펌프를 함께 만든다 — 설정모드 로스터(buildRoster)의 자동 연동과 같은 규칙이다.
  // 구조대·구급대는 차량을 붙이지 않는다.
  function makeActivity({ name, color, unitType }: ActivityItem) {
    // 진압대와 펌프는 한 짝 — 같은 그룹 ID 를 줘서 하나를 지우면 함께 지워지게 한다
    const pairId = unitType === 'suppression' ? `pair-${generateId()}` : undefined;
    createToken(name, 'activity', color, n => `${name.slice(0, -1)}${n}`, unitType, pairId);
    if (pairId) {
      createToken('펌프', 'vehicle', 'vehicle', n => `펌프${n}`, 'pump', pairId);
    }
  }

  // 차량: "펌프" → "펌프1"
  function makeVehicle({ name, unitType }: VehicleItem) {
    createToken(name, 'vehicle', 'vehicle', n => `${name}${n}`, unitType);
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
