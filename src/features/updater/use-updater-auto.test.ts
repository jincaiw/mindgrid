/**
 * 自动升级行为测试（对标 anySSH updater-store 补齐的部分）。
 *
 * 这里覆盖的是**release 构建下的真实路径**，所以 mock 出 Tauri 运行时：
 * - 自动更新开启 → 检查到新版本后自动下载安装，停在 installed（不自动重启）
 * - `is_release_build` 为 false → 只提示 available，绝不调用 downloadAndInstall
 *   （debug 构建自覆盖会把自己的二进制写坏，这是最关键的一条断言）
 * - 跳过版本 → 静默，且偏好被持久化
 *
 * 与 use-updater.test.ts 的分工：那个文件测浏览器降级路径（hasTauriRuntime=false）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUpdater } from './use-updater'
import { readUpdateSettings } from './update-settings'

const mock = vi.hoisted(() => {
  class MockUpdate {
    available = true
    version = '9.9.9'
    date = '2026-09-05'
    body = '更新日志'
    failDownload = false
    installCalls = 0

    async downloadAndInstall(
      onEvent?: (event: { event: string; data: Record<string, number> }) => void,
    ): Promise<void> {
      this.installCalls += 1
      if (this.failDownload) {
        throw new Error('network error')
      }
      onEvent?.({ event: 'Started', data: { contentLength: 100 } })
      onEvent?.({ event: 'Progress', data: { chunkLength: 40 } })
      onEvent?.({ event: 'Progress', data: { chunkLength: 60 } })
      onEvent?.({ event: 'Finished', data: {} })
    }
  }

  return {
    hasTauri: true,
    releaseBuild: true,
    /** 让 is_release_build 的 invoke 直接抛错，模拟拿不到答案的场景 */
    invokeFails: false,
    update: null as MockUpdate | null,
    relaunched: false,
    MockUpdate,
  }
})

vi.mock('../../lib/ipc/transport', () => ({
  hasTauriRuntime: () => mock.hasTauri,
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: () => Promise.resolve(mock.update),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string) => {
    if (mock.invokeFails) {
      return Promise.reject(new Error('command not found'))
    }
    if (command === 'is_release_build') {
      return Promise.resolve(mock.releaseBuild)
    }
    return Promise.reject(new Error(`unexpected command: ${command}`))
  },
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: () => {
    mock.relaunched = true
    return Promise.resolve()
  },
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => Promise.resolve('0.3.4'),
}))

/** 造一个"有新版本"的场景，并返回 update 句柄便于断言。 */
function givenUpdate() {
  const update = new mock.MockUpdate()
  mock.update = update
  return update
}

describe('自动升级', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mock.hasTauri = true
    mock.releaseBuild = true
    mock.invokeFails = false
    mock.update = null
    mock.relaunched = false
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('release 构建 + 自动更新开启：检查后自动装完并停在 installed', async () => {
    const update = givenUpdate()
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.manualCheck()
    })

    expect(result.current.state).toBe('installed')
    expect(update.installCalls).toBe(1)
    expect(result.current.updateInfo?.version).toBe('9.9.9')
    expect(result.current.downloadProgress).toBe(100)
  })

  it('装完不自动重启——等用户点「立即重启」', async () => {
    givenUpdate()
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.manualCheck()
    })

    expect(result.current.state).toBe('installed')
    expect(mock.relaunched).toBe(false)
  })

  it('relaunchNow 才真正触发重启', async () => {
    givenUpdate()
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.manualCheck()
    })
    await act(async () => {
      await result.current.relaunchNow()
    })

    expect(mock.relaunched).toBe(true)
  })

  it('非 release 构建绝不自覆盖安装：只提示 available', async () => {
    const update = givenUpdate()
    mock.releaseBuild = false
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.manualCheck()
    })

    expect(result.current.state).toBe('available')
    expect(update.installCalls).toBe(0)
  })

  it('is_release_build 命令不可用时保守降级为不自装', async () => {
    const update = givenUpdate()
    mock.invokeFails = true // invoke 抛错 → useUpdater 内部回落到 false
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.manualCheck()
    })

    expect(result.current.state).toBe('available')
    expect(update.installCalls).toBe(0)
  })

  it('自动更新关闭：只提示 available，不下载', async () => {
    const update = givenUpdate()
    const { result } = renderHook(() => useUpdater())

    act(() => {
      result.current.setAutoUpdate(false)
    })
    await act(async () => {
      await result.current.manualCheck()
    })

    expect(result.current.state).toBe('available')
    expect(update.installCalls).toBe(0)
  })

  it('关闭后手动点「安装」仍然可用', async () => {
    const update = givenUpdate()
    const { result } = renderHook(() => useUpdater())

    act(() => {
      result.current.setAutoUpdate(false)
    })
    await act(async () => {
      await result.current.manualCheck()
    })
    await act(async () => {
      await result.current.downloadAndInstall()
    })

    expect(result.current.state).toBe('installed')
    expect(update.installCalls).toBe(1)
  })

  it('没有可用更新时进入 no-update', async () => {
    mock.update = null
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.manualCheck()
    })

    expect(result.current.state).toBe('no-update')
  })
})

describe('跳过此版本', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mock.hasTauri = true
    mock.releaseBuild = true
    mock.invokeFails = false
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('skipUpdate 写入持久化并回到 idle', async () => {
    givenUpdate()
    const { result } = renderHook(() => useUpdater())

    act(() => {
      result.current.setAutoUpdate(false)
    })
    await act(async () => {
      await result.current.manualCheck()
    })

    act(() => {
      result.current.skipUpdate()
    })

    expect(result.current.state).toBe('idle')
    expect(readUpdateSettings().skippedVersion).toBe('9.9.9')
  })

  it('已跳过的版本再检查时静默（回到 idle，不提示也不下载）', async () => {
    const update = givenUpdate()
    const { result } = renderHook(() => useUpdater())

    act(() => {
      result.current.setAutoUpdate(false)
    })
    await act(async () => {
      await result.current.manualCheck()
    })
    act(() => {
      result.current.skipUpdate()
    })

    // 新挂载的 hook 会从 localStorage 读到跳过记录
    const second = renderHook(() => useUpdater())
    await act(async () => {
      await second.result.current.manualCheck()
    })

    expect(second.result.current.state).toBe('idle')
    expect(update.installCalls).toBe(0)
  })

  it('跳过的是版本号本身：换一个版本仍会提示', async () => {
    givenUpdate()
    const { result } = renderHook(() => useUpdater())

    act(() => {
      result.current.setAutoUpdate(false)
    })
    await act(async () => {
      await result.current.manualCheck()
    })
    act(() => {
      result.current.skipUpdate()
    })

    // 下一个 release 版本
    const nextUpdate = new mock.MockUpdate()
    nextUpdate.version = '10.0.0'
    mock.update = nextUpdate

    const second = renderHook(() => useUpdater())
    await act(async () => {
      await second.result.current.manualCheck()
    })

    expect(second.result.current.state).toBe('available')
    expect(second.result.current.updateInfo?.version).toBe('10.0.0')
  })
})

describe('错误与版本展示', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mock.hasTauri = true
    mock.releaseBuild = true
    mock.invokeFails = false
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('下载失败进入 error 并给出可读文案', async () => {
    const update = givenUpdate()
    update.failDownload = true
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.manualCheck()
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toContain('网络连接失败')
  })

  it('读取到当前运行版本', async () => {
    mock.update = null
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.appVersion).toBe('0.3.4')
  })

  it('dismiss 清空更新信息与进度', async () => {
    givenUpdate()
    const { result } = renderHook(() => useUpdater())

    act(() => {
      result.current.setAutoUpdate(false)
    })
    await act(async () => {
      await result.current.manualCheck()
    })

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.state).toBe('idle')
    expect(result.current.updateInfo).toBeNull()
  })

  it('没有可安装的更新时 downloadAndInstall 报错', async () => {
    mock.update = null
    const { result } = renderHook(() => useUpdater())

    await act(async () => {
      await result.current.downloadAndInstall()
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toContain('没有可安装的更新')
  })
})
