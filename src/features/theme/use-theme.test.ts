import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTheme } from './use-theme'

/**
 * use-theme hook 测试（批次 20）。
 *
 * 覆盖：
 * - 初次加载读取 localStorage
 * - setMode 持久化 + 应用 data-theme 属性
 * - cycleMode 在 system → light → dark → system 间循环
 * - effective 在 system 模式下解析为系统主题
 */

const STORAGE_KEY = 'mindgrid:theme-mode'

/** 模拟 matchMedia，返回可控的 mql。 */
function mockMatchMedia(prefersDark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mql = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((type: string, handler: (event: MediaQueryListEvent) => void) => {
      if (type === 'change') listeners.add(handler)
    }),
    removeEventListener: vi.fn((type: string, handler: (event: MediaQueryListEvent) => void) => {
      if (type === 'change') listeners.delete(handler)
    }),
    dispatch: (nextMatches: boolean) => {
      mql.matches = nextMatches
      const event = { matches: nextMatches, media: mql.media } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
  }
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn(() => mql),
  })
  return mql
}

/** 简易内存 localStorage，jsdom 30 未自动提供时使用。 */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
  }
}

beforeEach(() => {
  // jsdom 30 在测试环境下未默认提供 localStorage，显式 stub 为内存实现
  vi.stubGlobal('localStorage', createMemoryStorage())
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-theme')
  vi.restoreAllMocks()
})

describe('useTheme', () => {
  it('defaults to system mode when localStorage empty', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('system')
    expect(result.current.effective).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  it('reads persisted mode from localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark')
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('dark')
    expect(result.current.effective).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('setMode persists to localStorage and applies data-theme', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setMode('dark'))
    expect(result.current.mode).toBe('dark')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('setMode("system") removes data-theme attribute', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark')
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setMode('system'))
    expect(result.current.mode).toBe('system')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('system')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  it('cycleMode rotates system → light → dark → system', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('system')
    act(() => result.current.cycleMode())
    expect(result.current.mode).toBe('light')
    act(() => result.current.cycleMode())
    expect(result.current.mode).toBe('dark')
    act(() => result.current.cycleMode())
    expect(result.current.mode).toBe('system')
  })

  it('effective resolves system → system theme via matchMedia', () => {
    mockMatchMedia(true) // 系统暗色
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('system')
    expect(result.current.effective).toBe('dark')
  })

  it('ignores invalid localStorage values and falls back to system', () => {
    window.localStorage.setItem(STORAGE_KEY, 'purple')
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('system')
  })

  it('updates effective when system preference changes while in system mode', () => {
    const mql = mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.effective).toBe('light')
    act(() => mql.dispatch(true))
    expect(result.current.effective).toBe('dark')
  })

  it('does not change effective when explicit mode overrides system preference', () => {
    const mql = mockMatchMedia(true) // 系统暗色
    const { result } = renderHook(() => useTheme())
    expect(result.current.effective).toBe('dark')
    act(() => result.current.setMode('light'))
    // 显式 light 应覆盖系统暗色
    expect(result.current.effective).toBe('light')
    act(() => mql.dispatch(false))
    // 系统切换到浅色不影响显式 light
    expect(result.current.effective).toBe('light')
  })
})
