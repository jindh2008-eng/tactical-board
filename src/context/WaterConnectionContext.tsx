import {
  createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode,
} from 'react';
import { useTokens } from './TokenContext';
import { generateId } from '../utils/settingsStorage';
import { saveWaterConnSession, loadWaterConnSession } from '../utils/runtimeSession';

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

const STANDBY_ZONES  = new Set(['standby-standby1', 'standby-imminent']);
const AERIAL_TYPES   = new Set(['aerial', 'ladder']);
const WATER_SOURCES  = new Set(['pump', 'water_tank']);

export function useWaterConnections(): WaterConnectionContextValue {
  const ctx = useContext(WaterConnectionContext);
  if (!ctx) throw new Error('useWaterConnections must be used within WaterConnectionProvider');
  return ctx;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function WaterConnectionProvider({ children }: { children: ReactNode }) {
  const { tokens, addLog, setSprayState, setAerialSprayTarget } = useTokens();

  // 마운트 시 sessionStorage에서 복원 (없으면 빈 배열)
  const [connections, setConnections] = useState<WaterConnection[]>(
    () => (loadWaterConnSession() ?? []) as WaterConnection[],
  );

  const tokensRef          = useRef(tokens);
  const connectionsRef     = useRef<WaterConnection[]>(connections); // 복원값으로 초기화
  const prevTokensRef      = useRef<typeof tokens>([]);
  const removeConnRef      = useRef<(id: string) => void>(() => {});
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);

  // 연결 변경 시 sessionStorage 저장
  useEffect(() => {
    saveWaterConnSession(connections);
  }, [connections]);

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

  // removeConnRef를 먼저 선언하여 아래 useEffect에서 사용 가능하게 함
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
      // 진압대 연결 해제 시 방수 자동 중단
      if (conn.toType === 'suppression' && toToken?.sprayState != null) {
        setSprayState(conn.toId, null);
      }
      // 고가차/굴절차 연결 해제 시 방수 자동 중단
      if (AERIAL_TYPES.has(conn.toType) && toToken?.aerialSprayTarget != null) {
        setAerialSprayTarget(conn.toId, null);
      }
    }
    setConnections(prev => prev.filter(c => c.id !== id));
  }, [addLog, setSprayState, setAerialSprayTarget]);

  // removeConnRef는 최신 removeConnection을 항상 참조
  useEffect(() => { removeConnRef.current = removeConnection; }, [removeConnection]);

  // 마운트 시: 페이지 이동 후 재마운트될 때 연결 없이 방수 중인 토큰 자동 초기화
  // (connections는 리셋되지만 TokenContext는 sessionStorage에서 상태를 복원하므로 불일치 발생)
  useEffect(() => {
    for (const token of tokensRef.current) {
      const hasWater = connectionsRef.current.some(
        c => c.toId === token.id && WATER_SOURCES.has(c.fromType),
      );
      if (!hasWater) {
        if (token.sprayState != null) setSprayState(token.id, null);
        if (AERIAL_TYPES.has(token.unitType) && token.aerialSprayTarget != null) {
          setAerialSprayTarget(token.id, null);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 직전대기·대기1단계로 이동 시 해당 토큰의 송수 연결 자동 해제
  useEffect(() => {
    const prev = prevTokensRef.current;
    prevTokensRef.current = tokens;
    for (const token of tokens) {
      if (!token.zoneKey || !STANDBY_ZONES.has(token.zoneKey)) continue;
      const prevToken = prev.find(t => t.id === token.id);
      if (prevToken?.zoneKey === token.zoneKey) continue; // 이미 해당 구역
      const toRemove = connectionsRef.current.filter(
        c => c.fromId === token.id || c.toId === token.id
      );
      for (const conn of toRemove) removeConnRef.current(conn.id);
    }
  }, [tokens]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <WaterConnectionContext.Provider value={{ connections, addConnection, removeConnection }}>
      {children}
    </WaterConnectionContext.Provider>
  );
}
