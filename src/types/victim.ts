// ─────────────────────────────────────────────
// 구조대상자 토큰 타입 정의
// ─────────────────────────────────────────────

export type VictimGender    = '남' | '여';
export type VictimAgeGroup  = '소아' | '10대' | '20대' | '30대' | '40대' | '50대' | '60대' | '70대' | '80대';
export type VictimCondition = '경상' | '중상' | '사망' | '고립' | '의식없음';
export type VictimKind      = 'person' | 'custom';
export type VictimCreationMode = 'random' | 'manual' | 'custom';

export const VICTIM_GENDERS: VictimGender[] = ['남', '여'];

export const VICTIM_AGE_GROUPS: VictimAgeGroup[] = [
  '소아', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대',
];

export const VICTIM_CONDITIONS: VictimCondition[] = [
  '경상', '중상', '사망', '고립', '의식없음',
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
  /** 자동 위치: 토큰이 배치된 구역 레이블 (예: "3F", "A면"). 미배치 시 빈 문자열 */
  location:      string;
  /** 수동 세부위치: 사용자 직접 입력 (예: "212호", "복도"). 없으면 빈 문자열 */
  subLocation:   string;
  displayTop:    string;
  displayBottom: string;
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
