/**
 * 用户自建风格库的持久化（localStorage，与 `mindgrid:theme-mode` / `mindgrid:minimap-visible` 同一约定）。
 *
 * ## 为什么放在 localStorage 而不是走 Rust 侧落盘
 *
 * 项目里"最近打开"走的是 `app_config_dir()/recent-files.json`，风格库**本可以**照抄。
 * 这里选 localStorage 的理由是**验证性**：桌面端与浏览器降级链路会走**同一条代码路径**，
 * 于是真引擎（真实浏览器）取到的证据就是产品实际走的那条路。
 * 若落盘到 Rust，浏览器链路必须另写一份降级实现 —— 两份实现会各自演化，
 * 而"两端不同源"正是这个项目反复吃亏的一类缺陷。
 *
 * 代价（如实记录）：风格库跟着本机的应用数据走，**不随 .mgd 分享**、
 * 清空应用数据会丢。要跨机共享需要另做"导入/导出风格"（XMind 也是这么分的）。
 *
 * ## 坏数据进来了会怎样
 *
 * 读的时候严格校验（`readCustomThemes`），**损坏项逐条丢弃**、一条都不往渲染器传；
 * 解析失败当作"库是空的"，**不覆写**用户原有的那份数据（还有人工抢救的余地）。
 */

import { useSyncExternalStore } from 'react'
import {
  getCustomThemes,
  readCustomThemes,
  setCustomThemes,
  subscribeCustomThemes,
  type CustomTheme,
} from '../../lib/document/themes'

const STORAGE_KEY = 'mindgrid:custom-themes'

/** localStorage 不可用（隐私模式 / SSR）时返回 null，调用方静默降级。 */
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * 读风格库并写入注册表。返回解析后的列表。
 *
 * 应用启动时**必须先跑一次**（见 `main.tsx`）：文档里若用了自定义风格，
 * 注册表为空时 `getTheme` 会回落到默认主题，先是默认配色、下一帧才变对 —— 会闪一下。
 */
export function loadCustomThemes(): CustomTheme[] {
  const store = storage()
  let parsed: CustomTheme[] = []
  if (store) {
    const raw = store.getItem(STORAGE_KEY)
    if (raw !== null) {
      try {
        parsed = readCustomThemes(JSON.parse(raw))
      } catch {
        // 坏 JSON：当作空库，但不覆写——用户的数据还留着
        parsed = []
      }
    }
  }
  setCustomThemes(parsed)
  return parsed
}

/**
 * 写入风格库（**先校验再落盘**）。
 *
 * 反过来写（先落盘再校验）会让一份坏数据在磁盘上定居：
 * 下次启动读到它、又被丢弃、但永远修不回来。
 */
export function persistCustomThemes(themes: readonly CustomTheme[]): CustomTheme[] {
  const validated = readCustomThemes(themes)
  setCustomThemes(validated)
  const store = storage()
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(validated))
    } catch {
      // 配额满 / 被禁用：内存里仍然生效，只是这次没落盘
    }
  }
  return validated
}

/** 新增或覆盖一条（同 id 覆盖）。 */
export function upsertCustomTheme(theme: CustomTheme): CustomTheme[] {
  const current = getCustomThemes()
  const exists = current.some((item) => item.id === theme.id)
  return persistCustomThemes(
    exists ? current.map((item) => (item.id === theme.id ? theme : item)) : [...current, theme],
  )
}

/** 删除一条。 */
export function deleteCustomTheme(id: string): CustomTheme[] {
  return persistCustomThemes(getCustomThemes().filter((item) => item.id !== id))
}

/**
 * 订阅风格库变化。
 *
 * 快照直接用 `getCustomThemes()`：库不变时它返回**同一个数组引用**，
 * 满足 `useSyncExternalStore` 对稳定快照的要求（见 registry 文件头）。
 */
export function useCustomThemes(): CustomTheme[] {
  return useSyncExternalStore(subscribeCustomThemes, getCustomThemes, getCustomThemes)
}

export { STORAGE_KEY as CUSTOM_THEME_STORAGE_KEY }
