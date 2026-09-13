/**
 * Bubble Chart（气泡图）布局引擎。
 *
 * 根主题居中，各层后代按同心圆环排布（一层一环）；
 * 同层内按 BFS 顺序排列以保持兄弟相邻，弧段按子树叶子数占比分配，
 * 保证密集分支占更大角度。父子之间用直线连接。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { MindMapLayoutOptions, MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import {
  computeLayoutBounds,
  createStraightEdgeGeometry,
  estimateNodeSize,
} from './layout-utils'
import { footprintBlocks, footprintHalfHeight, type SubtreeFootprintResolver } from './mixed-structure'

const BASE_RADIUS = 300
const RING_GAP = 220
const SCENE_PADDING_X = 220
const SCENE_PADDING_Y = 140
/** 环上弧段分配用的"叶子块"参考高度（换骨架的子树按占地折算成等价份额）。 */
const LEAF_BLOCK = 80

interface BfsEntry {
  topic: TopicSnapshot
  depth: number
  parentId: string
  leafCount: number
}

function countLeaves(topic: TopicSnapshot, footprint?: SubtreeFootprintResolver): number {
  // 换过骨架的子树：按真实占地折算弧段份额，并不再往下钻（更深的覆盖已被它自己消化）
  const override = footprint?.(topic.id)
  if (override) {
    return footprintBlocks(footprintHalfHeight(override), LEAF_BLOCK)
  }

  if (topic.collapsed || topic.children.length === 0) {
    return 1
  }
  return topic.children.reduce((sum, child) => sum + countLeaves(child, footprint), 0)
}

export function computeBubbleLayout(
  rootTopic: TopicSnapshot,
  options: MindMapLayoutOptions = {},
): MindMapLayoutResult {
  const footprint = options.subtreeFootprint
  /** 该子树在整幅图里的真实层级（子树单独布局时由调用方给出）。 */
  const depthBase = options.depthBase ?? 0
  const rootSize = estimateNodeSize(rootTopic, depthBase)
  const rootNode: MindMapNodeLayout = {
    id: rootTopic.id,
    topic: rootTopic,
    depth: depthBase,
    side: 'center',
    x: 0,
    y: 0,
    width: rootSize.width,
    height: rootSize.height,
  }

  const nodes: MindMapNodeLayout[] = [rootNode]
  const edges: MindMapLayoutResult['edges'] = []
  const nodeById = new Map<string, MindMapNodeLayout>([[rootTopic.id, rootNode]])

  // BFS 收集各层条目（保持兄弟相邻的顺序）
  const levels: BfsEntry[][] = []
  let frontier: BfsEntry[] = [
    ...rootTopic.children
      .filter(() => !rootTopic.collapsed)
      .map((child) => ({
        topic: child,
        depth: 1,
        parentId: rootTopic.id,
        leafCount: countLeaves(child, footprint),
      })),
  ]
  if (rootTopic.collapsed) {
    frontier = []
  }

  while (frontier.length > 0) {
    levels.push(frontier)
    const next: BfsEntry[] = []
    for (const entry of frontier) {
      if (entry.topic.collapsed) {
        continue
      }
      for (const child of entry.topic.children) {
        next.push({
          topic: child,
          depth: entry.depth + 1,
          parentId: entry.topic.id,
          leafCount: countLeaves(child, footprint),
        })
      }
    }
    frontier = next
  }

  // 逐层放环：弧段按叶子数占比分配
  for (const level of levels) {
    const radius = BASE_RADIUS + (level[0].depth - 1) * RING_GAP
    const totalLeaves = level.reduce((sum, entry) => sum + entry.leafCount, 0)

    let angle = -Math.PI / 2 // 从正上方开始
    for (const entry of level) {
      const size = estimateNodeSize(entry.topic, entry.depth + depthBase)
      const share = entry.leafCount / Math.max(totalLeaves, 1)
      const nodeAngle = angle + (share * Math.PI) / 2

      const node: MindMapNodeLayout = {
        id: entry.topic.id,
        topic: entry.topic,
        depth: entry.depth + depthBase,
        side: 'center',
        x: radius * Math.cos(nodeAngle),
        y: radius * Math.sin(nodeAngle),
        width: size.width,
        height: size.height,
      }

      nodes.push(node)
      nodeById.set(node.id, node)

      const parent = nodeById.get(entry.parentId) ?? rootNode
      edges.push({
        id: `${parent.id}-${node.id}`,
        parentId: parent.id,
        childId: node.id,
        ...createStraightEdgeGeometry(parent, node),
      })

      angle += share * 2 * Math.PI
    }
  }

  const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
  return { nodes, edges, ...bounds }
}
