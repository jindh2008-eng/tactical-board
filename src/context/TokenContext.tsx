import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react';
import type { UnitToken, LogEntry, TokenType, TokenColor, TokenBadge } from '../types';

const MEDICAL_AUTO_MOVE_SEC = 30;
const MEDICAL_TARGET_ZONE   = 'standby-imminent';

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
  tokens:             UnitToken[];
  logs:               LogEntry[];
  positions:          Record<string, TokenPos>;
  medicalCountdowns:  Record<string, number>;   // tokenId → 남은 초
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
  /**
   * 구조 처리 — 출동대를 임시의료소로 이동하고 "구조중" 배지를 추가.
   * 이동 로그에 구조대상자 정보를 note로 기록.
   * @param tokenId     이동할 출동대 ID
   * @param victimLabel 로그에 남길 구조대상자 표시명 (예: "남/40대/중상(212호)")
   */
  rescueUnit:   (tokenId: string, victimLabel: string) => void;
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
  const [tokens,            setTokens]            = useState<UnitToken[]>([]);
  const [logs,              setLogs]              = useState<LogEntry[]>([]);
  const [positions,         setPositions]         = useState<Record<string, TokenPos>>({});
  const [medicalCountdowns, setMedicalCountdowns] = useState<Record<string, number>>({});
  const counters       = useRef<Record<string, number>>({});
  const tokensRef      = useRef<UnitToken[]>([]);
  const medicalTimers  = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => { tokensRef.current = tokens; }, [tokens]);

  // 1초마다 medicalCountdowns 감소
  useEffect(() => {
    const interval = setInterval(() => {
      setMedicalCountdowns(prev => {
        const keys = Object.keys(prev);
        if (keys.length === 0) return prev;
        const next: Record<string, number> = {};
        for (const k of keys) {
          if (prev[k] > 1) next[k] = prev[k] - 1;
          // 0이 되면 setTimeout이 이미 이동 처리하므로 항목 제거
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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

    // 임시의료소에서 다른 곳으로 수동 이동 시 타이머·카운트다운 취소
    if (zoneChanged && token.zoneKey === 'medical-post') {
      if (medicalTimers.current[tokenId]) {
        clearTimeout(medicalTimers.current[tokenId]);
        delete medicalTimers.current[tokenId];
      }
      setMedicalCountdowns(prev => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
    }

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
          tokenColor: token.color,
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

  // ── 구조 처리 ────────────────────────────────
  const rescueUnit = useCallback((tokenId: string, victimLabel: string) => {
    const token = tokensRef.current.find(t => t.id === tokenId);
    if (!token) return;

    // 이동 + "구조중" 배지를 한 번의 setState로 처리
    setTokens(prev => prev.map(t => {
      if (t.id !== tokenId) return t;
      return {
        ...t,
        zoneKey: 'medical-post',
        badges:  [...t.badges, { id: uid(), line1: '구조중' }],
      };
    }));

    // 절대 좌표 제거
    setPositions(prev => {
      const next = { ...prev };
      delete next[tokenId];
      return next;
    });

    // 구조 로그
    const entry: LogEntry = {
      id:         `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp:  nowHHMM(),
      logType:    'rescue',
      tokenId:    token.id,
      tokenName:  token.label,
      tokenColor: token.color,
      fromZoneId: token.zoneKey ?? 'pool',
      toZoneId:   'medical-post',
      note:       `${victimLabel} 구조대상자 → 구조, 임시의료소 이동`,
    };
    setLogs(prev => [entry, ...prev]);

    // 카운트다운 시작
    setMedicalCountdowns(prev => ({ ...prev, [tokenId]: MEDICAL_AUTO_MOVE_SEC }));

    // 기존 타이머가 있으면 취소 후 새로 등록
    if (medicalTimers.current[tokenId]) clearTimeout(medicalTimers.current[tokenId]);
    medicalTimers.current[tokenId] = setTimeout(() => {
      delete medicalTimers.current[tokenId];
      setMedicalCountdowns(prev => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
      // moveToken 대신 직접 setState — 콜백 클로저 의존성 없이 처리
      setTokens(prev => prev.map(t =>
        t.id === tokenId && t.zoneKey === 'medical-post'
          ? { ...t, zoneKey: MEDICAL_TARGET_ZONE }
          : t
      ));
      setLogs(prev => {
        const t = tokensRef.current.find(tk => tk.id === tokenId);
        if (!t) return prev;
        return [{
          id:         `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp:  nowHHMM(),
          logType:    'move' as const,
          tokenId:    t.id,
          tokenName:  t.label,
          tokenColor: t.color,
          fromZoneId: 'medical-post',
          toZoneId:   MEDICAL_TARGET_ZONE,
          note:       '임시의료소 처치 완료 → 직전대기 자동 이동',
        }, ...prev];
      });
    }, MEDICAL_AUTO_MOVE_SEC * 1000);
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
      tokens, logs, positions, medicalCountdowns,
      createToken, moveToken, rescueUnit,
      addBadge, removeBadge, clearBadges,
    }}>
      {children}
    </TokenContext.Provider>
  );
}
