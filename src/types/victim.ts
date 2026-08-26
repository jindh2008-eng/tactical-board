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
// 중증도 분류(트리아지)
//
// 현장에서 파악한 증상(경상/중상/사망)과 별개로, 임시의료소에서는
// 환자를 4단계로 다시 분류한다. 진입 시 1회 배정되며 이후 바뀌지 않는다.
//
//   지연   — 병원에 이송해도 가망이 없는 사망추정 환자
//   긴급   — 즉시 처치·이송이 필요한 환자
//   응급   — 처치는 필요하나 이송을 미룰 수 있는 환자
//   비응급 — 경미해 후순위로 둘 수 있는 환자
// ─────────────────────────────────────────────

export type VictimTriage = '긴급' | '응급' | '비응급' | '지연';

/** 통계 표시 순서 — 지연 → 긴급 → 응급 → 비응급 */
export const VICTIM_TRIAGES: VictimTriage[] = ['지연', '긴급', '응급', '비응급'];

/**
 * 증상 → 중증도 후보 2단계.
 * 임시의료소에서 재평가하는 절차라 각 증상이 인접한 두 단계 중 하나로 갈린다.
 * (사망추정이 소생 가능으로 판정되면 긴급, 경상이 안정적이면 비응급 …)
 */
const TRIAGE_CANDIDATES: Record<VictimCondition, readonly [VictimTriage, VictimTriage]> = {
  '사망': ['지연', '긴급'],
  '중상': ['긴급', '응급'],
  '경상': ['응급', '비응급'],
};

/** 증상에 따라 중증도를 무작위 배정. 임시의료소 진입 시 1회만 호출된다. */
export function classifyTriage(condition: VictimCondition): VictimTriage {
  const pair = TRIAGE_CANDIDATES[condition];
  return pair[Math.random() < 0.5 ? 0 : 1];
}

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
  /** 중증도 분류 스냅샷 — 임시의료소 진입 시 1회 배정. 구조활동통계 기준. */
  triage?:         VictimTriage;
  /**
   * 이송 중인 출동대 토큰 ID.
   * 구조대상자를 출동대 위에 드롭하면 연결되고, 이후 그 출동대가 구역을 옮기면
   * 따라 움직인다. 임시의료소 도착 시 자동 구조 처리되며 해제되고,
   * 구조대상자를 다른 곳으로 직접 드래그해도 해제된다.
   */
  carriedBy?:      string;
  /** 최초 배치 위치 표시 스냅샷 — 이동 후에도 유지. 카드 위치 표시 기준. */
  originDisplayBottom?: string;
  /**
   * 최초 배치 **구역 키** 스냅샷 — 이동해도 바뀌지 않는다.
   *
   * 구조대상자는 훈련 중 자리를 옮긴다. 특히 건물 내부에서 방면으로
   * 「추락」하는 개념이 있어, 옥상에 둔 사람이 A면으로 내려간 뒤 구조되는
   * 흐름이 흔하다. 이때 구조 현황은 **원래 있던 옥상** 기준으로 세어야 한다
   * (zoneKey 는 이미 medical-post 로 바뀌어 있고, 그 전에도 face-A 였다).
   *
   * originDisplayBottom 은 사람이 읽는 문자열이라 집계에 못 쓴다.
   * 이쪽은 parseZoneKey() 로 floorId·face 를 그대로 뽑을 수 있는 원본 키다.
   */
  originZoneKey?: string;
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
