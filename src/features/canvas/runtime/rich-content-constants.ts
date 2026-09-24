/**
 * 富内容（任务状态 / 标记 / 备注 / 链接 / 标签）的共享几何与配色常量。
 *
 * 基准是 DOM 渲染（`.mindmap-node__task` / `__meta` / `__labels` 的 CSS），
 * SVG 与 PNG（Canvas 2D）两端都从这里取值，避免三端口径漂移：
 *   - task 图标：节点左侧，垂直居中，`right: 100%` + `margin-right: 6px`
 *   - meta 图标行：节点右侧，垂直居中，`left: 100%` + `padding-left: 6px`，间距 4px
 *   - 标签胶囊行：节点下方水平居中，`top: 100%` + `margin-top: 4px`，间距 4px
 */

import { hasTopicEquation } from '../../../lib/document/equation'
import type { TopicSnapshot } from '../../../lib/document/types'
import { TOPIC_EQUATION_BLOCK, TOPIC_EQUATION_MIN_WIDTH } from './topic-equation-constants'
import { TOPIC_IMAGE_BLOCK, TOPIC_IMAGE_MIN_WIDTH } from './topic-image-constants'

/** 富内容图标的边长（DOM：`MarkerIcon` / `TaskStatusIcon` 默认 size=14）。 */
export const RICH_ICON_SIZE = 14

/** 图标内部 SVG 的 viewBox 边长（markerToSvgInner 等输出的坐标系）。 */
export const RICH_SVG_VIEWBOX = 14

/** meta 图标之间的水平间距（DOM `.mindmap-node__meta` gap）。 */
export const RICH_META_GAP = 4

/** 任务图标与节点左缘的间距（DOM `.mindmap-node__task` margin-right）。 */
export const RICH_TASK_GAP = 6

/** meta 图标行与节点右缘的间距（DOM `.mindmap-node__meta` padding-left）。 */
export const RICH_META_OFFSET = 6

/** 标签行与节点下缘的间距（DOM `.mindmap-node__labels` margin-top）。 */
export const RICH_LABEL_TOP_GAP = 4

/** 标签之间的水平间距（DOM `.mindmap-node__labels` gap）。 */
export const RICH_LABEL_GAP = 4

/** 标签胶囊字号（DOM `.mindmap-node__label` font-size）。 */
export const RICH_LABEL_FONT_SIZE = 11

/** 标签胶囊高度（DOM：11px × line-height 1.4 + padding 1px×2 ≈ 18）。 */
export const RICH_LABEL_HEIGHT = 18

/** 标签胶囊的水平内边距（DOM `.mindmap-node__label` padding: 1px 8px）。 */
export const RICH_LABEL_PADDING_X = 8

/** 标签胶囊最小宽度，避免单字标签过窄。 */
export const RICH_LABEL_MIN_WIDTH = 28

/** 最多展示的标签数量，超出以 `+N` 胶囊收尾。 */
export const RICH_LABEL_MAX_SHOWN = 3

/** 标签胶囊背景色（DOM `var(--color-accent-tint)` 的等价静态值）。 */
export const RICH_LABEL_BACKGROUND = 'rgba(91,140,255,0.12)'

/** 标签文字颜色（DOM `.mindmap-node__label` color）。 */
export const RICH_LABEL_TEXT_COLOR = '#3b5bdb'

/** 备注指示图标（14×14 viewBox 内部元素），与 DOM 的 `NoteGlyph` 对齐。 */
export const NOTE_ICON_SVG_INNER =
  '<circle cx="7" cy="7" r="6" fill="#f6be00"/><path d="M4 6h6M4 8h6M4 10h4" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>'

/** 链接指示图标（14×14 viewBox 内部元素），与 DOM 的 `LinkGlyph` 对齐。 */
export const LINK_ICON_SVG_INNER =
  '<circle cx="7" cy="7" r="6" fill="#5b8cff"/><path d="M4.5 9.5L9 5M9 5H6M9 5v3" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'

/**
 * 富内容在**节点高度**上占用的固定块 —— 图片与方程各一块。
 *
 * ## 为什么必须抽成唯一来源（这是一个真实缺陷的修法）
 *
 * 节点尺寸在两处各有一份实现（`mindmap-layout.estimateNodeSize` 与
 * `layouts/layout-utils.estimateNodeSize`，后者服务**所有非思维导图骨架**）。
 * 方程那一版只在 `mindmap-layout` 里补了槽位，`layout-utils` 里的图片块**从来没补过** ——
 * 于是鱼骨 / 气泡 / 时间轴 / 组织架构 / 矩阵这五种骨架里，给主题加图片后：
 * **布局一分钱不给（分配高 41），而 DOM / Canvas / SVG 三处都照着
 * `TOPIC_IMAGE_TITLE_OFFSET` 把图片与标题往下画（需要 137）** → 内容溢出节点框 96px、
 * 压到相邻节点上。实测确认（`node-size.test.ts` 的笛卡尔积守卫与
 * `dev/capture-rich-content-dom.mjs` 的真机量测）。
 *
 * 修法不是"把两处改成一样"（下次还会漂），而是**把这段逻辑收成一个函数**，
 * 两处都调它。这样"漂移"在结构上不再可能，两处只剩下文字度量那部分需要对照。
 *
 * ⚠️ 新增影响节点尺寸的富内容时，只改这里；`node-size.test.ts` 里把该字段加进
 * `SIZE_FEATURES` 列表，所有组合都会被对照覆盖。
 *
 * 顺序即绘制顺序：图片在上、方程在图片之下、标题最后 —— 高度是**累加**而不是取最大。
 */
export function applyRichContentBlocks(
  size: { width: number; height: number },
  topic: Pick<TopicSnapshot, 'image' | 'equation'>,
): { width: number; height: number } {
  let { width, height } = size

  if (topic.image) {
    width = Math.max(width, TOPIC_IMAGE_MIN_WIDTH)
    height += TOPIC_IMAGE_BLOCK
  }

  if (hasTopicEquation(topic.equation)) {
    width = Math.max(width, TOPIC_EQUATION_MIN_WIDTH)
    height += TOPIC_EQUATION_BLOCK
  }

  return { width, height }
}
