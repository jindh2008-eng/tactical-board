import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { SettingsProvider, useSettings } from './store/settingsStore';
import { TrainingProvider, useTraining } from './context/TrainingContext';
import { SettingsPage } from './pages/SettingsPage';
import { PlayPage }     from './pages/PlayPage';
import './App.css';

// ── 훈련 컨트롤 바 (SettingsProvider + TrainingProvider 내부) ──────────
function TrainingControls() {
  const { building }                  = useSettings();
  const { status, elapsed, loadSettings, start, stop } = useTraining();

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const timerLabel =
    status === 'running' ? `진행중 ${mm}:${ss}` :
    status === 'ended'   ? `종료   ${mm}:${ss}` :
                           '대기중 00:00';

  return (
    <div className="nav-training">
      <span className="nav-training__target">
        {building.targetName || '대상 미설정'}
      </span>
      <span className={`nav-training__timer${status === 'running' ? ' nav-training__timer--running' : ''}`}>
        {timerLabel}
      </span>
      <div className="nav-training__btns">
        <button
          className="nav-btn nav-btn--setting"
          onClick={loadSettings}
          title="설정 데이터를 실행 상태로 불러오고 초기화"
        >
          훈련 세팅
        </button>
        <button
          className="nav-btn nav-btn--start"
          onClick={start}
          disabled={status !== 'idle'}
        >
          시작
        </button>
        <button
          className="nav-btn nav-btn--stop"
          onClick={stop}
          disabled={status !== 'running'}
        >
          종료
        </button>
      </div>
    </div>
  );
}

// ── 앱 쉘 ────────────────────────────────────────────────────────────
function AppShell() {
  return (
    <div className="app-shell tactical-board-root">
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

        {/* ── 훈련 컨트롤 (동일 줄 우측) ── */}
        <TrainingControls />
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
  );
}

function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <TrainingProvider>
          <AppShell />
        </TrainingProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}

export default App;
