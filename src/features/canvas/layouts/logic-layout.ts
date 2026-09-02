/**
 * Logic Chart 布局引擎：从左到右的水平树。
 *
 * 根节点在最左侧，子节点逐级向右展开。
 * 每层为一列，列内节点按子树叶子数分配垂直空间。
 * 边为水平 S 型贝塞尔曲线。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import {
  computeLayoutBounds,
  createEdgeGeometry,
  estimateNodeSize,
  measureSubtree,
} from './layout-utils'

const COL_GAP = 150
const LEAF_BLOCK = 80
const ROW_GAP = 18
const SCENE_PADDING_X = 220
const SCENE_PADDING_Y = 140

export function computeLogicLayout(rootTopic: TopicSnapshot): MindMapLayoutResult {
  const rootSize = estimateNodeSize(rootTopic, 0)
  const rootNode: MindMapNodeLayout = {
    id: rootTopic.id,
    topic: rootTopic,
    depth: 0,
    side: 'center',
    x: 0,
    y: 0,
    width: rootSize.width,
    height: rootSize.height,
  }
  const nodes: MindMapNodeLayout[] = [rootNode]
  const edges: MindMapLayoutResult['edges'] = []

  if (rootTopic.collapsed) {
    const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
    return { nodes, edges, ...bounds }
  }

  const placeSubtree = (
    topic: TopicSnapshot,
    parent: MindMapNodeLayout,
    centerY: number,
    depth: number,
  ) => {
    const size = estimateNodeSize(topic, depth)
    const x = COL_GAP * depth
    const node: MindMapNodeLayout = {
      id: topic.id,
      topic,
      depth,
      side: 'right',
      x,
      y: centerY,
      width: size.width,
      height: size.height,
    }

    nodes.push(node)
    edges.push({
      id: `${parent.id}-${node.id}`,
      parentId: parent.id,
      childId: node.id,
      ...createEdgeGeometry(parent, node, 'right'),
    })

    if (topic.collapsed || topic.children.length === 0) {
      return
    }

    const metrics = topic.children.map((child) => measureSubtree(child))
    const totalLeafCount = metrics.reduce((sum, m) => sum + m.leafCount, 0)
    const totalHeight = totalLeafCount * LEAF_BLOCK + (topic.children.length - 1) * ROW_GAP
    let cursor = centerY - totalHeight / 2

    topic.children.forEach((child, index) => {
      const blockHeight = metrics[index].leafCount * LEAF_BLOCK
      const childCenterY = cursor + blockHeight / 2
      cursor += blockHeight + ROW_GAP
      placeSubtree(child, node, childCenterY, depth + 1)
    })
  }

  const metrics = rootTopic.children.map((child) => measureSubtree(child))
  const totalLeafCount = metrics.reduce((sum, m) => sum + m.leafCount, 0)
  const totalHeight = totalLeafCount * LEAF_BLOCK + (rootTopic.children.length - 1) * ROW_GAP
  let cursor = -totalHeight / 2

  rootTopic.children.forEach((child, index) => {
    const blockHeight = metrics[index].leafCount * LEAF_BLOCK
    const childCenterY = cursor + blockHeight / 2
    cursor += blockHeight + ROW_GAP
    placeSubtree(child, rootNode, childCenterY, 1)
  })

  const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
  return { nodes, edges, ...bounds }
}
