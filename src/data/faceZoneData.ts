import type { Face, FaceZone, AssignmentType } from '../types';

// ─────────────────────────────────────────────
// 방면별 메타 정보
// ─────────────────────────────────────────────

export interface FaceMeta {
  label:      string;
  sublabel:   string;
  isPrimary?: boolean;   // A면(진입면)만 true
}

export const FACE_META: Record<Face, FaceMeta> = {
  A: { label: 'A면', sublabel: '진입면', isPrimary: true },
  B: { label: 'B면', sublabel: '우측면' },
  C: { label: 'C면', sublabel: '후면'   },
  D: { label: 'D면', sublabel: '좌측면' },
};

// ─────────────────────────────────────────────
// 방면 zone 목록 생성
//
// 각 면마다 3개의 zone:
//   1) 일반 면 영역   (category: 'face')
//   2) 1선펌프 부서칸 (category: 'assignment', assignmentType: 'pump')
//   3) 중요물탱크 부서칸 (category: 'assignment', assignmentType: 'tank')
//
// zone.id 설계:
//   "A-face", "A-pump", "A-tank"
//   "B-face", "B-pump", "B-tank" ...
//
// 이 id가 향후 드래그/로그 시스템에서 구분 키로 사용됨.
// ─────────────────────────────────────────────

export function getFaceZones(face: Face): FaceZone[] {
  return [
    {
      id:       `${face}-face`,
      face,
      category: 'face',
      label:    `${face}면`,
      tokenIds: [],
    },
    {
      id:             `${face}-pump`,
      face,
      category:       'assignment',
      assignmentType: 'pump',
      label:          '1선펌프 부서',
      tokenIds:       [],
    },
    {
      id:             `${face}-tank`,
      face,
      category:       'assignment',
      assignmentType: 'tank',
      label:          '중요물탱크 부서',
      tokenIds:       [],
    },
  ];
}

// ─────────────────────────────────────────────
// 로그 문자열 생성 헬퍼
//
// 향후 드래그 완료 이벤트에서 LogEntry.note를 생성하는 데 사용.
// zone의 category로 '일반 이동' vs '부서 지정' 을 구분한다.
//
// 사용 예:
//   getFaceZoneLogText({ category:'face', face:'A' }, '진압1대')
//   → "진압1대 A면으로 이동"
//
//   getFaceZoneLogText({ category:'assignment', assignmentType:'pump', face:'B' }, '진압1대')
//   → "진압1대 B방면 부서 1선 펌프차 지정"
// ─────────────────────────────────────────────

const ASSIGNMENT_LABEL: Record<AssignmentType, string> = {
  pump: '1선 펌프차',
  tank: '중요 물탱크차',
};

export function getFaceZoneLogText(zone: FaceZone, tokenName: string): string {
  if (zone.category === 'face') {
    return `${tokenName} ${zone.face}면으로 이동`;
  }
  const roleLabel = ASSIGNMENT_LABEL[zone.assignmentType!];
  return `${tokenName} ${zone.face}방면 부서 ${roleLabel} 지정`;
}

// ─────────────────────────────────────────────
// DOM data-* 속성 생성 헬퍼
//
// ZoneCell이나 외곽 zone에 data 속성을 일관되게 붙이기 위한 헬퍼.
// 향후 drag event handler에서 e.currentTarget.dataset 으로 읽음.
// ─────────────────────────────────────────────

export function getFaceZoneDataAttrs(zone: FaceZone): Record<string, string> {
  const attrs: Record<string, string> = {
    'data-face-zone-id':    zone.id,
    'data-face':            zone.face,
    'data-zone-category':   zone.category,
  };
  if (zone.assignmentType) {
    attrs['data-assignment-type'] = zone.assignmentType;
  }
  return attrs;
}
