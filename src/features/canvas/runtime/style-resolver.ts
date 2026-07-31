/**
 * 样式解析器：将文档主题 + 主题层级 + 节点覆盖合并为具体渲染属性。
 *
 * 解析优先级（从低到高）：
 *   文档主题的层级默认色 → 主题节点 styleOverrides 覆盖
 *
 * 元信息文字色（metaTextColor）不纳入节点覆盖，始终跟随主题，
 * 保证深度/子主题数等辅助信息的视觉一致性。
 */

import { getTheme, type ThemePalette } from '../../../lib/document/themes'
import type { TopicStyleOverrides } from '../../../lib/document/types'
import type { NodeSide, ResolvedTopicStyle } from './render-tree'

export type { ResolvedTopicStyle } from './render-tree'

/**
 * 解析单个主题节点的样式。
 *
 * @param themeId 文档主题 ID（undefined 回退到默认主题）
 * @param depth 节点深度（0=根节点，>0=分支节点）
 * @param _side 节点侧（left/right/center，V1 预留，当前不参与解析）
 * @param overrides 节点级样式覆盖（可选）
 */
export function resolveTopicStyle(
  themeId: string | undefined,
  depth: number,
  _side: NodeSide,
  overrides: TopicStyleOverrides | undefined,
): ResolvedTopicStyle {
  const theme = getTheme(themeId)
  const base = depth === 0 ? theme.root : theme.branch

  return {
    fill: overrides?.fill ?? base.fill,
    textColor: overrides?.textColor ?? base.textColor,
    metaTextColor: base.metaTextColor,
    borderColor: overrides?.borderColor ?? base.borderColor,
  }
}

/** 解析主题的画布背景与网格线颜色。 */
export function resolveThemeBackground(
  themeId: string | undefined,
): Pick<ThemePalette, 'background' | 'gridLine'> {
  const theme = getTheme(themeId)
  return { background: theme.background, gridLine: theme.gridLine }
}

/** 解析主题的连线颜色。 */
export function resolveThemeEdge(
  themeId: string | undefined,
): Pick<ThemePalette, 'edge' | 'edgeActive'> {
  const theme = getTheme(themeId)
  return { edge: theme.edge, edgeActive: theme.edgeActive }
}
