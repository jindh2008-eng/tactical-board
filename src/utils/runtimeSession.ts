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
// 복원 형태 검증 헬퍼
// ─────────────────────────────────────────────

/**
 * Record<string, T> 형태로 인덱싱해도 안전한 값인지 확인.
 * JSON.parse 결과가 문법적으로는 정상이어도 필드가 누락되거나
 * 타입이 다르면(null/배열/원시값) 소비처에서 인덱싱·Object.entries 시
 * TypeError가 나므로, 복원 단계에서 미리 걸러낸다.
 */
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ─────────────────────────────────────────────
// 저장 형식
// ─────────────────────────────────────────────

/**
 * 좌표 저장 형식 버전.
 * 'norm' = 구역 대비 0~1 정규화 (현재). 값이 없으면 구버전 px 저장분이다.
 * → docs/RESPONSIVE_16_9_TABLET_LAYOUT_PLAN.md Phase 4
 */
export type PosFormat = 'norm';

export interface TokenSessionState {
  tokens:     UnitToken[];
  logs:       LogEntry[];
  positions:  Record<string, Pos>;

  /** 없으면 구버전 px 좌표 → 로드 시 positions 폐기 */
  posFormat?: PosFormat;

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

  /** 없으면 구버전 px 좌표 → 로드 시 victimPositions 폐기 */
  posFormat?: PosFormat;
}

// ─────────────────────────────────────────────
// 출동대 세션 저장 / 복원
// ─────────────────────────────────────────────

export function saveTokenSession(state: TokenSessionState): void {
  try {
    sessionStorage.setItem(KEY_TOKENS, JSON.stringify({ ...state, posFormat: 'norm' }));
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

    // ── 좌표 형식 마이그레이션: px → 0~1 정규화 ──────────────────────
    // 구역 크기를 알 수 없는 시점이라 px 값을 환산할 수 없다.
    // 구역 배치(zoneKey)는 유지하고 구역 내 세부 위치만 버린다 → 기본 흐름 배치로 표시.
    if (parsed.posFormat !== 'norm') {
      parsed.positions = {};
    }

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
    sessionStorage.setItem(KEY_VICTIMS, JSON.stringify({ ...state, posFormat: 'norm' }));
  } catch { /* ignore */ }
}

export function loadVictimSession(): VictimSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY_VICTIMS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VictimSessionState;
    if (!Array.isArray(parsed.victims)) return null;

    // 좌표 형식 마이그레이션 — loadTokenSession 과 동일 (구버전 px 값 폐기)
    if (parsed.posFormat !== 'norm') {
      parsed.victimPositions = {};
    }

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
  /** 보드(.tactical-area) 대비 0~1 정규화된 토큰 좌상단 */
  positions:        Record<string, { x: number; y: number }>;
  statuses:         Record<string, EventStatus>;
  floorIds?:        Record<string, string>;  // eventId → floorId (드롭 시점 저장, 구버전 호환 optional)
  firePercentages?: Record<string, number>;  // 이벤트 화재 진행도 (구버전 호환 optional)

  /** 없으면 구버전 px 좌표 → 로드 시 positions 폐기 후 자동 재배치 */
  posFormat?: PosFormat;
}

export function saveEventSession(state: EventSessionState): void {
  try {
    sessionStorage.setItem(KEY_EVENTS, JSON.stringify({ ...state, posFormat: 'norm' }));
  } catch { /* ignore */ }
}

export function loadEventSession(): EventSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY_EVENTS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EventSessionState;

    // 좌표 형식 마이그레이션 — 구버전 px 값 폐기.
    // 위치가 비면 EventLayer 가 A면 상단에 자동 재배치하므로 이벤트 자체는 남는다.
    if (parsed.posFormat !== 'norm') {
      parsed.positions = {};
    }

    return parsed;
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
    const parsed = JSON.parse(raw) as BuildingSessionState;

    // 형태 검증 — 소비처(BuildingStateContext)가 이 세 필드를 그대로 인덱싱하므로
    // 하나라도 객체가 아니면 복원을 포기하고 설정값 기반 초기화로 넘긴다.
    // (구버전 세션·부분 저장본으로 인한 마운트 시점 크래시 방지)
    if (!isPlainRecord(parsed.doorStates))      return null;
    if (!isPlainRecord(parsed.fireStates))      return null;
    if (!isPlainRecord(parsed.firePercentages)) return null;

    return parsed;
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
// 장비 활성 메시지 세션 (소화전/옥내소화전/연결송수구)
// ─────────────────────────────────────────────

const KEY_EQUIP_MSG = 'tactical-board.runtime.equip-msg';

export function saveEquipMsgSession(msgs: Record<string, string>): void {
  try {
    sessionStorage.setItem(KEY_EQUIP_MSG, JSON.stringify(msgs));
  } catch { /* ignore */ }
}

export function loadEquipMsgSession(): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(KEY_EQUIP_MSG);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      ? (parsed as Record<string, string>)
      : null;
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
// 인명검색 세션
// ─────────────────────────────────────────────

const KEY_VICTIM_SEARCH = 'tactical-board.runtime.victim-search';

export interface FloorSearchUnit {
  tokenId:       string;
  decrementRate: number;  // 구조대=2, 진압대=1
}

/** 인명검색 활성 세션 — floorId 기준 1건 */
export interface FloorSearchRecord {
  units:             FloorSearchUnit[];
  // 1차 (초진 이전 / 화재 없는 층은 전체 초진 이전)
  primaryInitial:    number;   // 100 / 70 / 30
  primaryScore:      number;   // 현재 점수
  primaryFrozen:     boolean;  // 초진 도달 시 true
  primarySchedule:   Array<{ victimId: string; revealAtScore: number }>;
  // 2차 (초진 이후)
  secondaryInitial:  number;   // 화재 있는 층=50, 없는 층=30
  secondaryScore:    number;
  secondaryActive:   boolean;
  secondarySchedule: Array<{ victimId: string; revealAtScore: number }>;
}

export interface VictimSearchSessionState {
  discoveredVictimIds: string[];
  activeSearches:      Record<string, FloorSearchRecord>; // floorId → 활성 검색
}

export function saveVictimSearchSession(state: VictimSearchSessionState): void {
  try {
    sessionStorage.setItem(KEY_VICTIM_SEARCH, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function loadVictimSearchSession(): VictimSearchSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY_VICTIM_SEARCH);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VictimSearchSessionState;

    // 형태 검증 — 소비처(VictimContext)가 activeSearches를 Object.entries()에
    // 바로 넘기므로 객체가 아니면 마운트 시점에 TypeError가 난다.
    if (!isPlainRecord(parsed.activeSearches)) return null;
    if (!Array.isArray(parsed.discoveredVictimIds)) {
      parsed.discoveredVictimIds = [];
    }

    return parsed;
  } catch { return null; }
}

// ─────────────────────────────────────────────
// 진행상황 관리(체크리스트) 세션
//
// 화면 분리 후에는 무플 화면이 체크 현황의 단일 원천이 되므로
// (docs/DUAL_SCREEN_SYNC_PLAN.md §4.1) 새로고침으로 소실되면
// 교수 태블릿 쪽 표시까지 함께 비어 버린다. 그래서 영속화한다.
// ─────────────────────────────────────────────

const KEY_CHECKLIST = 'tactical-board.runtime.checklist';

export interface ChecklistSessionState {
  checkedIds: string[];
}

export function saveChecklistSession(state: ChecklistSessionState): void {
  try {
    sessionStorage.setItem(KEY_CHECKLIST, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function loadChecklistSession(): ChecklistSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY_CHECKLIST);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChecklistSessionState;

    // 형태 검증 — 소비처가 new Set(...)에 그대로 넘기므로 배열이 아니면 폐기
    if (!Array.isArray(parsed.checkedIds)) return null;

    return parsed;
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
    sessionStorage.removeItem(KEY_VICTIM_SEARCH);
    sessionStorage.removeItem(KEY_CHECKLIST);
  } catch { /* ignore */ }
}
