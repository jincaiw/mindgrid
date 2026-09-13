/**
 * 主题图片几何常量的单一来源。
 *
 * DOM（global.css .mindmap-node__image）、布局（mindmap-layout.estimateNodeSize）、
 * SVG/PDF（svg-renderer）与 Canvas/PNG（canvas-renderer）四端共用这一组值，
 * 保证导出结果与画布显示一致。改这里即可同时影响四端。
 */

import type { WorldRect } from './render-tree'

/**
 * 布局为带图节点额外预留的高度。
 * 构成：图片本身 TOPIC_IMAGE_MAX_HEIGHT + 图与标题的间距 TOPIC_IMAGE_GAP = 88 + 8 = 96。
 */
export const TOPIC_IMAGE_BLOCK = 96

/** 图片最大绘制宽度（同时受节点内宽约束，见 computeTopicImageRect）。 */
export const TOPIC_IMAGE_MAX_WIDTH = 200

/** 图片最大绘制高度。等于 TOPIC_IMAGE_BLOCK - TOPIC_IMAGE_GAP，保证图片 + 间距正好用掉预留高度。 */
export const TOPIC_IMAGE_MAX_HEIGHT = 88

/** 图片底边与标题顶部的间距（对应 CSS .mindmap-node__image 的 margin-bottom）。 */
export const TOPIC_IMAGE_GAP = 8

/** 带图节点的最小宽度，保证图片不被压扁。 */
export const TOPIC_IMAGE_MIN_WIDTH = 120

/** 图片圆角（对应 CSS border-radius）。 */
export const TOPIC_IMAGE_RADIUS = 6

/** 有图时标题相对无图位置需要下移的距离（图片高度 + 间距），恰好等于 TOPIC_IMAGE_BLOCK。 */
export const TOPIC_IMAGE_TITLE_OFFSET = TOPIC_IMAGE_MAX_HEIGHT + TOPIC_IMAGE_GAP

/** 主题图片的绘制矩形（节点世界坐标系）。 */
export interface TopicImageRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 计算主题图片在节点内的绘制矩形。
 *
 * - `padding` 由调用方传入（两端都用 style-constants 的 `getNodePadding(depth)`），
 *   保证 SVG/PDF 与 Canvas/PNG 的几何完全一致。
 * - 顶边落在节点内边距处，水平居中（等价 CSS `margin: 0 auto`）。
 * - 宽度同时受最大宽度与节点内宽约束（等价 CSS `max-width: min(200px, 100%)`）。
 * - 绘制端按 `object-fit: contain` / `preserveAspectRatio="xMidYMid meet"` 在矩形内缩放居中。
 */
export function computeTopicImageRect(bounds: WorldRect, padding: number): TopicImageRect {
  const width = Math.max(0, Math.min(TOPIC_IMAGE_MAX_WIDTH, bounds.width - padding * 2))
  const height = Math.min(TOPIC_IMAGE_MAX_HEIGHT, TOPIC_IMAGE_BLOCK - TOPIC_IMAGE_GAP)

  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + padding,
    width,
    height,
  }
}

/**
 * 主题图片的**实际绘制区域**：把图片按 `object-fit: contain`
 * （等价 SVG 的 `preserveAspectRatio="xMidYMid meet"`）等比缩放到
 * `computeTopicImageRect` 的矩形内并居中后的那个矩形。
 *
 * 为什么必须单独算：绘制矩形是**固定尺寸**的槽位，而图片按自身比例要么顶满宽、
 * 要么顶满高，另一轴留黑边。圆角应该落在图片本体上，而不是槽位上——
 * 裁槽位时图片被内缩，圆角根本碰不到图片边缘，看起来就像没裁剪。
 *
 * Canvas/PNG 用它裁剪圆角，SVG/PDF 用它生成 `<clipPath>`；两处必须共用同一个函数，
 * 否则同一张图在 PNG 里是圆角、在 SVG 里是直角（历史缺陷）。
 * 需要图片固有尺寸，因此 SVG 端必须先解码，取不到就返回 null（不裁剪）。
 */
export function computeTopicImageFittedRect(
  bounds: WorldRect,
  padding: number,
  intrinsic: { width: number; height: number },
): TopicImageRect | null {
  if (intrinsic.width <= 0 || intrinsic.height <= 0) {
    return null
  }

  const rect = computeTopicImageRect(bounds, padding)
  const scale = Math.min(rect.width / intrinsic.width, rect.height / intrinsic.height)
  const width = intrinsic.width * scale
  const height = intrinsic.height * scale

  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  }
}
