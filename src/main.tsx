import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initSettingsSync } from './utils/settingsSync'

// 설정을 PC 파일(data/settings.json)에서 먼저 받아 온 뒤 그린다 — 설정 화면은 브라우저 사본을
// 동기적으로 읽으므로 그리기 전에 사본이 맞아 있어야 한다. 서버가 없으면 2초 안에 포기하고 연다.
void initSettingsSync().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
