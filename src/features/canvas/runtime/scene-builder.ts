/**
 * Scene Builder：布局结果 + 文档状态 → Render Tree（Scene）。
 *
 * 职责：
 * 1. 将布局节点/边转换为 RenderNode（投影域模型到可视模型）。
 * 2. 视口剔除（虚拟化）：只保留与可视区域相交的节点（含 Overscan 边距）。
 * 3. 叠加交互覆盖层（选择框、拖拽预览、放置指示器）。
 *
 * Scene Builder 是纯函数，无副作用，每帧由 React 组件调用。
 */

import type { MindMapEdgeLayout, MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import type { Boundary, Relationship, SummaryNode, TopicStyleOverrides } from '../../../lib/document/types'
import { resolveTopicStyle } from './style-resolver'
import { getBranchColor } from './style-constants'
import {
  expandRect,
  rectsIntersect,
  type BoundaryRenderNode,
  type CameraProjection,
  type DragPreviewRenderNode,
  type DropIndicatorRenderNode,
  type EdgeRenderNode,
  type RelationshipRenderNode,
  type RenderNode,
  type Scene,
  type SelectionBoxRenderNode,
  type SummaryRenderNode,
  type TopicRenderNode,
  type TopicVisualState,
  type Viewport,
  type WorldPoint,
  type WorldRect,
} from './render-tree'
import { computeViewportWorldRect } from './render-tree'

/** 视口剔除的 Overscan 边距（世界坐标）。 */
const VIEWPORT_OVERSCAN = 200

/** 拖拽预览/选择框等覆盖层的 z-order 边距。 */
const OVERLAY_BOUNDS_PADDING = 40

export interface TopicVisualStates {
  activeTopicId: string | null
  selectedTopicIds: Set<string>
  editingTopicId: string | null
  searchMatchedTopicIds: Set<string>
  activeSearchTopicId: string | null
  historyFocusTopicId: string | null
  dropTargetTopicId: string | null
  draggingTopicId: string | null
}

export interface InteractionOverlays {
  selectionBox: WorldRect | null
  dragPreview: {
    topicId: string
    text: string
    depth: number
    side: 'left' | 'right' | 'center'
    bounds: WorldRect
    styleOverrides?: TopicStyleOverrides
  } | null
  dropIndicator: {
    bounds: WorldRect
    label: string
  } | null
}

export interface BuildSceneOptions {
  layout: MindMapLayoutResult
  viewport: Viewport
  camera: CameraProjection
  visualStates: TopicVisualStates
  overlays: InteractionOverlays
  /** 文档级关系线（跨工作表，可选）。 */
  relationships?: Relationship[]
  /** 当前工作表的边界（可选）。 */
  boundaries?: Boundary[]
  /** 当前工作表的概要（可选）。 */
  summaries?: SummaryNode[]
  /** 文档主题 ID（用于样式解析）。缺省使用 classic-blue。 */
  themeId?: string
  /** 是否启用视口剔除（虚拟化）。测试或全量导出时可关闭。 */
  enableCulling?: boolean
}

/**
 * 从布局结果构建场景（Render Tree）。
 * 纯函数：相同输入产生相同输出。
 */
export function buildScene(options: BuildSceneOptions): Scene {
  const { layout, viewport, camera, visualStates, overlays } = options
  const enableCulling = options.enableCulling ?? true

  const cullRect = enableCulling
    ? expandRect(computeViewportWorldRect(viewport, camera), VIEWPORT_OVERSCAN)
    : null

  // 布局节点查找表：topicId → layoutNode（用于计算关系线/边界/概要的坐标）
  const layoutNodeMap = new Map<string, MindMapNodeLayout>()
  for (const node of layout.nodes) {
    layoutNodeMap.set(node.id, node)
  }

  // 分支色映射：根的每个直接子节点分配一个分支索引，其所有后代继承该索引。
  // 用于 XMind 式多色分支编码（每条主分支不同色的连线）。
  const branchIndexMap = buildBranchIndexMap(layout.nodes)

  const nodes: RenderNode[] = []

  // 边界（z-order 最低，在边之前）
  if (options.boundaries) {
    for (const boundary of options.boundaries) {
      const renderNode = boundaryToRenderNode(boundary, layoutNodeMap, layout.offsetX, layout.offsetY)
      if (!renderNode) continue
      if (cullRect && !rectsIntersect(renderNode.bounds, cullRect)) continue
      nodes.push(renderNode)
    }
  }

  // 边（在节点之前，因为 z-order 更低）
  for (const edge of layout.edges) {
    const edgeBounds = computeEdgeBounds(edge)
    if (cullRect && !rectsIntersect(edgeBounds, cullRect)) {
      continue
    }
    const childIsActive = edge.childId === visualStates.activeTopicId
    const childNode = layoutNodeMap.get(edge.childId)
    const childDepth = childNode?.depth ?? 1
    const branchIndex = branchIndexMap.get(edge.childId) ?? 0
    nodes.push(
      edgeToRenderNode(
        edge,
        edgeBounds,
        childIsActive,
        childDepth,
        getBranchColor(branchIndex),
      ),
    )
  }

  // 概要（在边之后、主题之前）
  if (options.summaries) {
    for (const summary of options.summaries) {
      const renderNode = summaryToRenderNode(summary, layoutNodeMap, layout.offsetX, layout.offsetY)
      if (!renderNode) continue
      if (cullRect && !rectsIntersect(renderNode.bounds, cullRect)) continue
      nodes.push(renderNode)
    }
  }

  // 主题节点
  for (const layoutNode of layout.nodes) {
    const bounds = layoutNodeToBounds(layoutNode, layout.offsetX, layout.offsetY)
    if (cullRect && !rectsIntersect(bounds, cullRect)) {
      continue
    }
    nodes.push(topicToRenderNode(layoutNode, bounds, visualStates, options.themeId))
  }

  // 关系线（在主题之后，z-order 更高）
  if (options.relationships) {
    for (const relationship of options.relationships) {
      const renderNode = relationshipToRenderNode(
        relationship,
        layoutNodeMap,
        layout.offsetX,
        layout.offsetY,
      )
      if (!renderNode) continue
      if (cullRect && !rectsIntersect(renderNode.bounds, cullRect)) continue
      nodes.push(renderNode)
    }
  }

  // 覆盖层
  if (overlays.selectionBox) {
    nodes.push(selectionBoxToRenderNode(overlays.selectionBox))
  }
  if (overlays.dropIndicator) {
    nodes.push(dropIndicatorToRenderNode(overlays.dropIndicator))
  }
  if (overlays.dragPreview) {
    nodes.push(dragPreviewToRenderNode(overlays.dragPreview, options.themeId))
  }

  // 世界包围盒（从布局计算，不受视口剔除影响）
  const layoutBounds: WorldRect = {
    x: 0,
    y: 0,
    width: layout.width,
    height: layout.height,
  }

  return {
    nodes,
    worldBounds: layoutBounds,
    offsetX: layout.offsetX,
    offsetY: layout.offsetY,
  }
}

// ---- 转换函数 ----

function layoutNodeToBounds(
  node: MindMapNodeLayout,
  offsetX: number,
  offsetY: number,
): WorldRect {
  return {
    x: node.x - node.width / 2 + offsetX,
    y: node.y - node.height / 2 + offsetY,
    width: node.width,
    height: node.height,
  }
}

function computeEdgeBounds(edge: MindMapEdgeLayout): WorldRect {
  const xs = [edge.start.x, edge.end.x, edge.control1.x, edge.control2.x]
  const ys = [edge.start.y, edge.end.y, edge.control1.y, edge.control2.y]
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function topicToRenderNode(
  layoutNode: MindMapNodeLayout,
  bounds: WorldRect,
  states: TopicVisualStates,
  themeId: string | undefined,
): TopicRenderNode {
  const id = layoutNode.id
  const visualState: TopicVisualState = {
    isActive: id === states.activeTopicId,
    isSelected: states.selectedTopicIds.has(id),
    isEditing: id === states.editingTopicId,
    isSearchMatch: states.searchMatchedTopicIds.has(id),
    isActiveSearchResult: id === states.activeSearchTopicId,
    isHistoryFocus: id === states.historyFocusTopicId,
    isDropTarget: id === states.dropTargetTopicId,
    isDragging: id === states.draggingTopicId,
  }

  const style = resolveTopicStyle(
    themeId,
    layoutNode.depth,
    layoutNode.side,
    layoutNode.topic.styleOverrides,
  )

  return {
    type: 'topic',
    id,
    layer: 'topic',
    bounds,
    text: layoutNode.topic.text,
    depth: layoutNode.depth,
    side: layoutNode.side,
    collapsed: layoutNode.topic.collapsed,
    childCount: layoutNode.topic.children.length,
    state: visualState,
    style,
  }
}

function edgeToRenderNode(
  edge: MindMapEdgeLayout,
  bounds: WorldRect,
  isActive: boolean,
  childDepth: number,
  branchColor: string,
): EdgeRenderNode {
  return {
    type: 'edge',
    id: edge.id,
    layer: 'edge',
    bounds,
    parentId: edge.parentId,
    childId: edge.childId,
    start: edge.start,
    end: edge.end,
    control1: edge.control1,
    control2: edge.control2,
    isActive,
    childDepth,
    branchColor,
  }
}

/**
 * 构建分支索引映射：根的每个直接子节点分配递增索引（0,1,2,...），
 * 其所有后代继承该索引。用于多色分支编码。
 *
 * 遍历方式：先找到根节点（depth=0），然后按子节点顺序分配索引并 DFS 传播。
 */
function buildBranchIndexMap(nodes: MindMapNodeLayout[]): Map<string, number> {
  const map = new Map<string, number>()
  const nodeById = new Map<string, MindMapNodeLayout>()
  for (const node of nodes) {
    nodeById.set(node.id, node)
  }

  // 找到根节点
  const root = nodes.find((n) => n.depth === 0)
  if (!root) return map

  // 根的直接子节点按布局顺序分配分支索引，DFS 传播给后代
  let branchIndex = 0
  for (const child of root.topic.children) {
    const index = branchIndex++
    propagateBranchIndex(child.id, index, nodeById, map)
  }

  return map
}

/** DFS 传播分支索引到整棵子树。 */
function propagateBranchIndex(
  topicId: string,
  index: number,
  nodeById: Map<string, MindMapNodeLayout>,
  map: Map<string, number>,
): void {
  map.set(topicId, index)
  const node = nodeById.get(topicId)
  if (!node) return
  for (const child of node.topic.children) {
    propagateBranchIndex(child.id, index, nodeById, map)
  }
}

function selectionBoxToRenderNode(rect: WorldRect): SelectionBoxRenderNode {
  return {
    type: 'selection-box',
    id: '__selection_box__',
    layer: 'overlay',
    bounds: rect,
  }
}

function dropIndicatorToRenderNode(indicator: {
  bounds: WorldRect
  label: string
}): DropIndicatorRenderNode {
  return {
    type: 'drop-indicator',
    id: '__drop_indicator__',
    layer: 'overlay',
    bounds: expandRect(indicator.bounds, OVERLAY_BOUNDS_PADDING),
    label: indicator.label,
  }
}

function dragPreviewToRenderNode(
  preview: {
    topicId: string
    text: string
    depth: number
    side: 'left' | 'right' | 'center'
    bounds: WorldRect
    styleOverrides?: TopicStyleOverrides
  },
  themeId: string | undefined,
): DragPreviewRenderNode {
  return {
    type: 'drag-preview',
    id: `__drag_preview_${preview.topicId}__`,
    layer: 'overlay',
    bounds: preview.bounds,
    text: preview.text,
    depth: preview.depth,
    side: preview.side,
    style: resolveTopicStyle(themeId, preview.depth, preview.side, preview.styleOverrides),
  }
}

// ---- 装饰元素转换（关系线 / 边界 / 概要）----

/** 计算主题在世界坐标系中的中心点。 */
function topicCenter(
  nodeId: string,
  layoutNodeMap: Map<string, MindMapNodeLayout>,
  offsetX: number,
  offsetY: number,
): WorldPoint | null {
  const node = layoutNodeMap.get(nodeId)
  if (!node) return null
  return { x: node.x + offsetX, y: node.y + offsetY }
}

/** 计算一组主题在世界坐标系中的包围盒。 */
function topicGroupBounds(
  topicIds: string[],
  layoutNodeMap: Map<string, MindMapNodeLayout>,
  offsetX: number,
  offsetY: number,
): WorldRect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let found = 0
  for (const id of topicIds) {
    const node = layoutNodeMap.get(id)
    if (!node) continue
    found++
    const left = node.x - node.width / 2 + offsetX
    const top = node.y - node.height / 2 + offsetY
    const right = left + node.width
    const bottom = top + node.height
    minX = Math.min(minX, left)
    minY = Math.min(minY, top)
    maxX = Math.max(maxX, right)
    maxY = Math.max(maxY, bottom)
  }
  if (found === 0) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function relationshipToRenderNode(
  relationship: Relationship,
  layoutNodeMap: Map<string, MindMapNodeLayout>,
  offsetX: number,
  offsetY: number,
): RelationshipRenderNode | null {
  const from = topicCenter(relationship.fromTopicId, layoutNodeMap, offsetX, offsetY)
  const to = topicCenter(relationship.toTopicId, layoutNodeMap, offsetX, offsetY)
  if (!from || !to) return null

  const minX = Math.min(from.x, to.x)
  const minY = Math.min(from.y, to.y)
  const maxX = Math.max(from.x, to.x)
  const maxY = Math.max(from.y, to.y)

  return {
    type: 'relationship',
    id: relationship.id,
    layer: 'relationship',
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    from,
    to,
    label: relationship.label ?? null,
  }
}

function boundaryToRenderNode(
  boundary: Boundary,
  layoutNodeMap: Map<string, MindMapNodeLayout>,
  offsetX: number,
  offsetY: number,
): BoundaryRenderNode | null {
  const bounds = topicGroupBounds(boundary.topicIds, layoutNodeMap, offsetX, offsetY)
  if (!bounds) return null

  return {
    type: 'boundary',
    id: boundary.id,
    layer: 'boundary',
    bounds,
    label: boundary.label ?? null,
  }
}

function summaryToRenderNode(
  summary: SummaryNode,
  layoutNodeMap: Map<string, MindMapNodeLayout>,
  offsetX: number,
  offsetY: number,
): SummaryRenderNode | null {
  const bounds = topicGroupBounds(summary.topicIds, layoutNodeMap, offsetX, offsetY)
  if (!bounds) return null

  // 括号锚点在成员包围盒右侧中点
  const anchor: WorldPoint = {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height / 2,
  }

  return {
    type: 'summary',
    id: summary.id,
    layer: 'summary',
    bounds,
    label: summary.label,
    anchor,
  }
}
