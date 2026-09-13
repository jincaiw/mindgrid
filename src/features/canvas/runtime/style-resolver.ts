/**
 * 样式解析器：将文档主题 + 主题层级 + 节点覆盖合并为具体渲染属性。
 *
 * 解析优先级（从低到高）：
 *   文档主题的层级默认色 → 主题节点 styleOverrides 覆盖
 *   深度分级排印/形状默认 → 主题节点 styleOverrides 覆盖
 *
 * 元信息文字色（metaTextColor）不纳入节点覆盖，始终跟随主题，
 * 保证深度/子主题数等辅助信息的视觉一致性。
 * 形状/字号/字重/边框粗细的深度分级默认由 style-constants 提供，
 * 节点覆盖优先于深度默认，未覆盖时回退到对应深度的默认值。
 */

import { getTheme, type ThemePalette } from '../../../lib/document/themes'
import type { TopicStyleOverrides } from '../../../lib/document/types'
import type { NodeSide, ResolvedTopicStyle } from './render-tree'
import { DEFAULT_BORDER_WIDTH, getTitleFontSize, getTitleFontWeight } from './style-constants'
import { mixWithWhite } from './color-utils'

/** 淡底分支节点的文字色（XMind 的二级主题是浅底深字）。 */
const DEEP_BRANCH_TEXT_COLOR = '#1f2937'
const DEEP_BRANCH_META_TEXT_COLOR = 'rgba(31, 41, 55, 0.62)'

export type { ResolvedTopicStyle } from './render-tree'

/**
 * 解析单个主题节点的样式。
 *
 * @param themeId 文档主题 ID（undefined 回退到默认主题）
 * @param depth 节点深度（0=根节点，>0=分支节点）
 * @param _side 节点侧（left/right/center，V1 预留，当前不参与解析）
 * @param overrides 节点级样式覆盖（可选）
 * @param branchIndex 一级分支序号（0 起）。缤纷主题据此从 `branchPalette` 取色，
 *   经典主题忽略。**两侧渲染必须传同一个来源算出的索引**，否则屏幕与导出会不同色。
 */
export function resolveTopicStyle(
  themeId: string | undefined,
  depth: number,
  _side: NodeSide,
  overrides: TopicStyleOverrides | undefined,
  branchIndex: number | null = null,
): ResolvedTopicStyle {
  const theme = getTheme(themeId)
  const base = depth === 0 ? theme.root : theme.branch

  // 缤纷主题：分支节点按分支序号取色，填充/文字/边框同源。
  // 根节点不参与（root 始终用主题自己的配色），节点级覆盖仍优先。
  const palette = theme.branchPalette
  const branchColor =
    depth > 0 && palette && palette.length > 0 && branchIndex !== null
      ? palette[branchIndex % palette.length]
      : null

  /**
   * 深度分级：对齐 XMind —— 一级分支是**饱和实色 + 白字**，
   * 二级及更深用**同一分支色的淡底 + 深色字**（否则整幅图全是实色块，深层层级看不出来）。
   * 淡底由分支色与白混合得到，边框取稍深一点的同色，保证三端同源。
   */
  const isDeepBranch = branchColor !== null && depth >= 2

  const baseFill = branchColor ? (isDeepBranch ? mixWithWhite(branchColor, 0.86) : branchColor) : base.fill
  const baseText = branchColor
    ? isDeepBranch
      ? DEEP_BRANCH_TEXT_COLOR
      : '#ffffff'
    : base.textColor
  const baseMetaText = branchColor
    ? isDeepBranch
      ? DEEP_BRANCH_META_TEXT_COLOR
      : 'rgba(255, 255, 255, 0.82)'
    : base.metaTextColor

  return {
    fill: overrides?.fill ?? baseFill,
    textColor: overrides?.textColor ?? baseText,
    metaTextColor: baseMetaText,
    borderColor: overrides?.borderColor ?? (isDeepBranch ? mixWithWhite(branchColor!, 0.62) : branchColor) ?? base.borderColor,
    shape: overrides?.shape ?? 'rounded',
    fontSize: overrides?.fontSize ?? getTitleFontSize(depth),
    fontWeight: overrides?.fontWeight ?? getTitleFontWeight(depth),
    borderWidth: overrides?.borderWidth ?? DEFAULT_BORDER_WIDTH,
    borderStyle: overrides?.borderStyle ?? 'solid',
    textAlign: overrides?.textAlign ?? 'left',
  }
}

/**
 * 解析画布背景色。
 *
 * @param themeId 文档主题 ID（undefined 回退到默认主题）
 * @param override 画布级背景覆盖（`canvas.background` 设置）。空值 = 跟随主题。
 *
 * 屏幕 DOM / PNG / SVG 都必须走这里：历史上屏幕用的是 UI 令牌
 * `--color-background-canvas`、导出用主题背景，切到暗色主题后
 * 「屏幕是浅的、导出是深的」。三端同源于此后不再分叉。
 */
export function resolveThemeBackground(
  themeId: string | undefined,
  override?: string | null,
): Pick<ThemePalette, 'background'> {
  const theme = getTheme(themeId)
  return { background: override && override.length > 0 ? override : theme.background }
}

/** 解析主题的连线颜色。 */
export function resolveThemeEdge(
  themeId: string | undefined,
): Pick<ThemePalette, 'edge' | 'edgeActive'> {
  const theme = getTheme(themeId)
  return { edge: theme.edge, edgeActive: theme.edgeActive }
}
