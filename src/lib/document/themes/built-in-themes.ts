/**
 * 内置主题定义。
 *
 * 每个主题定义一套完整的配色方案：画布背景、根/分支节点色彩、连线、装饰元素。
 * 主题使用纯色填充（V1 不含渐变），保证 Canvas/SVG/PNG 三端一致。
 *
 * 新增主题时在 BUILT_IN_THEMES 数组中追加即可，ID 必须全局唯一。
 */

/** 主题层级配色（根节点 / 分支节点各一套）。 */
export interface ThemeLevelColors {
  /** 节点背景填充色。 */
  fill: string
  /** 标题文字色。 */
  textColor: string
  /** 元信息（子主题数/深度）文字色。 */
  metaTextColor: string
  /** 边框色。 */
  borderColor: string
}

/** 主题完整配色板。 */
export interface ThemePalette {
  /** 主题唯一标识，存入 DocumentSnapshot.theme.id。 */
  id: BuiltinThemeId
  /** 显示名称。 */
  name: string
  /** 画布背景色。 */
  background: string
  /** 网格线颜色。 */
  gridLine: string
  /** 根节点（depth=0）配色。 */
  root: ThemeLevelColors
  /** 分支节点（depth>0）配色。 */
  branch: ThemeLevelColors
  /** 连线颜色。 */
  edge: string
  /** 激活连线颜色。 */
  edgeActive: string
}

export type BuiltinThemeId = 'classic-blue' | 'dark' | 'warm' | 'cool' | 'minimal'

export const DEFAULT_THEME_ID: BuiltinThemeId = 'classic-blue'

export const BUILT_IN_THEMES: ThemePalette[] = [
  {
    id: 'classic-blue',
    name: '经典蓝',
    background: 'rgba(238, 244, 255, 0.82)',
    gridLine: 'rgba(91, 140, 255, 0.06)',
    root: {
      fill: 'rgba(91, 140, 255, 0.96)',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: 'rgba(255, 255, 255, 0.94)',
      textColor: '#0f172a',
      metaTextColor: 'rgba(15, 23, 42, 0.54)',
      borderColor: 'rgba(15, 23, 42, 0.08)',
    },
    edge: 'rgba(41, 88, 176, 0.34)',
    edgeActive: 'rgba(59, 130, 246, 0.74)',
  },
  {
    id: 'dark',
    name: '暗夜',
    background: '#0b1220',
    gridLine: 'rgba(148, 163, 184, 0.06)',
    root: {
      fill: '#1e293b',
      textColor: '#e2e8f0',
      metaTextColor: 'rgba(226, 232, 240, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#0f172a',
      textColor: '#e2e8f0',
      metaTextColor: 'rgba(226, 232, 240, 0.54)',
      borderColor: 'rgba(148, 163, 184, 0.12)',
    },
    edge: 'rgba(148, 163, 184, 0.34)',
    edgeActive: 'rgba(59, 130, 246, 0.74)',
  },
  {
    id: 'warm',
    name: '暖阳',
    background: '#fffbeb',
    gridLine: 'rgba(234, 88, 12, 0.06)',
    root: {
      fill: '#ea580c',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#fff7ed',
      textColor: '#7c2d12',
      metaTextColor: 'rgba(124, 45, 18, 0.54)',
      borderColor: 'rgba(124, 45, 18, 0.08)',
    },
    edge: 'rgba(194, 65, 12, 0.34)',
    edgeActive: 'rgba(234, 88, 12, 0.74)',
  },
  {
    id: 'cool',
    name: '青松',
    background: '#f0fdfa',
    gridLine: 'rgba(13, 148, 136, 0.06)',
    root: {
      fill: '#0d9488',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#f0fdfa',
      textColor: '#134e4a',
      metaTextColor: 'rgba(19, 78, 74, 0.54)',
      borderColor: 'rgba(19, 78, 74, 0.08)',
    },
    edge: 'rgba(13, 148, 136, 0.34)',
    edgeActive: 'rgba(13, 148, 136, 0.74)',
  },
  {
    id: 'minimal',
    name: '极简',
    background: '#ffffff',
    gridLine: 'rgba(17, 24, 39, 0.04)',
    root: {
      fill: '#111827',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#ffffff',
      textColor: '#111827',
      metaTextColor: 'rgba(17, 24, 39, 0.54)',
      borderColor: 'rgba(17, 24, 39, 0.08)',
    },
    edge: 'rgba(17, 24, 39, 0.18)',
    edgeActive: 'rgba(17, 24, 39, 0.5)',
  },
]

const THEME_MAP = new Map<string, ThemePalette>(
  BUILT_IN_THEMES.map((theme) => [theme.id, theme]),
)

/** 按 ID 获取主题，未知 ID 或 undefined 回退到默认主题。 */
export function getTheme(id: string | undefined): ThemePalette {
  if (id && THEME_MAP.has(id)) {
    return THEME_MAP.get(id)!
  }
  return THEME_MAP.get(DEFAULT_THEME_ID)!
}

/** 列出所有内置主题。 */
export function listThemes(): ThemePalette[] {
  return BUILT_IN_THEMES
}
