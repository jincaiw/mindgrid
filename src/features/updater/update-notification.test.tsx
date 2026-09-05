/**
 * 更新提示卡片测试。
 *
 * 关注**用户能看见和点到什么**：版本号、当前版本、更新日志外链、三个决策按钮、
 * 以及 installed 状态下的「立即重启」（这一步不能自动化，否则会丢未保存的编辑）。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateNotification } from './update-notification'
import type { UseUpdaterResult } from './use-updater'

function makeUpdater(overrides: Partial<UseUpdaterResult> = {}): UseUpdaterResult {
  return {
    state: 'available',
    updateInfo: { version: '9.9.9' },
    appVersion: '0.3.4',
    downloadProgress: 0,
    error: null,
    autoUpdate: true,
    setAutoUpdate: vi.fn(),
    manualCheck: vi.fn(async () => {}),
    downloadAndInstall: vi.fn(async () => {}),
    relaunchNow: vi.fn(async () => {}),
    skipUpdate: vi.fn(),
    dismiss: vi.fn(),
    ...overrides,
  }
}

describe('UpdateNotification', () => {
  it('idle 与 checking 状态不渲染任何内容', () => {
    const { rerender } = render(<UpdateNotification updater={makeUpdater({ state: 'idle' })} />)
    expect(screen.queryByRole('alertdialog')).toBeNull()

    rerender(<UpdateNotification updater={makeUpdater({ state: 'checking' })} />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('available：显示新版本与当前版本', () => {
    render(<UpdateNotification updater={makeUpdater()} />)

    expect(screen.getByText(/发现新版本 v9\.9\.9/)).toBeTruthy()
    expect(screen.getByText(/当前版本 v0\.3\.4/)).toBeTruthy()
  })

  it('available：更新日志外链指向对应 tag', () => {
    render(<UpdateNotification updater={makeUpdater()} />)

    const link = screen.getByRole('link', { name: /更新日志/ })
    expect(link.getAttribute('href')).toBe(
      'https://github.com/jincaiw/mindgrid/releases/tag/v9.9.9',
    )
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('available：三个决策按钮分别调用安装 / 稍后 / 跳过', () => {
    const updater = makeUpdater()
    render(<UpdateNotification updater={updater} />)

    fireEvent.click(screen.getByRole('button', { name: '安装' }))
    expect(updater.downloadAndInstall).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '稍后' }))
    expect(updater.dismiss).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '跳过此版本' }))
    expect(updater.skipUpdate).toHaveBeenCalledTimes(1)
  })

  it('available：自动更新开关反映并回写设置', () => {
    const updater = makeUpdater({ autoUpdate: true })
    render(<UpdateNotification updater={updater} />)

    const checkbox = screen.getByRole('checkbox')
    expect((checkbox as HTMLInputElement).checked).toBe(true)

    fireEvent.click(checkbox)
    expect(updater.setAutoUpdate).toHaveBeenCalledWith(false)
  })

  it('available：没有更新正文时不渲染空区块', () => {
    const { container } = render(
      <UpdateNotification updater={makeUpdater({ updateInfo: { version: '9.9.9' } })} />,
    )

    expect(container.querySelector('.update-notification__body')).toBeNull()
  })

  it('available：有更新正文时渲染出来', () => {
    const { container } = render(
      <UpdateNotification
        updater={makeUpdater({ updateInfo: { version: '9.9.9', body: '修复了若干问题' } })}
      />,
    )

    expect(screen.getByText('修复了若干问题')).toBeTruthy()
    expect(container.querySelector('.update-notification__body')).not.toBeNull()
  })

  it('downloading：进度条带 aria-valuenow', () => {
    render(<UpdateNotification updater={makeUpdater({ state: 'downloading', downloadProgress: 42 })} />)

    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('42')
    expect(screen.getByText('42%')).toBeTruthy()
  })

  it('installed：给「立即重启」按钮而不是自动重启', () => {
    const updater = makeUpdater({ state: 'installed' })
    render(<UpdateNotification updater={updater} />)

    expect(screen.getByText('更新已安装')).toBeTruthy()
    expect(updater.relaunchNow).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '立即重启' }))
    expect(updater.relaunchNow).toHaveBeenCalledTimes(1)
  })

  it('installed：提示先保存未完成的编辑', () => {
    render(<UpdateNotification updater={makeUpdater({ state: 'installed' })} />)

    expect(screen.getByText(/请先保存未完成的编辑/)).toBeTruthy()
  })

  it('error：显示错误并提供重试', () => {
    const updater = makeUpdater({ state: 'error', error: '网络连接失败，请检查网络后重试' })
    render(<UpdateNotification updater={updater} />)

    expect(screen.getByText('网络连接失败，请检查网络后重试')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(updater.manualCheck).toHaveBeenCalledTimes(1)
  })

  it('no-update：带上当前版本号', () => {
    render(<UpdateNotification updater={makeUpdater({ state: 'no-update' })} />)

    expect(screen.getByText(/当前已是最新版本（v0\.3\.4）/)).toBeTruthy()
  })

  it('no-update：拿不到当前版本时只显示文案', () => {
    render(<UpdateNotification updater={makeUpdater({ state: 'no-update', appVersion: null })} />)

    expect(screen.getByText('当前已是最新版本')).toBeTruthy()
  })
})
