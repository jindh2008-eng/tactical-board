import type { UnitToken } from '../../types';
import { TokenCard } from './TokenCard';
import './CategorizedTokenGrid.css';

// ─────────────────────────────────────────────
// 우측 패널(자원대기소/대기1단계/출동대현황) 공용 —
// 출동대 종류별 5개 컬럼으로 분류해서 세로로 쌓아 표시.
// 병합 컬럼 내부는 하위 종류끼리 붙여서 쌓임(도착순 유지, 종류 우선).
// ─────────────────────────────────────────────

type ColumnKey = 'suppression' | 'rescueEms' | 'pump' | 'waterOther' | 'agencyCustom';

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'suppression',  label: '진압대'    },
  { key: 'rescueEms',    label: '구조/구급' },
  { key: 'pump',         label: '펌프'      },
  { key: 'waterOther',   label: '물탱크/기타' },
  { key: 'agencyCustom', label: '유관/직접' },
];

// 물탱크 외 차량 — 하나의 컬럼에 등록순으로 혼합 배치
const OTHER_VEHICLE_TYPES = new Set([
  'rescue_vehicle', 'aerial', 'ladder', 'smoke_exhaust', 'hazmat', 'wildfire',
]);

function categorize(unitType: string): ColumnKey {
  if (unitType === 'suppression') return 'suppression';
  if (unitType === 'rescue' || unitType === 'ems') return 'rescueEms';
  if (unitType === 'pump') return 'pump';
  if (unitType === 'water_tank' || OTHER_VEHICLE_TYPES.has(unitType)) return 'waterOther';
  return 'agencyCustom'; // agency, general(직접입력) 등 나머지
}

// 병합 컬럼 내부 하위 그룹 정렬 우선순위 — 같은 종류끼리 붙어서 쌓이도록
// (그룹 내부 상대 순서는 안정 정렬로 원래 순서 유지)
const SUBGROUP_PRIORITY: Record<string, number> = {
  rescue: 0, ems: 1,
  water_tank: 0,
  agency: 0, general: 1,
};

interface Props {
  tokens:             UnitToken[];
  selectMode?:        boolean;
  selected?:          Set<string>;
  onToggleSelect?:    (tokenId: string) => void;
  onTokenDoubleClick?: (tokenId: string) => void;
}

export function CategorizedTokenGrid({ tokens, selectMode, selected, onToggleSelect, onTokenDoubleClick }: Props) {
  const columns = COLUMNS.map(col => ({
    ...col,
    items: tokens
      .filter(t => categorize(t.unitType) === col.key)
      .slice()
      .sort((a, b) => (SUBGROUP_PRIORITY[a.unitType] ?? 0) - (SUBGROUP_PRIORITY[b.unitType] ?? 0)),
  }));

  return (
    <div className="ctg">
      {columns.map(col => (
        <div key={col.key} className="ctg__column">
          <div className="ctg__column-body">
            {col.items.length === 0 ? (
              <span className="ctg__placeholder">―</span>
            ) : (
              col.items.map(token => (
                <TokenCard
                  key={token.id}
                  token={token}
                  selectMode={selectMode}
                  selected={selected?.has(token.id)}
                  onToggleSelect={onToggleSelect ? () => onToggleSelect(token.id) : undefined}
                  onDoubleClick={onTokenDoubleClick ? () => onTokenDoubleClick(token.id) : undefined}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
