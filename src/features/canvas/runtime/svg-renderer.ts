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
  STRIKE_THROUGH_RATIO,
  TOGGLE_BUTTON_SIZE,
  TOGGLE_RADIUS,
  getNodePadding,
  getNodeRadiusForShape,
  measureTextWidth,
  wrapText,
} from './style-constants'
import {
  TOPIC_EQUATION_TITLE_OFFSET,
  computeTopicEquationRect,
} from './topic-equation-constants'
import { embedEquationSvg } from './topic-equation-store'
import {
  TOPIC_IMAGE_RADIUS,
  TOPIC_IMAGE_TITLE_OFFSET,
  computeTopicImageFittedRect,
  computeTopicImageRect,
} from './topic-image-constants'
import {
  TOPIC_CALLOUT_FONT_SIZE,
  TOPIC_CALLOUT_LINE_HEIGHT,
  TOPIC_CALLOUT_PADDING,
  TOPIC_CALLOUT_RADIUS,
  TOPIC_CALLOUT_TEXT_WIDTH,
  computeTopicCalloutLead,
  computeTopicCalloutPlacement,
} from './topic-callout-constants'
import { computeTopicStickerPlacement } from './topic-sticker-constants'
import { STICKER_VIEWBOX, findStickerDefinition } from '../sticker-definitions'
import {
  ILLUSTRATION_VIEWBOX,
  illustrationScale,
} from './canvas-illustration-constants'
import { findIllustrationDefinition } from '../illustration-definitions'
import { resolveThemeBackground } from './style-resolver'
import { applyTextTransform } from './text-transform'
import { taskStatusToSvgInner } from '../markers'
import { buildTopicMetaIcons } from './topic-meta-icons'
import {
  RICH_ICON_SIZE,
  RICH_LABEL_BACKGROUND,
  RICH_LABEL_FONT_SIZE,
  RICH_LABEL_GAP,
  RICH_LABEL_HEIGHT,
  RICH_LABEL_MAX_SHOWN,
  RICH_LABEL_MIN_WIDTH,
  RICH_LABEL_PADDING_X,
  RICH_LABEL_TEXT_COLOR,
  RICH_LABEL_TOP_GAP,
  RICH_META_GAP,
  RICH_META_OFFSET,
  RICH_TASK_GAP,
} from './rich-content-constants'
import {
  type BoundaryRenderNode,
  type EdgeRenderNode,
  type IllustrationRenderNode,
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
  /** 画布级背景色覆盖（`canvas.background` 设置）。空值 = 跟随主题。 */
  background?: string | null
  /** 画布级字体栈；未提供时使用默认字体栈。 */
  fontFamily?: string
  /**
   * 主题图片的**固有尺寸**（topicId → 像素宽高），由导出前预解码得到。
   *
   * 有它才能算出图片的实际绘制区域并套圆角 `clipPath`，与 Canvas/PNG 对齐；
   * 取不到（未解码 / 解码失败）就不裁剪——宁可直角，也不要拿错的尺寸裁坏图片。
   */
  topicImageSizes?: ReadonlyMap<string, { width: number; height: number }>
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
  const fontFamily = options.fontFamily ?? FONT_FAMILY
  const themeBackground = resolveThemeBackground(options.themeId, options.background)

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

  // 主题列表要提前拿：主题图片的圆角 clipPath 必须在 <defs> 里先生成出来
  const topics = exportableNodes.filter((n): n is TopicRenderNode => n.type === 'topic')
  const imageSizes = options.topicImageSizes
  const imageClips = new Map<string, string>()
  for (const node of topics) {
    if (!node.rich?.image) continue
    const clip = buildTopicImageClip(node, imageSizes?.get(node.id))
    if (clip) imageClips.set(node.id, clip)
  }

  layers.push(buildDefs([...imageClips.values()]))

  // 按 z-order 输出各层
  const boundaries = exportableNodes.filter(
    (n): n is BoundaryRenderNode => n.type === 'boundary',
  )
  for (const node of boundaries) {
    layers.push(boundaryToSvg(node, fontFamily))
  }

  const edges = exportableNodes.filter((n): n is EdgeRenderNode => n.type === 'edge')
  for (const node of edges) {
    layers.push(edgeToSvg(node))
  }

  const summaries = exportableNodes.filter(
    (n): n is SummaryRenderNode => n.type === 'summary',
  )
  for (const node of summaries) {
    layers.push(summaryToSvg(node, fontFamily))
  }

  for (const node of topics) {
    layers.push(topicToSvg(node, fontFamily, imageClips.has(node.id)))
  }

  const relationships = exportableNodes.filter(
    (n): n is RelationshipRenderNode => n.type === 'relationship',
  )
  for (const node of relationships) {
    layers.push(relationshipToSvg(node, fontFamily))
  }

  // 画布级插画（与 Canvas 端同一个 z-order：在地图内容之上）
  const illustrations = exportableNodes.filter(
    (n): n is IllustrationRenderNode => n.type === 'illustration',
  )
  for (const node of illustrations) {
    layers.push(illustrationToSvg(node))
  }

  const viewBox = `${fmt(bounds.x)} ${fmt(bounds.y)} ${fmt(bounds.width)} ${fmt(bounds.height)}`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    // xlink 命名空间：主题图片同时输出 href 与 xlink:href，兼容旧渲染器与 svg2pdf.js
    `     xmlns:xlink="http://www.w3.org/1999/xlink"`,
    `     viewBox="${viewBox}"`,
    `     width="${fmt(bounds.width)}" height="${fmt(bounds.height)}"`,
    `     font-family="${escapeXml(fontFamily)}">`,
    ...layers,
    `</svg>`,
  ].join('\n')
}

/**
 * 插画 → SVG 片段。
 *
 * 与 Canvas 端共用 `illustrationScale` 与同一份图元数据，
 * 所以"画多大、画在哪"两端由同一套数算出。
 */
function illustrationToSvg(node: IllustrationRenderNode): string {
  const definition = findIllustrationDefinition(node.illustrationId)
  if (!definition) {
    return ''
  }

  const scale = illustrationScale(node.size)
  const shapes = definition.shapes
    .map(
      (shape) =>
        `<path d="${shape.d}" fill="${shape.fill ?? 'none'}" stroke="${shape.stroke ?? 'none'}" stroke-width="${fmt(shape.strokeWidth ?? 0)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('')

  return `  <g transform="translate(${fmt(node.cx)} ${fmt(node.cy)}) scale(${fmt(scale)}) translate(${-ILLUSTRATION_VIEWBOX / 2} ${-ILLUSTRATION_VIEWBOX / 2})">${shapes}</g>`
}

// ---- defs：滤镜定义（节点阴影 / 切换按钮阴影） ----

function buildDefs(extra: readonly string[] = []): string {
  return [
    '  <defs>',
    '    <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">',
    '      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>',
    '    </filter>',
    '    <filter id="toggleShadow" x="-50%" y="-50%" width="200%" height="200%">',
    '      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.12"/>',
    '    </filter>',
    ...extra,
    '  </defs>',
  ].join('\n')
}

/** 主题图片圆角裁剪的 clipPath id；一个节点一个，避免不同节点的矩形互相覆盖。 */
export function topicImageClipId(topicId: string): string {
  return `topicImageClip-${topicId}`
}

/** 为主题图片生成圆角 clipPath；尺寸未知时返回 null（不裁剪）。 */
function buildTopicImageClip(
  node: TopicRenderNode,
  size: { width: number; height: number } | undefined,
): string | null {
  if (!size) return null
  const rect = computeTopicImageFittedRect(node.bounds, getNodePadding(node.depth), size)
  if (!rect) return null
  return `    <clipPath id="${topicImageClipId(node.id)}"><rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.width)}" height="${fmt(rect.height)}" rx="${TOPIC_IMAGE_RADIUS}" ry="${TOPIC_IMAGE_RADIUS}"/></clipPath>`
}

// ---- 各节点序列化 ----

/** 线型对应的 stroke-dasharray（与 canvas-renderer 的 setLineDash 同语义）。 */
function borderDashArray(style: 'solid' | 'dashed' | 'dotted', width: number): string {
  const w = Math.max(1, width)
  if (style === 'dashed') return ` stroke-dasharray="${fmt(w * 4)},${fmt(w * 2.5)}"`
  if (style === 'dotted') return ` stroke-dasharray="${fmt(w)},${fmt(w * 2)}"`
  return ''
}

function topicToSvg(
  node: TopicRenderNode,
  fontFamily: string,
  hasImageClip = false,
): string {
  const { bounds, text, number, depth, collapsed, childCount, style, side } = node
  const isRoot = depth === 0
  const isUnderline = style.shape === 'underline'
  const radius = isUnderline ? 0 : getNodeRadiusForShape(style.shape, depth, bounds.height)
  // 与 DOM / Canvas Renderer 共用同一套内边距，避免 SVG 导出与屏幕显示错位
  const padding = getNodePadding(depth)
  const rich = node.rich
  /** 有图时标题下移，给图片区让位。 */
  // 图片与方程各自让位（与 Canvas/PNG 端逐项一致；是否让位只看 rich 字段，
  // 不看渲染/解码是否成功，否则两端版面会因为个别失败项错位）
  const titleOffsetY =
    (rich?.image ? TOPIC_IMAGE_TITLE_OFFSET : 0) +
    (rich?.equation ? TOPIC_EQUATION_TITLE_OFFSET : 0)

  const elements: string[] = []

  if (isUnderline) {
    // underline 形状：无填充矩形，仅底部下划线（对齐 canvas-renderer）
    const lineColor = style.borderColor === 'transparent' ? style.textColor : style.borderColor
    if (style.borderWidth > 0) {
      elements.push(
        `  <line x1="${fmt(bounds.x)}" y1="${fmt(bounds.y + bounds.height)}" x2="${fmt(bounds.x + bounds.width)}" y2="${fmt(bounds.y + bounds.height)}" stroke="${lineColor}" stroke-width="${fmt(style.borderWidth)}" stroke-linecap="round"/>`,
      )
    }
  } else if (isRoot) {
    // 节点组（带阴影滤镜）：仅中心主题投影，分支节点保持纯色块（与 canvas-renderer 一致，
    // 逐个投影会让整幅图显脏，也与 XMind 的观感不符）
    elements.push(`  <g filter="url(#nodeShadow)">`)
    elements.push(
      `    <rect x="${fmt(bounds.x)}" y="${fmt(bounds.y)}" width="${fmt(bounds.width)}" height="${fmt(bounds.height)}" rx="${fmt(radius)}" ry="${fmt(radius)}" fill="${style.fill}"/>`,
    )
    // 边框（根节点无边框，与 canvas-renderer 一致；borderWidth=0 表示无边框）
    if (!isRoot && style.borderWidth > 0) {
      elements.push(
        `    <rect x="${fmt(bounds.x)}" y="${fmt(bounds.y)}" width="${fmt(bounds.width)}" height="${fmt(bounds.height)}" rx="${fmt(radius)}" ry="${fmt(radius)}" fill="none" stroke="${style.borderColor}" stroke-width="${fmt(style.borderWidth)}"${borderDashArray(style.borderStyle, style.borderWidth)}/>`,
      )
    }
    elements.push(`  </g>`)
  } else {
    // 分支节点：纯色块 + 可选边框，不套阴影滤镜
    elements.push(
      `  <rect x="${fmt(bounds.x)}" y="${fmt(bounds.y)}" width="${fmt(bounds.width)}" height="${fmt(bounds.height)}" rx="${fmt(radius)}" ry="${fmt(radius)}" fill="${style.fill}"/>`,
    )
    if (style.borderWidth > 0) {
      elements.push(
        `  <rect x="${fmt(bounds.x)}" y="${fmt(bounds.y)}" width="${fmt(bounds.width)}" height="${fmt(bounds.height)}" rx="${fmt(radius)}" ry="${fmt(radius)}" fill="none" stroke="${style.borderColor}" stroke-width="${fmt(style.borderWidth)}"${borderDashArray(style.borderStyle, style.borderWidth)}/>`,
      )
    }
  }

  // 标题文字：字号 / 字重 / 字体族来自解析样式（深度默认 + 节点覆盖；
  // 字体族为节点级覆盖，缺省继承根元素的画布全局字体）
  const effectiveFontFamily = style.fontFamily ?? fontFamily
  const titleFont = `${style.italic ? 'italic ' : ''}${style.fontWeight} ${style.fontSize}px ${effectiveFontFamily}`
  const maxTextWidth = bounds.width - padding * 2
  // 编号是展示层前缀：与 Canvas / DOM 三端一致地拼在标题前；大小写转换同理只作用于展示层
  const numberedText = number ? `${number} ${text}` : text
  const displayText = applyTextTransform(numberedText, style.textTransform)
  const lines = wrapText(displayText, maxTextWidth, titleFont)
  const lineHeight = style.fontSize * 1.35
  const titleY = bounds.y + padding + titleOffsetY

  // 标题对齐：与 canvas-renderer 用同一套内边距盒子（左/中/右）
  const textAnchor =
    style.textAlign === 'left' ? 'start' : style.textAlign === 'right' ? 'end' : 'middle'
  const textX =
    style.textAlign === 'left'
      ? bounds.x + padding
      : style.textAlign === 'right'
        ? bounds.x + bounds.width - padding
        : bounds.x + bounds.width / 2
  const tspans = lines
    .map(
      (line, i) =>
        `      <tspan x="${fmt(textX)}" dy="${i === 0 ? 0 : fmt(lineHeight)}">${escapeXml(line)}</tspan>`,
    )
    .join('\n')

  // 主题图片：位于标题上方，几何与 DOM 的 .mindmap-node__image 完全对齐
  if (rich?.image) {
    const rect = computeTopicImageRect(bounds, padding)
    // 圆角裁剪与 Canvas/PNG 同源：clipPath 的矩形由 computeTopicImageFittedRect 算出，
    // 尺寸未知时不加 clip-path（宁可直角，也不拿错尺寸裁坏图片）
    const clip = hasImageClip ? ` clip-path="url(#${topicImageClipId(node.id)})"` : ''
    elements.push(
      `  <image x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.width)}" height="${fmt(rect.height)}" preserveAspectRatio="xMidYMid meet" href="${escapeXml(rich.image)}" xlink:href="${escapeXml(rich.image)}"${clip}/>`,
    )
  }

  // 主题方程：在图片之下、标题之上（与 DOM 的元素顺序一致）
  const equation = rich?.equation
  if (equation?.svg && equation.width && equation.height) {
    const rect = computeTopicEquationRect(
      bounds,
      padding,
      { width: equation.width, height: equation.height },
      style.fontSize,
    )
    if (rect) {
      // 用嵌套 <svg> + preserveAspectRatio：与 DOM 的 max-* 约束、Canvas 的 drawImage 三者等价
      elements.push(
        `  ${embedEquationSvg(equation.svg, rect, style.textColor)}`,
      )
    }
  }

  // 标注（callout）：挂在节点外侧的说明框 + 一条引线（几何与 PNG 端同一个函数）
  const callout = rich?.callout
  if (callout && callout.text.trim().length > 0) {
    const lines = wrapText(
      callout.text,
      TOPIC_CALLOUT_TEXT_WIDTH,
      `${TOPIC_CALLOUT_FONT_SIZE}px ${style.fontFamily ?? fontFamily}`,
    )
    const placement = computeTopicCalloutPlacement(
      bounds,
      callout,
      lines.length,
      node.side === 'left' ? 'left' : 'right',
    )
    const lead = computeTopicCalloutLead(bounds, placement)
    const strokeColor =
      style.borderColor === 'transparent' ? style.textColor : style.borderColor

    elements.push(
      `  <line x1="${fmt(lead.x1)}" y1="${fmt(lead.y1)}" x2="${fmt(lead.x2)}" y2="${fmt(lead.y2)}" stroke="${escapeXml(strokeColor)}" stroke-width="1" opacity="0.55"/>`,
    )
    elements.push(
      `  <rect x="${fmt(placement.x)}" y="${fmt(placement.y)}" width="${fmt(placement.width)}" height="${fmt(placement.height)}" rx="${fmt(TOPIC_CALLOUT_RADIUS)}" ry="${fmt(TOPIC_CALLOUT_RADIUS)}" fill="${escapeXml(style.fill)}" stroke="${escapeXml(strokeColor)}" stroke-width="${fmt(style.borderWidth)}"/>`,
    )
    const tspans = lines
      .map(
        (line, index) =>
          `<tspan x="${fmt(placement.x + TOPIC_CALLOUT_PADDING)}" dy="${index === 0 ? 0 : fmt(TOPIC_CALLOUT_LINE_HEIGHT)}">${escapeXml(line)}</tspan>`,
      )
      .join('')
    elements.push(
      `  <text x="${fmt(placement.x + TOPIC_CALLOUT_PADDING)}" y="${fmt(placement.y + TOPIC_CALLOUT_PADDING)}" font-size="${fmt(TOPIC_CALLOUT_FONT_SIZE)}" font-weight="400" fill="${escapeXml(style.textColor)}" text-anchor="start" dominant-baseline="hanging">${tspans}</text>`,
    )
  }

  // 贴纸：画在节点之上（可压住文字，与 DOM 的层级一致）。
  // 几何来自 computeTopicStickerPlacement —— 与 PNG 端同一个函数。
  for (const [stickerIndex, sticker] of (rich?.stickers ?? []).entries()) {
    const definition = findStickerDefinition(sticker.stickerId)
    if (!definition) {
      continue
    }
    const placement = computeTopicStickerPlacement(bounds, sticker, stickerIndex)
    const scale = placement.size / STICKER_VIEWBOX
    const shapes = definition.shapes
      .map(
        (shape) =>
          `<path d="${shape.d}" fill="${shape.fill ?? 'none'}" stroke="${shape.stroke ?? 'none'}" stroke-width="${fmt(shape.strokeWidth ?? 0)}" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join('')
    elements.push(
      `  <g transform="translate(${fmt(placement.cx)} ${fmt(placement.cy)}) rotate(${fmt(placement.rotation)}) scale(${fmt(scale)}) translate(${-STICKER_VIEWBOX / 2} ${-STICKER_VIEWBOX / 2})">${shapes}</g>`,
    )
  }

  elements.push(
    `  <text x="${fmt(textX)}" y="${fmt(titleY)}" font-size="${fmt(style.fontSize)}" font-weight="${style.fontWeight}" fill="${style.textColor}" text-anchor="${textAnchor}" dominant-baseline="hanging"${style.fontFamily ? ` font-family="${escapeXml(style.fontFamily)}"` : ''}${style.italic ? ' font-style="italic"' : ''}>`,
    tspans,
    `  </text>`,
  )

  // 删除线：不用 text-decoration（svg2pdf.js 支持度不可靠），按每行实测宽度手绘横线。
  // 行宽、锚点与纵向比例与 canvas-renderer 的 drawNodeText 完全同源。
  if (style.strikethrough) {
    for (let i = 0; i < lines.length; i++) {
      const lineWidth = measureTextWidth(lines[i], titleFont)
      if (lineWidth <= 0) continue
      const startX =
        style.textAlign === 'left'
          ? textX
          : style.textAlign === 'right'
            ? textX - lineWidth
            : textX - lineWidth / 2
      const strikeY = titleY + i * lineHeight + style.fontSize * STRIKE_THROUGH_RATIO
      elements.push(
        `  <line x1="${fmt(startX)}" y1="${fmt(strikeY)}" x2="${fmt(startX + lineWidth)}" y2="${fmt(strikeY)}" stroke="${style.textColor}" stroke-width="${fmt(Math.max(1, style.fontSize / 14))}"/>`,
      )
    }
  }

  // —— 富内容投影：task / markers / notes / link / labels（与 DOM 渲染对齐）——
  if (rich) {
    // 任务状态图标：节点左侧垂直居中
    if (rich.task) {
      const iconSize = RICH_ICON_SIZE
      const tx = bounds.x - iconSize - RICH_TASK_GAP
      const ty = bounds.y + bounds.height / 2 - iconSize / 2
      elements.push(
        `  <g transform="translate(${fmt(tx)} ${fmt(ty)})" aria-label="任务状态 ${rich.task.status}">${taskStatusToSvgInner(rich.task.status, rich.task.priority)}</g>`,
      )
    }

    // meta 图标行：节点右侧（标记 / 备注 / 附件 / 语音备注 / 链接），垂直居中。
    // 图标种类与顺序来自 `buildTopicMetaIcons` —— 与 PNG 端调同一个函数，
    // 顺序或"画哪几类"的差异在结构上不再可能（附件 / 语音备注曾整个缺失）。
    const metaIcons = buildTopicMetaIcons(rich)
    if (metaIcons.length > 0) {
      const iconSize = RICH_ICON_SIZE
      const gap = RICH_META_GAP
      let cursorX = bounds.x + bounds.width + RICH_META_OFFSET
      const cursorY = bounds.y + bounds.height / 2 - iconSize / 2
      for (const icon of metaIcons) {
        elements.push(
          `  <g transform="translate(${fmt(cursorX)} ${fmt(cursorY)})">${icon.inner}</g>`,
        )
        cursorX += iconSize + gap
      }
    }

    // 标签胶囊行：节点下方水平居中，最多展示 3 个
    if (rich.labels && rich.labels.length > 0) {
      const shownLabels = rich.labels.slice(0, RICH_LABEL_MAX_SHOWN)
      const labelFontSize = RICH_LABEL_FONT_SIZE
      const labelHeight = RICH_LABEL_HEIGHT
      const labelGap = RICH_LABEL_GAP
      const labelY = bounds.y + bounds.height + RICH_LABEL_TOP_GAP

      // 先测量每个标签宽度
      const labelWidths = shownLabels.map((label) => {
        const w = measureTextWidth(label, `400 ${labelFontSize}px ${fontFamily}`)
        return Math.max(RICH_LABEL_MIN_WIDTH, w + RICH_LABEL_PADDING_X * 2)
      })
      const totalWidth =
        labelWidths.reduce((sum, w) => sum + w + labelGap, -labelGap) +
        // +N 胶囊必须计入居中宽度，否则有溢出标签时整行会右偏 (MIN_WIDTH+GAP)/2
        // （与 DOM 的 translateX(-50%) 和 Canvas 端 drawLabelPills 对齐）
        (rich.labels.length > RICH_LABEL_MAX_SHOWN ? RICH_LABEL_MIN_WIDTH + labelGap : 0)
      let labelX = bounds.x + bounds.width / 2 - totalWidth / 2

      for (let i = 0; i < shownLabels.length; i++) {
        const label = shownLabels[i]
        const w = labelWidths[i]
        elements.push(
          `  <rect x="${fmt(labelX)}" y="${fmt(labelY)}" width="${fmt(w)}" height="${labelHeight}" rx="${labelHeight / 2}" ry="${labelHeight / 2}" fill="${RICH_LABEL_BACKGROUND}"/>`,
        )
        elements.push(
          `  <text x="${fmt(labelX + w / 2)}" y="${fmt(labelY + labelHeight / 2)}" font-size="${labelFontSize}" fill="${style.metaTextColor ?? RICH_LABEL_TEXT_COLOR}" text-anchor="middle" dominant-baseline="central">${escapeXml(label)}</text>`,
        )
        labelX += w + labelGap
      }

      // 多余标签以 +N 胶囊展示
      if (rich.labels.length > RICH_LABEL_MAX_SHOWN) {
        const moreText = `+${rich.labels.length - RICH_LABEL_MAX_SHOWN}`
        const w = RICH_LABEL_MIN_WIDTH
        elements.push(
          `  <rect x="${fmt(labelX)}" y="${fmt(labelY)}" width="${w}" height="${labelHeight}" rx="${labelHeight / 2}" ry="${labelHeight / 2}" fill="${RICH_LABEL_BACKGROUND}"/>`,
        )
        elements.push(
          `  <text x="${fmt(labelX + w / 2)}" y="${fmt(labelY + labelHeight / 2)}" font-size="${labelFontSize}" fill="${style.metaTextColor ?? RICH_LABEL_TEXT_COLOR}" text-anchor="middle" dominant-baseline="central">${escapeXml(moreText)}</text>`,
        )
      }
    }
  }

  // 折叠/展开按钮（XMind 式：位于连线起点侧，16px，半嵌于节点边）
  if (childCount > 0) {
    const half = TOGGLE_BUTTON_SIZE / 2
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
    const toggleSign = collapsed ? '+' : '−'

    elements.push(`  <g filter="url(#toggleShadow)">`)
    elements.push(
      `    <circle cx="${fmt(toggleX)}" cy="${fmt(toggleY)}" r="${TOGGLE_RADIUS}" fill="rgba(255,255,255,0.96)" stroke="rgba(15,23,42,0.14)" stroke-width="1"/>`,
    )
    elements.push(`  </g>`)
    elements.push(
      `  <text x="${fmt(toggleX)}" y="${fmt(toggleY)}" font-size="10" font-weight="600" fill="${COLORS.text}" text-anchor="middle" dominant-baseline="central">${escapeXml(toggleSign)}</text>`,
    )
  }

  return elements.join('\n')
}

function edgeToSvg(node: EdgeRenderNode): string {
  const { start, end, control1, control2, branchColor, edgeType, lineWidth, endpoint } = node
  const strokeWidth = lineWidth

  let d: string
  if (edgeType === 'elbow') {
    // 正交折线：根据起止点相对位置判断水平/垂直布局
    const dx = Math.abs(end.x - start.x)
    const dy = Math.abs(end.y - start.y)
    if (dx >= dy) {
      const midX = (start.x + end.x) / 2
      d = `M ${fmt(start.x)} ${fmt(start.y)} L ${fmt(midX)} ${fmt(start.y)} L ${fmt(midX)} ${fmt(end.y)} L ${fmt(end.x)} ${fmt(end.y)}`
    } else {
      const midY = (start.y + end.y) / 2
      d = `M ${fmt(start.x)} ${fmt(start.y)} L ${fmt(start.x)} ${fmt(midY)} L ${fmt(end.x)} ${fmt(midY)} L ${fmt(end.x)} ${fmt(end.y)}`
    }
  } else if (edgeType === 'straight') {
    d = `M ${fmt(start.x)} ${fmt(start.y)} L ${fmt(end.x)} ${fmt(end.y)}`
  } else {
    d = `M ${fmt(start.x)} ${fmt(start.y)} C ${fmt(control1.x)} ${fmt(control1.y)}, ${fmt(control2.x)} ${fmt(control2.y)}, ${fmt(end.x)} ${fmt(end.y)}`
  }

  const endpointMarkup = endpoint === 'circle'
    ? `  <circle cx="${fmt(end.x)}" cy="${fmt(end.y)}" r="${fmt(Math.max(3, strokeWidth * 1.8))}" fill="${branchColor}"/>`
    : endpoint === 'arrow'
      ? (() => {
          const angle = Math.atan2(end.y - control2.y, end.x - control2.x)
          const size = Math.max(7, strokeWidth * 3.5)
          const wing = size * 0.55
          const p1 = `${fmt(end.x - Math.cos(angle) * size + Math.sin(angle) * wing)},${fmt(end.y - Math.sin(angle) * size - Math.cos(angle) * wing)}`
          const p2 = `${fmt(end.x - Math.cos(angle) * size - Math.sin(angle) * wing)},${fmt(end.y - Math.sin(angle) * size + Math.cos(angle) * wing)}`
          return `  <path d="M ${fmt(end.x)} ${fmt(end.y)} L ${p1} L ${p2} Z" fill="${branchColor}"/>`
        })()
      : ''

  return `  <path d="${d}" fill="none" stroke="${branchColor}" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>${endpointMarkup ? `\n${endpointMarkup}` : ''}`
}

function boundaryToSvg(node: BoundaryRenderNode, fontFamily: string): string {
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
      `  <text x="${fmt(labelX)}" y="${fmt(labelY)}" font-size="11" font-weight="600" font-family="${escapeXml(fontFamily)}" fill="${COLORS.boundaryLabelText}" dominant-baseline="hanging">${escapeXml(label)}</text>`,
    )
  }

  return elements.join('\n')
}

function summaryToSvg(node: SummaryRenderNode, fontFamily: string): string {
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
    `  <text x="${fmt(labelX)}" y="${fmt(midY)}" font-size="13" font-weight="600" font-family="${escapeXml(fontFamily)}" fill="${COLORS.summaryLabelText}" dominant-baseline="central">${escapeXml(label)}</text>`,
  ].join('\n')
}

function relationshipToSvg(node: RelationshipRenderNode, fontFamily: string): string {
  const { from, to, label } = node
  const elements: string[] = []

  elements.push(
    `  <line x1="${fmt(from.x)}" y1="${fmt(from.y)}" x2="${fmt(to.x)}" y2="${fmt(to.y)}" stroke="${COLORS.relationshipLine}" stroke-width="2" stroke-linecap="round" stroke-dasharray="6,4"/>`,
  )

  if (label) {
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    const labelFont = `600 12px ${fontFamily}`
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
