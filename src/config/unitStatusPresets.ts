/**
 * 유닛타입별 고정 상태 태그 프리셋
 * 우클릭 원형 메뉴에 표시되는 선택 항목.
 * 단일 선택(토글) 방식 — 같은 태그 재선택 시 해제.
 */

export interface StatusPreset {
  label: string;
  color: string;   // 'blue' | 'yellow' | 'red' | 'green' | 'white'
}

/** unitType → 상태 태그 목록 매핑 */
const UNIT_STATUS_PRESETS: Record<string, StatusPreset[]> = {
  suppression: [
    { label: '단위지휘관', color: 'blue'   },
    { label: 'RIT임무',    color: 'yellow' },
    { label: '대원부상',   color: 'red'    },
  ],
  rescue: [
    { label: '단위지휘관', color: 'blue'   },
    { label: 'RIT임무',    color: 'yellow' },
    { label: '대원부상',   color: 'red'    },
  ],
  ems: [
    { label: '단위지휘관',  color: 'blue' },
    { label: '임시의료소장', color: 'blue' },
  ],
  pump: [
    { label: '1선펌프',   color: 'blue'   },
    { label: '중요물탱크', color: 'blue'   },
    { label: '펌프고장',   color: 'red'    },
    { label: '순환보수',   color: 'blue'   },
  ],
  water_tank: [
    { label: '1선펌프',   color: 'blue'   },
    { label: '중요물탱크', color: 'blue'   },
    { label: '펌프고장',   color: 'red'    },
    { label: '순환보수',   color: 'blue'   },
  ],
  // aerial: 전용 AerialBarMenu 섹션(UnitStatusBarMenu 내)에서 처리 — 여기서 프리셋 불필요
  // ladder: 전용 AerialBarMenu 섹션(UnitStatusBarMenu 내)에서 처리 — 여기서 프리셋 불필요
  // hydrant: 전용 HydrantBarMenu 사용 — 여기서 프리셋 불필요
};

/** unitType에 해당하는 프리셋 목록 반환 (없으면 빈 배열) */
export function getStatusPresets(unitType: string): StatusPreset[] {
  return UNIT_STATUS_PRESETS[unitType] ?? [];
}
