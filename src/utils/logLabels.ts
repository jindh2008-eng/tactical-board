/**
 * 이벤트 로그의 사람이 읽는 레이블 — 화면(LogPanel)과 내보내기(exportLog)가 공유한다.
 *
 * 종전에는 같은 표가 두 파일에 글자 단위로 복제돼 있어, 구역이 늘면 두 곳을 같이
 * 고쳐야 했고 한쪽만 고치면 화면과 CSV가 어긋났다.
 * docs/EVENT_LOG_PLAN.md L-6 / E-3-5
 */

const STATIC_LABELS: Record<string, string> = {
  pool:               '대기(풀)',
  'medical-post':     '임시의료소',
  'standby-resource': '자원대기소',
  'standby-standby1': '대기1단계',
  'standby-imminent': '직전대기',
  'standby-rit':      'RIT',
  'command-post':     '현장지휘소',
  'unit-add':         '추가출동대',
  'face-A':           'A면',
  'face-B':           'B면',
  'face-C':           'C면',
  'face-D':           'D면',
};

const ZONE_NAMES: Record<string, string> = {
  left:   '단위',
  center: '내부',
  right:  '화재',
  stair:  '계단실',
};

/** 층 id → 표시명. 'RF' → 옥상, '3F' → 3층, 'B1' → B1층 */
export function floorIdLabel(floorId: string): string {
  if (floorId === 'RF') return '옥상';
  const above = floorId.match(/^(\d+)F$/);
  if (above) return `${above[1]}층`;
  const below = floorId.match(/^B(\d+)$/);
  if (below) return `B${below[1]}층`;
  return floorId;
}

/** 구역 키 → 표시명. "3F-stair" → "3층 계단실" */
export function zoneLabel(zoneId: string): string {
  if (STATIC_LABELS[zoneId]) return STATIC_LABELS[zoneId];
  const dashIdx = zoneId.lastIndexOf('-');
  if (dashIdx > 0) {
    const floor = zoneId.slice(0, dashIdx);
    const zone  = zoneId.slice(dashIdx + 1);
    if (ZONE_NAMES[zone]) return `${floorIdLabel(floor)} ${ZONE_NAMES[zone]}`;
  }
  return zoneId;
}

// ─────────────────────────────────────────────
// 구역 키 → 구조화된 위치
//
// 좌표는 담지 않는다 — 분석에 필요한 것은 "A~D 어느 면인가 / 몇 층 계단실인가 /
// 몇 층 내부인가"까지이지 구역 안 픽셀 위치가 아니다(사용자 확정 2026-08-20).
// docs/EVENT_LOG_PLAN.md X-1
// ─────────────────────────────────────────────

export type ZonePart =
  | 'floor-inside'   // 층 내부
  | 'floor-stair'    // 층 계단실
  | 'face'           // 외곽 방면 A~D
  | 'staging'        // 대기1단계·직전대기·자원대기소·임시의료소·추가출동대
  | 'pool'           // 출동대현황(미도착)
  | 'other';

export interface ZoneRef {
  zoneKey: string;
  floorId: string | null;   // 'floor-*' 일 때만
  face:    string | null;   // 'face' 일 때만 ('A' ~ 'D')
  part:    ZonePart;
  label:   string;          // 사람이 읽는 이름
}

const STAGING_KEYS = new Set([
  'medical-post', 'standby-resource', 'standby-standby1', 'standby-imminent',
  'standby-rit', 'command-post', 'unit-add',
]);

export function parseZoneKey(zoneKey: string | null | undefined): ZoneRef {
  const key = zoneKey ?? 'pool';
  if (key === 'pool' || key === '') {
    return { zoneKey: 'pool', floorId: null, face: null, part: 'pool', label: '대기(풀)' };
  }
  if (key.startsWith('face-')) {
    const face = key.slice('face-'.length);
    return { zoneKey: key, floorId: null, face, part: 'face', label: `${face}면` };
  }
  if (STAGING_KEYS.has(key)) {
    return { zoneKey: key, floorId: null, face: null, part: 'staging', label: zoneLabel(key) };
  }
  const dashIdx = key.lastIndexOf('-');
  if (dashIdx > 0) {
    const floorId = key.slice(0, dashIdx);
    const zone    = key.slice(dashIdx + 1);
    if (zone === 'stair' || zone === 'center') {
      return {
        zoneKey: key, floorId, face: null,
        part:  zone === 'stair' ? 'floor-stair' : 'floor-inside',
        label: zoneLabel(key),
      };
    }
  }
  return { zoneKey: key, floorId: null, face: null, part: 'other', label: zoneLabel(key) };
}

/**
 * 로그에 쓰는 구조대상자 표시명 — 「남/40대/중상」.
 *
 * VictimContext 안에만 있던 것을 꺼냈다. 고가차 바스켓 구조(AerialOverlay)도
 * 같은 형식으로 로그를 남겨야 하는데, 컨텍스트 파일에서 함수를 내보내면
 * react-refresh 규칙에 걸린다.
 */
export function victimDisplayName(v: {
  customLabel?: string; kind?: string; groupCount?: number;
  gender?: string; ageGroup?: string; age?: number; condition?: string;
}): string {
  if (v.customLabel) return v.customLabel;
  if (v.kind === 'group') return `${v.groupCount ?? '?'}명`;
  const parts = [v.gender, v.ageGroup ?? (v.age != null ? `${v.age}세` : undefined), v.condition]
    .filter(Boolean);
  return parts.length > 0 ? (parts as string[]).join('/') : '구조대상자';
}
