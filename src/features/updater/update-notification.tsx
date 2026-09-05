/**
 * 更新提示卡片（P6.2 + 自动升级补齐）。
 *
 * 右下角卡片，按状态展示不同内容：
 * - available：新版本号 + 当前版本 + 更新日志外链 + 自动更新开关 + 安装/稍后/跳过此版本
 * - downloading：下载进度条
 * - installed：已装好，给「立即重启」按钮（**不自动重启**，避免丢掉未保存的编辑）
 * - error：错误信息 + 重试 / 关闭
 * - no-update：已是最新版本（3 秒后自动消失）
 *
 * 与 ToastRegion 并列存在，不互相干扰。
 */

import { useEffect } from 'react'
import type { UseUpdaterResult } from './use-updater'

/** GitHub Releases 页面，更新日志外链拼 tag 用。 */
const RELEASES_BASE_URL = 'https://github.com/jincaiw/mindgrid/releases'

interface UpdateNotificationProps {
  updater: UseUpdaterResult
}

export function UpdateNotification({ updater }: UpdateNotificationProps) {
  const {
    state,
    updateInfo,
    appVersion,
    downloadProgress,
    error,
    autoUpdate,
    setAutoUpdate,
    manualCheck,
    downloadAndInstall,
    relaunchNow,
    skipUpdate,
    dismiss,
  } = updater

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
        <span>
          当前已是最新版本
          {appVersion ? `（v${appVersion}）` : null}
        </span>
        <button className="update-notification__close" type="button" onClick={dismiss} aria-label="关闭">
          ✕
        </button>
      </div>
    )
  }

  if (state === 'available') {
    const version = updateInfo?.version ?? ''

    return (
      <div
        className="update-notification update-notification--available"
        role="alertdialog"
        aria-label="发现新版本"
      >
        <div className="update-notification__content">
          <div className="update-notification__title">
            发现新版本 {version ? `v${version}` : ''}
          </div>
          {appVersion ? (
            <div className="update-notification__meta">当前版本 v{appVersion}</div>
          ) : null}
          {updateInfo?.body ? (
            <div className="update-notification__body">{updateInfo.body}</div>
          ) : null}
          {/* latest.json 的 notes 恒为空（tauri 未填），所以更新日志一律走外链 */}
          <a
            className="update-notification__link"
            href={`${RELEASES_BASE_URL}/tag/v${version}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            在 GitHub 上查看更新日志
          </a>
        </div>

        <label className="update-notification__toggle">
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(event) => setAutoUpdate(event.target.checked)}
          />
          <span>以后自动下载并安装更新</span>
        </label>

        <div className="update-notification__actions">
          <button className="update-notification__action" type="button" onClick={skipUpdate}>
            跳过此版本
          </button>
          <button className="update-notification__action" type="button" onClick={dismiss}>
            稍后
          </button>
          <button
            className="update-notification__action update-notification__action--primary"
            type="button"
            onClick={() => void downloadAndInstall()}
          >
            安装
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
      <div
        className="update-notification update-notification--installed"
        role="alertdialog"
        aria-label="更新已就绪"
      >
        <div className="update-notification__content">
          <div className="update-notification__title">更新已安装</div>
          <div className="update-notification__meta">重启后生效，请先保存未完成的编辑。</div>
        </div>
        <div className="update-notification__actions">
          <button className="update-notification__action" type="button" onClick={dismiss}>
            稍后
          </button>
          <button
            className="update-notification__action update-notification__action--primary"
            type="button"
            onClick={() => void relaunchNow()}
          >
            立即重启
          </button>
        </div>
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
