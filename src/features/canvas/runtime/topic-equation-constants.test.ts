import { describe, expect, it } from 'vitest'

import {
  computeTopicEquationRect,
  computeTopicEquationSlot,
  EQUATION_UNITS_PER_EM,
  TOPIC_EQUATION_BLOCK,
  TOPIC_EQUATION_GAP,
  TOPIC_EQUATION_MAX_HEIGHT,
  TOPIC_EQUATION_MAX_WIDTH,
} from './topic-equation-constants'

function rect(x: number, y: number, width: number, height: number) {
  return { x, y, width, height }
}

describe('方程几何常量自洽', () => {
  it('预留高度 = 槽位高度 + 间距', () => {
    expect(TOPIC_EQUATION_MAX_HEIGHT + TOPIC_EQUATION_GAP).toBe(TOPIC_EQUATION_BLOCK)
  })

  it('单位换算是 MathJax 的 1000 单位每 em（实测值，不是猜的）', () => {
    // a^2+b^2=c^2 的 viewBox 高 1083.9 单位 ≈ 1.084em，与 SVG 自报的 2.452ex 吻合
    expect(EQUATION_UNITS_PER_EM).toBe(1000)
  })
})

describe('computeTopicEquationSlot', () => {
  it('顶边落在内边距处，水平居中，宽度受内宽约束', () => {
    expect(computeTopicEquationSlot(rect(100, 50, 300, 200), 12)).toEqual({
      x: 100 + (300 - TOPIC_EQUATION_MAX_WIDTH) / 2,
      y: 62,
      width: TOPIC_EQUATION_MAX_WIDTH,
      height: TOPIC_EQUATION_MAX_HEIGHT,
    })
  })

  it('节点比最大宽度还窄时，槽位跟着变窄（不会被顶出节点）', () => {
    const slot = computeTopicEquationSlot(rect(0, 0, 120, 60), 10)
    expect(slot.width).toBe(100)
    expect(slot.x).toBe(10)
  })
})

describe('computeTopicEquationRect', () => {
  // a^2+b^2=c^2：viewBox 965.6 × 1083.9
  const square = { width: 965.6, height: 1083.9 }
  // \frac{a}{b} 一类：更高
  const fraction = { width: 900, height: 2200 }

  it('按节点字号折算自然尺寸（不是把 viewBox 当像素用）', () => {
    const drawn = computeTopicEquationRect(rect(0, 0, 300, 200), 12, square, 14)
    expect(drawn).not.toBeNull()
    // 965.6/1000*14 = 13.52；1083.9/1000*14 = 15.17
    expect(drawn!.width).toBeCloseTo(13.52, 2)
    expect(drawn!.height).toBeCloseTo(15.17, 2)
  })

  it('**只缩不放**：小公式保持自然大小，不放大到填满槽位', () => {
    const slot = computeTopicEquationSlot(rect(0, 0, 300, 200), 12)
    const drawn = computeTopicEquationRect(rect(0, 0, 300, 200), 12, square, 14)
    expect(drawn!.height).toBeLessThan(slot.height)
    expect(drawn!.width).toBeLessThan(slot.width)
  })

  it('超出槽位高度时按高度缩到恰好占满', () => {
    const drawn = computeTopicEquationRect(rect(0, 0, 400, 300), 12, fraction, 20)
    // 2200/1000*20 = 44 > 40 → 缩到 40
    expect(drawn!.height).toBeCloseTo(TOPIC_EQUATION_MAX_HEIGHT, 5)
  })

  it('两侧都在槽位内居中（DOM 用 flex 居中，导出必须落在同一处）', () => {
    const bounds = rect(0, 0, 300, 200)
    const slot = computeTopicEquationSlot(bounds, 12)
    const drawn = computeTopicEquationRect(bounds, 12, square, 14)!
    expect(drawn.x + drawn.width / 2).toBeCloseTo(slot.x + slot.width / 2, 5)
    expect(drawn.y + drawn.height / 2).toBeCloseTo(slot.y + slot.height / 2, 5)
  })

  it('字号改变时尺寸按同比例变化（导出端与 DOM 端必须传同一个字号）', () => {
    const at14 = computeTopicEquationRect(rect(0, 0, 400, 300), 12, square, 14)!
    const at28 = computeTopicEquationRect(rect(0, 0, 400, 300), 12, square, 28)!
    // 两次都不触顶（15.17 与 30.34 都 < 40），所以应严格成比例
    expect(at14.height).toBeLessThan(TOPIC_EQUATION_MAX_HEIGHT)
    expect(at28.height).toBeLessThan(TOPIC_EQUATION_MAX_HEIGHT)
    expect(at28.height / at14.height).toBeCloseTo(2, 5)
  })

  it('超顶后不再成比例：更大字号只会被夹在槽位高度上（"只缩不放"的必然结果）', () => {
    const at40 = computeTopicEquationRect(rect(0, 0, 400, 300), 12, fraction, 40)!
    const at60 = computeTopicEquationRect(rect(0, 0, 400, 300), 12, fraction, 60)!
    expect(at40.height).toBeCloseTo(TOPIC_EQUATION_MAX_HEIGHT, 5)
    expect(at60.height).toBeCloseTo(TOPIC_EQUATION_MAX_HEIGHT, 5)
  })

  it('取不到渲染结果（尺寸非正）或字号非法时返回 null，而不是画一个错的', () => {
    expect(computeTopicEquationRect(rect(0, 0, 300, 200), 12, { width: 0, height: 100 }, 14)).toBeNull()
    expect(computeTopicEquationRect(rect(0, 0, 300, 200), 12, { width: 100, height: 0 }, 14)).toBeNull()
    expect(computeTopicEquationRect(rect(0, 0, 300, 200), 12, square, 0)).toBeNull()
    expect(computeTopicEquationRect(rect(0, 0, 300, 200), 12, square, Number.NaN)).toBeNull()
    expect(computeTopicEquationRect(rect(0, 0, 300, 200), 12, square, -5)).toBeNull()
  })

  it('节点窄到放不下时返回 null（宁可不画，也不画出节点外）', () => {
    expect(computeTopicEquationRect(rect(0, 0, 20, 200), 12, square, 14)).toBeNull()
  })
})
