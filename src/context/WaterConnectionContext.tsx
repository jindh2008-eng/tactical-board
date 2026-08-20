import {
  createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode,
} from 'react';
import { useTokens } from './TokenContext';
import { generateId } from '../utils/settingsStorage';
import { saveWaterConnSession, loadWaterConnSession } from '../utils/runtimeSession';
import { hasWaterSupply } from '../utils/waterSupply';

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
  /**
   * 연결 시점의 표시 이름. 소화전·연결송수구처럼 UnitToken 이 아닌 설비는
   * tokens 배열에서 찾을 수 없어, 해제 로그에서 이름 대신 raw id 가 노출되던 문제가 있었다
   * (예: "1779762925172 → 펌프1호 해제"). 연결 시점에 이름을 박아 두면 해제할 때도
   * 다시 조회할 필요가 없다. optional 인 이유: 이 필드가 생기기 전 세션에서 복원된
   * 연결은 값이 없을 수 있다 — 그때는 기존처럼 tokens 조회로 대체한다(removeConnection 참고).
   */
  fromName?: string;
  toName?:   string;
}

// ─────────────────────────────────────────────
// Context 타입
// ─────────────────────────────────────────────

interface WaterConnectionContextValue {
  connections:      WaterConnection[];
  addConnection:    (fromId: string, toId: string, fromType: string, toType: string, fromNameOverride?: string, toNameOverride?: string) => void;
  removeConnection: (id: string) => void;
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const WaterConnectionContext = createContext<WaterConnectionContextValue | null>(null);

const STANDBY_ZONES  = new Set(['standby-standby1', 'standby-imminent']);
const AERIAL_TYPES   = new Set(['aerial', 'ladder']);
const WATER_SOURCES  = new Set(['pump', 'water_tank']);
/** 관창 방수 차종 — 급수가 끊기면 방수도 멈춘다 */
const SPRAY_UNIT_TYPES = new Set(['suppression', 'rescue']);

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
    toNameOverride?:   string,
  ) => {
    if (connectionsRef.current.some(c => c.fromId === fromId && c.toId === toId)) return;

    const fromToken = tokensRef.current.find(t => t.id === fromId);
    const toToken   = tokensRef.current.find(t => t.id === toId);
    const fromName  = fromNameOverride ?? fromToken?.label ?? fromId;
    const toName    = toNameOverride   ?? toToken?.label   ?? toId;

    addLog({
      logType:    'water-relay',
      tokenId:    fromId,
      tokenName:  fromName,
      tokenColor: fromToken?.color,
      fromZoneId: fromId,
      toZoneId:   toId,
      note:       `${fromName} → ${toName}`,
    });

    setConnections(prev => [
      ...prev,
      { id: `wc-${generateId()}`, fromId, toId, fromType, toType, status: 'active', fromName, toName },
    ]);
  }, [addLog]);

  // removeConnRef를 먼저 선언하여 아래 useEffect에서 사용 가능하게 함
  const removeConnection = useCallback((id: string) => {
    const conn = connectionsRef.current.find(c => c.id === id);
    if (conn) {
      const fromToken = tokensRef.current.find(t => t.id === conn.fromId);
      const toToken   = tokensRef.current.find(t => t.id === conn.toId);
      // 연결 시점에 저장해 둔 이름을 우선 쓴다 — 소화전·연결송수구처럼 tokens 에 없는
      // 설비는 이게 없으면 raw id 가 노출된다. 이 필드가 없는(구버전 세션) 연결만 대체한다.
      const fromName  = conn.fromName ?? fromToken?.label ?? conn.fromId;
      const toName    = conn.toName   ?? toToken?.label   ?? conn.toId;
      addLog({
        logType:    'water-relay',
        tokenId:    conn.fromId,
        tokenName:  fromName,
        tokenColor: fromToken?.color,
        fromZoneId: conn.fromId,
        toZoneId:   conn.toId,
        note:       `${fromName} → ${toName} 해제`,
      });
      // 급수가 완전히 끊기면 방수도 멈춘다. 남은 연결이 있으면 유지한다
      // (한 대에 펌프 두 대가 물릴 수 있어 마지막 하나가 빠질 때만 중단해야 한다).
      const remaining = connectionsRef.current.filter(c => c.id !== id);
      if (toToken && !hasWaterSupply(remaining, conn.toId, toToken.unitType)) {
        if (AERIAL_TYPES.has(conn.toType) && toToken.aerialSprayTarget != null) {
          setAerialSprayTarget(conn.toId, null);
        }
        if (SPRAY_UNIT_TYPES.has(conn.toType) && toToken.sprayState != null) {
          setSprayState(conn.toId, null);
        }
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
        // 진압대·구조대는 송수 없이도 방수 가능 — 초기화하지 않음
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
