import {
  createContext, useContext, useState, useCallback, useEffect, type ReactNode,
} from 'react';
import { saveHydrantSession, loadHydrantSession, saveEquipMsgSession, loadEquipMsgSession } from '../utils/runtimeSession';
import { useTokens } from './TokenContext';

// ─────────────────────────────────────────────
// Context 타입
// ─────────────────────────────────────────────

interface HydrantStateContextValue {
  brokenHydrants:      ReadonlySet<string>;
  isBroken:            (id: string) => boolean;
  toggleBroken:        (id: string) => void;
  equipmentMessages:   Readonly<Record<string, string>>;
  getEquipmentMessage: (id: string) => string;
  setEquipmentMessage: (id: string, msg: string) => void;
  clearEquipmentMessage: (id: string) => void;
}

const HydrantStateContext = createContext<HydrantStateContextValue | null>(null);

export function useHydrantState(): HydrantStateContextValue {
  const ctx = useContext(HydrantStateContext);
  if (!ctx) throw new Error('useHydrantState must be used within HydrantStateProvider');
  return ctx;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function HydrantStateProvider({ children }: { children: ReactNode }) {
  const { addLog } = useTokens();

  const [brokenHydrants, setBrokenHydrants] = useState<Set<string>>(
    () => loadHydrantSession() ?? new Set(),
  );
  const [equipmentMessages, setEquipmentMessages] = useState<Record<string, string>>(
    () => loadEquipMsgSession() ?? {},
  );

  useEffect(() => {
    saveHydrantSession(brokenHydrants);
  }, [brokenHydrants]);

  useEffect(() => {
    saveEquipMsgSession(equipmentMessages);
  }, [equipmentMessages]);

  const isBroken = useCallback(
    (id: string) => brokenHydrants.has(id),
    [brokenHydrants],
  );

  const toggleBroken = useCallback((id: string) => {
    setBrokenHydrants(prev => {
      const next = new Set(prev);
      const nowBroken = !next.has(id);
      if (nowBroken) next.add(id);
      else           next.delete(id);
      addLog({
        logType:    'status-tag',
        tokenId:    id,
        tokenName:  id,
        fromZoneId: '',
        toZoneId:   '',
        note:       nowBroken ? `소화전 고장: ${id}` : `소화전 복구: ${id}`,
      });
      return next;
    });
  }, [addLog]);

  const getEquipmentMessage = useCallback(
    (id: string) => equipmentMessages[id] ?? '',
    [equipmentMessages],
  );

  const setEquipmentMessage = useCallback((id: string, msg: string) => {
    setEquipmentMessages(prev => ({ ...prev, [id]: msg }));
  }, []);

  const clearEquipmentMessage = useCallback((id: string) => {
    setEquipmentMessages(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return (
    <HydrantStateContext.Provider value={{
      brokenHydrants, isBroken, toggleBroken,
      equipmentMessages, getEquipmentMessage, setEquipmentMessage, clearEquipmentMessage,
    }}>
      {children}
    </HydrantStateContext.Provider>
  );
}
