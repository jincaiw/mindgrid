/**
 * 布局引擎共享工具函数。
 *
 * 所有布局引擎共用节点尺寸估算、子树度量与边几何计算，
 * 保证 6 种图表的视觉一致性。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { MindMapEdgeLayout, MindMapNodeLayout } from '../mindmap-layout'
import { MAX_FIXED_WIDTH, MIN_FIXED_WIDTH } from '../mindmap-layout'
import { getFontScale } from '../runtime/style-constants'
import { footprintBlocks, footprintHalfHeight, type SubtreeFootprintResolver } from './mixed-structure'

export type LayoutSide = 'left' | 'right' | 'center'

export interface SubtreeMetrics {
  leafCount: number
}

/** 子树留白度量所需的上下文（叶子块尺寸 + 子树足迹查询）。 */
export interface BlockContext {
  /** 叶子块尺寸：纵向块状骨架传块高，横向块状骨架传块宽。 */
  leafBlock: number
  /**
   * 子树足迹查询：命中表示该子树换过骨架，按真实占地折算块数并**停止下钻**。
   */
  footprint?: SubtreeFootprintResolver
}

/**
 * 估算节点尺寸。
 *
 * **必须与 `../mindmap-layout` 的同名实现保持完全一致**——两处各写一份是历史遗留，
 * 一旦漂移，思维导图与其它骨架的节点尺寸就会不一样。数值口径见那边的注释。
 */
export function estimateNodeSize(topic: TopicSnapshot, depth: number) {
  const textLength = topic.text.trim().length || 1
  const metrics =
    depth === 0
      ? { fontSize: 20, lineHeight: 27, padX: 22, padY: 20, minW: 160, maxW: 320, charW: 19 }
      : depth === 1
        ? { fontSize: 14, lineHeight: 19, padX: 14, padY: 11, minW: 100, maxW: 250, charW: 13 }
        : { fontSize: 13, lineHeight: 18, padX: 12, padY: 9, minW: 90, maxW: 220, charW: 12 }

  // 字号覆盖 → 字宽与行高按同一比例缩放（口径与 `../mindmap-layout` 完全一致）
  const fontScale = getFontScale(topic.styleOverrides?.fontSize, metrics.fontSize)
  const charW = metrics.charW * fontScale
  const lineHeight = Math.round(metrics.lineHeight * fontScale)

  // 节点级固定宽度（XMind 样式页的「宽度」）：设了就照用，不再按文字自适应
  const fixedWidth = topic.styleOverrides?.width
  const width =
    typeof fixedWidth === 'number' && fixedWidth > 0
      ? Math.min(MAX_FIXED_WIDTH, Math.max(MIN_FIXED_WIDTH, Math.round(fixedWidth)))
      : Math.min(
          metrics.maxW,
          Math.max(metrics.minW, Math.round(textLength * charW + metrics.padX * 2)),
        )
  const usable = Math.max(1, width - metrics.padX * 2)
  const lineCount = Math.max(1, Math.ceil((textLength * charW) / usable))
  const height = metrics.padY * 2 + lineCount * lineHeight

  return { width, height }
}

/** 度量子树：叶子数量（用于垂直分配空间）。 */
export function measureSubtree(
  topic: TopicSnapshot,
  ctx: BlockContext = { leafBlock: 80 },
): SubtreeMetrics {
  // 换过骨架的子树：按真实占地折算等价块数，**不再往下钻**——
  // 更深的覆盖已由那次子树布局自己消化，父骨架看到的是一个黑盒。
  const footprint = ctx.footprint?.(topic.id)
  if (footprint) {
    return { leafCount: footprintBlocks(footprintHalfHeight(footprint), ctx.leafBlock) }
  }

  if (topic.collapsed || topic.children.length === 0) {
    return { leafCount: 1 }
  }

  return {
    leafCount: topic.children.reduce(
      (sum, child) => sum + measureSubtree(child, ctx).leafCount,
      0,
    ),
  }
}

/** 计算一组兄弟子树的总高度。 */
export function computeSubtreeHeight(
  children: TopicSnapshot[],
  leafBlock: number,
  gap: number,
): number {
  if (children.length === 0) {
    return leafBlock
  }
  const totalLeafCount = children.reduce(
    (sum, child) => sum + measureSubtree(child).leafCount,
    0,
  )
  return totalLeafCount * leafBlock + (children.length - 1) * gap
}

/**
 * 创建贝塞尔边几何。
 * side='right'：从父节点右侧到子节点左侧（水平方向）。
 * side='left'：从父节点左侧到子节点右侧（水平方向，镜像）。
 * side='center'：从父节点底部到子节点顶部（垂直方向）。
 */
export function createEdgeGeometry(
  parent: MindMapNodeLayout,
  child: MindMapNodeLayout,
  side: Exclude<LayoutSide, 'center'>,
): Omit<MindMapEdgeLayout, 'id' | 'parentId' | 'childId'> {
  const startX = side === 'right' ? parent.x + parent.width / 2 : parent.x - parent.width / 2
  const endX = side === 'right' ? child.x - child.width / 2 : child.x + child.width / 2
  const controlOffset = Math.max(48, Math.abs(endX - startX) * 0.42)
  const control1X = side === 'right' ? startX + controlOffset : startX - controlOffset
  const control2X = side === 'right' ? endX - controlOffset : endX + controlOffset

  return {
    side,
    path: `M ${startX} ${parent.y} C ${control1X} ${parent.y}, ${control2X} ${child.y}, ${endX} ${child.y}`,
    start: { x: startX, y: parent.y },
    end: { x: endX, y: child.y },
    control1: { x: control1X, y: parent.y },
    control2: { x: control2X, y: child.y },
  }
}

/**
 * 创建垂直贝塞尔边几何（用于 Tree / Org 布局）。
 * 从父节点底部到子节点顶部。
 */
export function createVerticalEdgeGeometry(
  parent: MindMapNodeLayout,
  child: MindMapNodeLayout,
): Omit<MindMapEdgeLayout, 'id' | 'parentId' | 'childId'> {
  const startX = parent.x
  const endX = child.x
  const startY = parent.y + parent.height / 2
  const endY = child.y - child.height / 2
  const controlOffset = Math.max(36, Math.abs(endY - startY) * 0.42)
  const control1Y = startY + controlOffset
  const control2Y = endY - controlOffset

  return {
    side: 'right', // 复用 right 的渲染样式（非 center 即可）
    path: `M ${startX} ${startY} C ${startX} ${control1Y}, ${endX} ${control2Y}, ${endX} ${endY}`,
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    control1: { x: startX, y: control1Y },
    control2: { x: endX, y: control2Y },
  }
}

/**
 * 创建直线边几何（用于 Fishbone / Timeline 布局）。
 * 控制点设为起止点，使贝塞尔退化为直线。
 */
export function createStraightEdgeGeometry(
  parent: MindMapNodeLayout,
  child: MindMapNodeLayout,
): Omit<MindMapEdgeLayout, 'id' | 'parentId' | 'childId'> {
  const startX = parent.x
  const startY = parent.y
  const endX = child.x
  const endY = child.y

  return {
    side: 'right',
    path: `M ${startX} ${startY} L ${endX} ${endY}`,
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    control1: { x: startX, y: startY },
    control2: { x: endX, y: endY },
  }
}

/** 计算布局结果的包围盒并生成偏移量，使所有节点位于正坐标空间。 */
export function computeLayoutBounds(
  nodes: MindMapNodeLayout[],
  paddingX: number,
  paddingY: number,
): { width: number; height: number; offsetX: number; offsetY: number } {
  if (nodes.length === 0) {
    return { width: paddingX * 2, height: paddingY * 2, offsetX: paddingX, offsetY: paddingY }
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.width / 2)
    maxX = Math.max(maxX, node.x + node.width / 2)
    minY = Math.min(minY, node.y - node.height / 2)
    maxY = Math.max(maxY, node.y + node.height / 2)
  }

  return {
    width: maxX - minX + paddingX * 2,
    height: maxY - minY + paddingY * 2,
    offsetX: paddingX - minX,
    offsetY: paddingY - minY,
  }
}
