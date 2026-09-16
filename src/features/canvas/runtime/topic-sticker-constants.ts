/**
 * 贴纸几何常量：DOM / Canvas(PNG) / SVG 三端共用的单一来源。
 *
 * 与主题图片不同，贴纸**不参与布局**——它贴在节点上、可以压住文字，
 * 因此不需要在 `estimateNodeSize` 里预留空间，也就不会动到已校准的节点几何。
 * 这一点是刻意的：贴纸是装饰，不该改变图的结构尺寸。
 */

/** 贴纸绘制边长（世界单位）。 */
export const TOPIC_STICKER_SIZE = 28

/** 连续贴多张时的横向步距：略小于边长，让它们像"贴成一排"而不是散开。 */
export const TOPIC_STICKER_STRIDE_X = 22

/**
 * **未被拖过**的贴纸落在哪：节点左上角内侧，按 `index` 向右排开。
 *
 * 为什么不落中心：第一版落在节点正中间，实测（真引擎截图）会直接压住标题文字。
 * 但要在"贴"的那一刻算出左上角就得知道节点宽高，而那时只有文档、没有布局。
 * 所以默认位置**延迟到渲染时**按节点尺寸现算：存储里不写 offset，
 * 三端各自用同一个函数算出同一个位置。
 *
 * 与节点尺寸无关的常量只保留"步距"，保证多张贴纸排开而不是叠成一坨。
 */
function defaultOffsetForBounds(
  bounds: { width: number; height: number },
  index: number,
): { offsetX: number; offsetY: number } {
  const safeIndex = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0
  return {
    offsetX: -bounds.width / 2 + TOPIC_STICKER_SIZE / 2 + safeIndex * TOPIC_STICKER_STRIDE_X,
    offsetY: -bounds.height / 2 + TOPIC_STICKER_SIZE / 2,
  }
}

/** 单个主题的贴纸数量上限（防误操作把节点贴满）。 */
export const TOPIC_STICKER_MAX_PER_TOPIC = 12

/** 每次"旋转"调整的角度（度）。 */
export const TOPIC_STICKER_ROTATION_STEP = 15

/** 一张贴纸的落点（三端共用）。 */
export interface TopicStickerPlacement {
  /** 相对节点中心的偏移（DOM 用 `calc(50% ± Npx)` 表达）。 */
  offsetX: number
  offsetY: number
  /** 贴纸中心的世界坐标（PNG / SVG 导出用）。 */
  cx: number
  cy: number
  /** 绘制边长（世界单位）。 */
  size: number
  /** 旋转角度（度）。 */
  rotation: number
}

/**
 * 计算贴纸在世界坐标里的落点。
 *
 * **三端必须调这一个函数**：DOM 用 `calc(50% + offset)` 表达同一语义，
 * Canvas(PNG) 与 SVG 用它拿到绝对坐标。此前图片那轮已经证明——
 * 只要有一端自己算，就会出现"屏幕上对、导出里歪"。
 */
export function computeTopicStickerPlacement(
  bounds: { x: number; y: number; width: number; height: number },
  sticker: { offsetX?: number; offsetY?: number; rotation?: number },
  index = 0,
): TopicStickerPlacement {
  // 没有被显式摆放过的贴纸走"默认落点"（节点左上角、按序排开）；
  // 拖过一次之后 offset 就写进文档，两端都用存下来的值。
  const fallback = defaultOffsetForBounds(bounds, index)
  const offsetX = sticker.offsetX ?? fallback.offsetX
  const offsetY = sticker.offsetY ?? fallback.offsetY

  return {
    offsetX,
    offsetY,
    cx: bounds.x + bounds.width / 2 + offsetX,
    cy: bounds.y + bounds.height / 2 + offsetY,
    size: TOPIC_STICKER_SIZE,
    rotation: sticker.rotation ?? 0,
  }
}

/**
 * 生成一个贴纸实例 id。
 *
 * 为什么前端生成：命令是"整体替换贴纸列表"，服务端只存不造 id；
 * 而同一个贴纸可以贴多次，必须由发起方区分。时间戳 + 随机后缀足够避免
 * 同一文档内的碰撞（同毫秒连点也不会重）。
 */
export function createStickerInstanceId(): string {
  return `sticker_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
