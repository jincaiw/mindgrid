/**
 * Fishbone（鱼骨图 / Ishikawa）布局引擎。
 *
 * 根节点（效果/问题）在最右侧。
 * 主干：从左到右的水平线，终点为根节点。
 * 主分支（原因，depth=1）：在主干上下交替斜向延伸（约 60°）。
 * 子原因（depth≥2）：沿主分支方向继续延伸。
 * 边为直线（控制点退化为端点，贝塞尔退化为直线）。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import {
  computeLayoutBounds,
  createStraightEdgeGeometry,
  estimateNodeSize,
} from './layout-utils'

const SPINE_LENGTH = 640
const BRANCH_ANGLE = Math.PI / 3 // 60°
const BRANCH_LENGTH = 200
const SUB_BRANCH_LENGTH = 120
const SCENE_PADDING_X = 200
const SCENE_PADDING_Y = 160

export function computeFishboneLayout(rootTopic: TopicSnapshot): MindMapLayoutResult {
  const rootSize = estimateNodeSize(rootTopic, 0)
  const rootNode: MindMapNodeLayout = {
    id: rootTopic.id,
    topic: rootTopic,
    depth: 0,
    side: 'center',
    x: SPINE_LENGTH,
    y: 0,
    width: rootSize.width,
    height: rootSize.height,
  }
  const nodes: MindMapNodeLayout[] = [rootNode]
  const edges: MindMapLayoutResult['edges'] = []

  if (rootTopic.collapsed || rootTopic.children.length === 0) {
    const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
    return { nodes, edges, ...bounds }
  }

  const causeCount = rootTopic.children.length
  const spineStartX = 0
  const spineEndX = SPINE_LENGTH

  rootTopic.children.forEach((cause, index) => {
    // 上下交替
    const isAbove = index % 2 === 0
    const direction = isAbove ? -1 : 1 // y 方向：上为负

    // 沿主干均匀分布分支起点
    const spineRatio = causeCount === 1 ? 0.5 : index / (causeCount - 1)
    const branchX = spineStartX + (spineEndX - spineStartX) * (0.15 + spineRatio * 0.7)

    // 主分支终点：从主干点向左上/左下延伸（朝尾部方向，远离根/头部）
    const branchEndX = branchX - Math.cos(BRANCH_ANGLE) * BRANCH_LENGTH
    const branchEndY = Math.sin(BRANCH_ANGLE) * BRANCH_LENGTH * direction

    const causeSize = estimateNodeSize(cause, 1)
    const causeNode: MindMapNodeLayout = {
      id: cause.id,
      topic: cause,
      depth: 1,
      side: isAbove ? 'left' : 'right',
      x: branchEndX,
      y: branchEndY,
      width: causeSize.width,
      height: causeSize.height,
    }

    nodes.push(causeNode)

    // 主干到分支的边
    edges.push({
      id: `${rootNode.id}-${causeNode.id}`,
      parentId: rootNode.id,
      childId: causeNode.id,
      ...createStraightEdgeGeometry(
        { ...rootNode, x: branchX, y: 0 },
        causeNode,
      ),
    })

    // 子原因沿分支方向继续延伸
    if (cause.collapsed || cause.children.length === 0) {
      return
    }

    const subAngle = BRANCH_ANGLE
    cause.children.forEach((subCause, subIndex) => {
      const subOffset = (subIndex + 1) * SUB_BRANCH_LENGTH
      const subX = branchEndX - Math.cos(subAngle) * subOffset
      const subY = branchEndY + Math.sin(subAngle) * subOffset * direction

      const subSize = estimateNodeSize(subCause, 2)
      const subNode: MindMapNodeLayout = {
        id: subCause.id,
        topic: subCause,
        depth: 2,
        side: isAbove ? 'left' : 'right',
        x: subX,
        y: subY,
        width: subSize.width,
        height: subSize.height,
      }

      nodes.push(subNode)
      edges.push({
        id: `${causeNode.id}-${subNode.id}`,
        parentId: causeNode.id,
        childId: subNode.id,
        ...createStraightEdgeGeometry(causeNode, subNode),
      })
    })
  })

  // 主干本身：一条从 spineStart 到 rootNode 的边（视觉引导线）
  // 用一条虚拟边表示主干（parentId = root, childId = root 不合法，
  // 所以直接在 bounds 计算中处理，不额外加边）

  const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
  return { nodes, edges, ...bounds }
}
