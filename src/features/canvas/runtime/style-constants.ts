/**
 * 共享样式常量与文本度量工具。
 *
 * Canvas 2D Renderer、SVG Renderer、PNG Exporter 共用同一套色彩、字体、几何常量，
 * 保证三种渲染路径的视觉一致性。
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

  // 边
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

export const NODE_RADIUS = 20
export const SELECTION_RADIUS = 16
export const TOGGLE_RADIUS = 15
export const TOGGLE_BUTTON_SIZE = 30

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
