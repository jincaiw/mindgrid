/**
 * 更新设置的持久化（对标 anySSH settings-store 里的 autoUpdate / skippedUpdateVersion）。
 *
 * 存两份状态：
 * - `autoUpdate`：开启后，启动检查到新版本时**自动下载并安装**，无需用户点确认
 * - `skippedVersion`：用户在弹窗里点了「跳过此版本」，该版本号不再提示
 *
 * 两处设计取舍：
 * - **装完不自动重启**。MindGrid 是文档编辑应用，重启会丢掉未保存的编辑内容；
 *   自动升级只负责"下载 + 安装"，最后一步重启交给用户点「立即重启」。
 * - **默认开启自动更新**。用户要的是"自动升级"，保守地默认关闭等于没做。
 *
 * localStorage 不可用时（隐私模式 / SSR）全部回落到默认值，静默降级。
 */

import { useCallback, useState } from 'react'

export interface UpdateSettings {
  /** 发现新版本后自动下载并安装（仍会提示重启） */
  autoUpdate: boolean
  /** 被用户显式跳过的版本号，null 表示没有 */
  skippedVersion: string | null
}

const STORAGE_KEY = 'mindgrid:update-settings'

export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  autoUpdate: true,
  skippedVersion: null,
}

/**
 * 解析存储值。任何异常（非 JSON / 字段类型不对 / null）都回落到默认值——
 * 设置项损坏不该影响更新功能本身，更不该让应用起不来。
 */
export function parseUpdateSettings(raw: string | null): UpdateSettings {
  if (!raw) {
    return DEFAULT_UPDATE_SETTINGS
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return DEFAULT_UPDATE_SETTINGS
    }

    const record = parsed as Record<string, unknown>
    const autoUpdate =
      typeof record.autoUpdate === 'boolean' ? record.autoUpdate : DEFAULT_UPDATE_SETTINGS.autoUpdate
    const skippedVersion =
      typeof record.skippedVersion === 'string' ? record.skippedVersion : null

    return { autoUpdate, skippedVersion }
  } catch {
    return DEFAULT_UPDATE_SETTINGS
  }
}

export function readUpdateSettings(): UpdateSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_UPDATE_SETTINGS
  }

  try {
    return parseUpdateSettings(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_UPDATE_SETTINGS
  }
}

export function writeUpdateSettings(settings: UpdateSettings): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 写入失败（配额 / 隐私模式）静默忽略：设置不持久，但功能不受影响
  }
}

export interface UseUpdateSettingsResult {
  settings: UpdateSettings
  setAutoUpdate: (enabled: boolean) => void
  /** 跳过指定版本，之后不再提示 */
  skipVersion: (version: string) => void
}

export function useUpdateSettings(): UseUpdateSettingsResult {
  const [settings, setSettings] = useState<UpdateSettings>(() => readUpdateSettings())

  const setAutoUpdate = useCallback((enabled: boolean) => {
    setSettings((current) => {
      const next = { ...current, autoUpdate: enabled }
      writeUpdateSettings(next)
      return next
    })
  }, [])

  const skipVersion = useCallback((version: string) => {
    setSettings((current) => {
      const next = { ...current, skippedVersion: version }
      writeUpdateSettings(next)
      return next
    })
  }, [])

  return { settings, setAutoUpdate, skipVersion }
}
