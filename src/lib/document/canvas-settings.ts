/**
 * 画布级设置：键名、候选值、默认值与解析。
 *
 * 存在 `document.settings` 这个自由键值字典里（Rust 侧不校验内容），
 * 因此**所有读取都必须走本模块的解析函数**——外部直接读原始值，
 * 一旦存了畸形数据（旧版本残留、手工编辑、跨版本迁移），
 * 渲染层就会拿到 undefined 并画出坏结果。这里统一做"损坏即回落默认值"。
 *
 * 画布设置是**文档级**的（跟随 .mgd 保存），与 UI 偏好（面板开合等，走
 * localStorage/sessionStorage）区分开。
 */

import type { DocumentSettings } from './types'

/** 画布设置键名。新增项必须同步加到 `DEFAULT_CANVAS_SETTINGS`。 */
export const CANVAS_SETTINGS_KEYS = {
  /** 布尔：显示网格。 */
  showGrid: 'canvas.showGrid',
  /** 字符串：画布背景色（#rrggbb）。空/缺省 = 跟随主题。 */
  background: 'canvas.background',
  /** 全局字体 id，见 GLOBAL_FONT_OPTIONS。 */
  fontFamily: 'canvas.fontFamily',
  /** 中日韩字体模式，见 CJK_FONT_OPTIONS。 */
  cjkFont: 'canvas.cjkFont',
  /** 分支线粗细 id，见 BRANCH_THICKNESS_OPTIONS。 */
  branchThickness: 'canvas.branchThickness',
  /** 布尔：彩虹分支（每分支一色）。缺省 = 跟随主题（缤纷主题自动开）。 */
  rainbowBranch: 'canvas.rainbowBranch',
  /** 彩虹分支色板 id，见 BRANCH_PALETTE_PRESETS。 */
  branchPalette: 'canvas.branchPalette',
  /** 布尔：自动平衡布局（左右分支数量均衡）。 */
  balance: 'canvas.balance',
  /** 布尔：紧凑型布局（缩小层间距）。 */
  compact: 'canvas.compact',
  /** 布尔：同级主题对齐（同层主题顶边对齐）。 */
  alignSiblings: 'canvas.alignSiblings',
  /** 布尔：允许双击空白画布创建自由主题。缺省 true。 */
  freeTopic: 'canvas.freeTopic',
  /** 布尔：分支自由布局（拖拽一级分支可自由摆放，位置记进 layoutHints）。缺省 false。 */
  freeBranchLayout: 'canvas.freeBranchLayout',
  /** 用户自建配色方案列表（数组，见 CustomPalette）。损坏项逐条丢弃，不整表回落。 */
  customPalettes: 'canvas.customPalettes',
  /** 布尔：主题层叠（允许主题重叠）。缺省 true——与 XMind 默认勾选一致。 */
  stackTopics: 'canvas.stackTopics',
} as const

// ---- 全局字体 ----

export type GlobalFontId = 'default' | 'system' | 'song' | 'hei' | 'kai' | 'mono'

/**
 * 字体栈的通用后缀：西文回退 + CJK 回退。
 * 具体字体名由各选项拼在前面，CJK 段由 `buildFontStack` 按 cjkFont 设置替换。
 */
const WESTERN_FALLBACK = 'Roboto, "Segoe UI", sans-serif'

/** 默认 CJK 段（与 style-constants 的 FONT_FAMILY 保持一致）。 */
const DEFAULT_CJK_SEGMENT =
  '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Noto Sans SC"'

/** CJK 优化段：优先思源黑体/苹方，再回退到衬线宋体系。 */
const OPTIMIZED_CJK_SEGMENT =
  '"Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Noto Sans SC"'

export interface GlobalFontOption {
  id: GlobalFontId
  label: string
  /** 该选项的字体名段（不含 CJK 段与西文回退）。 */
  segment: string
}

export const GLOBAL_FONT_OPTIONS: readonly GlobalFontOption[] = [
  { id: 'default', label: '默认', segment: '-apple-system, BlinkMacSystemFont, "SF Pro Text"' },
  { id: 'system', label: '系统默认', segment: 'system-ui' },
  { id: 'song', label: '宋体', segment: '"Songti SC", SimSun, serif' },
  { id: 'hei', label: '黑体', segment: '"Heiti SC", SimHei' },
  { id: 'kai', label: '楷体', segment: '"Kaiti SC", KaiTi' },
  { id: 'mono', label: '等宽', segment: '"SF Mono", Menlo, Consolas, monospace' },
]

export type CjkFontId = 'default' | 'optimized'

export const CJK_FONT_OPTIONS: readonly { id: CjkFontId; label: string }[] = [
  { id: 'default', label: '默认' },
  { id: 'optimized', label: 'CJK 优化' },
]

/**
 * 拼出完整字体栈：`<选项段>, <CJK 段>, <西文回退>`。
 *
 * 导出链路（Canvas / SVG）与屏幕 DOM 必须调用同一个函数，
 * 否则 PNG 与屏幕会因字体度量不同而错位。
 */
export function buildFontStack(fontId: GlobalFontId, cjkId: CjkFontId): string {
  const option =
    GLOBAL_FONT_OPTIONS.find((item) => item.id === fontId) ?? GLOBAL_FONT_OPTIONS[0]
  const cjk = cjkId === 'optimized' ? OPTIMIZED_CJK_SEGMENT : DEFAULT_CJK_SEGMENT
  return `${option.segment}, ${cjk}, ${WESTERN_FALLBACK}`
}

// ---- 分支线粗细 ----

export type BranchThicknessId = 'default' | 'thin' | 'medium' | 'thick'

export const BRANCH_THICKNESS_OPTIONS: readonly {
  id: BranchThicknessId
  label: string
  multiplier: number
}[] = [
  { id: 'default', label: '默认', multiplier: 1 },
  { id: 'thin', label: '细', multiplier: 0.75 },
  { id: 'medium', label: '中', multiplier: 1.5 },
  { id: 'thick', label: '粗', multiplier: 2 },
]

// ---- 彩虹分支色板 ----

export interface BranchPalettePreset {
  id: string
  label: string
  colors: string[]
}

/** 预设色板。id 与 XMind 风格命名对齐，方便用户按名称回忆。 */
export const BRANCH_PALETTE_PRESETS: readonly BranchPalettePreset[] = [
  {
    id: 'rainbow',
    label: '彩虹',
    colors: ['#e2564a', '#e08b3c', '#d4b13f', '#5fa855', '#3d9be9', '#8a6cd6'],
  },
  {
    id: 'ocean',
    label: '海洋',
    colors: ['#1b6ca8', '#2a9d8f', '#3a86a8', '#4d9de0', '#5f7ad4', '#2c5f8a'],
  },
  {
    id: 'autumn',
    label: '秋叶',
    colors: ['#b7410e', '#d97a26', '#c98f3c', '#8c5a2b', '#6b4a2f', '#a35c1e'],
  },
  {
    id: 'candy',
    label: '糖果',
    colors: ['#ef7d9c', '#f0a35e', '#f2d16b', '#7fc8a9', '#7aa7e0', '#b48ce0'],
  },
  {
    id: 'mono',
    label: '素雅',
    colors: ['#4a4a4a', '#5f6368', '#6f7680', '#7d8695', '#5c6570', '#495057'],
  },
]

// ---- 解析 ----

/** 从自由键值里取布尔，非布尔一律回落默认值。 */
function readBool(
  settings: DocumentSettings | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const value = settings?.[key]
  return typeof value === 'boolean' ? value : fallback
}

/** 从自由键值里取限定枚举，不在候选内一律回落默认值。 */
function readEnum<T extends string>(
  settings: DocumentSettings | undefined,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = settings?.[key]
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

/** 从自由键值里取颜色字符串（#rgb / #rrggbb），非法一律返回 null。 */
function readColor(settings: DocumentSettings | undefined, key: string): string | null {
  const value = settings?.[key]
  if (typeof value !== 'string') return null
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : null
}

export interface DocumentCanvasSettings {
  showGrid: boolean
  /** null 表示跟随主题。 */
  background: string | null
  fontFamily: GlobalFontId
  cjkFont: CjkFontId
  branchThickness: BranchThicknessId
  /** null 表示未显式设置，跟随主题（缤纷主题自动启用彩虹分支）。 */
  rainbowBranch: boolean | null
  branchPalette: string
  balance: boolean
  compact: boolean
  alignSiblings: boolean
  freeTopic: boolean
  /** 分支自由布局：拖拽一级分支可自由摆放（位置存进该分支的 layoutHints）。 */
  freeBranchLayout: boolean
  /** 用户自建配色方案（可选；内置预设不在此列表里）。 */
  customPalettes: CustomPalette[]
  /** 主题层叠：为 false 时，自由摆放的分支会避开上方主题自动下移。 */
  stackTopics: boolean
}

/** 全默认配置。所有字段缺省即"跟随主题 / XMind 默认行为"。 */
export const DEFAULT_CANVAS_SETTINGS: DocumentCanvasSettings = {
  showGrid: false,
  background: null,
  fontFamily: 'default',
  cjkFont: 'default',
  branchThickness: 'default',
  rainbowBranch: null,
  branchPalette: 'rainbow',
  balance: false,
  compact: false,
  alignSiblings: false,
  freeTopic: true,
  freeBranchLayout: false,
  customPalettes: [],
  stackTopics: true,
}

const FONT_IDS = GLOBAL_FONT_OPTIONS.map((option) => option.id)
const CJK_IDS = CJK_FONT_OPTIONS.map((option) => option.id)
const THICKNESS_IDS = BRANCH_THICKNESS_OPTIONS.map((option) => option.id)
const PALETTE_IDS = BRANCH_PALETTE_PRESETS.map((option) => option.id)

/**
 * 解析文档设置里的画布项。
 *
 * **存储值损坏一律回落默认值**，不让设置项把渲染拖垮——
 * 任何一个字段的畸形值都只影响该字段，不会连累其他字段。
 */
export function resolveCanvasSettings(
  settings: DocumentSettings | undefined,
): DocumentCanvasSettings {
  const rawRainbow = settings?.[CANVAS_SETTINGS_KEYS.rainbowBranch]
  const customPalettes = readCustomPalettes(settings)
  // 色板 id 的合法集合 = 内置预设 ∪ 自定义方案。
  // 只按内置枚举校验会把自定义 id 当成非法值回落到彩虹——设置存进去了、
  // UI 却永远显示/使用彩虹（端到端冒烟抓到过这个）。
  const paletteIds = [
    ...PALETTE_IDS,
    ...customPalettes.map((palette) => palette.id),
  ] as readonly string[]

  return {
    showGrid: readBool(settings, CANVAS_SETTINGS_KEYS.showGrid, DEFAULT_CANVAS_SETTINGS.showGrid),
    background: readColor(settings, CANVAS_SETTINGS_KEYS.background),
    fontFamily: readEnum(settings, CANVAS_SETTINGS_KEYS.fontFamily, FONT_IDS, 'default'),
    cjkFont: readEnum(settings, CANVAS_SETTINGS_KEYS.cjkFont, CJK_IDS, 'default'),
    branchThickness: readEnum(
      settings,
      CANVAS_SETTINGS_KEYS.branchThickness,
      THICKNESS_IDS,
      'default',
    ),
    // 三态：显式 true/false 生效，其他值（含缺省）交给主题决定
    rainbowBranch: typeof rawRainbow === 'boolean' ? rawRainbow : null,
    branchPalette: readEnum(
      settings,
      CANVAS_SETTINGS_KEYS.branchPalette,
      paletteIds,
      'rainbow',
    ),
    balance: readBool(settings, CANVAS_SETTINGS_KEYS.balance, false),
    compact: readBool(settings, CANVAS_SETTINGS_KEYS.compact, false),
    alignSiblings: readBool(settings, CANVAS_SETTINGS_KEYS.alignSiblings, false),
    freeTopic: readBool(settings, CANVAS_SETTINGS_KEYS.freeTopic, true),
    freeBranchLayout: readBool(settings, CANVAS_SETTINGS_KEYS.freeBranchLayout, false),
    customPalettes,
    stackTopics: readBool(settings, CANVAS_SETTINGS_KEYS.stackTopics, true),
  }
}

/** 取粗细乘数。 */
export function branchThicknessMultiplier(id: BranchThicknessId): number {
  return BRANCH_THICKNESS_OPTIONS.find((option) => option.id === id)?.multiplier ?? 1
}

/**
 * 用户自建配色方案。
 *
 * 存进 `document.settings` 的 `canvas.customPalettes`（_文档级_，随 .mgd 走），
 * 与内置预设共用同一个字段 `canvas.branchPalette` 的 id 空间——选中哪个方案由 id 决定。
 */
export interface CustomPalette {
  id: string
  name: string
  colors: string[]
}

/** 自定义配色的 id 前缀：避免与内置预设 id 撞车。 */
export const CUSTOM_PALETTE_ID_PREFIX = 'custom-'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** 自定义色板最多允许的颜色数（超过就没有"分支编码"的意义了）。 */
export const CUSTOM_PALETTE_MAX_COLORS = 12
export const CUSTOM_PALETTE_MIN_COLORS = 2

/** 解析自定义配色列表：损坏项逐条丢弃（一条坏数据不该带走整份列表）。 */
export function readCustomPalettes(settings: DocumentSettings | undefined): CustomPalette[] {
  const raw = settings?.[CANVAS_SETTINGS_KEYS.customPalettes]
  if (!Array.isArray(raw)) {
    return []
  }

  const result: CustomPalette[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const colors = Array.isArray(record.colors)
      ? record.colors.filter((c): c is string => typeof c === 'string' && HEX_COLOR.test(c))
      : []

    if (!id.startsWith(CUSTOM_PALETTE_ID_PREFIX) || !name || colors.length < CUSTOM_PALETTE_MIN_COLORS) {
      continue
    }
    if (seen.has(id)) continue

    seen.add(id)
    result.push({ id, name, colors: colors.slice(0, CUSTOM_PALETTE_MAX_COLORS) })
  }

  return result
}

/** 内置预设 + 自定义配色，供选择器列表使用（自定义排在后面）。 */
export function listBranchPaletteOptions(
  customPalettes: CustomPalette[],
): BranchPalettePreset[] {
  return [
    ...BRANCH_PALETTE_PRESETS,
    ...customPalettes.map((palette) => ({
      id: palette.id,
      label: palette.name,
      colors: palette.colors,
    })),
  ]
}

/** 取色板颜色数组：内置 id → 自定义 id → 回落第一套内置。 */
export function resolveBranchPalette(id: string, customPalettes: CustomPalette[] = []): string[] {
  const custom = customPalettes.find((palette) => palette.id === id)
  if (custom) {
    return custom.colors
  }
  return (BRANCH_PALETTE_PRESETS.find((preset) => preset.id === id) ?? BRANCH_PALETTE_PRESETS[0])
    .colors
}
