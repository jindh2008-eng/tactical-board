/**
 * 유닛타입별 임무/상태 태그 프리셋
 * - missionPresets : 좌측 임무 레이블 (역할 지정, 파란 계열)
 * - statusPresets  : 상단 상태 태그 (컨디션, 빨간/노란 계열)
 */

export interface StatusPreset {
  label: string;
  color: string;   // 'blue' | 'yellow' | 'red' | 'green' | 'white'
  abbr?: string;   // 좌측 임무 레이블용 약어 (없으면 label 앞 3자)
}

interface UnitPresets {
  missions: StatusPreset[];
  statuses: StatusPreset[];
}

const UNIT_PRESETS: Record<string, UnitPresets> = {
  suppression: {
    missions: [
      { label: '단위지휘관', color: 'blue',   abbr: '단위' },
      { label: 'RIT임무',    color: 'yellow', abbr: 'RIT'  },
    ],
    statuses: [
      { label: '대원부상', color: 'red' },
    ],
  },
  rescue: {
    missions: [
      { label: '단위지휘관', color: 'blue',   abbr: '단위' },
      { label: 'RIT임무',    color: 'yellow', abbr: 'RIT'  },
    ],
    statuses: [
      { label: '대원부상', color: 'red' },
    ],
  },
  ems: {
    missions: [
      { label: '단위지휘관',  color: 'blue', abbr: '단위' },
      { label: '임시의료소장', color: 'blue', abbr: '의료' },
    ],
    statuses: [],
  },
  pump: {
    missions: [
      { label: '1선펌프',   color: 'blue', abbr: '1선' },
      { label: '중요물탱크', color: 'blue', abbr: '중요' },
      { label: '순환보수',   color: 'blue', abbr: '순환' },
    ],
    statuses: [
      { label: '펌프고장', color: 'red' },
    ],
  },
  water_tank: {
    missions: [
      { label: '1선펌프',   color: 'blue', abbr: '1선' },
      { label: '중요물탱크', color: 'blue', abbr: '중요' },
      { label: '순환보수',   color: 'blue', abbr: '순환' },
    ],
    statuses: [
      { label: '펌프고장', color: 'red' },
    ],
  },
};

export function getMissionPresets(unitType: string): StatusPreset[] {
  return UNIT_PRESETS[unitType]?.missions ?? [];
}

export function getStatusPresets(unitType: string): StatusPreset[] {
  return UNIT_PRESETS[unitType]?.statuses ?? [];
}
