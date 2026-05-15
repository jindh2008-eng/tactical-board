import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { VictimToken, CreateVictimInput, VictimCondition } from '../types/victim';
import type { VictimSetupItem } from '../types/settings';
import type { BuildingConfig, Pos } from '../types';
import {
  buildVictim, randomVictim,
  buildVictimDisplayLine, zoneKeyToFullLabel,
} from '../utils/victimUtils';
import { useTokens } from './TokenContext';
import {
  victimSetupToToken,
  computeInitialPositions,
} from '../utils/victimPlacement';
import { buildValidVictimZoneKeys } from '../data/buildingData';
import {
  saveVictimSession, loadVictimSession,
} from '../utils/runtimeSession';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type VictimPos = Pos;

/** updateVictim 에 전달 가능한 변경 필드 */
export interface VictimUpdate {
  condition?:   VictimCondition;
  subLocation?: string;
  customLabel?: string;
}

interface VictimContextValue {
  victims:         VictimToken[];
  victimPositions: Record<string, VictimPos>;
  createVictim:    (input: CreateVictimInput) => void;
  createRandom:    (subLocation: string) => void;
  moveVictim:      (victimId: string, toZoneKey: string | null, pos?: VictimPos) => void;
  updateVictim:    (victimId: string, update: VictimUpdate) => void;
}

const VictimContext = createContext<VictimContextValue | null>(null);

export function useVictims(): VictimContextValue {
  const ctx = useContext(VictimContext);
  if (!ctx) throw new Error('useVictims must be used within VictimProvider');
  return ctx;
}

// ─────────────────────────────────────────────
// 로그용 구조대상자 표시명
// ─────────────────────────────────────────────

function victimDisplayName(v: VictimToken): string {
  if (v.customLabel) return v.customLabel;
  if (v.kind === 'group') return `${v.groupCount ?? '?'}명`;
  const parts = [v.gender, v.age != null ? `${v.age}세` : undefined, v.condition].filter(Boolean);
  return parts.length > 0 ? (parts as string[]).join('/') : '구조대상자';
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function VictimProvider({
  children,
  initialVictimSetup,
  buildingConfig,
  fireFloor,
}: {
  children:            React.ReactNode;
  initialVictimSetup?: VictimSetupItem[];
  /** 배치 가능 구역 검증에 사용. 미전달 시 검증 생략. */
  buildingConfig?:     BuildingConfig;
  fireFloor?:          number;
}) {
  const { addLog } = useTokens();

  // ── 배치 가능 구역 집합 (마운트 시 1회 계산) ─────────────────────────
  // 세션 복원 시 범위 행에 속한 구역의 구조대상자를 pool 로 이동하는 데 사용
  const validZoneKeysRef = useRef<Set<string>>(
    buildingConfig !== undefined
      ? buildValidVictimZoneKeys(buildingConfig, fireFloor ?? 1)
      : new Set<string>()
  );

  /**
   * victim 의 zoneKey 가 현재 건물 설정 기준 유효하지 않으면 pool 로 이동.
   * (요약 행으로 묶인 층에 배치된 구버전 데이터 마이그레이션)
   */
  function sanitizeVictim(v: VictimToken): VictimToken {
    if (!buildingConfig) return v;
    if (v.zoneKey === null) return v;
    if (validZoneKeysRef.current.has(v.zoneKey)) return v;
    // 유효하지 않은 구역 → pool 이동
    return { ...v, zoneKey: null };
  }

  // ── victimsRef — 로그 기록용 안정적 참조 ──────────────────────────────
  const victimsRef = useRef<VictimToken[]>([]);

  // ── 구조대상자 상태 (세션 복원 우선) ─────────────────────────────────
  const [victims, setVictims] = useState<VictimToken[]>(() => {
    const session = loadVictimSession();
    if (session && session.victims.length > 0) return session.victims.map(sanitizeVictim);
    return initialVictimSetup && initialVictimSetup.length > 0
      ? initialVictimSetup.map(victimSetupToToken)
      : [];
  });

  // ── 구조대상자 위치 (세션 복원 → 오프셋 초기 계산 → 빈 객체) ─────────
  const [victimPositions, setVictimPositions] = useState<Record<string, VictimPos>>(() => {
    const session = loadVictimSession();
    if (session && session.victims.length > 0) {
      // sanitize 로 pool 이동된 victim 의 위치도 제거
      const invalidIds = new Set(
        session.victims
          .filter(v => v.zoneKey !== null && buildingConfig && !validZoneKeysRef.current.has(v.zoneKey))
          .map(v => v.id)
      );
      if (invalidIds.size === 0) return session.victimPositions;
      const cleaned = { ...session.victimPositions };
      for (const id of invalidIds) delete cleaned[id];
      return cleaned;
    }

    // 세션이 없을 때: setup 기반 초기 오프셋 계산
    if (initialVictimSetup && initialVictimSetup.length > 0) {
      const initialTokens = initialVictimSetup.map(victimSetupToToken);
      return computeInitialPositions(initialTokens);
    }
    return {};
  });

  useEffect(() => { victimsRef.current = victims; }, [victims]);

  // ── sessionStorage 저장 (500ms debounce) ─────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      saveVictimSession({ victims, victimPositions });
    }, 500);
    return () => clearTimeout(timer);
  }, [victims, victimPositions]);

  // ── 구조대상자 생성 ──────────────────────────────────────────────────
  const createVictim = useCallback((input: CreateVictimInput) => {
    setVictims(prev => [...prev, buildVictim(input)]);
  }, []);

  const createRandom = useCallback((subLocation: string) => {
    setVictims(prev => [...prev, randomVictim(subLocation)]);
  }, []);

  /**
   * 토큰 이동.
   * toZoneKey가 주어지면 zoneKeyToLabel() 로 자동 위치 레이블을 결정하고
   * displayBottom 을 재계산한다.
   * pool 복귀(null) 시 location 을 초기화한다.
   *
   * originDisplayBottom: 임시의료소·대기 등 특수 구역으로 이동해도 변경하지 않는다.
   * 최초 실제 배치 구역(건물 층·외곽 방면) 진입 시 1회 기록.
   */
  const moveVictim = useCallback((
    victimId:  string,
    toZoneKey: string | null,
    pos?:      VictimPos,
  ) => {
    if (toZoneKey !== null) {
      const v = victimsRef.current.find(vic => vic.id === victimId);
      if (v && v.zoneKey !== toZoneKey) {
        addLog({
          logType:    'move',
          tokenId:    victimId,
          tokenName:  victimDisplayName(v),
          fromZoneId: v.zoneKey ?? 'pool',
          toZoneId:   toZoneKey,
        });
      }
    }

    setVictims(prev => prev.map(v => {
      if (v.id !== victimId) return v;

      // 구조위치 스냅샷 — 임시의료소 진입 시 1회만 기록
      const rescueLocation: string | undefined =
        toZoneKey === 'medical-post' && !v.rescueLocation
          ? (() => {
              const zoneLabel  = zoneKeyToFullLabel(v.zoneKey);
              const subDisplay = v.face
                ? [v.face + '면', v.subLocation].filter(Boolean).join(' / ')
                : v.subLocation;
              return [zoneLabel, subDisplay].filter(Boolean).join(' ') || '위치미상';
            })()
          : v.rescueLocation;

      // 최초 실제 배치 시 위치 표시 스냅샷 — 특수 구역 제외
      const isSpecialZone =
        toZoneKey === null ||
        toZoneKey === 'medical-post' ||
        toZoneKey.startsWith('standby-');
      const originDisplayBottom =
        v.originDisplayBottom ??
        (isSpecialZone ? undefined : buildVictimDisplayLine({ ...v, zoneKey: toZoneKey }));

      return { ...v, zoneKey: toZoneKey, rescueLocation, originDisplayBottom };
    }));

    setVictimPositions(prev => {
      if (toZoneKey === null || pos === undefined) {
        const next = { ...prev };
        delete next[victimId];
        return next;
      }
      return { ...prev, [victimId]: pos };
    });
  }, [addLog]);

  /** 상태·세부위치·라벨 변경 */
  const updateVictim = useCallback((victimId: string, update: VictimUpdate) => {
    if (update.condition !== undefined) {
      const v = victimsRef.current.find(vic => vic.id === victimId);
      if (v && v.condition !== update.condition) {
        addLog({
          logType:    'status-tag',
          tokenId:    victimId,
          tokenName:  victimDisplayName(v),
          fromZoneId: '',
          toZoneId:   '',
          note:       `환자상태 ${update.condition} 변경`,
        });
      }
    }
    setVictims(prev => prev.map(v => v.id !== victimId ? v : { ...v, ...update }));
  }, [addLog]);

  return (
    <VictimContext.Provider value={{
      victims, victimPositions,
      createVictim, createRandom, moveVictim, updateVictim,
    }}>
      {children}
    </VictimContext.Provider>
  );
}
