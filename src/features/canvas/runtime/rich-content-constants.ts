/**
 * 富内容（任务状态 / 标记 / 备注 / 链接 / 标签）的共享几何与配色常量。
 *
 * 基准是 DOM 渲染（`.mindmap-node__task` / `__meta` / `__labels` 的 CSS），
 * SVG 与 PNG（Canvas 2D）两端都从这里取值，避免三端口径漂移：
 *   - task 图标：节点左侧，垂直居中，`right: 100%` + `margin-right: 6px`
 *   - meta 图标行：节点右侧，垂直居中，`left: 100%` + `padding-left: 6px`，间距 4px
 *   - 标签胶囊行：节点下方水平居中，`top: 100%` + `margin-top: 4px`，间距 4px
 */

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
