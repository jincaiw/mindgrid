/**
 * UI 主题切换 Hook（批次 20）。
 *
 * 管理 'system' | 'light' | 'dark' 三态，持久化到 localStorage，
 * 通过 <html data-theme="..."> 应用到全局 CSS 变量。
 *
 * - 'system'：移除 data-theme 属性，由 tokens.css 的 @media (prefers-color-scheme: dark) 接管
 * - 'light' / 'dark'：显式覆盖系统偏好，优先级高于 @media 规则
 *
 * 同时订阅系统 prefers-color-scheme 变化（仅当 mode === 'system' 时影响 effective 主题），
 * 以便工具栏图标实时反映当前生效主题。
 */
import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

const STORAGE_KEY = 'mindgrid:theme-mode'

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value
    }
  } catch {
    // localStorage 不可用（隐私模式 / SSR）→ 回落到 'system'
  }
  return 'system'
}

function readSystemTheme(): EffectiveTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeAttribute(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', mode)
  }
}

export interface UseThemeResult {
  /** 用户选择的模式（持久化态） */
  mode: ThemeMode
  /** 当前实际生效的主题（system 时由系统偏好解析） */
  effective: EffectiveTheme
  /** 在 system → light → dark → system 间循环 */
  cycleMode: () => void
  /** 直接设置模式 */
  setMode: (mode: ThemeMode) => void
}

export function useTheme(): UseThemeResult {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode())
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(() => readSystemTheme())

  // 持久化 + 应用 data-theme
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // 持久化失败时静默回退（不阻塞 UI）
    }
    applyThemeAttribute(mode)
  }, [mode])

  // 订阅系统 prefers-color-scheme 变化
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }
    // 兼容 Safari < 14：addEventListener 可用则用，否则回退 legacy API
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }
    if (typeof mql.addListener === 'function') {
      mql.addListener(handler)
      return () => mql.removeListener(handler)
    }
    return
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
  }, [])

  const cycleMode = useCallback(() => {
    setModeState((current) => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'))
  }, [])

  const effective: EffectiveTheme = mode === 'system' ? systemTheme : mode

  return { mode, effective, cycleMode, setMode }
}
