import type { TopicSnapshot } from '../../lib/document/types'

type LayoutSide = 'left' | 'right' | 'center'

interface SubtreeMetrics {
  leafCount: number
}

export interface MindMapNodeLayout {
  id: string
  topic: TopicSnapshot
  depth: number
  side: LayoutSide
  x: number
  y: number
  width: number
  height: number
}

export interface MindMapEdgeLayout {
  id: string
  parentId: string
  childId: string
  side: Exclude<LayoutSide, 'center'>
  path: string
  /** 贝塞尔曲线几何，供 Canvas 2D 渲染器直接使用（无需解析 SVG path）。 */
  start: { x: number; y: number }
  end: { x: number; y: number }
  control1: { x: number; y: number }
  control2: { x: number; y: number }
}

export interface MindMapLayoutResult {
  nodes: MindMapNodeLayout[]
  edges: MindMapEdgeLayout[]
  width: number
  height: number
  offsetX: number
  offsetY: number
}

const ROOT_HORIZONTAL_GAP = 220
const DEPTH_HORIZONTAL_GAP = 178
const VERTICAL_GAP = 26
const LEAF_BLOCK = 92
const SCENE_PADDING_X = 220
const SCENE_PADDING_Y = 140

export function estimateNodeSize(topic: TopicSnapshot, depth: number) {
  const textLength = topic.text.trim().length || 1
  const widthBase = depth === 0 ? 180 : 140
  const width = Math.min(widthBase + textLength * 12, depth === 0 ? 300 : 250)
  const lineCount = Math.max(1, Math.ceil(textLength / (depth === 0 ? 14 : 16)))
  const height = 44 + (lineCount - 1) * 18

  return { width, height }
}

function measureSubtree(topic: TopicSnapshot): SubtreeMetrics {
  if (topic.collapsed || topic.children.length === 0) {
    return { leafCount: 1 }
  }

  return {
    leafCount: topic.children.reduce(
      (sum, child) => sum + measureSubtree(child).leafCount,
      0,
    ),
  }
}

function assignRootSides(children: TopicSnapshot[]) {
  const weights = new Map<string, Exclude<LayoutSide, 'center'>>()
  let leftWeight = 0
  let rightWeight = 0

  for (const child of children) {
    const nextWeight = measureSubtree(child).leafCount
    const nextSide = leftWeight <= rightWeight ? 'left' : 'right'

    weights.set(child.id, nextSide)

    if (nextSide === 'left') {
      leftWeight += nextWeight
    } else {
      rightWeight += nextWeight
    }
  }

  return weights
}

function createCurveGeometry(
  parent: MindMapNodeLayout,
  child: MindMapNodeLayout,
  side: Exclude<LayoutSide, 'center'>,
) {
  const startX = side === 'right' ? parent.x + parent.width / 2 : parent.x - parent.width / 2
  const endX = side === 'right' ? child.x - child.width / 2 : child.x + child.width / 2
  const controlOffset = Math.max(48, Math.abs(endX - startX) * 0.42)
  const control1X = side === 'right' ? startX + controlOffset : startX - controlOffset
  const control2X = side === 'right' ? endX - controlOffset : endX + controlOffset

  return {
    path: `M ${startX} ${parent.y} C ${control1X} ${parent.y}, ${control2X} ${child.y}, ${endX} ${child.y}`,
    start: { x: startX, y: parent.y },
    end: { x: endX, y: child.y },
    control1: { x: control1X, y: parent.y },
    control2: { x: control2X, y: child.y },
  }
}

function distributeCenters(
  topics: TopicSnapshot[],
  centerY: number,
  side: Exclude<LayoutSide, 'center'>,
  sideMap: Map<string, Exclude<LayoutSide, 'center'>>,
) {
  const relevantTopics =
    side === 'left'
      ? topics.filter((topic) => sideMap.get(topic.id) === 'left')
      : topics.filter((topic) => sideMap.get(topic.id) !== 'left')
  const metrics = relevantTopics.map((topic) => measureSubtree(topic))
  const totalLeafCount = Math.max(
    1,
    metrics.reduce((sum, metric) => sum + metric.leafCount, 0),
  )
  const totalHeight = totalLeafCount * LEAF_BLOCK + (relevantTopics.length - 1) * VERTICAL_GAP
  let cursor = centerY - totalHeight / 2

  return relevantTopics.map((topic, index) => {
    const blockHeight = metrics[index].leafCount * LEAF_BLOCK
    const nodeCenterY = cursor + blockHeight / 2

    cursor += blockHeight + VERTICAL_GAP

    return { topic, centerY: nodeCenterY }
  })
}

export function computeMindMapLayout(rootTopic: TopicSnapshot): MindMapLayoutResult {
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
  const edges: MindMapEdgeLayout[] = []

  if (rootTopic.collapsed) {
    return {
      nodes,
      edges,
      width: rootNode.width + SCENE_PADDING_X * 2,
      height: rootNode.height + SCENE_PADDING_Y * 2,
      offsetX: SCENE_PADDING_X,
      offsetY: SCENE_PADDING_Y,
    }
  }

  const sideMap = assignRootSides(rootTopic.children)

  const placeSubtree = (
    topic: TopicSnapshot,
    parent: MindMapNodeLayout,
    side: Exclude<LayoutSide, 'center'>,
    centerY: number,
    depth: number,
  ) => {
    const size = estimateNodeSize(topic, depth)
    const x =
      side === 'right'
        ? ROOT_HORIZONTAL_GAP + (depth - 1) * DEPTH_HORIZONTAL_GAP
        : -(ROOT_HORIZONTAL_GAP + (depth - 1) * DEPTH_HORIZONTAL_GAP)
    const node: MindMapNodeLayout = {
      id: topic.id,
      topic,
      depth,
      side,
      x,
      y: centerY,
      width: size.width,
      height: size.height,
    }

    nodes.push(node)
    const curve = createCurveGeometry(parent, node, side)
    edges.push({
      id: `${parent.id}-${node.id}`,
      parentId: parent.id,
      childId: node.id,
      side,
      path: curve.path,
      start: curve.start,
      end: curve.end,
      control1: curve.control1,
      control2: curve.control2,
    })

    if (topic.collapsed || topic.children.length === 0) {
      return
    }

    const childMetrics = topic.children.map((child) => measureSubtree(child))
    const totalChildLeafCount = childMetrics.reduce(
      (sum, metric) => sum + metric.leafCount,
      0,
    )
    const totalChildHeight =
      totalChildLeafCount * LEAF_BLOCK + (topic.children.length - 1) * VERTICAL_GAP
    let cursor = centerY - totalChildHeight / 2

    topic.children.forEach((child, index) => {
      const blockHeight = childMetrics[index].leafCount * LEAF_BLOCK
      const childCenterY = cursor + blockHeight / 2

      cursor += blockHeight + VERTICAL_GAP
      placeSubtree(child, node, side, childCenterY, depth + 1)
    })
  }

  const leftGroups = distributeCenters(rootTopic.children, 0, 'left', sideMap)
  const rightGroups = distributeCenters(rootTopic.children, 0, 'right', sideMap)

  leftGroups.forEach(({ topic, centerY }) => {
    placeSubtree(topic, rootNode, 'left', centerY, 1)
  })

  rightGroups.forEach(({ topic, centerY }) => {
    placeSubtree(topic, rootNode, 'right', centerY, 1)
  })

  const minX = Math.min(...nodes.map((node) => node.x - node.width / 2))
  const maxX = Math.max(...nodes.map((node) => node.x + node.width / 2))
  const minY = Math.min(...nodes.map((node) => node.y - node.height / 2))
  const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2))

  return {
    nodes,
    edges,
    width: maxX - minX + SCENE_PADDING_X * 2,
    height: maxY - minY + SCENE_PADDING_Y * 2,
    offsetX: SCENE_PADDING_X - minX,
    offsetY: SCENE_PADDING_Y - minY,
  }
}
