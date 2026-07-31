/**
 * 共享样式常量与文本度量工具。
 *
 * Canvas 2D Renderer、SVG Renderer、PNG Exporter 共用同一套色彩、字体、几何常量，
 * 保证三种渲染路径的视觉一致性。
 *
 * 节点视觉按深度分级（参考 XMind）：根节点 / 一级分支 / 二级 / 叶子各有不同的
 * 字号、字重、圆角与内边距，形成清晰的视觉层级。
 *
 * 连接线使用 8 色循环的分支色板：根的每个直接子节点决定其整条分支的连线颜色，
 * 子分支继承父分支色，线宽按深度逐级递减。
 *
 * 文本度量通过模块级离屏 canvas 实现；jsdom 等无真实 2D 上下文的环境回退到字符数估算。
 */

// ---- 色彩（从 canvas-renderer.ts 投影）----

export const COLORS = {
  // 背景
  backgroundRadial: 'rgba(91, 140, 255, 0.08)',
  backgroundLinearTop: 'rgba(238, 244, 255, 0.82)',
  backgroundLinearBottom: 'rgba(229, 236, 248, 0.66)',
  gridLine: 'rgba(91, 140, 255, 0.06)',

  // 边（回退色，实际连线优先使用分支色）
  edge: 'rgba(41, 88, 176, 0.34)',
  edgeActive: 'rgba(59, 130, 246, 0.74)',

  // 主题
  text: '#0f172a',
  textMeta: 'rgba(15, 23, 42, 0.54)',
  textRootMeta: 'rgba(255, 255, 255, 0.82)',
  border: 'rgba(15, 23, 42, 0.08)',
  nodeBgLeft: 'rgba(255, 255, 255, 0.94)',
  nodeBgRight: 'rgba(255, 255, 255, 0.96)',

  // 状态
  activeBorder: 'rgba(59, 130, 246, 0.45)',
  activeRing: 'rgba(59, 130, 246, 0.12)',
  selectedRing: 'rgba(59, 130, 246, 0.16)',
  searchMatchBorder: 'rgba(14, 165, 233, 0.22)',
  searchActiveRing: 'rgba(14, 165, 233, 0.12)',
  dropTargetBorder: 'rgba(16, 185, 129, 0.52)',
  dropTargetRing: 'rgba(16, 185, 129, 0.12)',
  historyFocusBorder: 'rgba(59, 130, 246, 0.4)',
  historyFocusRing: 'rgba(59, 130, 246, 0.1)',

  // 覆盖层
  selectionBorder: 'rgba(59, 130, 246, 0.48)',
  selectionFill: 'rgba(59, 130, 246, 0.12)',
  dropIndicatorBg: 'rgba(12, 21, 40, 0.92)',
  dropIndicatorText: 'rgba(255, 255, 255, 0.92)',

  // 装饰元素（关系线 / 边界 / 概要）
  relationshipLine: 'rgba(168, 85, 247, 0.56)',
  relationshipLabelBg: 'rgba(168, 85, 247, 0.12)',
  relationshipLabelText: 'rgba(107, 33, 168, 0.92)',
  boundaryFill: 'rgba(245, 158, 11, 0.06)',
  boundaryBorder: 'rgba(245, 158, 11, 0.42)',
  boundaryLabelText: 'rgba(180, 83, 9, 0.88)',
  summaryBracket: 'rgba(14, 165, 233, 0.5)',
  summaryLabelText: 'rgba(2, 132, 199, 0.92)',
} as const

export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

// ---- 深度分级几何常量（参考 XMind）----

/** 节点圆角按深度递减：根 12 → L1 8 → L2 6 → L3+ 6。 */
export function getNodeRadius(depth: number): number {
  if (depth === 0) return 12
  if (depth === 1) return 8
  return 6
}

/** 保留旧常量名供 SVG renderer 过渡使用（等同于 depth>0 的默认圆角）。 */
export const NODE_RADIUS = 12
export const SELECTION_RADIUS = 12
export const TOGGLE_RADIUS = 11
export const TOGGLE_BUTTON_SIZE = 22

// ---- 深度分级字号 / 字重 ----

/** 标题字号按深度递减：根 18 → L1 14 → L2 13 → L3+ 12。 */
export function getTitleFontSize(depth: number): number {
  if (depth === 0) return 18
  if (depth === 1) return 14
  if (depth === 2) return 13
  return 12
}

/** 标题字重按深度递减：根 600 → L1 600 → L2 500 → L3+ 400。 */
export function getTitleFontWeight(depth: number): number {
  if (depth <= 1) return 600
  if (depth === 2) return 500
  return 400
}

// ---- 分支色板（8 色循环，参考 XMind）----

/**
 * 每条主分支（根的直接子节点）分配一个色相，其所有后代继承该色。
 * 用于连线和节点强调，形成视觉上的分支编码。
 */
export const BRANCH_COLORS = [
  '#5B8DEF', // 蓝
  '#FF8B3D', // 橙
  '#4CB050', // 绿
  '#E5484D', // 红
  '#9B6BFF', // 紫
  '#00A6A6', // 青
  '#F6BE00', // 黄
  '#EC6CB0', // 粉
] as const

/** 按分支索引取色（循环）。 */
export function getBranchColor(branchIndex: number): string {
  return BRANCH_COLORS[branchIndex % BRANCH_COLORS.length]
}

// ---- 连接线线宽（按深度逐级递减）----

/** 父→子连线的线宽，按子节点深度递减。激活态 +0.5px。 */
export function getEdgeLineWidth(childDepth: number, isActive = false): number {
  let width: number
  if (childDepth <= 1) width = 2.5
  else if (childDepth === 2) width = 2
  else if (childDepth === 3) width = 1.5
  else width = 1
  return isActive ? width + 0.5 : width
}

// ---- 文本度量 ----

/** 离屏 canvas 2D 上下文，用于文本宽度度量。jsdom 环境下可能为 null。 */
let measureContext: CanvasRenderingContext2D | null = null

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext !== null) {
    return measureContext
  }

  if (typeof document === 'undefined') {
    return null
  }

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    measureContext = context ?? null
  } catch {
    measureContext = null
  }

  return measureContext
}

/** 估算字符平均宽度（无真实 2D 上下文时的回退）。 */
const FALLBACK_CHAR_WIDTH = 8

/**
 * 度量文本在指定字体下的像素宽度。
 *
 * 优先使用离屏 canvas 的 measureText；jsdom 等无真实上下文的环境回退到字符数 × 估算宽度。
 * 这与 canvas-renderer.test.ts 中 `measureText: vi.fn((text) => ({ width: text.length * 8 }))` 的 mock 一致。
 */
export function measureTextWidth(text: string, font: string): number {
  const context = getMeasureContext()

  if (context) {
    context.font = font
    return context.measureText(text).width
  }

  return text.length * FALLBACK_CHAR_WIDTH
}

/**
 * 按最大宽度换行文本（中英文混合，逐字符测量）。
 *
 * 与 canvas-renderer 原有的 wrapText 逻辑一致：先按显式换行拆分，再逐字符测量超宽拆行。
 */
export function wrapText(text: string, maxWidth: number, font: string): string[] {
  const explicitLines = text.split('\n')
  const result: string[] = []

  for (const line of explicitLines) {
    if (measureTextWidth(line, font) <= maxWidth) {
      result.push(line)
      continue
    }

    let current = ''
    for (const char of line) {
      const test = current + char
      if (measureTextWidth(test, font) > maxWidth && current.length > 0) {
        result.push(current)
        current = char
      } else {
        current = test
      }
    }
    if (current.length > 0) {
      result.push(current)
    }
  }

  return result.length > 0 ? result : ['']
}
