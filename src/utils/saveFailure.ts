// ─────────────────────────────────────────────
// 훈련 상태 저장 실패 알림
//
// 훈련창의 상태는 sessionStorage 에 저장된다(utils/runtimeSession). 예전에는 저장이 실패해도
// (저장 공간 초과 · 사생활 보호 모드) 조용히 넘어갔다 — 그대로 새로고침하면 마지막 저장
// 이후의 로그·배치가 사라지는데 아무도 모른다. 실패하면 이벤트를 쏘고 훈련창 배너
// (components/shared/SaveFailureBanner)가 받아 경고한다(2026-09-15).
//
// 저장은 디바운스돼 계속 불린다 — 같은 알림을 쉴 새 없이 쏘지 않게 10초에 한 번으로 줄인다.
// ─────────────────────────────────────────────

export const SAVE_FAILED_EVENT = 'tactical-board:save-failed';

export interface SaveFailureDetail {
  /** 실패한 sessionStorage 키 — 'tactical-board.runtime.logs' 등 */
  key:   string;
  /** 저장 공간이 모자라 실패했는가(아니면 사생활 보호 모드 등) */
  quota: boolean;
}

const THROTTLE_MS = 10_000;
let lastReportedAt = 0;

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

export function reportSaveFailure(key: string, error: unknown): void {
  const now = Date.now();
  if (now - lastReportedAt < THROTTLE_MS) return;
  lastReportedAt = now;
  console.warn('[runtimeSession] 저장 실패', key, error);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SaveFailureDetail>(SAVE_FAILED_EVENT, {
    detail: { key, quota: isQuotaError(error) },
  }));
}
