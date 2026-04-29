import {
  createContext, useContext, useState, useCallback, type ReactNode,
} from 'react';

// ─────────────────────────────────────────────
// Context 타입
// ─────────────────────────────────────────────

interface HydrantStateContextValue {
  brokenHydrants: ReadonlySet<string>;
  isBroken:       (id: string) => boolean;
  toggleBroken:   (id: string) => void;
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
  const [brokenHydrants, setBrokenHydrants] = useState<Set<string>>(new Set());

  const isBroken = useCallback(
    (id: string) => brokenHydrants.has(id),
    [brokenHydrants],
  );

  const toggleBroken = useCallback((id: string) => {
    setBrokenHydrants(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
  }, []);

  return (
    <HydrantStateContext.Provider value={{ brokenHydrants, isBroken, toggleBroken }}>
      {children}
    </HydrantStateContext.Provider>
  );
}
