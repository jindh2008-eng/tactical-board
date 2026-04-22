// ─────────────────────────────────────────────
// 건물 설정 타입
// ─────────────────────────────────────────────

export interface BuildingConfig {
  aboveGroundFloors: number;
  basementFloors:    number;
}

// ─────────────────────────────────────────────
// 건물 내부 구역 타입
// ─────────────────────────────────────────────

export type FloorId = string;

export type ZoneId = 'left' | 'center' | 'right' | 'stair';

export interface ZoneStatus {
  fire?:     boolean;
  smoke?:    boolean;
  fireDoor?: boolean;
  roofDoor?: boolean;
  tokenIds?: string[];
}

export interface Zone {
  id:           ZoneId;
  label:        string;
  status:       ZoneStatus;
  acceptsTokens: boolean;   // 출동대 토큰 배치 허용 여부
}

export interface Floor {
  id:         FloorId;
  label:      string;
  isBasement: boolean;
  zones:      Zone[];
}

/**
 * 화면 표시용 층 행
 *
 * 건물 층수가 많을 때 여러 층을 하나의 행으로 압축 표시하기 위해
 * 실제 층수(startFloor~endFloor)와 화면 레이블(label)을 분리함.
 *
 * isRange === true 이면 label은 "1~3F" 형식, false 이면 "4F" 형식.
 */
export interface DisplayFloor {
  id:         string;    // 고유 키 (예: "10F", "1F-3F", "B1")
  label:      string;    // 화면 표시 레이블 (예: "10F", "1~3F", "B1")
  startFloor: number;    // 이 행이 대표하는 실제 최하 층번호
  endFloor:   number;    // 이 행이 대표하는 실제 최상 층번호
  isRange:    boolean;   // 복수 층 압축 행 여부
  isBasement: boolean;
  zones:      Zone[];    // 렌더링에 사용할 구역 배열
}

// ─────────────────────────────────────────────
// 외곽 작전 면(A/B/C/D) 타입
// ─────────────────────────────────────────────

/** 건물 외부 4개 작전면 */
export type Face = 'A' | 'B' | 'C' | 'D';

/**
 * 코너(모서리) 작전 구역 — 두 방면이 만나는 지점
 * AB = A면·B면 코너, BC = B면·C면 코너, 등
 * 향후 차량 대기·진입로 설정 등에 활용
 */
export type CornerFace = 'AB' | 'BC' | 'CD' | 'AD';

/**
 * 방면 zone의 종류
 *
 * 'face'       : 일반 방면 이동 영역 (차량이 이 면으로 이동)
 * 'assignment' : 역할 지정 부서칸   (특정 역할로 부서 지정)
 */
export type FaceZoneCategory = 'face' | 'assignment';

/**
 * 부서칸 역할 종류 — category === 'assignment' 일 때만 사용
 *
 * 'pump' : 1선펌프 부서칸
 * 'tank' : 중요물탱크 부서칸
 */
export type AssignmentType = 'pump' | 'tank';

/**
 * 외곽 작전면의 드롭 가능 zone 단위
 *
 * data-* 속성으로 DOM에 부착되어 향후 드래그 이벤트 핸들러가
 * 로그 종류(일반 이동 vs 부서 지정)를 판별하는 기반이 됨.
 *
 * 로그 생성 예시 (faceZoneData.ts 의 getFaceZoneLogLabel 참고):
 *   category='face'       → "진압1대 A면으로 이동"
 *   category='assignment' → "진압1대 B방면 부서 1선 펌프차 지정"
 */
export interface FaceZone {
  id:              string;           // e.g. "A-face", "B-pump", "C-tank"
  face:            Face;
  category:        FaceZoneCategory;
  assignmentType?: AssignmentType;   // category === 'assignment' 일 때만
  label:           string;           // 화면 표시용 레이블
  tokenIds?:       string[];         // 향후: 배치된 토큰 ID 목록
}

// ─────────────────────────────────────────────
// 드래그 가능 출동대 토큰
// ─────────────────────────────────────────────

export type TokenType  = 'activity' | 'vehicle' | 'agency' | 'custom';
export type TokenColor = 'red' | 'yellow' | 'green' | 'vehicle' | 'agency';

/** 토큰에 직접 부착되는 상태 배지 (1~2줄 표시) */
export interface TokenBadge {
  id:     string;
  line1:  string;
  line2?: string;
}

/** 재사용 가능한 배지 프리셋 (localStorage 유지) */
export interface BadgePreset {
  id:     string;
  line1:  string;
  line2?: string;
}

export interface UnitToken {
  id:       string;                    // 고유 ID
  label:    string;                    // 표시 이름 (진압1대, 펌프2호 등)
  type:     TokenType;                 // 토큰 종류
  color:    TokenColor;                // 색상 키
  unitType: string;                    // 출동대 종류 키 (e.g. 'suppression', 'pump', 'ladder')
  zoneKey:  string | null;             // 현재 위치 구역 키 (null = pool/출동대현황)
  badges:   TokenBadge[];              // 부착된 상태 배지 목록
  /**
   * 생성 경로
   * 'roster' : dispatchRoster 기반 자동 생성
   * 'manual' : 사용자가 실행 중 직접 생성
   */
  source:   'roster' | 'manual';
}

// ─────────────────────────────────────────────
// 로그 타입 (향후 사용)
// ─────────────────────────────────────────────

/**
 * 로그 종류
 * 'move'       : 일반 이동 (A면으로 이동 등)
 * 'assignment' : 부서 지정 (B방면 1선펌프 부서 지정)
 * 'rescue'     : 구조 처리 (구조대상자 → 임시의료소 이동)
 */
export type LogType = 'move' | 'assignment' | 'rescue';

export interface LogEntry {
  id:             string;
  timestamp:      string;
  logType:        LogType;
  tokenId:        string;
  tokenName:      string;
  tokenColor?:    TokenColor;
  fromZoneId:     string;
  toZoneId:       string;
  face?:          Face;
  assignmentType?: AssignmentType;
  note?:          string;
}

// ─────────────────────────────────────────────
// 지휘정보 타입 (향후 사용)
// ─────────────────────────────────────────────

export type CommandStrategy = '공격' | '방어' | null;
export type CommandMethod   = '고정' | '전진' | '이동' | null;
