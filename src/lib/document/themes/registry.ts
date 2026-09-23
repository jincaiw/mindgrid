/**
 * 主题注册表：**渲染链路取主题的唯一入口**。
 *
 * 内置主题是静态数据；用户自建风格是运行时加载的（见 `custom-theme-store`），
 * 所以这里维护一份**已物化**的自定义主题表，并提供订阅能力给 React。
 *
 * ## 为什么要物化一份
 *
 * `getTheme` 在渲染里被高频调用（每个节点每帧都可能走
 * `resolveTopicStyle` → `getTheme`）。若在那里现物化，等于每帧给每个节点造一批新对象，
 * 依赖这些对象的 `useMemo`/effect 会反复失效。所以**注册表变更时物化一次**，
 * `getTheme` 只做 Map 查表、返回稳定引用。
 *
 * ## 订阅的快照必须是**稳定引用**
 *
 * React 的 `useSyncExternalStore` 会在每次渲染时比较快照；若快照每次都是新对象，
 * 会被判成"一直在变"从而无限重渲染。所以：
 * - ✅ 用 `getCustomThemes()`（库不变时**返回同一个数组**）
 * - ❌ 用 `listThemes()` / `listThemesByFamily()`（每次都新建数组）
 *
 * 这条不是理论：一开始这里用的是"版本号 + 组件里再取一次数据"的绕法，
 * 而绕法的根源就是误以为必须用基本类型做快照。
 */

import {
  BUILT_IN_THEMES,
  getBuiltInTheme,
  listBuiltInThemes,
  listBuiltInThemesByFamily,
  type ThemeFamily,
  type ThemePalette,
} from './built-in-themes'
import { materializeTheme, type CustomTheme } from './custom-themes'

let customRecords: CustomTheme[] = []
let customPalettes: ThemePalette[] = []
let customMap = new Map<string, ThemePalette>()
const listeners = new Set<() => void>()

/**
 * 替换整份自定义风格列表（风格库加载后 / 保存删除后调用）。
 *
 * 采用**整体替换**而不是逐项增删：列表很短（上限 24），
 * 而"新建/改名/改色/删除"在语义上都是"这是新的那一份库"。
 */
export function setCustomThemes(themes: readonly CustomTheme[]): void {
  const builtInIds = new Set(BUILT_IN_THEMES.map((theme) => theme.id))
  const seen = new Set<string>()

  customRecords = []
  for (const theme of themes) {
    // 防御性过滤：即使调用方漏了校验，也不允许覆盖内置主题或出现重复 id
    if (builtInIds.has(theme.id) || seen.has(theme.id)) continue
    seen.add(theme.id)
    customRecords.push(theme)
  }

  customPalettes = customRecords.map(materializeTheme)
  customMap = new Map(customPalettes.map((palette) => [palette.id, palette]))
  for (const listener of listeners) listener()
}

/** 当前风格库（记录形态，供编辑器/选择器展示与编辑）。 */
export function getCustomThemes(): CustomTheme[] {
  return customRecords
}

export function subscribeCustomThemes(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 按 ID 取主题：**内置 → 自定义 → 默认**。
 *
 * 第三条回退不是可选行为：文档里记的可能是**别的机器上创建的自定义风格**
 * （把 .mgd 发给同事就会遇到）。这时渲染不能崩、也不能出空白，
 * 只能回落到默认主题；界面上再单独提示（`isThemeResolvable`）。
 */
export function getTheme(id: string | undefined): ThemePalette {
  if (id) {
    const custom = customMap.get(id)
    if (custom) return custom
  }
  return getBuiltInTheme(id)
}

/** 该 id 在本机是否解析得到（用于提示"文档用了本机没有的自定义风格"）。 */
export function isThemeResolvable(id: string | undefined): boolean {
  if (!id) return true
  return customMap.has(id) || BUILT_IN_THEMES.some((theme) => theme.id === id)
}

/** 全部主题：内置在前、自定义在后（与选择器里的分组顺序一致）。 */
export function listThemes(): ThemePalette[] {
  if (customPalettes.length === 0) return listBuiltInThemes()
  return [...listBuiltInThemes(), ...customPalettes]
}

/** 按分组列出主题。 */
export function listThemesByFamily(family: ThemeFamily): ThemePalette[] {
  if (family === 'custom') return [...customPalettes]
  return listBuiltInThemesByFamily(family)
}
