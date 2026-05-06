import {
  createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode,
} from 'react';
import { useTokens } from './TokenContext';
import { generateId } from '../utils/settingsStorage';

// ─────────────────────────────────────────────
// 송수 연결 타입
// ─────────────────────────────────────────────

export interface WaterConnection {
  id:       string;
  fromId:   string;   // 급수 출처 (pump / water_tank / hydrant)
  toId:     string;   // 수신 대상
  fromType: string;
  toType:   string;
  status:   'active';
}

// ─────────────────────────────────────────────
// Context 타입
// ─────────────────────────────────────────────

interface WaterConnectionContextValue {
  connections:      WaterConnection[];
  addConnection:    (fromId: string, toId: string, fromType: string, toType: string, fromNameOverride?: string) => void;
  removeConnection: (id: string) => void;
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const WaterConnectionContext = createContext<WaterConnectionContextValue | null>(null);

export function useWaterConnections(): WaterConnectionContextValue {
  const ctx = useContext(WaterConnectionContext);
  if (!ctx) throw new Error('useWaterConnections must be used within WaterConnectionProvider');
  return ctx;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function WaterConnectionProvider({ children }: { children: ReactNode }) {
  const { tokens, addLog } = useTokens();
  const [connections, setConnections] = useState<WaterConnection[]>([]);

  const tokensRef      = useRef(tokens);
  const connectionsRef = useRef<WaterConnection[]>([]);
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);

  const addConnection = useCallback((
    fromId: string,
    toId:   string,
    fromType: string,
    toType:   string,
    fromNameOverride?: string,
  ) => {
    if (connectionsRef.current.some(c => c.fromId === fromId && c.toId === toId)) return;

    const fromToken = tokensRef.current.find(t => t.id === fromId);
    const toToken   = tokensRef.current.find(t => t.id === toId);
    const fromName  = fromNameOverride ?? fromToken?.label ?? fromId;
    const toName    = toToken?.label   ?? toId;

    addLog({
      logType:    'water-relay',
      tokenId:    fromId,
      tokenName:  fromName,
      tokenColor: fromToken?.color,
      fromZoneId: fromId,
      toZoneId:   toId,
      note:       `${fromName} → ${toName}`,
    });

    setConnections(prev => [...prev, { id: `wc-${generateId()}`, fromId, toId, fromType, toType, status: 'active' }]);
  }, [addLog]);

  const removeConnection = useCallback((id: string) => {
    const conn = connectionsRef.current.find(c => c.id === id);
    if (conn) {
      const fromToken = tokensRef.current.find(t => t.id === conn.fromId);
      const toToken   = tokensRef.current.find(t => t.id === conn.toId);
      const fromName  = fromToken?.label ?? conn.fromId;
      const toName    = toToken?.label   ?? conn.toId;
      addLog({
        logType:    'water-relay',
        tokenId:    conn.fromId,
        tokenName:  fromName,
        tokenColor: fromToken?.color,
        fromZoneId: conn.fromId,
        toZoneId:   conn.toId,
        note:       `${fromName} → ${toName} 해제`,
      });
    }
    setConnections(prev => prev.filter(c => c.id !== id));
  }, [addLog]);

  return (
    <WaterConnectionContext.Provider value={{ connections, addConnection, removeConnection }}>
      {children}
    </WaterConnectionContext.Provider>
  );
}
