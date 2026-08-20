import { memo, useState, useRef, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { SettingsProvider } from './store/settingsStore';
import { TrainingProvider } from './context/TrainingContext';
import { UIOverlayProvider, useUIOverlay } from './context/UIOverlayContext';
import { NavSlotProvider, NavSlot } from './context/NavSlotContext';
import { SettingsPage }    from './pages/SettingsPage';
import { PlayPage }        from './pages/PlayPage';
import { ScenarioModal }   from './components/overlays/ScenarioModal';
import { ErrorBoundary }   from './components/shared/ErrorBoundary';
import './App.css';

// ── 메뉴 버튼 (드롭다운) ──────────────────────────────────────────────
/**
 * 네 모드로 나눈 진입 메뉴 — docs/MASTER_PLAN.md 결정 D-4
 *
 *   설정모드            /settings
 *   훈련모드(무플)      /play          ★ 현재 작업 범위
 *   훈련모드(지휘)      미구현          → MASTER_PLAN.md §7.1
 *   분석(창)            /play 내부 모달
 *
 * 지휘 항목은 자리만 잡아 두고 비활성이다. 라우트를 미리 만들지 않는 이유는
 * 빈 화면으로 들어가는 경로가 생기면 훈련 중 오조작이 되기 때문이다.
 */
function MenuButton() {
  const [open, setOpen]          = useState(false);
  const navigate                 = useNavigate();
  const location                 = useLocation();
  const { overlay, openOverlay } = useUIOverlay();
  const menuRef                  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // 분석창이 열려 있는 동안에는 경로가 /play 여도 분석을 현재 모드로 본다
  const analysisOpen = overlay === 'analysis';
  const itemClass = (active: boolean) =>
    `app-menu__item${active ? ' app-menu__item--active' : ''}`;

  function goTo(path: string) {
    if (location.pathname !== path) navigate(path);
    setOpen(false);
  }

  return (
    <div className="app-menu" ref={menuRef}>
      <button className="app-menu__trigger" onClick={() => setOpen(v => !v)}>
        메뉴
      </button>
      {open && (
        <div className="app-menu__dropdown">
          <button
            className={itemClass(location.pathname === '/settings')}
            onClick={() => goTo('/settings')}
          >
            설정모드
          </button>

          <div className="app-menu__group">훈련모드</div>
          <button
            className={itemClass(location.pathname === '/play' && !analysisOpen)}
            onClick={() => goTo('/play')}
          >
            무전플레이어
          </button>
          <button
            className="app-menu__item app-menu__item--pending"
            disabled
            title="훈련모드(무플) 완성 후 착수 — docs/MASTER_PLAN.md §7.1"
          >
            지휘교수
            <span className="app-menu__badge">준비 중</span>
          </button>

          <div className="app-menu__divider" />
          <button
            className={itemClass(analysisOpen)}
            onClick={() => {
              if (location.pathname !== '/play') navigate('/play');
              openOverlay('analysis');
              setOpen(false);
            }}
          >
            분석
          </button>
        </div>
      )}
    </div>
  );
}

// ── 라우트 변경 시 오류 상태를 자동 해제하는 경계 래퍼 ────────────────
// 별도 컴포넌트로 분리해 useLocation 구독이 AppShell(memo)까지 전파되지 않게 한다.
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

// ── 앱 쉘 — React.memo로 NavSlotProvider 재렌더 전파 차단 ─────────────
const AppShell = memo(function AppShell() {
  const { overlay } = useUIOverlay();
  return (
    <div className="app-shell tactical-board-root">
      <nav className="app-nav">
        <MenuButton />
        <NavSlot />
      </nav>
      <div className="app-content">
        {/* 오류 경계는 Routes만 감싼다 — 상단 nav는 밖에 남겨
            오류 발생 후에도 메뉴로 화면 이동이 가능하도록 함 */}
        <RouteErrorBoundary>
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/play"     element={<PlayPage />} />
            <Route path="*"         element={<Navigate to="/play" replace />} />
          </Routes>
        </RouteErrorBoundary>
      </div>
      {overlay === 'scenario' && <ScenarioModal />}
    </div>
  );
});

function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <TrainingProvider>
          <UIOverlayProvider>
            <NavSlotProvider>
              <AppShell />
            </NavSlotProvider>
          </UIOverlayProvider>
        </TrainingProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}

export default App;
