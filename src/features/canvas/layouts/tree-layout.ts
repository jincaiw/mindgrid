/**
 * Tree Chart 布局引擎：从上到下的垂直树。
 *
 * 根节点在最顶部，子节点逐级向下展开。
 * 每层为一行，行内节点按子树宽度水平排布，整体居中。
 * 边为垂直 S 型贝塞尔曲线。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { MindMapLayoutOptions, MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import {
  computeLayoutBounds,
  createVerticalEdgeGeometry,
  estimateNodeSize,
} from './layout-utils'
import { footprintHalfWidth, type SubtreeFootprintResolver } from './mixed-structure'

const ROW_HEIGHT = 104
const SIBLING_GAP = 28
const SCENE_PADDING_X = 220
const SCENE_PADDING_Y = 140

/** 布局上下文：深度基准 + 子树足迹查询（见 layouts/mixed-structure）。 */
interface SubtreeContext {
  depthBase: number
  footprint?: SubtreeFootprintResolver
}

interface SubtreeLayout {
  node: MindMapNodeLayout
  width: number
  children: SubtreeLayout[]
}

/** 递归布局子树，返回子树宽度（用于水平排布）。 */
function layoutSubtree(
  topic: TopicSnapshot,
  depth: number,
  centerX: number,
  ctx: SubtreeContext,
): SubtreeLayout {
  const size = estimateNodeSize(topic, depth + ctx.depthBase)
  const node: MindMapNodeLayout = {
    id: topic.id,
    topic,
    depth: depth + ctx.depthBase,
    side: 'center',
    x: centerX,
    y: depth * ROW_HEIGHT,
    width: size.width,
    height: size.height,
  }

  if (topic.collapsed || topic.children.length === 0) {
    return { node, width: size.width, children: [] }
  }

  const children = topic.children.map((child) => {
    const footprint = ctx.footprint?.(child.id)
    if (footprint) {
      // 换过骨架的子树当黑盒：按真实占地留出**对称**槽位（半宽取左右较大的一侧，
      // 内容才一定落得进去），并且不再往下递归——更深的层级由那份子布局自己负责。
      const childSize = estimateNodeSize(child, depth + 1 + ctx.depthBase)
      return {
        node: {
          id: child.id,
          topic: child,
          depth: depth + 1 + ctx.depthBase,
          side: 'center' as const,
          x: 0,
          y: (depth + 1) * ROW_HEIGHT,
          width: childSize.width,
          height: childSize.height,
        },
        width: footprintHalfWidth(footprint) * 2,
        children: [],
      }
    }
    return layoutSubtree(child, depth + 1, 0, ctx)
  })
  const childrenWidth = children.reduce((sum, child, i) => {
    return sum + child.width + (i > 0 ? SIBLING_GAP : 0)
  }, 0)

  // 重新定位子节点，使其居中于当前节点
  let cursor = centerX - childrenWidth / 2
  for (const child of children) {
    const childCenterX = cursor + child.width / 2
    offsetSubtree(child, childCenterX - child.node.x)
    cursor += child.width + SIBLING_GAP
  }

  const subtreeWidth = Math.max(size.width, childrenWidth)
  return { node, width: subtreeWidth, children }
}

/** 将子树整体偏移 deltaX。 */
function offsetSubtree(layout: SubtreeLayout, deltaX: number) {
  layout.node = { ...layout.node, x: layout.node.x + deltaX }
  for (const child of layout.children) {
    offsetSubtree(child, deltaX)
  }
}

/** 收集所有节点和边。 */
function collectNodesAndEdges(
  layout: SubtreeLayout,
  nodes: MindMapNodeLayout[],
  edges: MindMapLayoutResult['edges'],
) {
  nodes.push(layout.node)
  for (const child of layout.children) {
    edges.push({
      id: `${layout.node.id}-${child.node.id}`,
      parentId: layout.node.id,
      childId: child.node.id,
      ...createVerticalEdgeGeometry(layout.node, child.node),
    })
    collectNodesAndEdges(child, nodes, edges)
  }
}

export function computeTreeLayout(
  rootTopic: TopicSnapshot,
  options: MindMapLayoutOptions = {},
): MindMapLayoutResult {
  const tree = layoutSubtree(rootTopic, 0, 0, {
    depthBase: options.depthBase ?? 0,
    footprint: options.subtreeFootprint,
  })
  const nodes: MindMapNodeLayout[] = []
  const edges: MindMapLayoutResult['edges'] = []
  collectNodesAndEdges(tree, nodes, edges)

  const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
  return { nodes, edges, ...bounds }
}
