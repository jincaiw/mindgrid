/**
 * Organization Chart 布局引擎：紧凑型组织结构图。
 *
 * 根节点在顶部中心，子节点按部门式排布在下方。
 * 子树宽度驱动水平间距，保证不重叠。
 * 边为正交（L 型）连接器，用贝塞尔曲线近似直角。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { MindMapLayoutOptions, MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import {
  computeLayoutBounds,
  createVerticalEdgeGeometry,
  estimateNodeSize,
} from './layout-utils'
import { footprintHalfWidth, type SubtreeFootprintResolver } from './mixed-structure'

const ROW_HEIGHT = 100
const SIBLING_GAP = 20
const SCENE_PADDING_X = 200
const SCENE_PADDING_Y = 120

interface OrgSubtree {
  node: MindMapNodeLayout
  halfWidth: number
  children: OrgSubtree[]
}

/** 布局上下文：深度基准 + 子树足迹查询（见 layouts/mixed-structure）。 */
interface OrgContext {
  depthBase: number
  footprint?: SubtreeFootprintResolver
}

function layoutOrgSubtree(
  topic: TopicSnapshot,
  depth: number,
  centerX: number,
  ctx: OrgContext,
): OrgSubtree {
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
    return { node, halfWidth: size.width / 2, children: [] }
  }

  const children = topic.children.map((child) => {
    const footprint = ctx.footprint?.(child.id)
    if (footprint) {
      // 换过骨架的子树当黑盒：按真实占地的半宽留出对称槽位，不再往下递归
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
        halfWidth: footprintHalfWidth(footprint),
        children: [] as OrgSubtree[],
      }
    }
    return layoutOrgSubtree(child, depth + 1, 0, ctx)
  })

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

export function computeOrgLayout(
  rootTopic: TopicSnapshot,
  options: MindMapLayoutOptions = {},
): MindMapLayoutResult {
  const tree = layoutOrgSubtree(rootTopic, 0, 0, {
    depthBase: options.depthBase ?? 0,
    footprint: options.subtreeFootprint,
  })
  const nodes: MindMapNodeLayout[] = []
  const edges: MindMapLayoutResult['edges'] = []
  collectOrgNodes(tree, nodes, edges)

  const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
  return { nodes, edges, ...bounds }
}
