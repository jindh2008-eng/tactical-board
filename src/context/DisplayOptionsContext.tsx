import { createContext, useContext } from 'react';

export interface DisplayOptions {
  showWaterConn:  boolean;
  showSpray:      boolean;
  showWaterLevel: boolean;
}

export const DisplayOptionsContext = createContext<DisplayOptions>({
  showWaterConn:  true,
  showSpray:      true,
  showWaterLevel: true,
});

export function useDisplayOptions(): DisplayOptions {
  return useContext(DisplayOptionsContext);
}
