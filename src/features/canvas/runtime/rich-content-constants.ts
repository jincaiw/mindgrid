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

/**
 * meta 行图标的**唯一来源**（14×14 viewBox 内部元素）。
 *
 * ## 这四个常量为什么必须同时被 DOM 与导出端渲染
 *
 * 它们原先只是"导出端的副本"，DOM 侧另有四个手写的 JSX 组件（`NoteGlyph` /
 * `LinkGlyph` / `AttachmentGlyph` / `VoiceNoteGlyph`），靠注释里一句"与 DOM 对齐"
 * 维持。实测结果是四组里**两组图形根本不是同一个东西、两组导出里完全没有**：
 *   - 备注：DOM 是黄色便签纸（折角 + 三行字），导出的却是"黄圆 + 白线"
 *   - 链接：DOM 是蓝色链条，导出的却是"蓝圆 + 白箭头"
 *   - 附件、语音备注：导出端连字段都没接进去，图标整个不存在
 * 都在屏幕上看不出来，只有把导出图放大对照才发现。
 *
 * 现在的约定是**结构性**的：DOM 的四个 Glyph 组件用 `dangerouslySetInnerHTML`
 * 渲染这四个常量（见 `canvas-host.tsx`），导出端直接用同样的字符串。
 * `topic-meta-icons.test.ts` 会读 `canvas-host.tsx` 的源码，断言组件里不再出现
 * 内联的 `d="…"` —— 想再写第二份图形会被守卫拦住。
 *
 * ⚠️ 写新图标时：`svg-inner-canvas` 只支持 `<circle>` / `<path>` / `<text>`，
 * 用别的元素（例如 `<rect>`）会被**静默跳过**，PNG 里少一块且不报错。
 * `topic-meta-icons.test.ts` 里有一条"每个元素都必须被解析出来"的守卫。
 */

/** 备注指示图标：黄色便签纸 + 折角 + 三行字（与 DOM 屏幕表现一致）。 */
export const NOTE_ICON_SVG_INNER =
  '<path d="M2.5 1.5h6l3 3v8h-9z" fill="#f6be00" fill-opacity="0.18" stroke="#f6be00" stroke-width="1" stroke-linejoin="round"/>' +
  '<path d="M8.5 1.5v3h3" fill="none" stroke="#f6be00" stroke-width="1" stroke-linejoin="round"/>' +
  '<path d="M4 6.5h5M4 8.5h5M4 10.5h3" fill="none" stroke="rgba(180,83,9,0.5)" stroke-width="0.8" stroke-linecap="round"/>'

/** 链接指示图标：蓝色链条（与 DOM 屏幕表现一致）。 */
export const LINK_ICON_SVG_INNER =
  '<path d="M5.5 8.5l3-3M5 6a2.5 2.5 0 0 0 -3 0l-.5.5a2.5 2.5 0 0 0 3.5 3.5L6 9M9 8a2.5 2.5 0 0 0 3 0l.5-.5a2.5 2.5 0 0 0 -3.5 -3.5L8 5" fill="none" stroke="#5b8cff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'

/** 附件指示图标：黄色回形针。 */
export const ATTACHMENT_ICON_SVG_INNER =
  '<path d="M9.5 4.5l-4 4a2 2 0 0 0 2.8 2.8l4.2-4.2a3.5 3.5 0 0 0 -5 -5L3.2 6.4a5 5 0 0 0 7 7l1.6-1.6" fill="none" stroke="#f6be00" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'

/**
 * 语音备注指示图标：红色话筒（囊体 + 拾音弧 + 支脚）。
 *
 * ⚠️ 话筒的囊体**用 path 表达而不是 `<rect rx>`**：DOM 原来写的是 `<rect>`，
 * 而 `svg-inner-canvas` 不支持 `<rect>`（静默跳过），照抄到导出端会只剩弧和支脚。
 * DOM 侧现在也从这一个常量渲染，所以两边是同一个形状。
 */
export const VOICE_NOTE_ICON_SVG_INNER =
  // 囊体 = 圆角矩形（x 5.4→8.6、y 1.6→8.0、rx 1.6）用两段半圆 + 两条直边表达；
  // sweep 取 0（counter-clockwise）才会分别从**下方**与**上方**绕过去。
  '<path d="M5.4 3.2L5.4 6.4A1.6 1.6 0 0 0 8.6 6.4L8.6 3.2A1.6 1.6 0 0 0 5.4 3.2Z" fill="#e5484d"/>' +
  '<path d="M3.2 6.6a3.8 3.8 0 0 0 7.6 0" fill="none" stroke="#e5484d" stroke-width="1.2" stroke-linecap="round"/>' +
  '<path d="M7 10.4v2" fill="none" stroke="#e5484d" stroke-width="1.2" stroke-linecap="round"/>'

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
