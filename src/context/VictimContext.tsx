import { createContext, useContext, useState, useCallback } from 'react';
import type { VictimToken, CreateVictimInput, VictimCondition } from '../types/victim';
import {
  buildVictim, randomVictim,
  rebuildVictimDisplay, zoneKeyToLabel,
} from '../utils/victimUtils';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export interface VictimPos { x: number; y: number; }

/** updateVictim 에 전달 가능한 변경 필드 */
export interface VictimUpdate {
  condition?:   VictimCondition;
  subLocation?: string;         // 사용자가 수동 입력하는 세부위치
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
// Provider
// ─────────────────────────────────────────────

export function VictimProvider({ children }: { children: React.ReactNode }) {
  const [victims,         setVictims]         = useState<VictimToken[]>([]);
  const [victimPositions, setVictimPositions] = useState<Record<string, VictimPos>>({});

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
   */
  const moveVictim = useCallback((
    victimId:  string,
    toZoneKey: string | null,
    pos?:      VictimPos,
  ) => {
    setVictims(prev => prev.map(v => {
      if (v.id !== victimId) return v;
      const newLocation = toZoneKey ? zoneKeyToLabel(toZoneKey) : '';
      const merged      = { ...v, zoneKey: toZoneKey, location: newLocation };
      const display     = rebuildVictimDisplay(merged);
      return { ...merged, ...display };
    }));

    setVictimPositions(prev => {
      if (toZoneKey === null || pos === undefined) {
        const next = { ...prev };
        delete next[victimId];
        return next;
      }
      return { ...prev, [victimId]: pos };
    });
  }, []);

  /** 상태·세부위치·라벨 변경 — display 자동 재계산 */
  const updateVictim = useCallback((victimId: string, update: VictimUpdate) => {
    setVictims(prev => prev.map(v => {
      if (v.id !== victimId) return v;
      const merged  = { ...v, ...update };
      const display = rebuildVictimDisplay(merged);
      return { ...merged, ...display };
    }));
  }, []);

  return (
    <VictimContext.Provider value={{
      victims, victimPositions,
      createVictim, createRandom, moveVictim, updateVictim,
    }}>
      {children}
    </VictimContext.Provider>
  );
}
