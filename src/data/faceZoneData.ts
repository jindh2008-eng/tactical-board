import type { Face, FaceZone } from '../types';

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
  ];
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
  return attrs;
}
