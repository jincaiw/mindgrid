/**
 * 节点右侧 meta 图标行：**顺序与图形的唯一来源**。
 *
 * ## 为什么要有这个模块
 *
 * meta 行是「主题右侧一排小图标」，包含五类来源：
 * 标记（可多个）/ 备注 / 附件 / 语音备注 / 链接。
 * 它在项目里有**三个**绘制端：DOM（`canvas-host.tsx` 的 JSX）、
 * PNG（`canvas-renderer.ts`）、SVG（`svg-renderer.ts`）。
 *
 * 此前两端导出各自手写了一份 `if (rich.xxx) metaIcons.push(...)` 列表，
 * 结果是四类图标里：
 *   - 附件、语音备注：列表里**根本没有**（屏幕上看得见，导出里没有）
 *   - 备注、链接：图形与 DOM **不是同一个东西**（黄圆 vs 便签纸、蓝圆 vs 链条）
 * 三端各自"看起来没问题"，只有把导出图与屏幕并排放大才看得出来。
 *
 * 现在几何（`RICH_META_OFFSET` / `RICH_META_GAP` / `RICH_ICON_SIZE`）与
 * 图形（`*_ICON_SVG_INNER`）都已经各自唯一；这个模块把**最后一件事**——
 * "有哪几个图标、按什么顺序排"——也收成一个函数，两端导出都调它，
 * 于是"两端顺序不同"或"某端漏一类"在结构上不再可能。
 *
 * ⚠️ DOM 端是 JSX（附件/语音是按钮、链接是 `<a>`，元素类型不同），没法直接复用
 * 这个函数；`topic-meta-icons.test.ts` 用**渲染出来的 DOM** 与
 * `TOPIC_META_ICON_ORDER` 逐项比对顺序，并读 `canvas-host.tsx` 源码断言
 * 那四个 Glyph 组件不再内联第二份图形。
 */

import { markerToSvgInner } from '../markers'
import type { TopicRichContent } from './render-tree'
import {
  ATTACHMENT_ICON_SVG_INNER,
  LINK_ICON_SVG_INNER,
  NOTE_ICON_SVG_INNER,
  VOICE_NOTE_ICON_SVG_INNER,
} from './rich-content-constants'

/** meta 行里可能出现的一类图标。 */
export type TopicMetaIconKind = 'marker' | 'notes' | 'attachment' | 'voiceNote' | 'link'

/**
 * meta 行的绘制顺序（自左向右）。
 *
 * 必须与 DOM `.mindmap-node__meta` 里 JSX 的书写顺序一致 ——
 * 图标是一个接一个按 `RICH_ICON_SIZE + RICH_META_GAP` 排开的，
 * 顺序不同会让同一个图标在屏幕与导出里落在不同的 x 上。
 */
export const TOPIC_META_ICON_ORDER: readonly TopicMetaIconKind[] = [
  'marker',
  'notes',
  'attachment',
  'voiceNote',
  'link',
]

export interface TopicMetaIcon {
  kind: TopicMetaIconKind
  /** 14×14 viewBox 的内部 SVG 片段。 */
  inner: string
}

/** 按 `TOPIC_META_ICON_ORDER` 展开一个主题的 meta 图标序列。 */
export function buildTopicMetaIcons(rich: TopicRichContent | undefined): TopicMetaIcon[] {
  if (!rich) return []

  const icons: TopicMetaIcon[] = []
  for (const kind of TOPIC_META_ICON_ORDER) {
    switch (kind) {
      case 'marker':
        // 标记可以同时贴多个，每个占一格
        for (const marker of rich.markers ?? []) {
          icons.push({ kind, inner: markerToSvgInner(marker) })
        }
        break
      case 'notes':
        if (rich.notes && rich.notes.length > 0) {
          icons.push({ kind, inner: NOTE_ICON_SVG_INNER })
        }
        break
      case 'attachment':
        if (rich.attachment) {
          icons.push({ kind, inner: ATTACHMENT_ICON_SVG_INNER })
        }
        break
      case 'voiceNote':
        if (rich.voiceNote) {
          icons.push({ kind, inner: VOICE_NOTE_ICON_SVG_INNER })
        }
        break
      case 'link':
        if (rich.link) {
          icons.push({ kind, inner: LINK_ICON_SVG_INNER })
        }
        break
    }
  }
  return icons
}
