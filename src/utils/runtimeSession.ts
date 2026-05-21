/**
 * 실행 중 상태 (런타임) → sessionStorage 저장/복원 유틸
 *
 * localStorage(설정 저장)와 역할을 명확히 분리한다.
 * sessionStorage는 브라우저 탭 생명주기 동안만 유지된다.
 *
 * 키 네임스페이스: 'tactical-board.runtime.*'
 */

import type { UnitToken, LogEntry, Pos, DoorState, FireStatus } from '../types';
import type { VictimToken } from '../types/victim';
import type { EventStatus } from '../types/events';

// ─────────────────────────────────────────────
// 저장 키
// ─────────────────────────────────────────────

const KEY_TOKENS  = 'tactical-board.runtime.tokens';
const KEY_VICTIMS = 'tactical-board.runtime.victims';

// ─────────────────────────────────────────────
// 저장 형식
// ─────────────────────────────────────────────

export interface TokenSessionState {
  tokens:     UnitToken[];
  logs:       LogEntry[];
  positions:  Record<string, Pos>;

  /**
   * 절대 도착 시각 (ms timestamp).
   * 저장/복원 시 경과 시간과 무관하게 정확한 남은 시간 계산 가능.
   * 복원 시: remaining = Math.ceil((targetAt - Date.now()) / 1000)
   */
  arrivalTargetAt: Record<string, number>;

  /**
   * 이동 카운트다운 완료 절대 시각 (ms timestamp).
   * arrivalTargetAt 와 동일한 방식으로 복원 시 정확한 남은 시간 계산.
   */
  moveTargetAt?: Record<string, number>;

  /**
   * createToken 카운터 상태.
   * 복원 후 수동 생성 번호가 기존 출동대와 중복되지 않도록 유지.
   */
  counters: Record<string, number>;

  // ── 구버전 호환 필드 (로드 시 arrivalTargetAt 로 변환) ──────────────
  /** @deprecated 3차 이전 저장 데이터 호환용 */
  arrivalCountdowns?: Record<string, number>;
  /** @deprecated 3차 이전 저장 데이터 호환용 */
  savedAt?: number;
}

export interface VictimSessionState {
  victims:         VictimToken[];
  victimPositions: Record<string, Pos>;
}

// ─────────────────────────────────────────────
// 출동대 세션 저장 / 복원
// ─────────────────────────────────────────────

export function saveTokenSession(state: TokenSessionState): void {
  try {
    sessionStorage.setItem(KEY_TOKENS, JSON.stringify(state));
  } catch {
    // quota exceeded 또는 private mode — 무시
  }
}

export function loadTokenSession(): TokenSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY_TOKENS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TokenSessionState;

    if (!Array.isArray(parsed.tokens)) return null;

    // ── 구버전 마이그레이션: arrivalCountdowns + savedAt → arrivalTargetAt ──
    if (!parsed.arrivalTargetAt && parsed.arrivalCountdowns && typeof parsed.savedAt === 'number') {
      const now     = Date.now();
      const elapsed = now - parsed.savedAt;
      const targetAt: Record<string, number> = {};
      for (const [id, secs] of Object.entries(parsed.arrivalCountdowns)) {
        targetAt[id] = now + (secs * 1000 - elapsed);
      }
      parsed.arrivalTargetAt = targetAt;
    }

    parsed.arrivalTargetAt = parsed.arrivalTargetAt ?? {};
    parsed.moveTargetAt    = parsed.moveTargetAt    ?? {};
    parsed.counters        = parsed.counters        ?? {};

    return parsed;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 구조대상자 세션 저장 / 복원
// ─────────────────────────────────────────────

export function saveVictimSession(state: VictimSessionState): void {
  try {
    sessionStorage.setItem(KEY_VICTIMS, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function loadVictimSession(): VictimSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY_VICTIMS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VictimSessionState;
    if (!Array.isArray(parsed.victims)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 훈련 상태 세션 저장 / 복원
// ─────────────────────────────────────────────

const KEY_TRAINING = 'tactical-board.runtime.training';

export type TrainingStatus = 'idle' | 'running' | 'ended';

export interface TrainingSessionState {
  status:    TrainingStatus;
  startedAt: number | null;
  endedAt:   number | null;
}

export function saveTrainingSession(state: TrainingSessionState): void {
  try {
    sessionStorage.setItem(KEY_TRAINING, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function loadTrainingSession(): TrainingSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY_TRAINING);
    if (!raw) return null;
    return JSON.parse(raw) as TrainingSessionState;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 이벤트 토큰 세션 저장 / 복원
// ─────────────────────────────────────────────

const KEY_EVENTS = 'tactical-board.runtime.events';

export interface EventSessionState {
  positions:        Record<string, { x: number; y: number }>;
  statuses:         Record<string, EventStatus>;
  floorIds?:        Record<string, string>;  // eventId → floorId (드롭 시점 저장, 구버전 호환 optional)
  firePercentages?: Record<string, number>;  // 이벤트 화재 진행도 (구버전 호환 optional)
}

export function saveEventSession(state: EventSessionState): void {
  try {
    sessionStorage.setItem(KEY_EVENTS, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function loadEventSession(): EventSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY_EVENTS);
    if (!raw) return null;
    return JSON.parse(raw) as EventSessionState;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 건물 상태 세션
// ─────────────────────────────────────────────

const KEY_BUILDING = 'tactical-board.runtime.building';

export interface BuildingSessionState {
  doorStates:         Record<string, DoorState>;
  fireStates:         Record<string, FireStatus | null>;
  firePercentages:    Record<string, number>;
  stairSmokeFloor:    number | null;
  smokeConcentration: number;
}

export function saveBuildingSession(state: BuildingSessionState): void {
  try {
    sessionStorage.setItem(KEY_BUILDING, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function loadBuildingSession(): BuildingSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY_BUILDING);
    if (!raw) return null;
    return JSON.parse(raw) as BuildingSessionState;
  } catch { return null; }
}

// ─────────────────────────────────────────────
// 송수 연결 세션
// ─────────────────────────────────────────────

const KEY_WATERCONN = 'tactical-board.runtime.waterconn';

export interface WaterConnSessionItem {
  id: string; fromId: string; toId: string;
  fromType: string; toType: string; status: 'active';
}

export function saveWaterConnSession(connections: WaterConnSessionItem[]): void {
  try {
    sessionStorage.setItem(KEY_WATERCONN, JSON.stringify(connections));
  } catch { /* ignore */ }
}

export function loadWaterConnSession(): WaterConnSessionItem[] | null {
  try {
    const raw = sessionStorage.getItem(KEY_WATERCONN);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

// ─────────────────────────────────────────────
// 소화전 고장 상태 세션
// ─────────────────────────────────────────────

const KEY_HYDRANT = 'tactical-board.runtime.hydrant';

export function saveHydrantSession(brokenIds: ReadonlySet<string>): void {
  try {
    sessionStorage.setItem(KEY_HYDRANT, JSON.stringify([...brokenIds]));
  } catch { /* ignore */ }
}

export function loadHydrantSession(): Set<string> | null {
  try {
    const raw = sessionStorage.getItem(KEY_HYDRANT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set<string>(parsed) : null;
  } catch { return null; }
}

// ─────────────────────────────────────────────
// 수량 세션
// ─────────────────────────────────────────────

const KEY_WATER_LEVELS = 'tactical-board.runtime.waterlevels';

export interface WaterLevelSessionState {
  levels: Record<string, number>;
}

export function saveWaterLevelSession(state: WaterLevelSessionState): void {
  try {
    sessionStorage.setItem(KEY_WATER_LEVELS, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function loadWaterLevelSession(): WaterLevelSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY_WATER_LEVELS);
    if (!raw) return null;
    return JSON.parse(raw) as WaterLevelSessionState;
  } catch { return null; }
}

// ─────────────────────────────────────────────
// 전체 초기화 (새 훈련 시작 시 호출)
// ─────────────────────────────────────────────

export function clearRuntimeSession(): void {
  try {
    sessionStorage.removeItem(KEY_TOKENS);
    sessionStorage.removeItem(KEY_VICTIMS);
    sessionStorage.removeItem(KEY_TRAINING);
    sessionStorage.removeItem(KEY_EVENTS);
    sessionStorage.removeItem(KEY_BUILDING);
    sessionStorage.removeItem(KEY_WATERCONN);
    sessionStorage.removeItem(KEY_HYDRANT);
    sessionStorage.removeItem(KEY_WATER_LEVELS);
  } catch { /* ignore */ }
}
