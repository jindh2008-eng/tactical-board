import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { SettingsProvider } from './store/settingsStore';
import { TokenProvider }    from './context/TokenContext';
import { VictimProvider }   from './context/VictimContext';
import { SettingsPage }     from './pages/SettingsPage';
import { PlayPage }         from './pages/PlayPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <TokenProvider>
          <VictimProvider>
            <div className="app-shell">
              {/* ── 상단 네비게이션 ── */}
              <nav className="app-nav">
                <span className="app-nav__brand">전술 상황판</span>
                <div className="app-nav__links">
                  <NavLink
                    to="/settings"
                    className={({ isActive }) =>
                      `app-nav__link${isActive ? ' app-nav__link--active' : ''}`
                    }
                  >
                    설정
                  </NavLink>
                  <NavLink
                    to="/play"
                    className={({ isActive }) =>
                      `app-nav__link${isActive ? ' app-nav__link--active' : ''}`
                    }
                  >
                    실행
                  </NavLink>
                </div>
              </nav>

              {/* ── 페이지 라우트 ── */}
              <div className="app-content">
                <Routes>
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/play"     element={<PlayPage />} />
                  <Route path="*"         element={<Navigate to="/play" replace />} />
                </Routes>
              </div>
            </div>
          </VictimProvider>
        </TokenProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}

export default App;
