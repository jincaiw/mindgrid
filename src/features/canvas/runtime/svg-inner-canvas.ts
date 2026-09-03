/**
 * SVG-inner → Canvas 2D：把「14×14 viewBox 的内部 SVG 片段」绘制到 Canvas。
 *
 * **为什么需要它**：标记 / 任务状态 / 备注 / 链接图标的图形目前只有一份真源——
 * `markers.tsx` 里的 SVG 字符串（`markerToSvgInner` / `taskStatusToSvgInner`）。
 * SVG 导出直接内嵌这些字符串；PNG（Canvas 2D）若要画同样的图形，要么复制一份
 * 图形表（三端漂移的老问题），要么解析同一份 SVG。本模块选后者：
 * 单一数据源，以后新增标记自动同时出现在 SVG 与 PNG 里。
 *
 * **支持的子集**（仅覆盖 markers / rich-content 图标实际用到的元素与命令）：
 *   - 元素：`<circle>` `<path>` `<text>`
 *   - 路径命令：M/m L/l H/h V/v C/c Q/q A/a Z/z（含隐式重复参数）
 *   - 表现属性：fill / fill-opacity / stroke / stroke-width / stroke-linecap /
 *     stroke-linejoin / font-size / font-weight / text-anchor / dominant-baseline
 *
 * 不支持的元素静默跳过；环境无 DOMParser 时整个绘制静默降级（不抛错），
 * 与主题图片的容错策略一致：个别图标画不出来也不该让整次导出失败。
 */

import { FONT_FAMILY } from './style-constants'
import { RICH_ICON_SIZE, RICH_SVG_VIEWBOX } from './rich-content-constants'

interface PaintAttrs {
  fill: string | null
  fillOpacity: number
  stroke: string | null
  strokeWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
}

type SvgElement =
  | ({ kind: 'circle'; cx: number; cy: number; r: number } & PaintAttrs)
  | ({ kind: 'path'; d: string } & PaintAttrs)
  | {
      kind: 'text'
      x: number
      y: number
      content: string
      fontSize: number
      fontWeight: number
      fill: string | null
      textAnchor: CanvasTextAlign
      textBaseline: CanvasTextBaseline
    }

/** 解析缓存：同一段 SVG 在大图里会重复出现（同一标记用于多个主题）。 */
const parseCache = new Map<string, SvgElement[]>()

/**
 * 将内部 SVG 片段绘制到 Canvas。
 *
 * @param ctx Canvas 2D 上下文
 * @param svgInner 内部 SVG 片段（不含 `<svg>` 包裹，坐标系为 RICH_SVG_VIEWBOX）
 * @param x 绘制区左上角 X（世界坐标）
 * @param y 绘制区左上角 Y（世界坐标）
 * @param size 绘制区边长（默认 RICH_ICON_SIZE，14 时缩放比为 1）
 */
export function drawSvgInner(
  ctx: CanvasRenderingContext2D,
  svgInner: string,
  x: number,
  y: number,
  size: number = RICH_ICON_SIZE,
): void {
  if (!svgInner) return

  const elements = parseSvgInner(svgInner)
  if (elements.length === 0) return

  const scale = size / RICH_SVG_VIEWBOX

  for (const element of elements) {
    if (element.kind === 'text') {
      drawTextElement(ctx, element, x, y, scale)
      continue
    }

    const prevAlpha = ctx.globalAlpha
    const prevLineCap = ctx.lineCap
    const prevLineJoin = ctx.lineJoin
    const prevLineWidth = ctx.lineWidth

    ctx.beginPath()
    if (element.kind === 'circle') {
      ctx.arc(x + element.cx * scale, y + element.cy * scale, element.r * scale, 0, Math.PI * 2)
    } else {
      buildPath(ctx, element.d, x, y, scale)
    }

    if (element.fill) {
      ctx.globalAlpha = prevAlpha * element.fillOpacity
      ctx.fillStyle = element.fill
      ctx.fill()
    }
    if (element.stroke && element.strokeWidth > 0) {
      ctx.globalAlpha = prevAlpha
      ctx.strokeStyle = element.stroke
      ctx.lineWidth = element.strokeWidth * scale
      ctx.lineCap = element.lineCap
      ctx.lineJoin = element.lineJoin
      ctx.stroke()
    }

    ctx.globalAlpha = prevAlpha
    ctx.lineCap = prevLineCap
    ctx.lineJoin = prevLineJoin
    ctx.lineWidth = prevLineWidth
  }
}

// ---- 解析 ----

/**
 * 解析内部 SVG 片段。解析失败（无 DOMParser / 非法片段）返回空数组，绝不抛错。
 * 导出到外部是为了便于单测解析行为。
 */
export function parseSvgInner(svgInner: string): SvgElement[] {
  const cached = parseCache.get(svgInner)
  if (cached) return cached

  const elements: SvgElement[] = []
  try {
    if (typeof DOMParser === 'undefined') return []

    const doc = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${svgInner}</svg>`,
      'image/svg+xml',
    )
    for (const node of Array.from(doc.documentElement.childNodes)) {
      if (node.nodeType !== 1) continue // 只处理元素节点
      const element = convertElement(node as Element)
      if (element) elements.push(element)
    }
  } catch {
    // 解析异常按「无图标」降级
    return []
  }

  parseCache.set(svgInner, elements)
  return elements
}

function convertElement(node: Element): SvgElement | null {
  switch (node.tagName.toLowerCase()) {
    case 'circle':
      return {
        kind: 'circle',
        cx: num(node.getAttribute('cx')),
        cy: num(node.getAttribute('cy')),
        r: num(node.getAttribute('r')),
        ...readPaintAttrs(node),
      }
    case 'path': {
      const d = node.getAttribute('d') ?? ''
      if (!d) return null
      return { kind: 'path', d, ...readPaintAttrs(node) }
    }
    case 'text': {
      const fontSize = num(node.getAttribute('font-size'), 12)
      const textAnchor = node.getAttribute('text-anchor') === 'middle' ? 'center' : 'left'
      const baselineRaw = node.getAttribute('dominant-baseline')
      const textBaseline: CanvasTextBaseline =
        baselineRaw === 'central' || baselineRaw === 'middle' ? 'middle' : 'alphabetic'
      return {
        kind: 'text',
        x: num(node.getAttribute('x')),
        y: num(node.getAttribute('y')),
        content: node.textContent ?? '',
        fontSize,
        fontWeight: num(node.getAttribute('font-weight'), 400),
        fill: readColor(node.getAttribute('fill')),
        textAnchor,
        textBaseline,
      }
    }
    default:
      return null
  }
}

function readPaintAttrs(node: Element): PaintAttrs {
  return {
    fill: readColor(node.getAttribute('fill')),
    fillOpacity: num(node.getAttribute('fill-opacity'), 1),
    stroke: readColor(node.getAttribute('stroke')),
    strokeWidth: num(node.getAttribute('stroke-width'), 1),
    lineCap: toLineCap(node.getAttribute('stroke-linecap')),
    lineJoin: toLineJoin(node.getAttribute('stroke-linejoin')),
  }
}

function readColor(raw: string | null): string | null {
  if (!raw || raw === 'none' || raw === 'transparent') return null
  return raw
}

// ---- 路径 ----

const PATH_NUMBER_RE = /-?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g
const PATH_TOKEN_RE = new RegExp(
  `[MmLlHhVvCcQqAaZz]|${PATH_NUMBER_RE.source}`,
  'g',
)
const IS_COMMAND_RE = /[MmLlHhVvCcQqAaZz]/

/** 将 SVG path 的 `d` 属性按命令切分为「命令 + 参数」序列。 */
export function tokenizePath(d: string): Array<{ op: string; args: number[] }> {
  const tokens = d.match(PATH_TOKEN_RE)
  if (!tokens) return []

  const commands: Array<{ op: string; args: number[] }> = []
  let i = 0
  while (i < tokens.length) {
    const op = tokens[i]
    if (!IS_COMMAND_RE.test(op)) {
      i += 1 // 游离数字（非法输入）跳过
      continue
    }
    i += 1
    const args: number[] = []
    while (i < tokens.length && !IS_COMMAND_RE.test(tokens[i])) {
      args.push(Number(tokens[i]))
      i += 1
    }
    commands.push({ op, args })
  }
  return commands
}

/**
 * 在 ctx 上按 SVG 路径语义构建路径。
 *
 * 隐式重复参数（`l1 2 3 4 5 6` 等价于三次 lineto）按每组参数重复命令处理；
 * `M` 之后的额外参数对按隐式 `L` 处理。
 */
function buildPath(
  ctx: CanvasRenderingContext2D,
  d: string,
  ox: number,
  oy: number,
  scale: number,
): void {
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0

  const px = (v: number) => ox + v * scale
  const py = (v: number) => oy + v * scale

  for (const { op, args } of tokenizePath(d)) {
    const upper = op.toUpperCase()
    const relative = op !== upper
    let i = 0

    if (upper === 'Z') {
      ctx.closePath()
      cx = startX
      cy = startY
      continue
    }

    // 参数个数：M/L/T=2，H/V=1，C=6，Q=4，A=7
    const arity = upper === 'H' || upper === 'V' ? 1 : upper === 'A' ? 7 : upper === 'C' ? 6 : upper === 'Q' ? 4 : 2
    let first = true

    while (i + arity <= args.length) {
      let cmd = upper
      // M 的后续参数对按隐式 L 处理
      if (cmd === 'M' && !first) cmd = 'L'

      if (cmd === 'M') {
        cx = relative ? cx + args[i] : args[i]
        cy = relative ? cy + args[i + 1] : args[i + 1]
        startX = cx
        startY = cy
        ctx.moveTo(px(cx), py(cy))
      } else if (cmd === 'L' || cmd === 'T') {
        // T（平滑二次贝塞尔）在本图标集内未使用，按直线降级处理
        cx = relative ? cx + args[i] : args[i]
        cy = relative ? cy + args[i + 1] : args[i + 1]
        ctx.lineTo(px(cx), py(cy))
      } else if (cmd === 'H') {
        cx = relative ? cx + args[i] : args[i]
        ctx.lineTo(px(cx), py(cy))
      } else if (cmd === 'V') {
        cy = relative ? cy + args[i] : args[i]
        ctx.lineTo(px(cx), py(cy))
      } else if (cmd === 'C') {
        const x1 = relative ? cx + args[i] : args[i]
        const y1 = relative ? cy + args[i + 1] : args[i + 1]
        const x2 = relative ? cx + args[i + 2] : args[i + 2]
        const y2 = relative ? cy + args[i + 3] : args[i + 3]
        cx = relative ? cx + args[i + 4] : args[i + 4]
        cy = relative ? cy + args[i + 5] : args[i + 5]
        ctx.bezierCurveTo(px(x1), py(y1), px(x2), py(y2), px(cx), py(cy))
      } else if (cmd === 'Q') {
        const x1 = relative ? cx + args[i] : args[i]
        const y1 = relative ? cy + args[i + 1] : args[i + 1]
        cx = relative ? cx + args[i + 2] : args[i + 2]
        cy = relative ? cy + args[i + 3] : args[i + 3]
        ctx.quadraticCurveTo(px(x1), py(y1), px(cx), py(cy))
      } else if (cmd === 'A') {
        const rx = args[i]
        const ry = args[i + 1]
        const largeArc = args[i + 3] !== 0
        const sweep = args[i + 4] !== 0
        const x2 = relative ? cx + args[i + 5] : args[i + 5]
        const y2 = relative ? cy + args[i + 6] : args[i + 6]
        drawArcSegment(ctx, cx, cy, rx, ry, largeArc, sweep, x2, y2, px, py, scale)
        cx = x2
        cy = y2
      }

      i += arity
      first = false
    }
  }
}

type Projector = (value: number) => number

/**
 * 绘制一段 SVG 圆弧（无 x 轴旋转）。
 *
 * 图标集内的圆弧都是正圆（rx === ry），按标准「端点 → 圆心」参数化
 * （SVG 实现规范 F.6.1，此处 cosφ=1 / sinφ=0）换算为 ctx.arc；
 * 非正圆且环境支持 ctx.ellipse 时走椭圆，否则按 rx 退化处理。
 */
function drawArcSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  rxRaw: number,
  ryRaw: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
  px: Projector,
  py: Projector,
  scale: number,
): void {
  let rx = Math.abs(rxRaw)
  let ry = Math.abs(ryRaw)
  if (rx === 0 || ry === 0) {
    ctx.lineTo(px(x2), py(y2))
    return
  }

  const dx2 = (x1 - x2) / 2
  const dy2 = (y1 - y2) / 2
  const lambda = (dx2 * dx2) / (rx * rx) + (dy2 * dy2) / (ry * ry)
  if (lambda > 1) {
    // 半径过小无法连接两端点：按比例放大（SVG 规范 F.6.6）
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }

  const sign = largeArc === sweep ? -1 : 1
  const numerator = rx * rx * (ry * ry - dy2 * dy2) - ry * ry * dx2 * dx2
  const denominator = rx * rx * dy2 * dy2 + ry * ry * dx2 * dx2
  const coef = sign * Math.sqrt(Math.max(0, numerator / denominator))
  const ccx = coef * ((rx * dy2) / ry) + (x1 + x2) / 2
  const ccy = coef * (-(ry * dx2) / rx) + (y1 + y2) / 2

  const theta1 = Math.atan2((y1 - ccy) / ry, (x1 - ccx) / rx)
  const theta2 = Math.atan2((y2 - ccy) / ry, (x2 - ccx) / rx)
  let delta = theta2 - theta1
  if (sweep && delta < 0) delta += Math.PI * 2
  if (!sweep && delta > 0) delta -= Math.PI * 2

  // 圆心与半径按同一 scale 投影，等比缩放不改变角度，故角度无需修正
  const centerX = px(ccx)
  const centerY = py(ccy)
  if (rx !== ry && typeof ctx.ellipse === 'function') {
    ctx.ellipse(centerX, centerY, rx * scale, ry * scale, 0, theta1, theta1 + delta, delta < 0)
  } else {
    ctx.arc(centerX, centerY, rx * scale, theta1, theta1 + delta, delta < 0)
  }
}

function drawTextElement(
  ctx: CanvasRenderingContext2D,
  element: Extract<SvgElement, { kind: 'text' }>,
  ox: number,
  oy: number,
  scale: number,
): void {
  if (!element.fill || !element.content) return

  const prevAlign = ctx.textAlign
  const prevBaseline = ctx.textBaseline
  const prevFont = ctx.font

  ctx.font = `${element.fontWeight} ${element.fontSize * scale}px ${FONT_FAMILY}`
  ctx.fillStyle = element.fill
  ctx.textAlign = element.textAnchor
  ctx.textBaseline = element.textBaseline
  ctx.fillText(element.content, ox + element.x * scale, oy + element.y * scale)

  ctx.textAlign = prevAlign
  ctx.textBaseline = prevBaseline
  ctx.font = prevFont
}

// ---- 工具 ----

function num(raw: string | null, fallback = 0): number {
  if (raw === null) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function toLineCap(raw: string | null): CanvasLineCap {
  return raw === 'round' || raw === 'square' ? raw : 'butt'
}

function toLineJoin(raw: string | null): CanvasLineJoin {
  return raw === 'round' || raw === 'bevel' ? raw : 'miter'
}
