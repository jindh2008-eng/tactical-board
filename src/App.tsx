import { memo, useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { SettingsProvider } from './store/settingsStore';
import { TrainingProvider } from './context/TrainingContext';
import { UIOverlayProvider, useUIOverlay } from './context/UIOverlayContext';
import { NavSlotProvider, NavSlot } from './context/NavSlotContext';
import { SettingsPage }    from './pages/SettingsPage';
import { PlayPage }        from './pages/PlayPage';
import { ScenarioModal }   from './components/overlays/ScenarioModal';
import './App.css';

// ── 메뉴 버튼 (드롭다운) ──────────────────────────────────────────────
function MenuButton() {
  const [open, setOpen]  = useState(false);
  const navigate         = useNavigate();
  const location         = useLocation();
  const { openOverlay }  = useUIOverlay();
  const menuRef          = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div className="app-menu" ref={menuRef}>
      <button className="app-menu__trigger" onClick={() => setOpen(v => !v)}>
        메뉴
      </button>
      {open && (
        <div className="app-menu__dropdown">
          <button className="app-menu__item" onClick={() => { navigate('/settings'); setOpen(false); }}>
            설정
          </button>
          <button className="app-menu__item" onClick={() => { navigate('/play'); setOpen(false); }}>
            훈련
          </button>
          <button className="app-menu__item" onClick={() => {
            if (location.pathname !== '/play') navigate('/play');
            openOverlay('analysis');
            setOpen(false);
          }}>
            분석
          </button>
        </div>
      )}
    </div>
  );
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
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/play"     element={<PlayPage />} />
          <Route path="*"         element={<Navigate to="/play" replace />} />
        </Routes>
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
