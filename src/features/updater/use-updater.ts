/**
 * 自动更新 Hook（P6.2）。
 *
 * 基于 tauri-plugin-updater + tauri-plugin-process 实现：
 * - 启动后延迟自动检查（仅 release 构建，debug 跳过）
 * - 提供 manualCheck() 供"检查更新"按钮调用
 * - 暴露 update 状态机：idle → checking → available → downloading → installed → error
 * - 未配置端点 / 公钥为占位符 / 网络错误时优雅降级，不阻塞应用
 *
 * 安全约束：
 * - 不自动下载安装，需用户确认
 * - 下载进度通过 onEvent 回调暴露
 * - 安装后调用 relaunch 重启应用
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { hasTauriRuntime } from '../../lib/ipc/transport'

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'no-update'
  | 'downloading'
  | 'installed'
  | 'error'

export interface UpdateInfo {
  version: string
  date?: string
  body?: string
}

export interface UseUpdaterResult {
  state: UpdateState
  updateInfo: UpdateInfo | null
  downloadProgress: number
  error: string | null
  manualCheck: () => Promise<void>
  downloadAndInstall: () => Promise<void>
  dismiss: () => void
}

/** 占位公钥前缀，用于检测未配置签名密钥的场景。 */
const PLACEHOLDER_PUBKEY = 'REPLACE_WITH_TAURI_SIGNING_PUBLIC_KEY'

/**
 * 延迟自动检查的等待时间（毫秒）。
 * 给应用启动留出窗口，避免与初始文档加载竞争网络。
 */
const AUTO_CHECK_DELAY_MS = 3_000

export function useUpdater(): UseUpdaterResult {
  const [state, setState] = useState<UpdateState>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const updateRef = useRef<Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>> | null>(null)
  const autoCheckedRef = useRef(false)

  const isReleaseBuild = !import.meta.env.DEV

  const performCheck = useCallback(async () => {
    if (!hasTauriRuntime()) {
      setError('浏览器环境不支持自动更新')
      setState('error')
      return
    }

    setState('checking')
    setError(null)

    try {
      const { check } = await import('@tauri-apps/plugin-updater')

      const update = await check()
      updateRef.current = update

      if (update?.available) {
        setUpdateInfo({
          version: update.version,
          date: update.date,
          body: update.body,
        })
        setState('available')
      } else {
        setState('no-update')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      // 优雅降级：未配置端点或公钥为占位符时，不视为错误
      if (message.includes('REPLACE_WITH') || message.includes('pubkey') || message.includes('endpoint')) {
        setState('idle')
        return
      }

      setError(formatUpdateError(message))
      setState('error')
    }
  }, [])

  const manualCheck = useCallback(async () => {
    autoCheckedRef.current = true
    await performCheck()
  }, [performCheck])

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current
    if (!update) {
      setError('没有可安装的更新')
      setState('error')
      return
    }

    setState('downloading')
    setError(null)
    setDownloadProgress(0)

    try {
      const { relaunch } = await import('@tauri-apps/plugin-process')

      let totalBytes = 0
      let downloadedBytes = 0

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalBytes = event.data.contentLength
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          if (totalBytes > 0) {
            setDownloadProgress(Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)))
          }
        }
      })

      setState('installed')
      // 安装完成，重启应用以应用更新
      await relaunch()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(formatUpdateError(message))
      setState('error')
    }
  }, [])

  const dismiss = useCallback(() => {
    setState('idle')
    setUpdateInfo(null)
    setError(null)
    setDownloadProgress(0)
    updateRef.current = null
  }, [])

  // 启动后自动检查（仅 release 构建，仅一次）
  useEffect(() => {
    if (!isReleaseBuild || autoCheckedRef.current) {
      return
    }
    if (!hasTauriRuntime()) {
      return
    }

    const timer = setTimeout(() => {
      autoCheckedRef.current = true
      void performCheck()
    }, AUTO_CHECK_DELAY_MS)

    return () => clearTimeout(timer)
  }, [isReleaseBuild, performCheck])

  return {
    state,
    updateInfo,
    downloadProgress,
    error,
    manualCheck,
    downloadAndInstall,
    dismiss,
  }
}

function formatUpdateError(message: string): string {
  if (message.includes('network') || message.includes('fetch') || message.includes('connect')) {
    return '网络连接失败，请检查网络后重试'
  }
  if (message.includes('signature') || message.includes('verify')) {
    return '更新签名验证失败，请稍后重试或联系开发者'
  }
  if (message.includes('permission') || message.includes('denied')) {
    return '权限不足，无法执行更新'
  }
  return `检查更新失败：${message}`
}

/** 导出占位公钥常量，供配置检查使用。 */
export { PLACEHOLDER_PUBKEY }
