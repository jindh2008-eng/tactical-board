import { createContext, useContext, useState, type ReactNode } from 'react';

export type OverlayType = 'log' | 'analysis' | 'scenario' | 'checklist' | 'rescue-stats' | null;

interface UIOverlayContextValue {
  overlay: OverlayType;
  openOverlay: (type: OverlayType) => void;
  closeOverlay: () => void;
}

const UIOverlayContext = createContext<UIOverlayContextValue>(null!);

export function UIOverlayProvider({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState<OverlayType>(null);
  return (
    <UIOverlayContext.Provider
      value={{ overlay, openOverlay: setOverlay, closeOverlay: () => setOverlay(null) }}
    >
      {children}
    </UIOverlayContext.Provider>
  );
}

export function useUIOverlay() {
  return useContext(UIOverlayContext);
}
