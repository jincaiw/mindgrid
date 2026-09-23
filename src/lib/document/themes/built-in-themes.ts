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

/**
 * 主题归属的分组。
 *
 * `classic` / `vivid` 对应 XMind 配色浮层的两个 Tab；
 * `custom` 是**用户自建风格**（存在本机风格库里，见 `custom-themes.ts`），
 * 不是内置数据 —— 但它必须走同一套 `ThemePalette` 结构与同一条解析链路，
 * 否则"自定义风格"会变成渲染器里的一条特殊分支。
 */
export type ThemeFamily = 'classic' | 'vivid' | 'custom'

/**
 * 主题 id。
 *
 * 内置 id 仍是字面量联合（保留补全与穷尽检查），
 * 但**必须允许任意字符串**：用户自建风格的 id 是运行时生成的（`custom-theme-xxx`），
 * 且文档里记录的 id 可能是**别的机器上创建、本机没有**的自定义风格
 * （打开别人发来的 .mgd 就会遇到），解析时统一回落到默认主题。
 */
export type ThemeId = BuiltinThemeId | (string & {})

/** 主题完整配色板。 */
export interface ThemePalette {
  /** 主题唯一标识，存入 DocumentSnapshot.theme.id。 */
  id: ThemeId
  /** 显示名称。 */
  name: string
  /** 分组：经典=MindGrid 原有 5 套；缤纷=XMind 风格的多色分支主题。 */
  family: ThemeFamily
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
  /**
   * 多色分支色板（仅缤纷主题有）。
   *
   * 每条一级分支按索引取一色，其所有后代继承该色——即 XMind「彩虹分支」的效果。
   * 有值时分支节点的填充/文字/边框与连线都取它，深度分级配色退居其次；
   * 无值（经典主题）时沿用 `branch` 单色。
   *
   * 颜色统一挑饱和度适中、明度偏深的色，保证白色文字可读——
   * 这里不引入运行时对比度计算，配色在数据阶段就定死。
   */
  branchPalette?: string[]
}

export type BuiltinThemeId =
  // 经典（MindGrid 原有 5 套，色值不动）
  | 'classic-blue'
  | 'dark'
  | 'warm'
  | 'cool'
  | 'minimal'
  // 缤纷（对标 XMind，12 套）
  | 'rainbow'
  | 'vibrant'
  | 'dance'
  | 'code'
  | 'washi'
  | 'island'
  | 'rose'
  | 'mint'
  | 'green-tea'
  | 'cosmos'
  | 'refined'
  | 'innocent'

export const DEFAULT_THEME_ID: BuiltinThemeId = 'classic-blue'

/**
 * 新建文档使用的主题 id。
 *
 * 与 `DEFAULT_THEME_ID` 是**两个概念**：前者是"取不到主题时的兜底"，后者是
 * "新文档长什么样"。XMind 新建导图是深色中心 + 多色分支 + 白字，对应这里的
 * `rainbow`；Rust 侧 `DocumentSnapshot::DEFAULT_THEME_ID` 必须与此保持一致。
 */
export const NEW_DOCUMENT_THEME_ID: BuiltinThemeId = 'rainbow'

export const BUILT_IN_THEMES: ThemePalette[] = [
  {
    id: 'classic-blue',
    name: '经典蓝',
    family: 'classic',
    background: '#f5f5f7',
    gridLine: 'rgba(0, 0, 0, 0.06)',
    root: {
      fill: 'rgba(91, 140, 255, 0.96)',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#ffffff',
      textColor: '#1d1d1f',
      metaTextColor: 'rgba(60, 60, 67, 0.6)',
      borderColor: 'rgba(0, 0, 0, 0.08)',
    },
    edge: 'rgba(41, 88, 176, 0.34)',
    edgeActive: 'rgba(59, 130, 246, 0.74)',
  },
  {
    id: 'dark',
    name: '暗夜',
    family: 'classic',
    background: '#1a1a2e',
    gridLine: 'rgba(255, 255, 255, 0.04)',
    root: {
      fill: '#2d3748',
      textColor: '#e2e8f0',
      metaTextColor: 'rgba(226, 232, 240, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#1e293b',
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
    family: 'classic',
    background: '#fef9f3',
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
    family: 'classic',
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
    family: 'classic',
    background: '#ffffff',
    gridLine: 'rgba(17, 24, 39, 0.05)',
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

  // —— 缤纷：对标 XMind 的多色分支主题 ——
  // 每条一级分支取 branchPalette 中的一色（后代继承），填充/文字/边框/连线同源。
  // 填充色一律选明度偏深的饱和色，配白色文字；背景统一用浅色，暗底主题另注明。
  {
    id: 'rainbow',
    name: '彩虹',
    family: 'vivid',
    background: '#fbfbfd',
    gridLine: 'rgba(0, 0, 0, 0.05)',
    root: {
      fill: '#334155',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#64748b',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    edge: 'rgba(100, 116, 139, 0.5)',
    edgeActive: 'rgba(51, 65, 85, 0.8)',
    branchPalette: [
      '#e2564a',
      '#e08b3c',
      '#c9a227',
      '#4c9a4c',
      '#2f80b8',
      '#3c5fa8',
      '#8551b5',
      '#b04a86',
    ],
  },
  {
    id: 'vibrant',
    name: '活力',
    family: 'vivid',
    background: '#fffaf5',
    gridLine: 'rgba(234, 88, 12, 0.06)',
    root: {
      fill: '#c2410c',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#ea580c',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    edge: 'rgba(234, 88, 12, 0.42)',
    edgeActive: 'rgba(194, 65, 12, 0.78)',
    branchPalette: [
      '#d9452f',
      '#e0721d',
      '#c98a12',
      '#8f9a1a',
      '#2f8f5b',
      '#1f7f8c',
      '#2f5fb0',
      '#8b3fa0',
    ],
  },
  {
    id: 'dance',
    name: '舞动',
    family: 'vivid',
    background: '#fdf7ff',
    gridLine: 'rgba(168, 85, 247, 0.06)',
    root: {
      fill: '#7e22ce',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#a855f7',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    edge: 'rgba(168, 85, 247, 0.42)',
    edgeActive: 'rgba(126, 34, 206, 0.78)',
    branchPalette: [
      '#9333c4',
      '#c02f8f',
      '#e04a6a',
      '#e07a2c',
      '#b8912a',
      '#5ba03d',
      '#2b8f96',
      '#3f5cbf',
    ],
  },
  {
    id: 'code',
    name: '代码',
    family: 'vivid',
    // 暗底：终端配色，文字用高亮前景色
    background: '#14161d',
    gridLine: 'rgba(255, 255, 255, 0.05)',
    root: {
      fill: '#2b303b',
      textColor: '#f0f2f6',
      metaTextColor: 'rgba(240, 242, 246, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    branch: {
      fill: '#22262f',
      textColor: '#e6e9ef',
      metaTextColor: 'rgba(230, 233, 239, 0.62)',
      borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    edge: 'rgba(160, 174, 192, 0.42)',
    edgeActive: 'rgba(125, 211, 252, 0.8)',
    branchPalette: [
      '#e06c75',
      '#d19a66',
      '#e5c07b',
      '#98c379',
      '#56b6c2',
      '#61afef',
      '#c678dd',
      '#be5046',
    ],
  },
  {
    id: 'washi',
    name: '和风',
    family: 'vivid',
    background: '#faf7f2',
    gridLine: 'rgba(120, 90, 60, 0.06)',
    root: {
      fill: '#6b5344',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#8a6f5c',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    edge: 'rgba(138, 111, 92, 0.42)',
    edgeActive: 'rgba(107, 83, 68, 0.78)',
    branchPalette: [
      '#a8574f',
      '#b07a3f',
      '#8f8340',
      '#5d7d5a',
      '#4a737d',
      '#4f5f80',
      '#76527a',
      '#8c5f6b',
    ],
  },
  {
    id: 'island',
    name: '岛屿',
    family: 'vivid',
    background: '#f4fbfb',
    gridLine: 'rgba(13, 148, 136, 0.06)',
    root: {
      fill: '#0f766e',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#14b8a6',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    edge: 'rgba(20, 184, 166, 0.42)',
    edgeActive: 'rgba(15, 118, 110, 0.78)',
    branchPalette: [
      '#0d9488',
      '#2aa1a0',
      '#3b82a6',
      '#4a6fb5',
      '#6f63b5',
      '#9c5aa0',
      '#c2677f',
      '#d98a5f',
    ],
  },
  {
    id: 'rose',
    name: '玫瑰',
    family: 'vivid',
    background: '#fff7f9',
    gridLine: 'rgba(225, 29, 72, 0.06)',
    root: {
      fill: '#be123c',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#e11d48',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    edge: 'rgba(225, 29, 72, 0.42)',
    edgeActive: 'rgba(190, 18, 60, 0.78)',
    branchPalette: [
      '#c9184a',
      '#d6336c',
      '#c7478f',
      '#a855a8',
      '#7c5bbd',
      '#5a63c4',
      '#3f7ab8',
      '#2f8f96',
    ],
  },
  {
    id: 'mint',
    name: '薄荷',
    family: 'vivid',
    background: '#f4fdf9',
    gridLine: 'rgba(16, 185, 129, 0.06)',
    root: {
      fill: '#047857',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#10b981',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    edge: 'rgba(16, 185, 129, 0.42)',
    edgeActive: 'rgba(4, 120, 87, 0.78)',
    branchPalette: [
      '#059669',
      '#2f9e6b',
      '#4c9a5e',
      '#6d944a',
      '#8f8f3d',
      '#7a7a4d',
      '#4f7d7a',
      '#35738f',
    ],
  },
  {
    id: 'green-tea',
    name: '绿茶',
    family: 'vivid',
    background: '#f8fbf5',
    gridLine: 'rgba(101, 163, 13, 0.06)',
    root: {
      fill: '#4d7c0f',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#65a30d',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    edge: 'rgba(101, 163, 13, 0.42)',
    edgeActive: 'rgba(77, 124, 15, 0.78)',
    branchPalette: [
      '#4d7c0f',
      '#5f8f2a',
      '#6f9436',
      '#7f8a3a',
      '#7a7f42',
      '#6f7f56',
      '#5f7f6b',
      '#4f7a7a',
    ],
  },
  {
    id: 'cosmos',
    name: '宇宙',
    family: 'vivid',
    // 暗底：深空蓝紫
    background: '#11122b',
    gridLine: 'rgba(255, 255, 255, 0.05)',
    root: {
      fill: '#312e81',
      textColor: '#eef2ff',
      metaTextColor: 'rgba(238, 242, 255, 0.72)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    branch: {
      fill: '#3b3a7a',
      textColor: '#eef2ff',
      metaTextColor: 'rgba(238, 242, 255, 0.62)',
      borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    edge: 'rgba(165, 180, 252, 0.42)',
    edgeActive: 'rgba(129, 140, 248, 0.82)',
    branchPalette: [
      '#6366f1',
      '#8b5cf6',
      '#a855f7',
      '#c026d3',
      '#db2777',
      '#e11d48',
      '#f97316',
      '#eab308',
    ],
  },
  {
    id: 'refined',
    name: '精致',
    family: 'vivid',
    background: '#fafafa',
    gridLine: 'rgba(0, 0, 0, 0.05)',
    root: {
      fill: '#3f3f46',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#71717a',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    edge: 'rgba(113, 113, 122, 0.45)',
    edgeActive: 'rgba(63, 63, 70, 0.8)',
    branchPalette: [
      '#5c5c66',
      '#6b6257',
      '#7c6a55',
      '#82614f',
      '#77584f',
      '#6a5568',
      '#5b5b78',
      '#4f6273',
    ],
  },
  {
    id: 'innocent',
    name: '纯真',
    family: 'vivid',
    background: '#fdfdff',
    gridLine: 'rgba(0, 0, 0, 0.04)',
    root: {
      fill: '#7c6ba8',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    branch: {
      fill: '#a99ccb',
      textColor: '#ffffff',
      metaTextColor: 'rgba(255, 255, 255, 0.82)',
      borderColor: 'transparent',
    },
    edge: 'rgba(169, 156, 203, 0.5)',
    edgeActive: 'rgba(124, 107, 168, 0.8)',
    branchPalette: [
      '#e08a8a',
      '#e6a97a',
      '#d8c47a',
      '#9fc48a',
      '#7fc0bd',
      '#82aede',
      '#b295d8',
      '#d896c0',
    ],
  },
]

const THEME_MAP = new Map<string, ThemePalette>(
  BUILT_IN_THEMES.map((theme) => [theme.id, theme]),
)

/**
 * 按 ID 取**内置**主题，未知 ID 回退到默认主题。
 *
 * ⚠️ 渲染链路**不要直接调它**——用户的 自定义风格 不在内置表里，
 * 直接调会静默回落到默认主题（表现是"选了自定义风格但不生效"）。
 * 对外请用 `registry.ts` 的 `getTheme`（内置 + 自定义一起查）。
 */
export function getBuiltInTheme(id: string | undefined): ThemePalette {
  if (id && THEME_MAP.has(id)) {
    return THEME_MAP.get(id)!
  }
  return THEME_MAP.get(DEFAULT_THEME_ID)!
}

/** 列出所有**内置**主题（对外请用 `registry.ts` 的 `listThemes`）。 */
export function listBuiltInThemes(): ThemePalette[] {
  return BUILT_IN_THEMES
}

/** 按分组列出**内置**主题（`custom` 分组不属于这里，由风格库提供）。 */
export function listBuiltInThemesByFamily(family: ThemeFamily): ThemePalette[] {
  return BUILT_IN_THEMES.filter((theme) => theme.family === family)
}
