// ─────────────────────────────────────────────
// 구조대상자 토큰 타입 정의
// ─────────────────────────────────────────────

export type VictimGender    = '남' | '여';
export type VictimAgeGroup  = '소아' | '10대' | '20대' | '30대' | '40대' | '50대' | '60대' | '70대' | '80대';
export type VictimCondition = '경상' | '중상' | '사망';
export type VictimKind      = 'person' | 'custom' | 'group';
export type VictimCreationMode = 'random' | 'manual' | 'custom' | 'group';

/** 건물 외곽 방면 — VictimSetupItem 과 VictimToken 공통 사용 */
export type VictimFace = 'A' | 'B' | 'C' | 'D';
export const VICTIM_FACES: VictimFace[] = ['A', 'B', 'C', 'D'];

export const VICTIM_GENDERS: VictimGender[] = ['남', '여'];

export const VICTIM_AGE_GROUPS: VictimAgeGroup[] = [
  '소아', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대',
];

export const VICTIM_CONDITIONS: VictimCondition[] = ['경상', '중상', '사망'];

// ─────────────────────────────────────────────
// 구조대상자 토큰
// ─────────────────────────────────────────────

export interface VictimToken {
  id:           string;
  kind:         VictimKind;
  gender?:      VictimGender;
  age?:         number;
  ageGroup?:    VictimAgeGroup;
  condition?:   VictimCondition;
  customLabel?: string;
  groupCount?:  number;
  /** 방면 정보 — 로스터 생성 시 복사. 수동 생성 시 undefined. */
  face?:           VictimFace | null;
  /** 순수 상세위치 — 면 접두어 없이 저장 (예: "205호", "복도"). 없으면 빈 문자열 */
  subLocation:  string;
  /** 구조위치 스냅샷 — 임시의료소 진입 시 1회 기록. 통계 기준. */
  rescueLocation?: string;
  /** 최초 배치 위치 표시 스냅샷 — 이동 후에도 유지. 카드 위치 표시 기준. */
  originDisplayBottom?: string;
  zoneKey:      string | null;
}

// ─────────────────────────────────────────────
// createVictim 입력 타입
// ─────────────────────────────────────────────

export type CreateVictimInput =
  | {
      kind:        'person';
      gender:      VictimGender;
      age:         number;
      condition:   VictimCondition;
      subLocation: string;
    }
  | {
      kind:        'custom';
      customLabel: string;
      subLocation: string;
    }
  | {
      kind:        'group';
      groupCount:  number;
      condition:   VictimCondition;
      subLocation: string;
    };
