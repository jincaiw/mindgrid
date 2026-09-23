import { describe, expect, it } from 'vitest'
import {
  ILLUSTRATION_DEFAULT_SIZE,
  ILLUSTRATION_INSERT_MARGIN,
  ILLUSTRATION_INSERT_STRIDE,
  ILLUSTRATION_SIZE_MAX,
  ILLUSTRATION_SIZE_MIN,
  ILLUSTRATION_VIEWBOX,
  computeIllustrationInsertPosition,
  createIllustrationInstanceId,
  illustrationScale,
} from './canvas-illustration-constants'

describe('illustrationScale', () => {
  it('把素材坐标系换算成世界单位', () => {
    expect(illustrationScale(ILLUSTRATION_VIEWBOX)).toBe(1)
    expect(illustrationScale(128)).toBe(2)
    expect(illustrationScale(ILLUSTRATION_DEFAULT_SIZE)).toBeCloseTo(120 / 64, 10)
  })
})

describe('computeIllustrationInsertPosition', () => {
  const layout = { width: 800, height: 400, offsetX: 0, offsetY: 0 }

  it('第一张落在地图内容下方的空白带（横向居中）', () => {
    // 不落在正中间：插画在画布层、主题节点是 DOM 叠在画布之上，
    // 放中心等于落在中心主题背后（真引擎截图推翻过第一版）。
    expect(computeIllustrationInsertPosition(layout, 0)).toEqual({
      x: 400,
      y: 400 + ILLUSTRATION_INSERT_MARGIN,
    })
  })

  it('多张按固定步距向右下错开（不叠在同一处）', () => {
    const second = computeIllustrationInsertPosition(layout, 1)
    expect(second.x).toBe(400 + ILLUSTRATION_INSERT_STRIDE)
    expect(second.y).toBe(400 + ILLUSTRATION_INSERT_MARGIN + ILLUSTRATION_INSERT_STRIDE)
  })

  it('非法 index 当成 0（负数 / NaN 不产生离谱坐标）', () => {
    const expected = { x: 400, y: 400 + ILLUSTRATION_INSERT_MARGIN }
    expect(computeIllustrationInsertPosition(layout, -3)).toEqual(expected)
    expect(computeIllustrationInsertPosition(layout, Number.NaN)).toEqual(expected)
  })

  it('结果只由布局决定（与相机/滚动位置无关）', () => {
    // 同一份布局、同一个 index，反复调用必须完全一致：
    // 这条是"落点可断言"的前提，也是当初不用视口中心的原因。
    const first = computeIllustrationInsertPosition(layout, 2)
    const again = computeIllustrationInsertPosition(layout, 2)
    expect(first).toEqual(again)
  })

  it('把 layout.offset 减出去（布局系 → 世界系的换算）', () => {
    // 布局产出的是"根主题相对坐标"，加 offset 才是世界坐标；
    // 而插画的**存储**坐标是布局坐标系。漏减 offset 会让插画整体偏一个 offset，
    // 真引擎实测过：新插画落在画面右边缘、还被裁掉一半。
    const offset = { width: 800, height: 400, offsetX: 300, offsetY: 120 }
    expect(computeIllustrationInsertPosition(offset, 0)).toEqual({
      x: 100,
      y: 400 + ILLUSTRATION_INSERT_MARGIN - 120,
    })
  })
})

describe('尺寸范围常量', () => {
  it('默认尺寸落在允许范围内', () => {
    expect(ILLUSTRATION_DEFAULT_SIZE).toBeGreaterThanOrEqual(ILLUSTRATION_SIZE_MIN)
    expect(ILLUSTRATION_DEFAULT_SIZE).toBeLessThanOrEqual(ILLUSTRATION_SIZE_MAX)
  })
})

describe('createIllustrationInstanceId', () => {
  it('同一毫秒连点也不会撞 id', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createIllustrationInstanceId()))
    expect(ids.size).toBe(200)
    for (const id of ids) {
      expect(id.startsWith('ill_')).toBe(true)
    }
  })
})
