import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react';
import type { UnitToken, LogEntry, TokenType, TokenColor, TokenBadge } from '../types';

// ─────────────────────────────────────────────
// unitType 기본값 유도 (color 기반)
// ─────────────────────────────────────────────

function defaultUnitType(color: TokenColor): string {
  switch (color) {
    case 'red':     return 'suppression';
    case 'yellow':  return 'rescue';
    case 'green':   return 'ems';
    case 'vehicle': return 'vehicle';
    case 'agency':  return 'agency';
    default:        return 'general';
  }
}

// ─────────────────────────────────────────────
// Context 타입
// ─────────────────────────────────────────────

export interface TokenPos { x: number; y: number; }

interface TokenContextValue {
  tokens:    UnitToken[];
  logs:      LogEntry[];
  positions: Record<string, TokenPos>;
  /**
   * unitType: 출동대 종류 키 (e.g. 'suppression', 'pump', 'ladder').
   * 생략하면 color에서 자동 유도.
   */
  createToken: (
    baseKey:     string,
    type:        TokenType,
    color:       TokenColor,
    formatLabel: (n: number) => string,
    unitType?:   string,
  ) => void;
  moveToken:    (tokenId: string, toZoneKey: string | null, pos?: TokenPos) => void;
  addBadge:     (tokenId: string, badge: Omit<TokenBadge, 'id'>) => void;
  removeBadge:  (tokenId: string, badgeId: string) => void;
  clearBadges:  (tokenId: string) => void;
}

const TokenContext = createContext<TokenContextValue | null>(null);

export function useTokens(): TokenContextValue {
  const ctx = useContext(TokenContext);
  if (!ctx) throw new Error('useTokens must be used within TokenProvider');
  return ctx;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function TokenProvider({ children }: { children: React.ReactNode }) {
  const [tokens,    setTokens]    = useState<UnitToken[]>([]);
  const [logs,      setLogs]      = useState<LogEntry[]>([]);
  const [positions, setPositions] = useState<Record<string, TokenPos>>({});
  const counters  = useRef<Record<string, number>>({});
  const tokensRef = useRef<UnitToken[]>([]);

  useEffect(() => { tokensRef.current = tokens; }, [tokens]);

  // ── 토큰 생성 ───────────────────────────────
  const createToken = useCallback((
    baseKey:     string,
    type:        TokenType,
    color:       TokenColor,
    formatLabel: (n: number) => string,
    unitType?:   string,
  ) => {
    const count = (counters.current[baseKey] ?? 0) + 1;
    counters.current[baseKey] = count;
    setTokens(prev => [
      ...prev,
      {
        id:       `${baseKey}-${Date.now()}`,
        label:    formatLabel(count),
        type,
        color,
        unitType: unitType ?? defaultUnitType(color),
        zoneKey:  null,
        badges:   [],
      },
    ]);
  }, []);

  // ── 토큰 이동 ───────────────────────────────
  const moveToken = useCallback((
    tokenId:   string,
    toZoneKey: string | null,
    pos?:      TokenPos,
  ) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    if (!token) return;

    const zoneChanged = token.zoneKey !== toZoneKey;

    if (zoneChanged) {
      setTokens(prev =>
        prev.map(t => t.id === tokenId ? { ...t, zoneKey: toZoneKey } : t)
      );
      if (toZoneKey !== null) {
        const entry: LogEntry = {
          id:         `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp:  nowHHMM(),
          logType:    'move',
          tokenId:    token.id,
          tokenName:  token.label,
          fromZoneId: token.zoneKey ?? 'pool',
          toZoneId:   toZoneKey,
        };
        setLogs(prev => [entry, ...prev]);
      }
    }

    setPositions(prev => {
      if (toZoneKey === null || pos === undefined) {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      }
      return { ...prev, [tokenId]: pos };
    });
  }, []);

  // ── 배지 (실행 중 임시 상태) ─────────────────
  const addBadge = useCallback((tokenId: string, badge: Omit<TokenBadge, 'id'>) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId
        ? { ...t, badges: [...t.badges, { ...badge, id: uid() }] }
        : t
    ));
  }, []);

  const removeBadge = useCallback((tokenId: string, badgeId: string) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId
        ? { ...t, badges: t.badges.filter(b => b.id !== badgeId) }
        : t
    ));
  }, []);

  const clearBadges = useCallback((tokenId: string) => {
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, badges: [] } : t
    ));
  }, []);

  return (
    <TokenContext.Provider value={{
      tokens, logs, positions,
      createToken, moveToken,
      addBadge, removeBadge, clearBadges,
    }}>
      {children}
    </TokenContext.Provider>
  );
}
