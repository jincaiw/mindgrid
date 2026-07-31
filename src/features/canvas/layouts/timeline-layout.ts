/**
 * Timeline（时间线）布局引擎。
 *
 * 根节点在最左侧（时间起点），子节点沿水平时间轴依次排列。
 * 子节点的子节点（孙节点）在父节点下方垂直延伸。
 * 边为水平/垂直直线，主轴为水平时间线。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import {
  computeLayoutBounds,
  createStraightEdgeGeometry,
  estimateNodeSize,
} from './layout-utils'

const EVENT_GAP = 220
const SUB_EVENT_ROW_HEIGHT = 90
const SCENE_PADDING_X = 200
const SCENE_PADDING_Y = 140

export function computeTimelineLayout(rootTopic: TopicSnapshot): MindMapLayoutResult {
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

  if (rootTopic.collapsed || rootTopic.children.length === 0) {
    const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
    return { nodes, edges, ...bounds }
  }

  rootTopic.children.forEach((event, index) => {
    const eventX = (index + 1) * EVENT_GAP
    const eventSize = estimateNodeSize(event, 1)
    const eventNode: MindMapNodeLayout = {
      id: event.id,
      topic: event,
      depth: 1,
      side: 'right',
      x: eventX,
      y: 0,
      width: eventSize.width,
      height: eventSize.height,
    }

    nodes.push(eventNode)

    // 主轴连接：根 → 事件（或前一个事件 → 当前事件）
    if (index === 0) {
      edges.push({
        id: `${rootNode.id}-${eventNode.id}`,
        parentId: rootNode.id,
        childId: eventNode.id,
        ...createStraightEdgeGeometry(rootNode, eventNode),
      })
    } else {
      const prevEvent = nodes[nodes.length - 2]
      edges.push({
        id: `${prevEvent.id}-${eventNode.id}`,
        parentId: prevEvent.id,
        childId: eventNode.id,
        ...createStraightEdgeGeometry(prevEvent, eventNode),
      })
    }

    // 子事件在下方垂直排列
    if (event.collapsed || event.children.length === 0) {
      return
    }

    event.children.forEach((subEvent, subIndex) => {
      const subY = (subIndex + 1) * SUB_EVENT_ROW_HEIGHT
      const subSize = estimateNodeSize(subEvent, 2)
      const subNode: MindMapNodeLayout = {
        id: subEvent.id,
        topic: subEvent,
        depth: 2,
        side: 'right',
        x: eventX,
        y: subY,
        width: subSize.width,
        height: subSize.height,
      }

      nodes.push(subNode)
      edges.push({
        id: `${eventNode.id}-${subNode.id}`,
        parentId: eventNode.id,
        childId: subNode.id,
        ...createStraightEdgeGeometry(eventNode, subNode),
      })
    })
  })

  const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
  return { nodes, edges, ...bounds }
}
