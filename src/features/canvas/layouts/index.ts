/**
 * 布局调度器：根据图表类型选择对应布局引擎。
 *
 * 所有布局引擎返回统一的 MindMapLayoutResult 结构，
 * 使 Scene Builder / Canvas Renderer 无需感知具体图表类型。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { ChartType } from '../../../lib/document/types'
import type { MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import { computeMindMapLayout, estimateNodeSize } from '../mindmap-layout'
import { computeLayoutBounds } from './layout-utils'
import { computeBraceLayout } from './brace-layout'
import { computeBubbleLayout } from './bubble-layout'
import { computeFishboneLayout } from './fishbone-layout'
import { computeLogicLayout } from './logic-layout'
import { computeMatrixLayout } from './matrix-layout'
import { computeOrgLayout } from './org-layout'
import { computeTimelineLayout } from './timeline-layout'
import { computeTreeLayout } from './tree-layout'

/**
 * 根据图表类型计算布局。
 *
 * @param rootTopic 根主题
 * @param chartType 图表类型，缺省为 mindmap
 * @param floatingTopics 浮动主题列表（可选）。浮动主题不参与树布局，
 *   坐标由 layoutHints.offsetX/offsetY 提供（根主题相对坐标）。
 */
export function computeLayout(
  rootTopic: TopicSnapshot,
  chartType: ChartType | undefined,
  floatingTopics?: TopicSnapshot[],
): MindMapLayoutResult {
  const base = (() => {
    switch (chartType) {
      case 'logic':
        return computeLogicLayout(rootTopic)
      case 'tree':
        return computeTreeLayout(rootTopic)
      case 'org':
        return computeOrgLayout(rootTopic)
      case 'fishbone':
        return computeFishboneLayout(rootTopic)
      case 'timeline':
        return computeTimelineLayout(rootTopic)
      case 'brace':
        return computeBraceLayout(rootTopic)
      case 'matrix':
        return computeMatrixLayout(rootTopic)
      case 'bubble':
        return computeBubbleLayout(rootTopic)
      case 'mindmap':
      default:
        return computeMindMapLayout(rootTopic)
    }
  })()

  return mergeFloatingTopics(base, floatingTopics)
}

/**
 * 将浮动主题合并到布局结果中。
 *
 * 浮动主题作为独立节点追加到 nodes 列表，不产生边（无父子连线）。
 * 坐标取自 layoutHints.offsetX/offsetY（根主题相对坐标系）。
 * 布局包围盒重新计算以包含浮动主题，保持与原布局相同的 padding。
 */
function mergeFloatingTopics(
  base: MindMapLayoutResult,
  floatingTopics?: TopicSnapshot[],
): MindMapLayoutResult {
  if (!floatingTopics || floatingTopics.length === 0) {
    return base
  }

  // 从原布局反推 padding：offsetX = paddingX - minX → paddingX = offsetX + minX
  let origMinX = Infinity
  let origMinY = Infinity
  for (const node of base.nodes) {
    origMinX = Math.min(origMinX, node.x - node.width / 2)
    origMinY = Math.min(origMinY, node.y - node.height / 2)
  }
  // 退化保护：空布局时使用经验值
  const paddingX = origMinX === Infinity ? 220 : base.offsetX + origMinX
  const paddingY = origMinY === Infinity ? 140 : base.offsetY + origMinY

  const floatingNodes: MindMapNodeLayout[] = floatingTopics.map((topic) => {
    const size = estimateNodeSize(topic, 0)
    return {
      id: topic.id,
      topic,
      depth: 0,
      side: 'center' as const,
      x: topic.layoutHints?.offsetX ?? 0,
      y: topic.layoutHints?.offsetY ?? 0,
      width: size.width,
      height: size.height,
    }
  })

  const allNodes = [...base.nodes, ...floatingNodes]
  const bounds = computeLayoutBounds(allNodes, paddingX, paddingY)

  return {
    nodes: allNodes,
    edges: base.edges,
    width: bounds.width,
    height: bounds.height,
    offsetX: bounds.offsetX,
    offsetY: bounds.offsetY,
  }
}

export { computeBraceLayout, computeBubbleLayout, computeFishboneLayout, computeLogicLayout, computeMatrixLayout, computeOrgLayout, computeTimelineLayout, computeTreeLayout }
