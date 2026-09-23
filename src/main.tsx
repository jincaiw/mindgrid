import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import './styles/tokens.css'
import './styles/global.css'
import { loadCustomThemes } from './features/theme/custom-theme-store'

// 风格库里若有当前文档在用的自定义风格，**必须在首次渲染前**装进注册表：
// 否则首帧按默认主题画、第二帧才变对，会看到一闪。
loadCustomThemes()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
