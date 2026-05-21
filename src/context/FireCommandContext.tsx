import { createContext, useContext, useRef, type ReactNode } from 'react';
import type { FireStatus } from '../types';

type SetFireFn      = (floorId: string, status: FireStatus | null) => void;
type GetFireStatesFn = () => Record<string, FireStatus | null>;

interface FireCommandValue {
  register:              (fn: SetFireFn) => void;
  callSetFire:           (floorId: string, status: FireStatus | null) => void;
  registerGetFireStates: (fn: GetFireStatesFn) => void;
  getFireStates:         () => Record<string, FireStatus | null>;
}

const FireCommandContext = createContext<FireCommandValue | null>(null);

export function FireCommandProvider({ children }: { children: ReactNode }) {
  const setFireRef      = useRef<SetFireFn | null>(null);
  const getFireStatesRef = useRef<GetFireStatesFn | null>(null);
  const value: FireCommandValue = {
    register:              fn => { setFireRef.current = fn; },
    callSetFire:           (floorId, status) => setFireRef.current?.(floorId, status),
    registerGetFireStates: fn => { getFireStatesRef.current = fn; },
    getFireStates:         () => getFireStatesRef.current?.() ?? {},
  };
  return <FireCommandContext.Provider value={value}>{children}</FireCommandContext.Provider>;
}

export function useFireCommand(): FireCommandValue {
  const ctx = useContext(FireCommandContext);
  if (!ctx) throw new Error('useFireCommand must be used inside FireCommandProvider');
  return ctx;
}
