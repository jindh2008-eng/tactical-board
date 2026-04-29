import {
  createContext, useContext, useState, useCallback, type ReactNode,
} from 'react';

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
  addConnection:    (fromId: string, toId: string, fromType: string, toType: string) => void;
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

function uid(): string {
  return `wc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function WaterConnectionProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<WaterConnection[]>([]);

  const addConnection = useCallback((
    fromId: string,
    toId:   string,
    fromType: string,
    toType:   string,
  ) => {
    // 중복 연결 방지 (같은 쌍이 이미 있으면 추가하지 않음)
    setConnections(prev => {
      const exists = prev.some(c => c.fromId === fromId && c.toId === toId);
      if (exists) return prev;
      return [...prev, { id: uid(), fromId, toId, fromType, toType, status: 'active' }];
    });
  }, []);

  const removeConnection = useCallback((id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
  }, []);

  return (
    <WaterConnectionContext.Provider value={{ connections, addConnection, removeConnection }}>
      {children}
    </WaterConnectionContext.Provider>
  );
}
