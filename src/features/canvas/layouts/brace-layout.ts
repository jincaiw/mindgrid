/**
 * Brace Chart（括号图）布局引擎。
 *
 * 根主题在左侧，子主题逐级向右展开为纵向列；
 * 父子之间用“括号式”肘形连线：从父节点右缘水平引出，
 * 经中点折向子节点左缘（贝塞尔近似）。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import {
  computeLayoutBounds,
  estimateNodeSize,
  measureSubtree,
} from './layout-utils'

const COLUMN_GAP = 120
const SIBLING_GAP = 16
const SCENE_PADDING_X = 220
const SCENE_PADDING_Y = 140

interface SubtreeLayout {
  node: MindMapNodeLayout
  height: number
  children: SubtreeLayout[]
}

/** 递归布局子树：列内纵向堆叠，返回子树总高度。 */
function layoutSubtree(
  topic: TopicSnapshot,
  depth: number,
  centerY: number,
): SubtreeLayout {
  const size = estimateNodeSize(topic, depth)
  const node: MindMapNodeLayout = {
    id: topic.id,
    topic,
    depth,
    side: 'center',
    x: depth * COLUMN_GAP,
    y: centerY,
    width: size.width,
    height: size.height,
  }

  if (topic.collapsed || topic.children.length === 0) {
    return { node, height: size.height, children: [] }
  }

  const children = topic.children.map((child) => layoutSubtree(child, depth + 1, 0))
  const childrenHeight = children.reduce(
    (sum, child, i) => sum + child.height + (i > 0 ? SIBLING_GAP : 0),
    0,
  )

  // 以当前节点中心为基准，纵向排布子节点
  let cursor = centerY - childrenHeight / 2
  for (const child of children) {
    const childCenterY = cursor + child.height / 2
    offsetSubtree(child, childCenterY - child.node.y)
    cursor += child.height + SIBLING_GAP
  }

  const subtreeHeight = Math.max(size.height, childrenHeight)
  return { node, height: subtreeHeight, children }
}

/** 将子树整体偏移 deltaY。 */
function offsetSubtree(layout: SubtreeLayout, deltaY: number) {
  layout.node = { ...layout.node, y: layout.node.y + deltaY }
  for (const child of layout.children) {
    offsetSubtree(child, deltaY)
  }
}

/** 收集节点与括号式肘形边。 */
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
      ...createBraceEdgeGeometry(layout.node, child.node),
    })
    collectNodesAndEdges(child, nodes, edges)
  }
}

/** 括号式肘形边：父右缘 → 垂直中轴 → 子左缘（贝塞尔近似肘形）。 */
function createBraceEdgeGeometry(
  parent: MindMapNodeLayout,
  child: MindMapNodeLayout,
): Omit<MindMapLayoutResult['edges'][number], 'id' | 'parentId' | 'childId'> {
  const startX = parent.x + parent.width / 2
  const startY = parent.y
  const endX = child.x - child.width / 2
  const endY = child.y
  const midX = startX + Math.max(24, (endX - startX) * 0.5)

  return {
    side: 'right',
    path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    control1: { x: midX, y: startY },
    control2: { x: midX, y: endY },
  }
}

export function computeBraceLayout(rootTopic: TopicSnapshot): MindMapLayoutResult {
  const tree = layoutSubtree(rootTopic, 0, 0)
  const nodes: MindMapNodeLayout[] = []
  const edges: MindMapLayoutResult['edges'] = []
  collectNodesAndEdges(tree, nodes, edges)

  const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
  return { nodes, edges, ...bounds }
}

// measureSubtree 保留导出供潜在扩展（与 logic 布局的子树度量保持一致）
export { measureSubtree }
