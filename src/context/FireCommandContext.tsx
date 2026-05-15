import { createContext, useContext, useRef, type ReactNode } from 'react';
import type { FireStatus } from '../types';

type SetFireFn = (floorId: string, status: FireStatus | null) => void;

interface FireCommandValue {
  register: (fn: SetFireFn) => void;
  callSetFire: (floorId: string, status: FireStatus | null) => void;
}

const FireCommandContext = createContext<FireCommandValue | null>(null);

export function FireCommandProvider({ children }: { children: ReactNode }) {
  const fnRef = useRef<SetFireFn | null>(null);
  const value: FireCommandValue = {
    register:    fn => { fnRef.current = fn; },
    callSetFire: (floorId, status) => fnRef.current?.(floorId, status),
  };
  return <FireCommandContext.Provider value={value}>{children}</FireCommandContext.Provider>;
}

export function useFireCommand(): FireCommandValue {
  const ctx = useContext(FireCommandContext);
  if (!ctx) throw new Error('useFireCommand must be used inside FireCommandProvider');
  return ctx;
}
