import type { TokenColor } from './index';

// ─────────────────────────────────────────────
// 상태 프리셋 색상 옵션
// ─────────────────────────────────────────────

export interface PresetColorOption {
  value: TokenColor;
  label: string;
  bg:    string;
  border: string;
  text:  string;
}

export const PRESET_COLORS: PresetColorOption[] = [
  { value: 'red',    label: '빨강', bg: '#E53935', border: '#c62828', text: '#fff' },
  { value: 'yellow', label: '노랑', bg: '#FBC02D', border: '#f9a825', text: '#000' },
  { value: 'blue',   label: '파랑', bg: '#1565C0', border: '#0D47A1', text: '#fff' },
  { value: 'white',  label: '흰색', bg: '#F5F5F5', border: '#bdbdbd', text: '#222' },
  { value: 'green',  label: '추천', bg: '#43A047', border: '#2e7d32', text: '#fff' },
];

// ─────────────────────────────────────────────
// 출동대 종류 정의
// ─────────────────────────────────────────────

export interface UnitTypeEntry {
  key: string;
  label: string;
}

/**
 * 프로젝트 전반에서 사용하는 출동대 종류 목록.
 * UnitStatus.tsx 토큰 생성, 설정창 체크박스, 필터링에 공통 사용.
 */
export const UNIT_TYPES: UnitTypeEntry[] = [
  { key: 'suppression',    label: '진압대'    },
  { key: 'rescue',         label: '구조대'    },
  { key: 'ems',            label: '구급대'    },
  { key: 'pump',           label: '펌프차'    },
  { key: 'ladder',         label: '굴절차'    },
  { key: 'aerial',         label: '고가차'    },
  { key: 'water_tank',     label: '물탱크차'  },
  { key: 'rescue_vehicle', label: '구조차'    },
  { key: 'hazmat',         label: '화학차'    },
  { key: 'smoke_exhaust',  label: '배연차'    },
  { key: 'wildfire',       label: '산불진화차' },
  { key: 'agency',         label: '유관기관'  },
];

export function getUnitLabel(key: string): string {
  return UNIT_TYPES.find(u => u.key === key)?.label ?? key;
}

// ─────────────────────────────────────────────
// 공통 프리셋 (여러 출동대에 공통 적용 가능)
// ─────────────────────────────────────────────

/**
 * targetTypes: 이 프리셋을 보여줄 출동대 unitType 목록.
 * 빈 배열([])이면 모든 출동대에 표시 (공통 프리셋).
 */
export interface SharedBadgePreset {
  id: string;
  topText: string;
  bottomText?: string;
  targetTypes: string[];
  color?: TokenColor;
}

// ─────────────────────────────────────────────
// 출동대 종류별 고유 프리셋
// ─────────────────────────────────────────────

export interface UnitSpecificBadgePreset {
  id: string;
  unitType: string;  // e.g. 'suppression', 'rescue', 'pump', 'ladder'
  topText: string;
  bottomText?: string;
  color?: TokenColor;
}
