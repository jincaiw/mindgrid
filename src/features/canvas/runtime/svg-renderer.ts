/**
 * SVG Renderer：将 Scene（Render Tree）序列化为 SVG 1.1 字符串。
 *
 * 与 Canvas 2D Renderer 对等，操作同一套 RenderNode 类型，复用共享样式常量。
 * 按 z-order 分层输出：boundary → edge → summary → topic → relationship。
 * overlay 节点（交互态）不导出。
 *
 * 节点样式来自 TopicRenderNode.style（主题层级色 + 节点覆盖合并结果），
 * 背景矩形颜色来自文档主题（resolveThemeBackground）。
 * V1 主题使用纯色填充（不含渐变），保证 Canvas/SVG/PNG 三端一致。
 *
 * 输出为纯字符串，可直接写入 .svg 文件或在浏览器中渲染。
 */

import {
  COLORS,
  FONT_FAMILY,
  TOGGLE_BUTTON_SIZE,
  TOGGLE_RADIUS,
  getEdgeLineWidth,
  getNodeRadius,
  getTitleFontSize,
  getTitleFontWeight,
  measureTextWidth,
  wrapText,
} from './style-constants'
import { resolveThemeBackground } from './style-resolver'
import {
  type BoundaryRenderNode,
  type EdgeRenderNode,
  type RelationshipRenderNode,
  type Scene,
  type SummaryRenderNode,
  type TopicRenderNode,
  computeNodesBounds,
} from './render-tree'

export interface SvgRenderOptions {
  /** 是否绘制背景矩形（默认 false，透明背景）。 */
  drawBackground?: boolean
  /** 画布外边距（世界坐标，默认 32），避免节点贴边。 */
  padding?: number
  /** 文档主题 ID（用于背景色解析）。缺省使用 classic-blue。 */
  themeId?: string
}

const DEFAULT_PADDING = 32

/**
 * 将场景序列化为 SVG 字符串。
 *
 * @param scene 场景（建议用 enableCulling: false 构建全量场景）
 * @param options 渲染选项
 * @returns SVG 1.1 字符串
 */
export function renderSceneToSvg(scene: Scene, options: SvgRenderOptions = {}): string {
  const { drawBackground = false, padding = DEFAULT_PADDING } = options
  const themeBackground = resolveThemeBackground(options.themeId)

  // 过滤掉 overlay 节点（交互态，非文档内容）
  const exportableNodes = scene.nodes.filter(
    (node) =>
      node.type !== 'selection-box' &&
      node.type !== 'drag-preview' &&
      node.type !== 'drop-indicator',
  )

  const contentBounds = computeNodesBounds(exportableNodes)
  const bounds = expandBounds(contentBounds, padding)

  const layers: string[] = []

  if (drawBackground) {
    layers.push(
      `  <rect x="${fmt(bounds.x)}" y="${fmt(bounds.y)}" width="${fmt(bounds.width)}" height="${fmt(bounds.height)}" fill="${themeBackground.background}"/>`,
    )
  }

  layers.push(buildDefs())

  // 按 z-order 输出各层
  const boundaries = exportableNodes.filter(
    (n): n is BoundaryRenderNode => n.type === 'boundary',
  )
  for (const node of boundaries) {
    layers.push(boundaryToSvg(node))
  }

  const edges = exportableNodes.filter((n): n is EdgeRenderNode => n.type === 'edge')
  for (const node of edges) {
    layers.push(edgeToSvg(node))
  }

  const summaries = exportableNodes.filter(
    (n): n is SummaryRenderNode => n.type === 'summary',
  )
  for (const node of summaries) {
    layers.push(summaryToSvg(node))
  }

  const topics = exportableNodes.filter((n): n is TopicRenderNode => n.type === 'topic')
  for (const node of topics) {
    layers.push(topicToSvg(node))
  }

  const relationships = exportableNodes.filter(
    (n): n is RelationshipRenderNode => n.type === 'relationship',
  )
  for (const node of relationships) {
    layers.push(relationshipToSvg(node))
  }

  const viewBox = `${fmt(bounds.x)} ${fmt(bounds.y)} ${fmt(bounds.width)} ${fmt(bounds.height)}`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `     viewBox="${viewBox}"`,
    `     width="${fmt(bounds.width)}" height="${fmt(bounds.height)}"`,
    `     font-family="${escapeXml(FONT_FAMILY)}">`,
    ...layers,
    `</svg>`,
  ].join('\n')
}

// ---- defs：滤镜定义（节点阴影 / 切换按钮阴影） ----

function buildDefs(): string {
  return [
    '  <defs>',
    '    <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">',
    '      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>',
    '    </filter>',
    '    <filter id="toggleShadow" x="-50%" y="-50%" width="200%" height="200%">',
    '      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.12"/>',
    '    </filter>',
    '  </defs>',
  ].join('\n')
}

// ---- 各节点序列化 ----

function topicToSvg(node: TopicRenderNode): string {
  const { bounds, text, depth, collapsed, childCount, style } = node
  const isRoot = depth === 0
  const radius = getNodeRadius(depth)
  const padding = depth === 0 ? 20 : depth === 1 ? 14 : 12

  const elements: string[] = []

  // 节点组（带阴影滤镜）
  elements.push(`  <g filter="url(#nodeShadow)">`)
  elements.push(
    `    <rect x="${fmt(bounds.x)}" y="${fmt(bounds.y)}" width="${fmt(bounds.width)}" height="${fmt(bounds.height)}" rx="${radius}" ry="${radius}" fill="${style.fill}"/>`,
  )
  // 边框（根节点无边框，与 canvas-renderer 一致）
  if (!isRoot) {
    elements.push(
      `    <rect x="${fmt(bounds.x)}" y="${fmt(bounds.y)}" width="${fmt(bounds.width)}" height="${fmt(bounds.height)}" rx="${radius}" ry="${radius}" fill="none" stroke="${style.borderColor}" stroke-width="1"/>`,
    )
  }
  elements.push(`  </g>`)

  // 标题文字：字号 / 字重按深度分级（参考 XMind）
  const titleFontSize = getTitleFontSize(depth)
  const titleFontWeight = getTitleFontWeight(depth)
  const titleFont = `${titleFontWeight} ${titleFontSize}px ${FONT_FAMILY}`
  const maxTextWidth = bounds.width - padding * 2
  const lines = wrapText(text, maxTextWidth, titleFont)
  const lineHeight = titleFontSize * 1.35
  const titleY = bounds.y + padding

  const tspans = lines
    .map(
      (line, i) =>
        `      <tspan x="${fmt(bounds.x + padding)}" dy="${i === 0 ? 0 : fmt(lineHeight)}">${escapeXml(line)}</tspan>`,
    )
    .join('\n')

  elements.push(
    `  <text x="${fmt(bounds.x + padding)}" y="${fmt(titleY)}" font-size="${titleFontSize}" font-weight="${titleFontWeight}" fill="${style.textColor}" dominant-baseline="hanging">`,
    tspans,
    `  </text>`,
  )

  // 元信息已移除（参考 XMind：折叠状态由节点角的 +/− 按钮表达）

  // 折叠/展开按钮
  if (childCount > 0) {
    const toggleX = bounds.x + bounds.width - 14 - TOGGLE_BUTTON_SIZE / 2
    const toggleY = bounds.y - 8 + TOGGLE_BUTTON_SIZE / 2
    const toggleSign = collapsed ? '+' : '−'

    elements.push(`  <g filter="url(#toggleShadow)">`)
    elements.push(
      `    <circle cx="${fmt(toggleX)}" cy="${fmt(toggleY)}" r="${TOGGLE_RADIUS}" fill="rgba(255,255,255,0.96)" stroke="rgba(15,23,42,0.1)" stroke-width="1"/>`,
    )
    elements.push(`  </g>`)
    elements.push(
      `  <text x="${fmt(toggleX)}" y="${fmt(toggleY)}" font-size="13" font-weight="400" fill="${COLORS.text}" text-anchor="middle" dominant-baseline="central">${escapeXml(toggleSign)}</text>`,
    )
  }

  return elements.join('\n')
}

function edgeToSvg(node: EdgeRenderNode): string {
  const { start, end, control1, control2, isActive, childDepth, branchColor } = node
  const strokeWidth = getEdgeLineWidth(childDepth, isActive)

  const d = `M ${fmt(start.x)} ${fmt(start.y)} C ${fmt(control1.x)} ${fmt(control1.y)}, ${fmt(control2.x)} ${fmt(control2.y)}, ${fmt(end.x)} ${fmt(end.y)}`

  return `  <path d="${d}" fill="none" stroke="${branchColor}" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round"/>`
}

function boundaryToSvg(node: BoundaryRenderNode): string {
  const { bounds, label } = node
  const radius = 12
  const padding = 10
  const x = bounds.x - padding
  const y = bounds.y - padding
  const w = bounds.width + padding * 2
  const h = bounds.height + padding * 2

  const elements: string[] = []

  elements.push(
    `  <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="${radius}" ry="${radius}" fill="${COLORS.boundaryFill}" stroke="${COLORS.boundaryBorder}" stroke-width="1.5" stroke-dasharray="5,3"/>`,
  )

  if (label) {
    const labelX = x + 8
    const labelY = y + 6
    elements.push(
      `  <text x="${fmt(labelX)}" y="${fmt(labelY)}" font-size="11" font-weight="600" fill="${COLORS.boundaryLabelText}" dominant-baseline="hanging">${escapeXml(label)}</text>`,
    )
  }

  return elements.join('\n')
}

function summaryToSvg(node: SummaryRenderNode): string {
  const { bounds, label, anchor } = node
  const bracketOffset = 16
  const bracketWidth = 12

  const topY = bounds.y
  const bottomY = bounds.y + bounds.height
  const midY = bounds.y + bounds.height / 2
  const startX = anchor.x
  const protrudeX = anchor.x + bracketWidth

  // 大括号 } 路径（与 canvas-renderer drawSummary 一致）
  const d = [
    `M ${fmt(startX)} ${fmt(topY)}`,
    `Q ${fmt(protrudeX)} ${fmt(topY)}, ${fmt(protrudeX)} ${fmt(topY + bracketOffset)}`,
    `L ${fmt(protrudeX)} ${fmt(midY - bracketOffset)}`,
    `Q ${fmt(protrudeX)} ${fmt(midY)}, ${fmt(protrudeX + 4)} ${fmt(midY)}`,
    `Q ${fmt(protrudeX)} ${fmt(midY)}, ${fmt(protrudeX)} ${fmt(midY + bracketOffset)}`,
    `L ${fmt(protrudeX)} ${fmt(bottomY - bracketOffset)}`,
    `Q ${fmt(protrudeX)} ${fmt(bottomY)}, ${fmt(startX)} ${fmt(bottomY)}`,
  ].join(' ')

  const labelX = protrudeX + 10

  return [
    `  <path d="${d}" fill="none" stroke="${COLORS.summaryBracket}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    `  <text x="${fmt(labelX)}" y="${fmt(midY)}" font-size="13" font-weight="600" fill="${COLORS.summaryLabelText}" dominant-baseline="central">${escapeXml(label)}</text>`,
  ].join('\n')
}

function relationshipToSvg(node: RelationshipRenderNode): string {
  const { from, to, label } = node
  const elements: string[] = []

  elements.push(
    `  <line x1="${fmt(from.x)}" y1="${fmt(from.y)}" x2="${fmt(to.x)}" y2="${fmt(to.y)}" stroke="${COLORS.relationshipLine}" stroke-width="2" stroke-linecap="round" stroke-dasharray="6,4"/>`,
  )

  if (label) {
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    const labelFont = `600 12px ${FONT_FAMILY}`
    const textWidth = measureTextWidth(label, labelFont)
    const pillWidth = textWidth + 16
    const pillHeight = 22
    const pillX = midX - pillWidth / 2
    const pillY = midY - pillHeight / 2

    elements.push(
      `  <rect x="${fmt(pillX)}" y="${fmt(pillY)}" width="${fmt(pillWidth)}" height="${fmt(pillHeight)}" rx="${pillHeight / 2}" ry="${pillHeight / 2}" fill="${COLORS.relationshipLabelBg}"/>`,
    )
    elements.push(
      `  <text x="${fmt(midX)}" y="${fmt(midY)}" font-size="12" font-weight="600" fill="${COLORS.relationshipLabelText}" text-anchor="middle" dominant-baseline="central">${escapeXml(label)}</text>`,
    )
  }

  return elements.join('\n')
}

// ---- 工具函数 ----

function expandBounds(bounds: { x: number; y: number; width: number; height: number }, margin: number) {
  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2,
  }
}

/** 格式化数值：保留 2 位小数，去掉尾随 0。 */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

/** XML 特殊字符转义。 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
