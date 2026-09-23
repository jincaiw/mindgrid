/**
 * 用户自建风格（XMind「工具 → 创建自定义风格」的对应物）。
 *
 * ## 存储形态与运行时形态是**两个**东西
 *
 * 存进风格库的是 `CustomThemePalette`：**只允许 `#rrggbb`**，字段少、可严格校验。
 * 运行时用的是 `ThemePalette`（渲染器认的结构）。两者之间由 `materializeTheme` 转换。
 *
 * 为什么要分：风格库可能被手改、被别的版本写过、被导入坏数据。把"存储形态"限制成
 * 一个纯 hex 的小结构，校验就能做到**逐项判死**，而且**坏数据进不了渲染器**
 * （颜色会进 CSS/canvas，非法字符串的后果不在这一层能预料）。
 *
 * ## `metaTextColor` 由文字色派生，不单独存
 *
 * 元信息文字（深度/子主题数）在既有实现里就是"文字色的低透明度版本"
 * （内置主题写的是 `rgba(255,255,255,0.82)` / `rgba(60,60,67,0.6)` 这类，见
 * `built-in-themes.ts` 与 `style-resolver` 的 `DEEP_BRANCH_META_TEXT_COLOR`）。
 * 自定义风格沿用同一约定：`rgba(textColor, 0.62)`。
 *
 * 于是：① 用户改文字色时元信息自动跟着变，不会出现"深底上写着深色元信息"；
 * ② 存储结构里没有 rgba 字符串，校验只需认一种颜色格式。
 *
 * ## 半透明色在"入编辑器"时被合成掉
 *
 * 内置主题大量使用 `rgba()`（描边、连线、浅色边框）与 `transparent`（"没有边框"），
 * 而 `input[type=color]` 只认不透明 hex。所以 `draftPaletteFrom` 会把它们
 * **按不透明度与底色合成**成不透明色（见 `toOpaqueHex`）。
 *
 * 这条不做的话有两个后果，本轮都踩到了：
 * ① 取色控件显示成黑色（它拿到非法值会回落 `#000000`）；
 * ② **保存时整条风格被校验丢掉**——用户看到的是"点了保存什么都没发生"。
 */

import {
  BUILT_IN_THEMES,
  type ThemeFamily,
  type ThemeLevelColors,
  type ThemePalette,
} from './built-in-themes'

/** 自定义风格 id 前缀：与内置 id 天然隔离。 */
export const CUSTOM_THEME_ID_PREFIX = 'custom-theme-'

/** 风格库条数上限（超出后只保留前面的，避免一份坏数据把库撑爆）。 */
export const CUSTOM_THEME_MAX_COUNT = 24

/** 名称长度上限（提示条与选择器都放不下更长的）。 */
export const CUSTOM_THEME_NAME_MAX_LENGTH = 24

/** 分支色板的颜色数范围。 */
export const CUSTOM_THEME_MIN_PALETTE_COLORS = 2
export const CUSTOM_THEME_MAX_PALETTE_COLORS = 12

/** 元信息文字的不透明度（与内置主题的写法取齐）。 */
const META_TEXT_ALPHA = 0.62

/** 存储形态里的一个层级配色：只有三个 hex，元信息色由 textColor 派生。 */
export interface CustomThemeLevelColors {
  fill: string
  textColor: string
  borderColor: string
}

/** 存储形态的配色板：**全部是 `#rrggbb`**，校验逐项判死。 */
export interface CustomThemePalette {
  background: string
  gridLine: string
  root: CustomThemeLevelColors
  branch: CustomThemeLevelColors
  edge: string
  edgeActive: string
  /** 空/缺省 = 分支用单一 `branch` 配色；非空 = 分支按序号取色（缤纷分支）。 */
  branchPalette?: string[]
}

/** 风格库里的一个条目。 */
export interface CustomTheme {
  id: string
  name: string
  palette: CustomThemePalette
}

/** 编辑器里的草稿：还没定 id/名称的那份配色。 */
export interface CustomThemeDraft {
  name: string
  palette: CustomThemePalette
}

// 带捕获组：`toRgba` 要取 6 位数字。

const HEX_COLOR = /^#([0-9a-fA-F]{6})$/

/** 是否是本模块认的颜色（`#rrggbb`）。 */
export function isThemeColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value.trim())
}

/** `#rrggbb` → `rgba(r, g, b, a)`；非法输入原样返回（与 color-utils 的取舍一致）。 */
export function toRgba(hex: string, alpha: number): string {
  const match = HEX_COLOR.exec(hex.trim())
  if (!match) return hex
  const value = Number.parseInt(match[1], 16)
  const r = (value >> 16) & 0xff
  const g = (value >> 8) & 0xff
  const b = value & 0xff
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function readColor(value: unknown): string | null {
  return isThemeColor(value) ? (value as string).trim().toLowerCase() : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** 名称规范化：去首尾空白、截断到上限。空名返回 null（调用方决定要不要兜底）。 */
export function normalizeThemeName(value: unknown): string | null {
  const raw = readString(value)
  if (raw === null) return null
  const trimmed = raw.trim().slice(0, CUSTOM_THEME_NAME_MAX_LENGTH)
  return trimmed.length > 0 ? trimmed : null
}

/** 生成一个本库里没用过的风格名称：「我的风格 1」… */
export function defaultCustomThemeName(existing: readonly CustomTheme[]): string {
  const used = new Set(existing.map((item) => item.name))
  for (let index = 1; index <= CUSTOM_THEME_MAX_COUNT + 1; index += 1) {
    const candidate = `我的风格 ${index}`
    if (!used.has(candidate)) return candidate
  }
  return `我的风格 ${existing.length + 1}`
}

/**
 * 生成一个本库里没用过的风格 id。
 *
 * `seed` 由调用方给（界面传时间戳），**不在本函数里读时钟**——
 * 这样这个函数是纯的，测试能钉死"同一个 seed 在同一个库里产出同一个 id"。
 */
export function makeCustomThemeId(existing: readonly CustomTheme[], seed: string): string {
  const used = new Set(existing.map((item) => item.id))
  const base = `${CUSTOM_THEME_ID_PREFIX}${seed}`
  if (!used.has(base)) return base
  for (let index = 2; index <= CUSTOM_THEME_MAX_COUNT + 1; index += 1) {
    const candidate = `${base}-${index}`
    if (!used.has(candidate)) return candidate
  }
  return `${base}-${used.size + 1}`
}

function readLevel(raw: unknown): CustomThemeLevelColors | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const fill = readColor(record.fill)
  const textColor = readColor(record.textColor)
  const borderColor = readColor(record.borderColor)
  if (!fill || !textColor || !borderColor) return null
  return { fill, textColor, borderColor }
}

function readPalette(raw: unknown): CustomThemePalette | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>

  const background = readColor(record.background)
  const gridLine = readColor(record.gridLine)
  const edge = readColor(record.edge)
  const edgeActive = readColor(record.edgeActive)
  const root = readLevel(record.root)
  const branch = readLevel(record.branch)
  if (!background || !gridLine || !edge || !edgeActive || !root || !branch) {
    return null
  }

  // 分支色板：缺省/坏值一律当作"没有色板"（而不是判整条记录无效）——
  // 色板是可选增强，不该因为它丢掉用户整份风格。
  let branchPalette: string[] | undefined
  if (Array.isArray(record.branchPalette)) {
    const colors = record.branchPalette
      .map((item) => readColor(item))
      .filter((item): item is string => item !== null)
      .slice(0, CUSTOM_THEME_MAX_PALETTE_COLORS)
    if (colors.length >= CUSTOM_THEME_MIN_PALETTE_COLORS) {
      branchPalette = colors
    }
  }

  return {
    background,
    gridLine,
    root,
    branch,
    edge,
    edgeActive,
    ...(branchPalette ? { branchPalette } : {}),
  }
}

/**
 * 解析风格库：**损坏项逐条丢弃**（一条坏数据不该带走整份风格库），
 * 与 `canvas-settings.readCustomPalettes` 同一个取舍。
 */
export function readCustomThemes(raw: unknown): CustomTheme[] {
  if (!Array.isArray(raw)) return []

  const builtInIds = new Set(BUILT_IN_THEMES.map((theme) => theme.id))
  const seen = new Set<string>()
  const result: CustomTheme[] = []

  for (const item of raw) {
    if (result.length >= CUSTOM_THEME_MAX_COUNT) break
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>

    const id = readString(record.id)?.trim() ?? ''
    const name = normalizeThemeName(record.name)
    const palette = readPalette(record.palette)

    // id 必须带前缀（否则可能覆盖内置主题）、不能重复、名称与配色必须齐全
    if (!id.startsWith(CUSTOM_THEME_ID_PREFIX) || builtInIds.has(id)) continue
    if (seen.has(id)) continue
    if (!name || !palette) continue

    seen.add(id)
    result.push({ id, name, palette })
  }

  return result
}

/** 草稿 → 可入库的记录（盖章 id 与名称）。 */
export function createCustomTheme(draft: CustomThemeDraft, id: string): CustomTheme {
  const name = normalizeThemeName(draft.name) ?? '未命名风格'
  return { id, name, palette: draft.palette }
}

/** 素材形态 → 运行时形态（补上派生的元信息文字色与分组）。 */
export function materializeTheme(theme: CustomTheme): ThemePalette {
  const level = (colors: CustomThemeLevelColors): ThemeLevelColors => ({
    fill: colors.fill,
    textColor: colors.textColor,
    metaTextColor: toRgba(colors.textColor, META_TEXT_ALPHA),
    borderColor: colors.borderColor,
  })

  return {
    id: theme.id,
    name: theme.name,
    family: 'custom' satisfies ThemeFamily,
    background: theme.palette.background,
    gridLine: theme.palette.gridLine,
    root: level(theme.palette.root),
    branch: level(theme.palette.branch),
    edge: theme.palette.edge,
    edgeActive: theme.palette.edgeActive,
    ...(theme.palette.branchPalette ? { branchPalette: [...theme.palette.branchPalette] } : {}),
  }
}

/** `#rrggbb` → `{r,g,b}`；非法返回 null。 */
function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = HEX_COLOR.exec(hex.trim())
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff }
}

function toHexRgb(r: number, g: number, b: number): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const RGBA_COLOR = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/

/**
 * 把内置主题里的任意写法压成**不透明的 `#rrggbb`**。
 *
 * 内置主题的颜色有三种写法（实测：84 处 hex、95 处 `rgba()`、25 处 `transparent`），
 * 而编辑器与风格库只认不透明 hex。转换规则是**按不透明度与底色合成**：
 *
 * - `#rrggbb` → 原样（统一小写）
 * - `rgba(r,g,b,a)` → `a*C + (1-a)*base`
 * - `transparent` → 退化成 `base`
 *
 * `transparent` 不需要特例，是这条规则的自然结果。而它恰好是**正确的**：
 * 内置主题里 `transparent` 只出现在 `borderColor`（含义是"没有边框"），
 * 合成成底色之后，边框画出来与背景同色 —— 视觉上仍然"没有边框"，
 * 而不是变成一条本该没有的深色线。
 *
 * 代价要在界面上说清楚：**基准里的半透明色在编辑器里会变成不透明色**
 * （取色控件只支持不透明色）。编辑器顶部有这句提示。
 */
export function toOpaqueHex(color: string, baseHex: string): string {
  const base = isThemeColor(baseHex) ? baseHex.trim().toLowerCase() : '#ffffff'
  // 用解析结果而不是 `isThemeColor` 做判断：后者是 `value is string` 类型谓词，
  // 对已经是 `string` 的参数调用会把 else 分支收窄成 `never`
  if (parseHexRgb(color)) return color.trim().toLowerCase()

  const trimmed = color.trim()
  if (trimmed === 'transparent' || trimmed === 'none') return base

  const match = RGBA_COLOR.exec(trimmed)
  if (!match) return base
  const baseRgb = parseHexRgb(base) ?? { r: 255, g: 255, b: 255 }
  const channels = [Number(match[1]), Number(match[2]), Number(match[3])]
  const alpha = match[4] === undefined ? 1 : Number(match[4])
  if (!channels.every(Number.isFinite) || !Number.isFinite(alpha)) return base

  const t = Math.max(0, Math.min(1, alpha))
  return toHexRgb(
    channels[0] * t + baseRgb.r * (1 - t),
    channels[1] * t + baseRgb.g * (1 - t),
    channels[2] * t + baseRgb.b * (1 - t),
  )
}

/** 从任意主题（内置或自定义）取出一份可编辑的草稿配色。 */
export function draftPaletteFrom(theme: ThemePalette): CustomThemePalette {
  // 画布背景本身没有"底"可合成，以白为底
  const canvas = toOpaqueHex(theme.background, '#ffffff')

  const level = (colors: ThemeLevelColors): CustomThemeLevelColors => {
    const fill = toOpaqueHex(colors.fill, canvas)
    return {
      fill,
      // 文字画在节点填充上，边框画在节点外沿（底色是画布）——各自取正确的底
      textColor: toOpaqueHex(colors.textColor, fill),
      borderColor: toOpaqueHex(colors.borderColor, canvas),
    }
  }

  return {
    background: canvas,
    gridLine: toOpaqueHex(theme.gridLine, canvas),
    root: level(theme.root),
    branch: level(theme.branch),
    edge: toOpaqueHex(theme.edge, canvas),
    edgeActive: toOpaqueHex(theme.edgeActive, canvas),
    ...(theme.branchPalette
      ? { branchPalette: theme.branchPalette.map((color) => toOpaqueHex(color, canvas)) }
      : {}),
  }
}

/** 编辑器里可改的颜色位置。 */
export type ThemeColorPath =
  | 'background'
  | 'gridLine'
  | 'root.fill'
  | 'root.textColor'
  | 'root.borderColor'
  | 'branch.fill'
  | 'branch.textColor'
  | 'branch.borderColor'
  | 'edge'
  | 'edgeActive'

/** 编辑器里的颜色分组（决定界面上的小节归属）。 */
export type ThemeColorGroup = 'canvas' | 'root' | 'branch' | 'edge'

/** 分组的展示顺序与标题。 */
export const THEME_COLOR_GROUPS: readonly { id: ThemeColorGroup; title: string }[] = [
  { id: 'canvas', title: '画布' },
  { id: 'root', title: '根主题' },
  { id: 'branch', title: '分支主题' },
  { id: 'edge', title: '连线' },
]

export interface ThemeColorField {
  path: ThemeColorPath
  /** **组内相对名**。界面显示在所属分组的标题下，无障碍名由「组标题 + 本名」拼成。 */
  label: string
  /** 界面小节归属。**由字段自己声明**，界面按它分组——于是不存在"加了字段但没人渲染"。 */
  group: ThemeColorGroup
  /** 改这一项会不会与「分支色板」冲突（见 `applyThemeColor`）。 */
  branchScoped: boolean
}

/**
 * 颜色字段表：界面按它渲染，`applyThemeColor` 按它取值。
 *
 * **只有一份**——界面与规则各写一遍，就会出现"界面能改、但规则不认"的字段。
 */
export const THEME_COLOR_FIELDS: readonly ThemeColorField[] = [
  { path: 'background', label: '背景', group: 'canvas', branchScoped: false },
  { path: 'gridLine', label: '网格线', group: 'canvas', branchScoped: false },
  { path: 'root.fill', label: '背景', group: 'root', branchScoped: false },
  { path: 'root.textColor', label: '文字', group: 'root', branchScoped: false },
  { path: 'root.borderColor', label: '边框', group: 'root', branchScoped: false },
  { path: 'branch.fill', label: '背景', group: 'branch', branchScoped: true },
  { path: 'branch.textColor', label: '文字', group: 'branch', branchScoped: true },
  { path: 'branch.borderColor', label: '边框', group: 'branch', branchScoped: true },
  { path: 'edge', label: '颜色', group: 'edge', branchScoped: false },
  { path: 'edgeActive', label: '选中颜色', group: 'edge', branchScoped: false },
]

/** 取某个颜色位置的当前值。 */
export function readThemeColor(palette: CustomThemePalette, path: ThemeColorPath): string {
  switch (path) {
    case 'background':
      return palette.background
    case 'gridLine':
      return palette.gridLine
    case 'root.fill':
      return palette.root.fill
    case 'root.textColor':
      return palette.root.textColor
    case 'root.borderColor':
      return palette.root.borderColor
    case 'branch.fill':
      return palette.branch.fill
    case 'branch.textColor':
      return palette.branch.textColor
    case 'branch.borderColor':
      return palette.branch.borderColor
    case 'edge':
      return palette.edge
    case 'edgeActive':
      return palette.edgeActive
  }
}

export interface ApplyThemeColorResult {
  palette: CustomThemePalette
  /** 本次修改是否**顺手清空了分支色板**（界面要据此提示，否则用户不知道为什么分支变了）。 */
  clearedBranchPalette: boolean
}

/**
 * 改一个颜色，返回新的配色板。
 *
 * ## 为什么改分支配色要清空色板
 *
 * 渲染时 `branchPalette` 的优先级**高于**单一 `branch` 配色
 * （见 `style-resolver.resolveTopicStyle`：有色板时分支的填充/文字/边框都取色板）。
 * 就是说：**基准带了色板时，"分支背景"这个输入框改了也不会生效**。
 *
 * 两条路都有问题：留着它 → 是个死控件（点了没反应）；直接置灰 → 用户不知道为什么不能改。
 * 所以选第三条：**改分支配色就自动清空色板，并在界面上说明**——
 * 输出来的是一个确定的结果，用户随时能把色板加回来。
 *
 * 非 `branchScoped` 的位置（背景/连线/根节点）不动色板。
 */
export function applyThemeColor(
  palette: CustomThemePalette,
  path: ThemeColorPath,
  color: string,
): ApplyThemeColorResult {
  if (!isThemeColor(color)) {
    return { palette, clearedBranchPalette: false }
  }
  const next = color.trim().toLowerCase()

  switch (path) {
    case 'background':
      return { palette: { ...palette, background: next }, clearedBranchPalette: false }
    case 'gridLine':
      return { palette: { ...palette, gridLine: next }, clearedBranchPalette: false }
    case 'edge':
      return { palette: { ...palette, edge: next }, clearedBranchPalette: false }
    case 'edgeActive':
      return { palette: { ...palette, edgeActive: next }, clearedBranchPalette: false }
    case 'root.fill':
      return {
        palette: { ...palette, root: { ...palette.root, fill: next } },
        clearedBranchPalette: false,
      }
    case 'root.textColor':
      return {
        palette: { ...palette, root: { ...palette.root, textColor: next } },
        clearedBranchPalette: false,
      }
    case 'root.borderColor':
      return {
        palette: { ...palette, root: { ...palette.root, borderColor: next } },
        clearedBranchPalette: false,
      }
    case 'branch.fill':
    case 'branch.textColor':
    case 'branch.borderColor': {
      const key =
        path === 'branch.fill' ? 'fill' : path === 'branch.textColor' ? 'textColor' : 'borderColor'
      const { branchPalette, ...rest } = palette
      return {
        palette: { ...rest, branch: { ...palette.branch, [key]: next } },
        clearedBranchPalette: (branchPalette?.length ?? 0) > 0,
      }
    }
  }
}
