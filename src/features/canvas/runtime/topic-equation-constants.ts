/**
 * 主题方程几何常量的单一来源。
 *
 * DOM（global.css `.mindmap-node__equation`）、布局（两处 `estimateNodeSize`）、
 * SVG/PDF（svg-renderer）与 Canvas/PNG（canvas-renderer）共用这一组值，
 * 保证导出结果与画布显示一致 —— 与主题图片（`topic-image-constants`）同一套做法。
 *
 * ## 版面契约：**固定槽位 + 只缩不放**
 *
 * 与图片最大的不同：方程的固有尺寸来自**渲染结果**（MathJax 的 viewBox），
 * 而布局必须是纯同步的（它不能等渲染）。所以这里沿用图片那条路：
 * **布局预留一个固定高度的槽位**，绘制时把方程按比例"contain"进槽位。
 *
 * 唯一的差别是**只缩不放**：图片槽位允许把小图放大到填满，方程不行 ——
 * 一条 `x` 被放大到槽位高度会显得比周围文字大得多。方程的自然尺寸按
 * **节点字号**折算（见 `EQUATION_UNITS_PER_EM`），超过槽位才缩。
 *
 * 代价：一条很矮的方程也会占掉整个槽位的高度（和图片一样多留了空白）。
 * 想要"槽位随公式高度自适应"，就得把渲染结果喂给布局 —— 那会让布局依赖一个
 * 异步填充的缓存（首帧与预热后结果不同，节点尺寸会跳），这一版**刻意不做**。
 */

import type { WorldRect } from './render-tree'

/**
 * MathJax 的 viewBox 单位与字号的关系。
 *
 * 推导（实测，非猜测）：`a^2+b^2=c^2` 的 viewBox 高度是 1083.9 单位，
 * 而同一个 SVG 自报 `height="2.452ex"` → 1.084em（MathJax 的 ex = 0.442em）
 * → **1000 单位 = 1em**。所以自然尺寸 = viewBox 数值 / 1000 × 节点字号。
 */
export const EQUATION_UNITS_PER_EM = 1000

/** 方程槽位的高度上限（≈3em @13px 字号：够放分式、求和上下限）。 */
export const TOPIC_EQUATION_MAX_HEIGHT = 40

/** 方程最大绘制宽度（同时受节点内宽约束，见 computeTopicEquationRect）。 */
export const TOPIC_EQUATION_MAX_WIDTH = 220

/** 方程底边与标题顶部的间距（对应 CSS 的 margin-bottom）。与图片保持一致。 */
export const TOPIC_EQUATION_GAP = 8

/** 带方程的节点最小宽度，保证方程不被压得太窄。 */
export const TOPIC_EQUATION_MIN_WIDTH = 120

/**
 * 布局为带方程的节点额外预留的高度。
 * 构成：槽位高度 TOPIC_EQUATION_MAX_HEIGHT + 与标题的间距 TOPIC_EQUATION_GAP = 48。
 */
export const TOPIC_EQUATION_BLOCK = TOPIC_EQUATION_MAX_HEIGHT + TOPIC_EQUATION_GAP

/** 方程在节点内的槽位（节点世界坐标系）。 */
export interface TopicEquationSlot {
  x: number
  y: number
  width: number
  height: number
}

/** 渲染结果里我们用到的那部分：viewBox 的宽高（MathJax 单位）。 */
export interface TopicEquationIntrinsic {
  width: number
  height: number
}

/** 方程在节点内的固定槽位（顶边落在节点内边距处，水平居中）。 */
export function computeTopicEquationSlot(bounds: WorldRect, padding: number): TopicEquationSlot {
  const width = Math.max(0, Math.min(TOPIC_EQUATION_MAX_WIDTH, bounds.width - padding * 2))
  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + padding,
    width,
    height: TOPIC_EQUATION_MAX_HEIGHT,
  }
}

/**
 * 方程的实际绘制矩形：按节点字号折算自然尺寸，再"contain + **只缩不放**"进槽位并居中。
 *
 * - `fontSize` 用调用方所在深度的节点字号（`nodeMetrics(depth).fontSize`，
 *   并已乘上 `getFontScale`），DOM 与三端导出必须传同一个值，否则大小会不一致。
 * - 取不到渲染结果（引擎未就绪/语法错误）时返回 null —— 与图片"解码失败不画"同一约定。
 */
export function computeTopicEquationRect(
  bounds: WorldRect,
  padding: number,
  intrinsic: TopicEquationIntrinsic,
  fontSize: number,
): TopicEquationSlot | null {
  if (!(intrinsic.width > 0) || !(intrinsic.height > 0)) {
    return null
  }
  const safeFontSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 0
  if (safeFontSize <= 0) {
    return null
  }

  const naturalWidth = (intrinsic.width / EQUATION_UNITS_PER_EM) * safeFontSize
  const naturalHeight = (intrinsic.height / EQUATION_UNITS_PER_EM) * safeFontSize
  const slot = computeTopicEquationSlot(bounds, padding)
  const scale = Math.min(
    1,
    slot.width > 0 ? slot.width / naturalWidth : 0,
    slot.height > 0 ? slot.height / naturalHeight : 0,
  )
  if (!(scale > 0)) {
    return null
  }

  const width = naturalWidth * scale
  const height = naturalHeight * scale
  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height,
  }
}
