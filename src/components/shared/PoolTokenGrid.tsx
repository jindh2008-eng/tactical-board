import type { UnitToken } from '../../types';
import { useSettings } from '../../store/settingsStore';
import { TokenCard } from './TokenCard';
import { isMountedPump } from '../../utils/unitPairing';
import './PoolTokenGrid.css';

// ─────────────────────────────────────────────
// 출동대현황 · 추가출동대 · 자원대기소 · 대기1단계 공용 배열 — 종류별 6열(세로 쌓기)
//
// 자원대기소·대기1단계도 이 목록을 쓴다(2026-09-15 사용자 정의). 예전에는 맨 윗줄에
// 방금 들어온 「도착대」를 따로 두고 아래를 다른 5열 목록으로 그렸는데, 도착은 이제
// 이벤트 로그가 알려 주므로 출동대현황 모드1 과 같은 모양으로 맞췄다.
//
// 진압대에 동승 중인 펌프는 숨긴다. 대기 박스에서는 진압대 하나로 다루고,
// 펌프는 진압대가 출동할 때 자원대기소·대기1단계까지 함께 나가며 그때 보인다
// (TokenContext.moveToken). 짝이 먼저 나가 홀로 남은 펌프는 감추지 않는다.
// 판정(isMountedPump)이 출동대현황·추가출동대에서만 참이라 두 대기구역에서는 펌프가 보인다.
// ─────────────────────────────────────────────

type ColumnKey = 'suppression' | 'rescueEms' | 'waterTank' | 'special' | 'agency' | 'custom';

/** 왼쪽부터의 열 순서. 이름표는 붙이지 않는다 — 토큰만 봐도 종류가 읽힌다 */
const COLUMN_ORDER: ColumnKey[] = [
  'suppression', 'rescueEms', 'waterTank', 'special', 'agency', 'custom',
];

/** 특수차 — 물탱크를 뺀 나머지 차량 전부 */
const SPECIAL_VEHICLE_TYPES = new Set([
  'rescue_vehicle', 'aerial', 'ladder', 'smoke_exhaust', 'hazmat', 'wildfire', 'command',
]);

function categorize(unitType: string): ColumnKey {
  if (unitType === 'suppression') return 'suppression';
  if (unitType === 'rescue' || unitType === 'ems') return 'rescueEms';
  if (unitType === 'water_tank') return 'waterTank';
  if (unitType === 'pump' || SPECIAL_VEHICLE_TYPES.has(unitType)) return 'special';
  if (unitType === 'agency') return 'agency';
  return 'custom';
}

interface Props {
  tokens:              UnitToken[];
  selectMode?:         boolean;
  selected?:           Set<string>;
  onToggleSelect?:     (tokenId: string) => void;
  onTokenDoubleClick?: (tokenId: string) => void;
}

export function PoolTokenGrid({
  tokens, selectMode, selected, onToggleSelect, onTokenDoubleClick,
}: Props) {
  const { dispatchRoster } = useSettings();

  // 동승 중인 펌프만 감춘다 (홀로 만든 펌프·짝을 잃은 펌프는 그대로 보인다)
  const visible = tokens.filter(t => !isMountedPump(t, tokens, dispatchRoster));

  const columns = COLUMN_ORDER
    .map(key => ({ key, items: visible.filter(t => categorize(t.unitType) === key) }))
    .filter(col => col.items.length > 0);   // 빈 열은 자리를 차지하지 않게 뺀다

  if (columns.length === 0) return null;

  return (
    <div className="ptg">
      {columns.map(col => (
        <div key={col.key} className="ptg__column">
          {col.items.map(token => (
            <TokenCard
              key={token.id}
              token={token}
              selectMode={selectMode}
              selected={selected?.has(token.id)}
              onToggleSelect={onToggleSelect ? () => onToggleSelect(token.id) : undefined}
              onDoubleClick={onTokenDoubleClick ? () => onTokenDoubleClick(token.id) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
