/**
 * 自动更新 Hook（P6.2 + 对标 anySSH 的 updater-store 补齐自动升级）。
 *
 * 基于 tauri-plugin-updater + tauri-plugin-process 实现：
 * - 启动后延迟自动检查（仅 release 构建，dev 跳过）
 * - 提供 manualCheck() 供"检查更新"菜单项调用
 * - 状态机：idle → checking → available → downloading → installed → error
 * - 未配置端点 / 网络错误时优雅降级，不阻塞应用
 *
 * 自动升级的行为（本应用与 anySSH 的唯一实质差异）：
 * - anySSH 装完立刻 `relaunch()`；MindGrid **不自动重启**，只进入 installed 状态
 *   让用户点「立即重启」。原因是 MindGrid 是文档编辑应用，重启会丢掉未保存的编辑，
 *   而 relaunch 不会触发 beforeunload 保护。自动升级只负责"下载 + 安装"。
 *
 * 安全约束：
 * - debug / dev 二进制**绝不**自覆盖安装（会把运行中的可执行文件写坏），
 *   判定走 Rust 侧 `is_release_build`，不能用 `import.meta.env.DEV`
 *   —— `tauri build --debug` 前端是生产模式打包，DEV 已是 false，会误判
 * - 下载进度通过 onEvent 回调暴露
 * - 用户可「跳过此版本」，该版本号持久化后不再提示
 */

import { useCallback, useEffect, useRef, useState } from 'react'
// core 已被 dialog / process 等插件静态引入，这里再动态 import 只会被打包器判定为
// INEFFECTIVE_DYNAMIC_IMPORT，索性静态引入。调用点仍由 hasTauriRuntime() 守卫。
import { invoke } from '@tauri-apps/api/core'
import { hasTauriRuntime } from '../../lib/ipc/transport'
import { useUpdateSettings } from './update-settings'

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
  /** 当前运行版本（来自 tauri app 插件），Web 环境下为 null */
  appVersion: string | null
  downloadProgress: number
  error: string | null
  /** 是否开启自动下载安装 */
  autoUpdate: boolean
  setAutoUpdate: (enabled: boolean) => void
  manualCheck: () => Promise<void>
  downloadAndInstall: () => Promise<void>
  /** 重启进入已安装的新版本（installed 状态下可用） */
  relaunchNow: () => Promise<void>
  /** 跳过当前这个版本，之后不再提示 */
  skipUpdate: () => void
  dismiss: () => void
}

/** 占位公钥前缀，用于检测未配置签名密钥的场景。 */
const PLACEHOLDER_PUBKEY = 'REPLACE_WITH_TAURI_SIGNING_PUBLIC_KEY'

/**
 * 延迟自动检查的等待时间（毫秒）。
 * 给应用启动留出窗口，避免与初始文档加载竞争网络。
 */
const AUTO_CHECK_DELAY_MS = 3_000

/** check() 返回的更新句柄。 */
type UpdateHandle = NonNullable<
  Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>>
>

export function useUpdater(): UseUpdaterResult {
  const [state, setState] = useState<UpdateState>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const updateRef = useRef<UpdateHandle | null>(null)
  const autoCheckedRef = useRef(false)

  const { settings, setAutoUpdate, skipVersion } = useUpdateSettings()

  // 设置是对象，每次变更都是新引用。用 ref 承载最新值，让下面这些回调保持
  // 引用稳定——否则设置一变，自动检查的 effect 就会重跑一遍定时器。
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // 只 invoke 一次「是否 release 构建」，结果缓存在 ref。
  // 取不到答案时保守返回 false：宁可不自动安装，也不能写坏自己的二进制。
  const releaseBuildRef = useRef<boolean | null>(null)
  const isReleaseBuild = useCallback(async (): Promise<boolean> => {
    if (releaseBuildRef.current === null) {
      try {
        releaseBuildRef.current = await invoke<boolean>('is_release_build')
      } catch {
        releaseBuildRef.current = false
      }
    }
    return releaseBuildRef.current
  }, [])

  /** 下载并安装。非 release 构建只提示有新版本，绝不自覆盖。 */
  const installUpdate = useCallback(
    async (update: UpdateHandle) => {
      if (!(await isReleaseBuild())) {
        setState('available')
        return
      }

      setState('downloading')
      setError(null)
      setDownloadProgress(0)

      try {
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(formatUpdateError(message))
        setState('error')
      }
    },
    [isReleaseBuild],
  )

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

      // 注意：`update.available` 在 v2 里已废弃且恒为 true，
      // 判断有没有更新要看 check() 是否返回 null。
      if (!update) {
        setState('no-update')
        return
      }

      setUpdateInfo({
        version: update.version,
        date: update.date,
        body: update.body,
      })

      // 用户点过「跳过此版本」→ 静默，不打扰
      if (settingsRef.current.skippedVersion === update.version) {
        setState('idle')
        return
      }

      // 自动更新开启 → 直接下载安装，装完停在 installed 等用户点重启
      if (settingsRef.current.autoUpdate) {
        await installUpdate(update)
        return
      }

      setState('available')
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
  }, [installUpdate])

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

    await installUpdate(update)
  }, [installUpdate])

  const relaunchNow = useCallback(async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(formatUpdateError(message))
      setState('error')
    }
  }, [])

  const skipUpdate = useCallback(() => {
    const version = updateInfo?.version
    if (version) {
      skipVersion(version)
    }
    setState('idle')
    setUpdateInfo(null)
  }, [updateInfo?.version, skipVersion])

  const dismiss = useCallback(() => {
    setState('idle')
    setUpdateInfo(null)
    setError(null)
    setDownloadProgress(0)
    updateRef.current = null
  }, [])

  // 读取当前运行版本，用于更新弹窗里显示「当前 vX → 新 vY」
  useEffect(() => {
    if (!hasTauriRuntime()) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app')
        const version = await getVersion()
        if (!cancelled) {
          setAppVersion(version)
        }
      } catch {
        // best-effort：拿不到就不显示当前版本
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // 启动后自动检查（仅 release 构建，仅一次）
  useEffect(() => {
    if (import.meta.env.DEV || autoCheckedRef.current) {
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
  }, [performCheck])

  return {
    state,
    updateInfo,
    appVersion,
    downloadProgress,
    error,
    autoUpdate: settings.autoUpdate,
    setAutoUpdate,
    manualCheck,
    downloadAndInstall,
    relaunchNow,
    skipUpdate,
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
