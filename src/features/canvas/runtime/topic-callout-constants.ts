/**
 * 标注（callout）的几何常量与落点计算：DOM / Canvas(PNG) / SVG 三端共用。
 *
 * **不参与布局**：callout 是挂在节点外侧的说明框，靠节点的溢出显示呈现，
 * 与贴纸同理——它不改变 `estimateNodeSize`，因此不会动到已校准的节点几何。
 * 这条是刻意的：外框（boundary）也是"渲染节点 + 不进布局"，callout 沿用同一思路，
 * 于是对齐 XMind 的画布表达能力，代价为零几何风险。
 *
 * 文本换行用 `wrapText`（与节点标题同一函数）。**DOM 不自己换行**——DOM 给的是固定
 * 内容宽度 + 与 wrapText 相同的字号/字体，换行结果由 CSS 决定，与导出端同源（项目既有的
 * 节点标题也是这个模式：DOM CSS 是几何基线，wrapText 照 CSS 行为实现）。
 *
 * 与贴纸的差别只是多了文本与引线：框高随行数变、框到节点之间画一条短引线。
 */

/** 标注框的绘制宽度（世界单位）。第一版固定，不做宽度调整。 */
export const TOPIC_CALLOUT_WIDTH = 150

/** 框的内边距。 */
export const TOPIC_CALLOUT_PADDING = 8

/** 正文字号（比节点标题小一号，视觉上从属于主题）。 */
export const TOPIC_CALLOUT_FONT_SIZE = 12

/** 行高系数，与节点标题一致（style-constants 里标题也用 1.35）。 */
export const TOPIC_CALLOUT_LINE_HEIGHT = TOPIC_CALLOUT_FONT_SIZE * 1.35

/** 最少占两行高的视觉下限，避免空文本时框塌成一条线。 */
export const TOPIC_CALLOUT_MIN_HEIGHT = 24

/** 引线长度：节点边缘到框边缘的距离。 */
export const TOPIC_CALLOUT_LEAD = 10

/** 框的圆角。 */
export const TOPIC_CALLOUT_RADIUS = 6

/** 框内可用于文本的宽度。 */
export const TOPIC_CALLOUT_TEXT_WIDTH = TOPIC_CALLOUT_WIDTH - TOPIC_CALLOUT_PADDING * 2

/** 一条标注的完整落点（三端共用）。 */
export interface TopicCalloutPlacement {
  /** 相对节点中心的偏移（DOM 用 `calc(50% ± Npx)` 表达）。 */
  offsetX: number
  offsetY: number
  /** 框左上角的世界坐标（PNG / SVG 用）。 */
  x: number
  y: number
  /** 框尺寸（世界单位）。 */
  width: number
  height: number
  /** 挂在节点的哪一侧：右侧分支挂右、左侧分支挂左。 */
  side: 'left' | 'right'
}

/** 主题上存的标注。位置可选——没显式摆放过就由渲染端按默认落点现算。 */
export interface TopicCalloutLike {
  text: string
  offsetX?: number
  offsetY?: number
}

/**
 * 计算标注的落点。
 *
 * `lineCount` 由调用方给出（三端都用 `wrapText` 算），
 * 这样"几行"在三端是同一个数——否则一端多一行就会错位。
 */
export function computeTopicCalloutPlacement(
  bounds: { x: number; y: number; width: number; height: number },
  callout: TopicCalloutLike,
  lineCount: number,
  nodeSide: 'left' | 'right' | 'center',
): TopicCalloutPlacement {
  const safeLines = Number.isFinite(lineCount) && lineCount > 0 ? Math.floor(lineCount) : 1
  const height = Math.max(
    TOPIC_CALLOUT_MIN_HEIGHT,
    TOPIC_CALLOUT_PADDING * 2 + safeLines * TOPIC_CALLOUT_LINE_HEIGHT,
  )
  const width = TOPIC_CALLOUT_WIDTH

  // 中心主题两侧都有分支，统一挂右侧（与 XMind 观感一致）
  const side: 'left' | 'right' = nodeSide === 'left' ? 'left' : 'right'
  const direction = side === 'left' ? -1 : 1

  // 默认落点：框贴在节点外侧，垂直与节点居中
  const fallbackOffsetX = direction * (bounds.width / 2 + TOPIC_CALLOUT_LEAD + width / 2)
  const offsetX = callout.offsetX ?? fallbackOffsetX
  const offsetY = callout.offsetY ?? 0

  return {
    offsetX,
    offsetY,
    x: bounds.x + bounds.width / 2 + offsetX - width / 2,
    y: bounds.y + bounds.height / 2 + offsetY - height / 2,
    width,
    height,
    side,
  }
}

/**
 * 引线的两个端点（世界坐标）。从节点边缘中点画到框的边缘中点。
 *
 * 单独抽出来是为了三端画同一条线——各画一次迟早会有一端取不同的边缘（含/不含边框）。
 */
export function computeTopicCalloutLead(
  bounds: { x: number; y: number; width: number; height: number },
  placement: TopicCalloutPlacement,
): { x1: number; y1: number; x2: number; y2: number } {
  const y = bounds.y + bounds.height / 2 + placement.offsetY
  return placement.side === 'left'
    ? {
        x1: bounds.x,
        y1: y,
        x2: placement.x + placement.width,
        y2: y,
      }
    : {
        x1: bounds.x + bounds.width,
        y1: y,
        x2: placement.x,
        y2: y,
      }
}

/**
 * 引线相对**标注元素左上角**的盒子（DOM 用）。
 *
 * 为什么单独给 DOM 一个版本：DOM 里拿不到节点的世界 bounds（只有节点尺寸），
 * 所以按"相对节点中心"算；但**"节点边缘"的定义必须与导出端一致**（`computeTopicCalloutLead` 用 `bounds.x + bounds.width`），
 * 于是这里也用 `nodeWidth / 2` 作为边缘。
 */
export function computeTopicCalloutLeadBox(
  nodeWidth: number,
  placement: TopicCalloutPlacement,
): { left: number; top: number; width: number } {
  const nodeEdge =
    placement.side === 'left' ? -nodeWidth / 2 : nodeWidth / 2
  const boxEdge =
    placement.side === 'left'
      ? placement.offsetX + placement.width / 2
      : placement.offsetX - placement.width / 2
  const boxLeft = placement.offsetX - placement.width / 2

  return {
    left: Math.min(nodeEdge, boxEdge) - boxLeft,
    top: placement.height / 2,
    width: Math.abs(boxEdge - nodeEdge),
  }
}
