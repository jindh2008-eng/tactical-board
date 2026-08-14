/**
 * protocol.ts — 지휘교수 태블릿 ⇄ 무전플레이어 화면 동기화 메시지 계약
 *
 * ★ 이 파일은 서버(server/server.mjs)와 클라이언트가 공유하는 계약이다.
 *   병렬 작업(Track A/B/C) 중에는 수정하지 않는다.
 *   변경이 필요하면 전 트랙을 멈추고 합의한 뒤 고친다.
 *   → docs/DUAL_SCREEN_PARALLEL_WORKPLAN.md §3.1, §4
 *
 * 설계 원칙 (docs/DUAL_SCREEN_SYNC_PLAN.md §4.1, §5.6):
 *  - 무플 화면이 모든 런타임 상태를 단독 소유한다 (진실의 원천)
 *  - 교수 태블릿은 명령만 보내고, 체크 현황을 그대로 그리는 무상태 미러다
 *  - 명령은 "무엇을 눌렀는지"만 담는다. 결과 상태 계산은 언제나 무플이 한다
 *    → 체크리스트에 새 항목 타입이 추가돼도 이 파일은 그대로다
 */

export const SYNC_PORT = 8787;
export const SYNC_PATH = '/ws';
export const PROTOCOL_V = 1;

export type Role = 'player' | 'instructor';

// ─────────────────────────────────────────────
// 메시지
// ─────────────────────────────────────────────

/** 접속 신고 — 연결 직후 1회 */
export interface HelloMessage {
  type: 'hello';
  role: Role;
}

/** 교수 → 무플 : 체크리스트 항목 토글 요청 */
export interface ToggleCommand {
  type:     'checklist.toggle';
  itemId:   string;
  /** 목표 상태. 무플이 이미 그 상태면 무시한다 (멱등) */
  checking: boolean;
}

/** 무플 → 교수 : 체크 현황 전량. 태블릿은 이 값을 그대로 그린다 */
export interface CheckedState {
  type:       'state.checked';
  checkedIds: string[];
}

/**
 * 무플 → 교수 : 설정 번들 1회 전송.
 * bundle 은 utils/settingsStorage.ts 의 SettingsExport 형태.
 * 태블릿에는 설정이 없으므로 이걸 받아야 체크리스트를 그릴 수 있다.
 */
export interface SettingsBundle {
  type:   'settings.bundle';
  bundle: unknown;
}

export type SyncMessage =
  | HelloMessage
  | ToggleCommand
  | CheckedState
  | SettingsBundle;

/** 전송 단위 */
export interface Envelope {
  v:   number;
  ts:  number;
  msg: SyncMessage;
}

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

export function envelope(msg: SyncMessage): Envelope {
  return { v: PROTOCOL_V, ts: Date.now(), msg };
}

/**
 * 수신 문자열 → Envelope 파싱.
 * 형태가 어긋나면 null 을 반환한다 (훈련 중 예외로 화면이 죽지 않도록).
 */
export function parseEnvelope(raw: string): Envelope | null {
  try {
    const parsed = JSON.parse(raw) as Envelope;
    if (parsed?.v !== PROTOCOL_V) return null;
    if (!parsed.msg || typeof parsed.msg.type !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}
