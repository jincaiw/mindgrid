/**
 * 更新通知组件（P6.2）。
 *
 * 在应用右下角显示更新状态：
 * - available：显示新版本号 + "立即更新" / "稍后" 按钮
 * - downloading：显示下载进度条
 * - installed：显示"即将重启…"提示（自动 relaunch 前的过渡）
 * - error：显示错误信息 + "重试" / "关闭" 按钮
 * - no-update：显示"已是最新版本"（3 秒后自动消失）
 *
 * 与 ToastRegion 并列存在，不互相干扰。
 */

import { useEffect } from 'react'
import type { UseUpdaterResult } from './use-updater'

interface UpdateNotificationProps {
  updater: UseUpdaterResult
}

export function UpdateNotification({ updater }: UpdateNotificationProps) {
  const { state, updateInfo, downloadProgress, error, manualCheck, downloadAndInstall, dismiss } = updater

  // no-update 状态 3 秒后自动消失
  useEffect(() => {
    if (state !== 'no-update') {
      return
    }
    const timer = setTimeout(() => dismiss(), 3_000)
    return () => clearTimeout(timer)
  }, [state, dismiss])

  if (state === 'idle' || state === 'checking') {
    return null
  }

  if (state === 'no-update') {
    return (
      <div className="update-notification update-notification--info" role="status">
        <span>当前已是最新版本</span>
        <button className="update-notification__close" type="button" onClick={dismiss} aria-label="关闭">
          ✕
        </button>
      </div>
    )
  }

  if (state === 'available') {
    return (
      <div className="update-notification update-notification--available" role="alertdialog" aria-label="发现新版本">
        <div className="update-notification__content">
          <div className="update-notification__title">
            发现新版本 v{updateInfo?.version ?? '?'}
          </div>
          {updateInfo?.body ? (
            <div className="update-notification__body">{updateInfo.body}</div>
          ) : null}
        </div>
        <div className="update-notification__actions">
          <button
            className="update-notification__action update-notification__action--primary"
            type="button"
            onClick={() => void downloadAndInstall()}
          >
            立即更新
          </button>
          <button className="update-notification__action" type="button" onClick={dismiss}>
            稍后
          </button>
        </div>
      </div>
    )
  }

  if (state === 'downloading') {
    return (
      <div className="update-notification update-notification--downloading" role="status">
        <div className="update-notification__content">
          <div className="update-notification__title">正在下载更新…</div>
          <div className="update-notification__progress">
            <div
              className="update-notification__progress-bar"
              style={{ width: `${downloadProgress}%` }}
              role="progressbar"
              aria-valuenow={downloadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <div className="update-notification__progress-text">{downloadProgress}%</div>
        </div>
      </div>
    )
  }

  if (state === 'installed') {
    return (
      <div className="update-notification update-notification--installed" role="status">
        <span>更新安装完成，即将重启…</span>
      </div>
    )
  }

  // error
  return (
    <div className="update-notification update-notification--error" role="alert">
      <div className="update-notification__content">
        <div className="update-notification__title">更新失败</div>
        <div className="update-notification__body">{error}</div>
      </div>
      <div className="update-notification__actions">
        <button
          className="update-notification__action update-notification__action--primary"
          type="button"
          onClick={() => void manualCheck()}
        >
          重试
        </button>
        <button className="update-notification__action" type="button" onClick={dismiss}>
          关闭
        </button>
      </div>
    </div>
  )
}
