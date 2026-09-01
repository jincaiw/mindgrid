/**
 * Canvas 2D Renderer：将 Scene（Render Tree）绘制到 <canvas>。
 *
 * 按 z-order 分层绘制：背景 → 边 → 主题 → 覆盖层。
 * 支持高 DPI（devicePixelRatio）锐利渲染。
 * 纯绘制逻辑，不做布局计算或状态管理。
 *
 * 主题色（背景 / 连线 / 节点填充/文字/边框）由 style-resolver 解析后注入：
 *   - 背景与连线：renderScene 入口解析文档主题 → 传入 drawBackgroundLayer / drawEdge
 *   - 节点样式：TopicRenderNode.style（主题层级色 + 节点覆盖合并结果）
 * 状态环、装饰元素、阴影、切换按钮等语义色仍来自共享 style-constants。
 */

import type { CameraProjection, Scene, Viewport } from './render-tree'
import {
  type BoundaryRenderNode,
  type DragPreviewRenderNode,
  type DropIndicatorRenderNode,
  type EdgeRenderNode,
  type RelationshipRenderNode,
  type ResolvedTopicStyle,
  type SelectionBoxRenderNode,
  type SummaryRenderNode,
  type TopicRenderNode,
} from './render-tree'
import { resolveThemeBackground } from './style-resolver'
import {
  COLORS,
  FONT_FAMILY,
  SELECTION_RADIUS,
  TOGGLE_BUTTON_SIZE,
  TOGGLE_RADIUS,
  getNodeRadiusForShape,
  wrapText,
} from './style-constants'

export interface RenderDPR {
  dpr: number
}

/**
 * 选择性渲染选项。默认全部绘制；可按需关闭某些层。
 * 用于混合渲染（如 Canvas 画边 + DOM 画主题）场景。
 */
export interface RenderOptions {
  /** 是否绘制背景（纯色）。默认 true。 */
  drawBackground?: boolean
  /** 是否绘制主题节点。默认 true。 */
  drawTopics?: boolean
  /** 是否绘制覆盖层（选择框/拖拽预览/放置指示器）。默认 true。 */
  drawOverlays?: boolean
  /** 是否绘制装饰元素（关系线/边界/概要）。默认 true。 */
  drawDecorations?: boolean
  /** 文档主题 ID（用于背景色与连线色解析）。缺省使用 classic-blue。 */
  themeId?: string
}

/**
 * 渲染场景到 Canvas 2D 上下文。
 *
 * @param ctx Canvas 2D 上下文（已按 DPR 缩放）
 * @param scene 场景（Render Tree）
 * @param viewport 视口尺寸（CSS 像素）
 * @param camera 相机状态
 * @param dpr 设备像素比
 * @param options 选择性渲染选项
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  viewport: Viewport,
  camera: CameraProjection,
  dpr: number,
  options: RenderOptions = {},
): void {
  const {
    drawBackground = true,
    drawTopics = true,
    drawOverlays = true,
    drawDecorations = true,
  } = options

  // 解析文档主题的背景色（节点样式已在 SceneBuilder 阶段注入 TopicRenderNode.style）
  const themeBackground = resolveThemeBackground(options.themeId)

  // 清空整个画布（物理像素）
  const pixelWidth = Math.round(viewport.width * dpr)
  const pixelHeight = Math.round(viewport.height * dpr)
  ctx.clearRect(0, 0, pixelWidth, pixelHeight)

  // 绘制背景（屏幕空间，不受 camera 影响）
  if (drawBackground) {
    drawBackgroundLayer(ctx, viewport, dpr, themeBackground)
  }

  // 应用 camera 变换（世界空间）
  ctx.save()
  ctx.scale(dpr, dpr) // 先按 DPR 缩放
  ctx.translate(camera.x, camera.y)
  ctx.scale(camera.zoom, camera.zoom)

  // 按层绘制（z-order 从低到高）：
  // boundary → edge → summary → topic → relationship → overlay
  if (drawDecorations) {
    const boundaries = scene.nodes.filter(
      (n): n is BoundaryRenderNode => n.type === 'boundary',
    )
    for (const boundary of boundaries) {
      drawBoundary(ctx, boundary)
    }
  }

  const edges = scene.nodes.filter((n): n is EdgeRenderNode => n.type === 'edge')
  for (const edge of edges) {
    drawEdge(ctx, edge)
  }

  if (drawDecorations) {
    const summaries = scene.nodes.filter(
      (n): n is SummaryRenderNode => n.type === 'summary',
    )
    for (const summary of summaries) {
      drawSummary(ctx, summary)
    }
  }

  if (drawTopics) {
    const topics = scene.nodes.filter((n): n is TopicRenderNode => n.type === 'topic')
    for (const topic of topics) {
      drawTopic(ctx, topic)
    }
  }

  if (drawDecorations) {
    const relationships = scene.nodes.filter(
      (n): n is RelationshipRenderNode => n.type === 'relationship',
    )
    for (const relationship of relationships) {
      drawRelationship(ctx, relationship)
    }
  }

  if (drawOverlays) {
    const overlays = scene.nodes.filter(
      (n) => n.type === 'selection-box' || n.type === 'drag-preview' || n.type === 'drop-indicator',
    )
    for (const overlay of overlays) {
      drawOverlay(ctx, overlay)
    }
  }

  ctx.restore()
}

// ---- 背景 ----

function drawBackgroundLayer(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  dpr: number,
  bg: { background: string },
): void {
  const w = viewport.width
  const h = viewport.height

  // 主题纯色背景（V1 主题不含渐变，保证 Canvas/SVG/PNG 三端一致）
  // 对齐 XMind：默认无点阵网格，画布为纯净纯色
  ctx.fillStyle = bg.background
  ctx.fillRect(0, 0, w * dpr, h * dpr)
}

// ---- 边 ----

function drawEdge(ctx: CanvasRenderingContext2D, edge: EdgeRenderNode): void {
  // XMind 式多色分支编码：每条分支使用自己的色相，线宽按深度逐级递减。
  // 连线类型由画布级 branchStyle.edgeType 决定：curve（默认）/ straight / elbow。
  ctx.beginPath()
  ctx.moveTo(edge.start.x, edge.start.y)
  if (edge.edgeType === 'elbow') {
    // 正交折线：根据起止点相对位置判断水平/垂直布局，走 L 型路径
    const dx = Math.abs(edge.end.x - edge.start.x)
    const dy = Math.abs(edge.end.y - edge.start.y)
    if (dx >= dy) {
      // 水平布局：先水平到中点，再垂直到目标行，再水平到终点
      const midX = (edge.start.x + edge.end.x) / 2
      ctx.lineTo(midX, edge.start.y)
      ctx.lineTo(midX, edge.end.y)
    } else {
      // 垂直布局：先垂直到中点，再水平到目标列，再垂直到终点
      const midY = (edge.start.y + edge.end.y) / 2
      ctx.lineTo(edge.start.x, midY)
      ctx.lineTo(edge.end.x, midY)
    }
    ctx.lineTo(edge.end.x, edge.end.y)
  } else if (edge.edgeType === 'straight') {
    ctx.lineTo(edge.end.x, edge.end.y)
  } else {
    // curve：贝塞尔曲线（默认）
    ctx.bezierCurveTo(
      edge.control1.x, edge.control1.y,
      edge.control2.x, edge.control2.y,
      edge.end.x, edge.end.y,
    )
  }
  ctx.strokeStyle = edge.branchColor
  ctx.lineWidth = edge.lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
}

// ---- 主题节点 ----

function drawTopic(ctx: CanvasRenderingContext2D, node: TopicRenderNode): void {
  const { bounds, state } = node

  // 拖拽时降低透明度
  if (state.isDragging) {
    ctx.globalAlpha = 0.86
  }

  // 阴影
  drawNodeShadow(ctx, node)

  // 背景
  drawNodeBackground(ctx, bounds, node.style, node.depth)

  // 状态环（选中/激活/搜索/放置目标/历史焦点）
  drawStateRing(ctx, node)

  // 边框
  drawNodeBorder(ctx, node)

  // 文字
  drawNodeText(ctx, node)

  // 折叠/展开按钮
  if (node.childCount > 0) {
    drawToggleButton(ctx, node)
  }

  ctx.globalAlpha = 1
}

function drawNodeShadow(ctx: CanvasRenderingContext2D, node: TopicRenderNode): void {
  const { bounds, state, depth, style } = node
  // underline 形状无填充矩形，不投射阴影
  if (style.shape === 'underline') return
  const radius = getNodeRadiusForShape(style.shape, depth, bounds.height)
  ctx.save()
  // XMind 式：状态由 2px 描边表达（drawStateOutline），阴影保持轻量统一，
  // 仅拖拽态略加重以体现悬浮感。
  ctx.shadowColor = 'rgba(15, 23, 42, 0.08)'
  ctx.shadowBlur = state.isDragging ? 16 : 8
  ctx.shadowOffsetY = state.isDragging ? 6 : 3
  ctx.fillStyle = 'rgba(255, 255, 255, 0.01)' // 几乎透明，只为触发阴影
  roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, radius)
  ctx.fill()
  ctx.restore()
}

function drawNodeBackground(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number },
  style: ResolvedTopicStyle,
  depth: number,
): void {
  // underline 形状无填充，文字直绘于画布
  if (style.shape === 'underline') return
  ctx.fillStyle = style.fill
  roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, getNodeRadiusForShape(style.shape, depth, bounds.height))
  ctx.fill()
}

function drawStateRing(ctx: CanvasRenderingContext2D, node: TopicRenderNode): void {
  const { bounds, state, style, depth } = node
  const cornerRadius = getNodeRadiusForShape(style.shape, depth, bounds.height)
  // XMind 式：状态以 2px 实心描边表达（取代填充光环），与 DOM outline 一致
  if (state.isActive) {
    drawStateOutline(ctx, bounds, COLORS.activeOutline, cornerRadius)
  } else if (state.isSelected) {
    drawStateOutline(ctx, bounds, COLORS.selectedOutline, cornerRadius)
  }

  if (state.isActiveSearchResult) {
    drawStateOutline(ctx, bounds, COLORS.searchActiveOutline, cornerRadius)
  }

  if (state.isDropTarget) {
    drawStateOutline(ctx, bounds, COLORS.dropTargetOutline, cornerRadius)
  }

  if (state.isHistoryFocus) {
    drawStateOutline(ctx, bounds, COLORS.historyFocusOutline, cornerRadius)
  }
}

/** 在节点包围盒外 2px 处绘制 2px 描边（对应 DOM `outline: 2px solid; outline-offset: 2px`）。 */
function drawStateOutline(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number },
  color: string,
  cornerRadius: number,
): void {
  const offset = 2
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  roundRect(
    ctx,
    bounds.x - offset,
    bounds.y - offset,
    bounds.width + offset * 2,
    bounds.height + offset * 2,
    cornerRadius + offset,
  )
  ctx.stroke()
}

function drawNodeBorder(ctx: CanvasRenderingContext2D, node: TopicRenderNode): void {
  const { bounds, state, depth, style } = node
  const isRoot = depth === 0

  // 默认边框色来自解析后的主题/覆盖；状态语义色（放置目标/激活/搜索匹配）优先覆盖。
  let borderColor: string = style.borderColor
  if (state.isDropTarget) {
    borderColor = COLORS.dropTargetBorder
  } else if (state.isActive || state.isHistoryFocus) {
    borderColor = COLORS.activeBorder
  } else if (state.isSearchMatch) {
    borderColor = COLORS.searchMatchBorder
  }

  // underline 形状：仅绘制底部下划线（对齐 XMind 下划线主题），
  // 线色取 borderColor（若透明则回退 textColor），线宽取 style.borderWidth。
  if (style.shape === 'underline') {
    const lineColor = borderColor === 'transparent' ? style.textColor : borderColor
    if (style.borderWidth <= 0) return
    ctx.strokeStyle = lineColor
    ctx.lineWidth = style.borderWidth
    ctx.beginPath()
    ctx.moveTo(bounds.x, bounds.y + bounds.height)
    ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height)
    ctx.stroke()
    return
  }

  // 根节点边框恒为透明（由主题 root.borderColor=transparent 体现，此处显式保留语义）
  ctx.strokeStyle = isRoot ? 'transparent' : borderColor
  ctx.lineWidth = style.borderWidth
  // borderWidth=0 表示无边框，跳过描边以避免 0 宽度描边伪影
  if (style.borderWidth <= 0) return
  const radius = getNodeRadiusForShape(style.shape, depth, bounds.height)
  roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, radius)
  ctx.stroke()
}

function drawNodeText(ctx: CanvasRenderingContext2D, node: TopicRenderNode): void {
  const { bounds, text, depth, style } = node
  const padding = depth === 0 ? 20 : depth === 1 ? 14 : 12

  // 标题：字号 / 字重来自解析样式（深度默认 + 节点覆盖）
  ctx.font = `${style.fontWeight} ${style.fontSize}px ${FONT_FAMILY}`
  ctx.fillStyle = style.textColor
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  const lines = wrapText(text, bounds.width - padding * 2, ctx.font)
  const lineHeight = style.fontSize * 1.35
  const titleY = bounds.y + padding
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bounds.x + padding, titleY + i * lineHeight)
  }

  // 元信息已移除（参考 XMind：折叠状态由节点角的 +/− 按钮表达，不再显示文字元信息）
}

function drawToggleButton(ctx: CanvasRenderingContext2D, node: TopicRenderNode): void {
  const { bounds, collapsed, side } = node
  const toggleSize = TOGGLE_BUTTON_SIZE
  const half = toggleSize / 2
  // XMind 式：toggle 位于连线起点侧（center→下缘、left→左缘、right→右缘），半嵌于节点边
  const toggleX =
    side === 'center'
      ? bounds.x + bounds.width / 2
      : side === 'left'
        ? bounds.x - half
        : bounds.x + bounds.width + half
  const toggleY =
    side === 'center'
      ? bounds.y + bounds.height + half
      : bounds.y + bounds.height / 2

  ctx.save()
  ctx.shadowColor = 'rgba(15, 23, 42, 0.1)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(toggleX, toggleY, TOGGLE_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.restore()

  // +/− 符号（切换按钮为独立 UI 控件，符号色不随主题变化）
  ctx.fillStyle = COLORS.text
  ctx.font = `600 10px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(collapsed ? '+' : '−', toggleX, toggleY)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
}

// ---- 覆盖层 ----

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: SelectionBoxRenderNode | DragPreviewRenderNode | DropIndicatorRenderNode,
): void {
  switch (overlay.type) {
    case 'selection-box':
      drawSelectionBox(ctx, overlay)
      break
    case 'drag-preview':
      drawDragPreview(ctx, overlay)
      break
    case 'drop-indicator':
      drawDropIndicator(ctx, overlay)
      break
  }
}

function drawSelectionBox(ctx: CanvasRenderingContext2D, node: SelectionBoxRenderNode): void {
  const { bounds } = node
  ctx.fillStyle = COLORS.selectionFill
  roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, SELECTION_RADIUS)
  ctx.fill()
  ctx.strokeStyle = COLORS.selectionBorder
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawDragPreview(ctx: CanvasRenderingContext2D, node: DragPreviewRenderNode): void {
  const { bounds, text, depth, side, style } = node

  ctx.globalAlpha = 0.86
  drawNodeBackground(ctx, bounds, style, depth)
  drawNodeText(ctx, {
    type: 'topic',
    id: '__drag__',
    layer: 'overlay',
    bounds,
    text,
    depth,
    side,
    collapsed: false,
    childCount: 0,
    state: {
      isActive: false,
      isSelected: false,
      isEditing: false,
      isSearchMatch: false,
      isActiveSearchResult: false,
      isHistoryFocus: false,
      isDropTarget: false,
      isDragging: true,
    },
    style,
  })
  ctx.globalAlpha = 1
}

function drawDropIndicator(ctx: CanvasRenderingContext2D, node: DropIndicatorRenderNode): void {
  const { bounds, label } = node
  ctx.save()
  ctx.shadowColor = 'rgba(12, 21, 40, 0.18)'
  ctx.shadowBlur = 38
  ctx.shadowOffsetY = 16

  ctx.font = `400 12px ${FONT_FAMILY}`
  const textWidth = ctx.measureText(label).width
  const pillWidth = textWidth + 28
  const pillHeight = 32
  const pillX = bounds.x + bounds.width / 2 - pillWidth / 2
  const pillY = bounds.y + bounds.height + 20

  ctx.fillStyle = COLORS.dropIndicatorBg
  roundRect(ctx, pillX, pillY, pillWidth, pillHeight, pillHeight / 2)
  ctx.fill()

  ctx.restore()

  ctx.fillStyle = COLORS.dropIndicatorText
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, pillX + pillWidth / 2, pillY + pillHeight / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
}

// ---- 装饰元素（关系线 / 边界 / 概要）----

/** 绘制关系线：两端主题中心之间的虚线连接 + 可选标签。 */
function drawRelationship(ctx: CanvasRenderingContext2D, node: RelationshipRenderNode): void {
  const { from, to, label } = node

  // 虚线连接（区别于树形实线边）
  ctx.save()
  ctx.strokeStyle = COLORS.relationshipLine
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.restore()

  // 标签（中点药丸）
  if (label) {
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    ctx.save()
    ctx.font = `600 12px ${FONT_FAMILY}`
    const textWidth = ctx.measureText(label).width
    const pillWidth = textWidth + 16
    const pillHeight = 22
    const pillX = midX - pillWidth / 2
    const pillY = midY - pillHeight / 2

    ctx.fillStyle = COLORS.relationshipLabelBg
    roundRect(ctx, pillX, pillY, pillWidth, pillHeight, pillHeight / 2)
    ctx.fill()

    ctx.fillStyle = COLORS.relationshipLabelText
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, midX, midY)
    ctx.restore()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
  }
}

/** 绘制边界：框选一组主题的圆角矩形 + 可选标签。 */
function drawBoundary(ctx: CanvasRenderingContext2D, node: BoundaryRenderNode): void {
  const { bounds, label } = node
  const radius = 12
  const padding = 10

  ctx.save()
  // 半透明填充
  ctx.fillStyle = COLORS.boundaryFill
  roundRect(
    ctx,
    bounds.x - padding,
    bounds.y - padding,
    bounds.width + padding * 2,
    bounds.height + padding * 2,
    radius,
  )
  ctx.fill()

  // 虚线边框
  ctx.strokeStyle = COLORS.boundaryBorder
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 3])
  roundRect(
    ctx,
    bounds.x - padding,
    bounds.y - padding,
    bounds.width + padding * 2,
    bounds.height + padding * 2,
    radius,
  )
  ctx.stroke()
  ctx.restore()

  // 标签（左上角）
  if (label) {
    ctx.save()
    ctx.font = `600 11px ${FONT_FAMILY}`
    ctx.fillStyle = COLORS.boundaryLabelText
    ctx.textBaseline = 'top'
    ctx.fillText(label, bounds.x - padding + 8, bounds.y - padding + 6)
    ctx.restore()
  }
}

/** 绘制概要：右侧大括号 + 标签。 */
function drawSummary(ctx: CanvasRenderingContext2D, node: SummaryRenderNode): void {
  const { bounds, label, anchor } = node
  const bracketOffset = 16
  const bracketWidth = 12

  ctx.save()
  ctx.strokeStyle = COLORS.summaryBracket
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 大括号 } 形状：从上端 → 中点凸出 → 下端
  const topY = bounds.y
  const bottomY = bounds.y + bounds.height
  const midY = bounds.y + bounds.height / 2
  const startX = anchor.x
  const protrudeX = anchor.x + bracketWidth

  ctx.beginPath()
  // 上半弧
  ctx.moveTo(startX, topY)
  ctx.quadraticCurveTo(protrudeX, topY, protrudeX, topY + bracketOffset)
  ctx.lineTo(protrudeX, midY - bracketOffset)
  ctx.quadraticCurveTo(protrudeX, midY, protrudeX + 4, midY)
  // 下半弧
  ctx.quadraticCurveTo(protrudeX, midY, protrudeX, midY + bracketOffset)
  ctx.lineTo(protrudeX, bottomY - bracketOffset)
  ctx.quadraticCurveTo(protrudeX, bottomY, startX, bottomY)
  ctx.stroke()
  ctx.restore()

  // 标签（括号右侧）
  ctx.save()
  ctx.font = `600 13px ${FONT_FAMILY}`
  ctx.fillStyle = COLORS.summaryLabelText
  ctx.textBaseline = 'middle'
  ctx.fillText(label, protrudeX + 10, midY)
  ctx.restore()
  ctx.textBaseline = 'top'
}

// ---- 工具函数 ----

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
