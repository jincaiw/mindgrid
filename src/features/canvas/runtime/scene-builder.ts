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
import type {
  Boundary,
  CanvasIllustration,
  EdgeEndpoint,
  Relationship,
  SheetBranchStyle,
  SummaryNode,
  TopicStyleOverrides,
} from '../../../lib/document/types'
import { resolveTopicStyleFrom } from './style-resolver'
import type { ThemePalette } from '../../../lib/document/themes'
import {
  branchThicknessMultiplier,
  type DocumentCanvasSettings,
} from '../../../lib/document/canvas-settings'
import { getEdgeLineWidth } from './style-constants'
import {
  expandRect,
  rectsIntersect,
  type BoundaryRenderNode,
  type CameraProjection,
  type DragPreviewRenderNode,
  type DropIndicatorRenderNode,
  type EdgeRenderNode,
  type IllustrationRenderNode,
  type RelationshipRenderNode,
  type RenderNode,
  type Scene,
  type SelectionBoxRenderNode,
  type SummaryRenderNode,
  type TopicEquationRender,
  type TopicRenderNode,
  type TopicVisualState,
  type Viewport,
  type WorldPoint,
  type WorldRect,
} from './render-tree'
import { computeViewportWorldRect } from './render-tree'
import { hasTopicEquation } from '../../../lib/document/equation'
import { topicEquationKey } from './topic-equation-store'

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
  /**
   * 画布级插画（不依附主题的浮动装饰）。
   *
   * 位置是**布局坐标系**，本模块统一加 `layout.offset`——与 `layoutNodeToBounds`
   * / `offsetEdge` 同一套约定；不这么干的话画布一平移，插画就会和内容分离。
   */
  illustrations?: readonly CanvasIllustration[]
  /**
   * **当前生效的主题**（画布级分支色板已叠加进去）。
   *
   * ⚠️ 由调用方用 `resolveEffectiveTheme({ themeId, branchStyle, canvasSettings })` 解析后传入，
   * 本模块**不再自己决定用什么色板**。这是刻意的：调色板的优先级逻辑原先在这里，
   * 结果只有连线读它、节点样式漏了 —— 同一幅图里"节点单色、连线彩虹"。
   * 收成"一个入参"之后，节点与连线在**类型层面**不可能用不同来源。
   */
  theme: ThemePalette
  /** 画布级分支样式（连线类型/粗细/分支色板），缺省回退到默认。 */
  branchStyle?: SheetBranchStyle
  /**
   * 文档级画布设置（彩虹分支开关 / 色板 / 粗细）。
   *
   * 由调用方从 `document.settings` 解析后传入——Scene 层不认识 settings 的
   * 存储格式，只认解析结果。屏幕与导出必须传同一份，否则两端分支色不同。
   */
  canvasSettings?: DocumentCanvasSettings
  /**
   * 主题编号映射（topicId → 形如 "1.2"）。
   * 由调用方用 `buildTopicNumbers()` 从画布 numbering 配置算出并传入——
   * Scene 层不认识编号配置，只认派生结果，屏幕与导出必须传同一份。
   */
  numberMap?: Map<string, string>
  /** 是否启用视口剔除（虚拟化）。测试或全量导出时可关闭。 */
  enableCulling?: boolean
  /**
   * 主题图片解析结果：topicId → data URL。
   *
   * 只有导出路径需要携带它（DOM 渲染走 React 侧的 useTopicImageUrls Hook，
   * 不经过 Scene）。缺省时主题不携带 image 字段，渲染端行为与改动前完全一致。
   */
  topicImageUrls?: Record<string, string>
  /**
   * 方程渲染结果：缓存键（`inline:latex` / `display:latex`）→ 已渲染的 SVG 与尺寸。
   *
   * 与 `topicImageUrls` 同理，只在需要时携带；DOM 侧由 `useTopicEquations` 填充，
   * 导出侧由 `resolveTopicEquations` 填充。**缺省时主题不携带 equation 字段**，
   * 渲染端行为与改动前一致。
   */
  topicEquations?: Record<string, TopicEquationRender>
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

  // 画布级分支样式解析：edgeType / thickness / colorPalette
  const branchStyle = options.branchStyle
  const canvasSettings = options.canvasSettings
  const resolvedEdgeType: 'curve' | 'straight' | 'elbow' = branchStyle?.edgeType ?? 'curve'
  const resolvedEndpoint: EdgeEndpoint = branchStyle?.endpoint ?? 'none'
  // 粗细：画布页下拉（离散档位）与样式页滑杆（连续值）写的是同一个字段。
  // 滑杆值为空时取画布设置的档位，二者不叠加——否则两处控件会互相放大。
  const thicknessMultiplier =
    branchStyle?.thickness ??
    (canvasSettings ? branchThicknessMultiplier(canvasSettings.branchThickness) : 1)
  // 生效主题由调用方解析（见 BuildSceneOptions.theme）。
  // 这里的色板就是**渲染要用的那一份**：连线与节点同源，不需要在这里再判断优先级。
  const theme = options.theme
  const palette =
    theme.branchPalette && theme.branchPalette.length > 0 ? theme.branchPalette : null

  /** 按分支索引取色。无色板（单色分支）时统一用主题连线色。 */
  const resolveBranchColor = (branchIndex: number): string =>
    palette === null ? theme.edge : palette[branchIndex % palette.length]

  /**
   * 节点级分支线条颜色（XMind 样式页「分支 → 线条颜色」）。
   *
   * 语义是**整条分支**：从该边的子主题往上找最近的、设了 `branchColor` 的祖先
   * （含子主题自己），用它的颜色。找"最近"而不是"根的一级子节点"，
   * 才能让深层节点单独改色时只影响自己那一段。
   */
  const parentOf = new Map<string, string>()
  for (const rawEdge of layout.edges) {
    parentOf.set(rawEdge.childId, rawEdge.parentId)
  }
  const resolveBranchColorOverride = (childId: string): string | null => {
    let currentId: string | undefined = childId
    while (currentId) {
      const color = layoutNodeMap.get(currentId)?.topic.styleOverrides?.branchColor
      if (color && color.trim() !== '') {
        return color
      }
      currentId = parentOf.get(currentId)
    }
    return null
  }

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
  //
  // 布局产出的边几何是**根主题相对坐标**（未含 offset），而节点在下面会被
  // `layoutNodeToBounds` 加上 offset。二者必须一起平移，否则连线会整体偏出
  // 半个画布——屏幕、PNG、PDF 三端都会错位（三端共用本函数，所以 parity 对比
  // 也发现不了，只能靠「边端点必须落在父/子节点边界上」这类不变量测试守）。
  for (const rawEdge of layout.edges) {
    const edge = offsetEdge(rawEdge, layout.offsetX, layout.offsetY)
    const edgeBounds = computeEdgeBounds(edge)
    if (cullRect && !rectsIntersect(edgeBounds, cullRect)) {
      continue
    }
    const childIsActive = edge.childId === visualStates.activeTopicId
    const childNode = layoutNodeMap.get(edge.childId)
    const childDepth = childNode?.depth ?? 1
    const branchIndex = branchIndexMap.get(edge.childId) ?? 0
    const baseLineWidth = getEdgeLineWidth(childDepth, childIsActive)
    const finalLineWidth = Math.max(0.5, baseLineWidth * thicknessMultiplier)
    // 节点级线条颜色覆盖分支色板；没设才回落到色板
    const branchColor = resolveBranchColorOverride(edge.childId) ?? resolveBranchColor(branchIndex)
    nodes.push(
      edgeToRenderNode(
        edge,
        edgeBounds,
        childIsActive,
        childDepth,
        branchColor,
        resolvedEdgeType,
        finalLineWidth,
        resolvedEndpoint,
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
    nodes.push(
      topicToRenderNode(
        layoutNode,
        bounds,
        visualStates,
        theme,
        options.topicImageUrls,
        options.topicEquations,
        branchIndexMap,
        options.numberMap,
      ),
    )
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

  // 插画（画布级装饰：z-order 高于主题与关系线，低于交互覆盖层）
  if (options.illustrations) {
    for (const illustration of options.illustrations) {
      const renderNode = illustrationToRenderNode(
        illustration,
        layout.offsetX,
        layout.offsetY,
      )
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
    nodes.push(dragPreviewToRenderNode(overlays.dragPreview, theme))
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

/** 将边几何从布局坐标系平移到场景坐标系（与节点边界同一坐标系）。 */
function offsetEdge(
  edge: MindMapEdgeLayout,
  offsetX: number,
  offsetY: number,
): MindMapEdgeLayout {
  return {
    ...edge,
    start: { x: edge.start.x + offsetX, y: edge.start.y + offsetY },
    end: { x: edge.end.x + offsetX, y: edge.end.y + offsetY },
    control1: { x: edge.control1.x + offsetX, y: edge.control1.y + offsetY },
    control2: { x: edge.control2.x + offsetX, y: edge.control2.y + offsetY },
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

/**
 * 画布级插画 → 渲染节点。
 *
 * 中心点 = 存储的布局坐标 + `layout.offset`。**必须与节点/连线一起平移**
 * （铁律：连线几何必须随 layout.offset 平移），否则画布一平移插画就掉队。
 */
function illustrationToRenderNode(
  illustration: CanvasIllustration,
  offsetX: number,
  offsetY: number,
): IllustrationRenderNode {
  const cx = illustration.x + offsetX
  const cy = illustration.y + offsetY
  const half = illustration.size / 2
  return {
    type: 'illustration',
    id: illustration.id,
    layer: 'illustration',
    bounds: {
      x: cx - half,
      y: cy - half,
      width: illustration.size,
      height: illustration.size,
    },
    cx,
    cy,
    size: illustration.size,
    illustrationId: illustration.illustrationId,
  }
}

function topicToRenderNode(
  layoutNode: MindMapNodeLayout,
  bounds: WorldRect,
  states: TopicVisualStates,
  theme: ThemePalette,
  topicImageUrls: Record<string, string> | undefined,
  topicEquations: Record<string, TopicEquationRender> | undefined,
  branchIndexMap: Map<string, number>,
  numberMap?: Map<string, string>,
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

  const style = resolveTopicStyleFrom(
    theme,
    layoutNode.depth,
    layoutNode.side,
    layoutNode.topic.styleOverrides,
    // 分支索引用于按分支取色；根节点与未知节点传 null 走单色。
    // 色板已经叠在 theme 里，所以这里取到的填充色**就是**该分支连线的颜色。
    branchIndexMap.get(id) ?? null,
  )

  // 富内容投影：仅当存在任意 meta 字段时携带，避免空对象污染渲染端判断
  const topic = layoutNode.topic
  const imageUrl = topicImageUrls?.[id]
  // 方程：只要**文档里有**就生成 rich 字段（哪怕是空对象"还没渲染好"）——
  // 这样 DOM 会先把槽位摆好、标题不会在渲染到达后跳一下；导出端同理，
  // 与图片"解码失败也照样下移标题"是同一个约定。
  const equationRender = hasTopicEquation(topic.equation)
    ? (topicEquations?.[topicEquationKey(topic.equation) ?? ''] ?? {})
    : undefined
  const hasRichContent =
    (topic.markers && topic.markers.length > 0) ||
    // ⚠️ 贴纸必须算进来：这个布尔量决定 rich 是否生成，
    // 漏掉它会让"只贴了贴纸的主题"在导出里完全没有贴纸（屏幕上有、导出没有）
    (topic.stickers && topic.stickers.length > 0) ||
    // ⚠️ 标注必须算进来（同贴纸）：漏掉它会让"只加了标注的主题"在导出里完全没有标注
    topic.callout ||
    (topic.labels && topic.labels.length > 0) ||
    (topic.notes && topic.notes.length > 0) ||
    // ⚠️ 附件与语音备注也必须算进来（与贴纸/标注/方程同一条教训）：
    // 它们是节点 meta 行上的回形针 / 话筒图标，漏掉这里就是
    // "屏幕上有、导出的 PNG / SVG 里没有" —— 实测这两项此前确实双双缺失。
    topic.attachment ||
    topic.voiceNote ||
    topic.link ||
    topic.task ||
    // ⚠️ 方程必须算进来：这个布尔量决定 rich 是否生成，漏掉它会让"只有方程的主题"
    // 在导出里完全没有方程（屏幕上有、导出没有）—— 贴纸/标注都踩过同一条
    equationRender ||
    !!imageUrl
  const rich = hasRichContent
    ? {
        markers: topic.markers?.slice(),
        stickers: topic.stickers?.slice(),
        callout: topic.callout,
        labels: topic.labels?.slice(),
        notes: topic.notes,
        attachment: topic.attachment,
        voiceNote: topic.voiceNote,
        link: topic.link,
        task: topic.task,
        image: imageUrl,
        equation: equationRender,
      }
    : undefined

  return {
    type: 'topic',
    id,
    layer: 'topic',
    bounds,
    text: layoutNode.topic.text,
    number: numberMap?.get(id) ?? null,
    depth: layoutNode.depth,
    side: layoutNode.side,
    collapsed: layoutNode.topic.collapsed,
    childCount: layoutNode.topic.children.length,
    state: visualState,
    style,
    rich,
  }
}

function edgeToRenderNode(
  edge: MindMapEdgeLayout,
  bounds: WorldRect,
  isActive: boolean,
  childDepth: number,
  branchColor: string,
  edgeType: 'curve' | 'straight' | 'elbow',
  lineWidth: number,
  endpoint: EdgeEndpoint,
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
    edgeType,
    lineWidth,
    endpoint,
  }
}

/**
 * 构建分支索引映射：根的每个直接子节点分配递增索引（0,1,2,...），
 * 其所有后代继承该索引。用于多色分支编码。
 *
 * 遍历方式：先找到根节点（depth=0），然后按子节点顺序分配索引并 DFS 传播。
 *
 * 导出给 canvas-host 复用：**屏幕 DOM 与导出渲染必须用同一个实现算索引**，
 * 若各算各的，缤纷主题下屏幕与 PNG/SVG 会分到不同的分支色。
 */
export function buildBranchIndexMap(nodes: MindMapNodeLayout[]): Map<string, number> {
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
  theme: ThemePalette,
): DragPreviewRenderNode {
  return {
    type: 'drag-preview',
    id: `__drag_preview_${preview.topicId}__`,
    layer: 'overlay',
    bounds: preview.bounds,
    text: preview.text,
    depth: preview.depth,
    side: preview.side,
    style: resolveTopicStyleFrom(theme, preview.depth, preview.side, preview.styleOverrides),
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
