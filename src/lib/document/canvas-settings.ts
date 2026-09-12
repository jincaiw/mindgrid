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
      PALETTE_IDS,
      'rainbow',
    ),
    balance: readBool(settings, CANVAS_SETTINGS_KEYS.balance, false),
    compact: readBool(settings, CANVAS_SETTINGS_KEYS.compact, false),
    alignSiblings: readBool(settings, CANVAS_SETTINGS_KEYS.alignSiblings, false),
    freeTopic: readBool(settings, CANVAS_SETTINGS_KEYS.freeTopic, true),
  }
}

/** 取粗细乘数。 */
export function branchThicknessMultiplier(id: BranchThicknessId): number {
  return BRANCH_THICKNESS_OPTIONS.find((option) => option.id === id)?.multiplier ?? 1
}

/** 取色板预设的颜色数组，未知 id 回落第一套。 */
export function resolveBranchPalette(id: string): string[] {
  return (BRANCH_PALETTE_PRESETS.find((preset) => preset.id === id) ?? BRANCH_PALETTE_PRESETS[0])
    .colors
}
