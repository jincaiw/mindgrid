/**
 * Organization Chart 布局引擎：紧凑型组织结构图。
 *
 * 根节点在顶部中心，子节点按部门式排布在下方。
 * 子树宽度驱动水平间距，保证不重叠。
 * 边为正交（L 型）连接器，用贝塞尔曲线近似直角。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import {
  computeLayoutBounds,
  createVerticalEdgeGeometry,
  estimateNodeSize,
} from './layout-utils'

const ROW_HEIGHT = 130
const SIBLING_GAP = 28
const SCENE_PADDING_X = 200
const SCENE_PADDING_Y = 120

interface OrgSubtree {
  node: MindMapNodeLayout
  halfWidth: number
  children: OrgSubtree[]
}

function layoutOrgSubtree(
  topic: TopicSnapshot,
  depth: number,
  centerX: number,
): OrgSubtree {
  const size = estimateNodeSize(topic, depth)
  const node: MindMapNodeLayout = {
    id: topic.id,
    topic,
    depth,
    side: 'center',
    x: centerX,
    y: depth * ROW_HEIGHT,
    width: size.width,
    height: size.height,
  }

  if (topic.collapsed || topic.children.length === 0) {
    return { node, halfWidth: size.width / 2, children: [] }
  }

  const children = topic.children.map((child) => layoutOrgSubtree(child, depth + 1, 0))

  // 计算子节点需要的总宽度
  let totalChildrenWidth = 0
  for (let i = 0; i < children.length; i++) {
    totalChildrenWidth += children[i].halfWidth * 2
    if (i > 0) totalChildrenWidth += SIBLING_GAP
  }

  // 排布子节点
  let cursor = centerX - totalChildrenWidth / 2
  for (const child of children) {
    const childCenterX = cursor + child.halfWidth
    offsetOrgSubtree(child, childCenterX - child.node.x)
    cursor += child.halfWidth * 2 + SIBLING_GAP
  }

  const halfWidth = Math.max(size.width / 2, totalChildrenWidth / 2)
  return { node, halfWidth, children }
}

function offsetOrgSubtree(layout: OrgSubtree, deltaX: number) {
  layout.node = { ...layout.node, x: layout.node.x + deltaX }
  for (const child of layout.children) {
    offsetOrgSubtree(child, deltaX)
  }
}

function collectOrgNodes(
  layout: OrgSubtree,
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
    collectOrgNodes(child, nodes, edges)
  }
}

export function computeOrgLayout(rootTopic: TopicSnapshot): MindMapLayoutResult {
  const tree = layoutOrgSubtree(rootTopic, 0, 0)
  const nodes: MindMapNodeLayout[] = []
  const edges: MindMapLayoutResult['edges'] = []
  collectOrgNodes(tree, nodes, edges)

  const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
  return { nodes, edges, ...bounds }
}
