/**
 * useUpdater Hook 单元测试。
 *
 * 验证要点：
 * - 浏览器环境（无 Tauri Runtime）优雅降级
 * - 初始状态正确
 * - manualCheck 在浏览器环境返回错误状态
 * - dismiss 重置状态
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUpdater } from './use-updater'

// Mock Tauri 运行时检测
vi.mock('../../lib/ipc/transport', () => ({
  hasTauriRuntime: () => false,
}))

describe('useUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('初始状态为 idle，无更新信息，无错误', () => {
    const { result } = renderHook(() => useUpdater())

    expect(result.current.state).toBe('idle')
    expect(result.current.updateInfo).toBeNull()
    expect(result.current.downloadProgress).toBe(0)
    expect(result.current.error).toBeNull()
  })

  it('浏览器环境调用 manualCheck 后进入 error 状态', async () => {
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.manualCheck()
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toContain('浏览器')
  })

  it('dismiss 重置所有状态', async () => {
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.manualCheck()
    })

    expect(result.current.state).toBe('error')

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.state).toBe('idle')
    expect(result.current.updateInfo).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.downloadProgress).toBe(0)
  })

  it('downloadAndInstall 在无更新时进入 error 状态', async () => {
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.downloadAndInstall()
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toContain('没有可安装的更新')
  })

  it('不自动检查（浏览器环境跳过自动检查）', () => {
    const { result } = renderHook(() => useUpdater())

    // 浏览器环境不应触发自动检查
    expect(result.current.state).toBe('idle')
  })
})
