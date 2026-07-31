/**
 * Render Tree：文档模型到可视场景的投影。
 *
 * Scene Builder 从布局结果 + 文档状态生成 Render Tree；
 * Canvas 2D Renderer 按层级遍历 Render Tree 绘制到 <canvas>。
 * 视口剔除在 Scene Builder 阶段完成，只有可见节点进入 Render Tree。
 */

// ---- 图层定义（z-order 从低到高）----

export const RENDER_LAYERS = [
  'background',
  'boundary',
  'edge',
  'summary',
  'topic',
  'relationship',
  'overlay',
] as const

export type RenderLayer = (typeof RENDER_LAYERS)[number]

export const LAYER_Z_ORDER: Record<RenderLayer, number> = {
  background: 0,
  boundary: 1,
  edge: 2,
  summary: 3,
  topic: 4,
  relationship: 5,
  overlay: 6,
}

// ---- 基础类型 ----

export interface WorldRect {
  x: number
  y: number
  width: number
  height: number
}

export interface WorldPoint {
  x: number
  y: number
}

export type NodeSide = 'left' | 'right' | 'center'

// ---- Render Node 联合类型 ----

/** 主题节点解析后的具体样式属性（由 style-resolver 计算，注入 TopicRenderNode）。 */
export interface ResolvedTopicStyle {
  fill: string
  textColor: string
  metaTextColor: string
  borderColor: string
}

export interface TopicRenderNode {
  type: 'topic'
  id: string
  layer: RenderLayer
  bounds: WorldRect
  text: string
  depth: number
  side: NodeSide
  collapsed: boolean
  childCount: number
  state: TopicVisualState
  /** 解析后的样式（主题 + 节点覆盖合并结果）。 */
  style: ResolvedTopicStyle
}

export interface TopicVisualState {
  isActive: boolean
  isSelected: boolean
  isEditing: boolean
  isSearchMatch: boolean
  isActiveSearchResult: boolean
  isHistoryFocus: boolean
  isDropTarget: boolean
  isDragging: boolean
}

export interface EdgeRenderNode {
  type: 'edge'
  id: string
  layer: RenderLayer
  /** 包围盒用于视口剔除（保守估计）。 */
  bounds: WorldRect
  parentId: string
  childId: string
  start: WorldPoint
  end: WorldPoint
  control1: WorldPoint
  control2: WorldPoint
  isActive: boolean
}

export interface SelectionBoxRenderNode {
  type: 'selection-box'
  id: string
  layer: RenderLayer
  bounds: WorldRect
}

export interface DropIndicatorRenderNode {
  type: 'drop-indicator'
  id: string
  layer: RenderLayer
  bounds: WorldRect
  label: string
}

export interface DragPreviewRenderNode {
  type: 'drag-preview'
  id: string
  layer: RenderLayer
  bounds: WorldRect
  text: string
  depth: number
  side: NodeSide
  /** 解析后的样式（跟随被拖拽主题的主题/覆盖）。 */
  style: ResolvedTopicStyle
}

/** 关系线渲染节点：两个主题中心之间的非父子连接。 */
export interface RelationshipRenderNode {
  type: 'relationship'
  id: string
  layer: RenderLayer
  /** 包围盒（用于视口剔除）。 */
  bounds: WorldRect
  from: WorldPoint
  to: WorldPoint
  label: string | null
}

/** 边界渲染节点：框选一组主题的圆角矩形。 */
export interface BoundaryRenderNode {
  type: 'boundary'
  id: string
  layer: RenderLayer
  bounds: WorldRect
  label: string | null
}

/** 概要渲染节点：对一组主题的归纳，附括号与标签。 */
export interface SummaryRenderNode {
  type: 'summary'
  id: string
  layer: RenderLayer
  bounds: WorldRect
  label: string
  /** 括号锚点（通常在成员包围盒右侧）。 */
  anchor: WorldPoint
}

export type RenderNode =
  | TopicRenderNode
  | EdgeRenderNode
  | SelectionBoxRenderNode
  | DropIndicatorRenderNode
  | DragPreviewRenderNode
  | RelationshipRenderNode
  | BoundaryRenderNode
  | SummaryRenderNode

/** Render Tree 场景：一组按层分组的渲染节点 + 世界包围盒。 */
export interface Scene {
  nodes: RenderNode[]
  /** 所有节点的世界包围盒（用于 fit-to-view）。 */
  worldBounds: WorldRect
  /** 场景在画布坐标系中的偏移（来自布局）。 */
  offsetX: number
  offsetY: number
}

// ---- 视口 ----

export interface Viewport {
  width: number
  height: number
}

export interface CameraProjection {
  x: number
  y: number
  zoom: number
}

/** 将世界坐标转换为画布坐标（考虑 camera 平移 + 缩放）。 */
export function projectWorldToScreen(
  world: WorldPoint,
  camera: CameraProjection,
): WorldPoint {
  return {
    x: world.x * camera.zoom + camera.x,
    y: world.y * camera.zoom + camera.y,
  }
}

/** 将画布坐标转换为世界坐标。 */
export function unprojectScreenToWorld(
  screen: WorldPoint,
  camera: CameraProjection,
): WorldPoint {
  return {
    x: (screen.x - camera.x) / camera.zoom,
    y: (screen.y - camera.y) / camera.zoom,
  }
}

/** 计算相机可视区域在世界坐标系中的矩形（用于视口剔除）。 */
export function computeViewportWorldRect(
  viewport: Viewport,
  camera: CameraProjection,
): WorldRect {
  const topLeft = unprojectScreenToWorld({ x: 0, y: 0 }, camera)
  const bottomRight = unprojectScreenToWorld(
    { x: viewport.width, y: viewport.height },
    camera,
  )
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }
}

/** 两个世界矩形是否相交（含边界）。 */
export function rectsIntersect(a: WorldRect, b: WorldRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

/** 扩展矩形边界以包含 Overscan 边距。 */
export function expandRect(rect: WorldRect, margin: number): WorldRect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  }
}

/** 计算一组节点的包围盒。 */
export function computeNodesBounds(nodes: { bounds: WorldRect }[]): WorldRect {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.bounds.x)
    minY = Math.min(minY, node.bounds.y)
    maxX = Math.max(maxX, node.bounds.x + node.bounds.width)
    maxY = Math.max(maxY, node.bounds.y + node.bounds.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
