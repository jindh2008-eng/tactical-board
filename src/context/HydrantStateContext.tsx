import {
  createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode,
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

  const brokenRef = useRef(brokenHydrants);
  useEffect(() => { brokenRef.current = brokenHydrants; }, [brokenHydrants]);

  const toggleBroken = useCallback((id: string) => {
    // addLog는 상태 업데이터 **밖**에서 — 안에서 부르면 StrictMode가 콜백을 이중 호출해
    // 로그가 두 번 쌓인다(EVENT_LOG_PLAN L-8).
    const nowBroken = !brokenRef.current.has(id);
    setBrokenHydrants(prev => {
      const next = new Set(prev);
      if (nowBroken) next.add(id);
      else           next.delete(id);
      return next;
    });
    addLog({
      logType:    'status-tag',
      tokenId:    id,
      tokenName:  id,
      fromZoneId: '',
      toZoneId:   '',
      note:       nowBroken ? `소화전 고장: ${id}` : `소화전 복구: ${id}`,
    });
  }, [addLog]);

  const getEquipmentMessage = useCallback(
    (id: string) => equipmentMessages[id] ?? '',
    [equipmentMessages],
  );

  const setEquipmentMessage = useCallback((id: string, msg: string) => {
    setEquipmentMessages(prev => ({ ...prev, [id]: msg }));
    addLog({
      logType:    'status-tag',
      tokenId:    id,
      tokenName:  id,
      fromZoneId: '', toZoneId: '',
      note:       `설비 상태: ${msg}`,
      payload:    { kind: 'equipment-message', equipmentId: id, message: msg },
    });
  }, [addLog]);

  const clearEquipmentMessage = useCallback((id: string) => {
    setEquipmentMessages(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    addLog({
      logType:    'status-tag',
      tokenId:    id,
      tokenName:  id,
      fromZoneId: '', toZoneId: '',
      note:       '설비 상태 해제',
      payload:    { kind: 'equipment-message', equipmentId: id, message: null },
    });
  }, [addLog]);

  return (
    <HydrantStateContext.Provider value={{
      brokenHydrants, isBroken, toggleBroken,
      equipmentMessages, getEquipmentMessage, setEquipmentMessage, clearEquipmentMessage,
    }}>
      {children}
    </HydrantStateContext.Provider>
  );
}
