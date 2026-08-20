import { createContext, useContext, useState } from 'react';

interface FireLineCtx {
  showFireLine: boolean;
  toggleFireLine: () => void;
  /** 값을 직접 지정한다. 출동대를 끌어다 놓는 "설치"는 토글이 아니라 항상 켜기다. */
  setFireLine: (next: boolean) => void;
  /**
   * 소방통제선 세로 위치 — **A면 높이 대비 0~1 정규화**. 0 이 최상단(기존 자리).
   * 건물에서 얼마나 떨어뜨릴지를 훈련 중에 끌어서 조절한다.
   * px 로 두면 해상도가 바뀔 때 어긋나므로 이 코드베이스 규칙대로 비율로 둔다.
   * 하한(아래로 얼마나 갈 수 있는지)은 A면 하단 박스 위치에 걸리므로
   * 저장값이 아니라 드래그 시점에 실측해서 잘라낸다(ExteriorZone).
   */
  fireLineY: number;
  setFireLineY: (next: number) => void;
  /** 경찰 통제선 — 소방통제선과 같은 방식, A면 하단에 깔린다. 위치는 바닥 고정 */
  showPoliceLine: boolean;
  setPoliceLine: (next: boolean) => void;
  /**
   * 통제선 설치 담당 출동대 — 드롭다운(우클릭 메뉴)으로 특정 출동대를 선택했을 때만 채워진다.
   * 단순 클릭 토글이나 해제 시에는 null(담당자 미지정). ControlLineToggles 가 버튼 옆에 텍스트로 보여준다.
   */
  fireLineInstaller: string | null;
  setFireLineInstaller: (next: string | null) => void;
  policeLineInstaller: string | null;
  setPoliceLineInstaller: (next: string | null) => void;
}

const FireLineContext = createContext<FireLineCtx>({
  showFireLine: false,
  toggleFireLine: () => {},
  setFireLine: () => {},
  fireLineY: 0,
  setFireLineY: () => {},
  showPoliceLine: false,
  setPoliceLine: () => {},
  fireLineInstaller: null,
  setFireLineInstaller: () => {},
  policeLineInstaller: null,
  setPoliceLineInstaller: () => {},
});

export function useFireLine() {
  return useContext(FireLineContext);
}

export function FireLineProvider({ children }: { children: React.ReactNode }) {
  const [showFireLine, setShowFireLine]     = useState(false);
  const [showPoliceLine, setShowPoliceLine] = useState(false);
  const [fireLineY, setFireLineY]           = useState(0);
  const [fireLineInstaller, setFireLineInstaller]     = useState<string | null>(null);
  const [policeLineInstaller, setPoliceLineInstaller] = useState<string | null>(null);
  return (
    <FireLineContext.Provider
      value={{
        showFireLine,
        toggleFireLine: () => setShowFireLine(v => !v),
        setFireLine:    setShowFireLine,
        fireLineY,
        setFireLineY,
        showPoliceLine,
        setPoliceLine:  setShowPoliceLine,
        fireLineInstaller,
        setFireLineInstaller,
        policeLineInstaller,
        setPoliceLineInstaller,
      }}
    >
      {children}
    </FireLineContext.Provider>
  );
}
