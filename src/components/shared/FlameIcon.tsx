import type { FireStatus } from '../../types';

// ─────────────────────────────────────────────
// 화재상태 → /public/fire-status/ 파일명 매핑
// ─────────────────────────────────────────────

const FLAME_FILES: Record<FireStatus, string> = {
  'extension-peak': '연소확대',
  'peak':           '최성기',
  'seventy':        '70%',
  'half':           '50%',
  'initial':        '초진',
  'complete':       '완진',
};

// 이벤트 상태 문자열 → FireStatus 매핑
export const EVENT_STATUS_TO_FIRE: Record<string, FireStatus> = {
  '연소확대': 'extension-peak',
  '최성기':  'peak',
  '큰불잡음': 'seventy',
  '50%':    'half',
  '초진':   'initial',
  '완진':   'complete',
};

/**
 * 가스/전기 이벤트의 "화재" 상태 — 전용 단계 개념이 없어 firePercentage를
 * 배경색 밴딩(tokenBg)과 동일한 기준으로 화염 이미지 단계에 매핑한다.
 */
export function gasElectricFireStage(firePercentage: number | undefined): FireStatus {
  const pct = firePercentage ?? 0;
  if (pct >= 70) return 'peak';
  if (pct >= 50) return 'seventy';
  return 'half';
}

// ─────────────────────────────────────────────
// FlameIcon
// ─────────────────────────────────────────────

interface FlameIconProps {
  status:     FireStatus;
  size?:      number;
  className?: string;
}

export function FlameIcon({ status, size, className }: FlameIconProps) {
  const file = FLAME_FILES[status];
  return (
    <img
      src={`/fire-status/${file}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
      {...(size !== undefined ? { width: size, height: size } : {})}
      {...(className ? { className } : {})}
    />
  );
}

// ─────────────────────────────────────────────
// FireEventIcon — 이벤트 상태 문자열로 표시
// ─────────────────────────────────────────────

interface FireEventIconProps {
  status:     string;
  size?:      number;
  className?: string;
}

export function FireEventIcon({ status, size = 24, className }: FireEventIconProps) {
  const fs = EVENT_STATUS_TO_FIRE[status];
  if (!fs) return null;
  return <FlameIcon status={fs} size={size} className={className} />;
}
