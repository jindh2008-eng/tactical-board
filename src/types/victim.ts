// ─────────────────────────────────────────────
// 구조대상자 토큰 타입 정의
// ─────────────────────────────────────────────

export type VictimGender    = '남' | '여';
export type VictimAgeGroup  = '소아' | '10대' | '20대' | '30대' | '40대' | '50대' | '60대' | '70대' | '80대';
export type VictimCondition = '경상' | '중상' | '의식없음';
export type VictimKind      = 'person' | 'custom';
export type VictimCreationMode = 'random' | 'manual' | 'custom';

/** 건물 외곽 방면 — VictimSetupItem 과 VictimToken 공통 사용 */
export type VictimFace = 'A' | 'B' | 'C' | 'D';
export const VICTIM_FACES: VictimFace[] = ['A', 'B', 'C', 'D'];

export const VICTIM_GENDERS: VictimGender[] = ['남', '여'];

export const VICTIM_AGE_GROUPS: VictimAgeGroup[] = [
  '소아', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대',
];

export const VICTIM_CONDITIONS: VictimCondition[] = [
  '경상', '중상', '의식없음',
];

// ─────────────────────────────────────────────
// 구조대상자 토큰
// ─────────────────────────────────────────────

export interface VictimToken {
  id:            string;
  kind:          VictimKind;
  gender?:       VictimGender;
  ageGroup?:     VictimAgeGroup;
  condition?:    VictimCondition;
  customLabel?:  string;
  /**
   * 명시적 방면 정보 — VictimSetupItem.face 에서 복사.
   * subLocation 문자열에 묻어있던 면 정보를 별도 필드로 보존.
   * 수동 생성 시에는 undefined.
   */
  face?:           VictimFace | null;
  /**
   * 세부 위치 원본 — VictimSetupItem.detailLocation 에서 복사.
   * subLocation 과 달리 "A면 /" 접두어 없이 순수 상세위치 문자열만 저장.
   * 수동 생성 시에는 undefined.
   */
  detailLocation?: string;
  /**
   * 현재 위치: 토큰이 현재 있는 구역 레이블 (예: "3F", "임시의료소").
   * 이동할 때마다 갱신됨.
   */
  location:      string;
  /** 수동 세부위치: 사용자 직접 입력 (예: "212호", "복도"). 없으면 빈 문자열 */
  subLocation:   string;
  /**
   * 구조위치: 임시의료소로 이동하기 직전의 층+구역 레이블 (예: "3F 중앙구역 212호").
   * 구조 처리 시 최초 1회 기록되며 이후 변경되지 않음.
   * 구조현황통계·이동로그 등에서 "어디서 구조됐는가"의 기준으로 사용.
   */
  rescueLocation?: string;
  displayTop:    string;
  displayBottom: string;
  /**
   * 최초 구조 위치 표시 — 설정에서 생성 시 또는 건물/방면 구역에 최초 배치 시 1회 기록.
   * 이후 임시의료소·대기 구역으로 이동해도 변경되지 않는다.
   * VictimCard 하단 줄에 이 값을 우선 표시함으로써 "어디서 구조됐는가" 맥락을 유지.
   */
  originDisplayBottom?: string;
  zoneKey:       string | null;
}

// ─────────────────────────────────────────────
// createVictim 입력 타입
// ─────────────────────────────────────────────

export type CreateVictimInput =
  | {
      kind:        'person';
      gender:      VictimGender;
      ageGroup:    VictimAgeGroup;
      condition:   VictimCondition;
      subLocation: string;          // 생성 시 입력하는 세부위치
    }
  | {
      kind:        'custom';
      customLabel: string;
      subLocation: string;
    };
