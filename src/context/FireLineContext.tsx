import { createContext, useContext, useState } from 'react';

interface FireLineCtx {
  showFireLine: boolean;
  toggleFireLine: () => void;
}

const FireLineContext = createContext<FireLineCtx>({
  showFireLine: true,
  toggleFireLine: () => {},
});

export function useFireLine() {
  return useContext(FireLineContext);
}

export function FireLineProvider({ children }: { children: React.ReactNode }) {
  const [showFireLine, setShowFireLine] = useState(true);
  return (
    <FireLineContext.Provider value={{ showFireLine, toggleFireLine: () => setShowFireLine(v => !v) }}>
      {children}
    </FireLineContext.Provider>
  );
}
