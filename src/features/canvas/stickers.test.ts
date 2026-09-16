import { describe, expect, it } from 'vitest'
import {
  STICKER_DEFINITIONS,
  STICKER_VIEWBOX,
  findStickerDefinition,
} from './sticker-definitions'
import {
  TOPIC_STICKER_MAX_PER_TOPIC,
  TOPIC_STICKER_SIZE,
  TOPIC_STICKER_STRIDE_X,
  computeTopicStickerPlacement,
  createStickerInstanceId,
} from './runtime/topic-sticker-constants'

describe('贴纸素材库', () => {
  it('id 唯一、有标签、每个贴纸至少一个图元', () => {
    const ids = STICKER_DEFINITIONS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const definition of STICKER_DEFINITIONS) {
      expect(definition.label.trim().length).toBeGreaterThan(0)
      expect(definition.shapes.length).toBeGreaterThan(0)
      for (const shape of definition.shapes) {
        expect(shape.d.trim().length).toBeGreaterThan(0)
        // 至少要有填充或描边，否则这张贴纸是隐形的
        expect(Boolean(shape.fill) || Boolean(shape.stroke)).toBe(true)
      }
    }
  })

  it('图元坐标都落在 viewBox 内（否则三端都会被裁掉一角）', () => {
    // 只做粗检：取出 path 里的数字，允许少量溢出（描边宽度会外扩）
    for (const definition of STICKER_DEFINITIONS) {
      for (const shape of definition.shapes) {
        const numbers = shape.d.match(/-?\d+(?:\.\d+)?/g) ?? []
        for (const value of numbers.map(Number)) {
          expect(value).toBeGreaterThan(-6)
          expect(value).toBeLessThan(STICKER_VIEWBOX + 6)
        }
      }
    }
  })

  it('未识别的 id 返回 undefined（旧文档里的自定义贴纸不该让渲染炸掉）', () => {
    expect(findStickerDefinition('star')).toBeDefined()
    expect(findStickerDefinition('不是内置贴纸')).toBeUndefined()
    expect(findStickerDefinition('')).toBeUndefined()
  })
})

describe('贴纸几何', () => {
  it('未被拖过的贴纸落在节点左上角内侧，并按序向右排开', () => {
    // 第一版落在节点正中间，实测会压住标题文字；默认落点改为左上角
    const bounds = { x: 0, y: 0, width: 160, height: 69 }
    const first = computeTopicStickerPlacement(bounds, {}, 0)
    const second = computeTopicStickerPlacement(bounds, {}, 1)

    // 贴纸左上角落进节点左上角：中心 = -(宽/2) + 半边长
    expect(first.offsetX).toBeCloseTo(-160 / 2 + TOPIC_STICKER_SIZE / 2)
    expect(first.offsetY).toBeCloseTo(-69 / 2 + TOPIC_STICKER_SIZE / 2)
    // 第二张在第一张右侧一个步距，纵向同排
    expect(second.offsetX - first.offsetX).toBeCloseTo(TOPIC_STICKER_STRIDE_X)
    expect(second.offsetY).toBe(first.offsetY)
  })

  it('非法序号按 0 处理（负数/NaN 不该算出跑飞的坐标）', () => {
    const bounds = { x: 0, y: 0, width: 160, height: 69 }
    expect(computeTopicStickerPlacement(bounds, {}, -3)).toEqual(
      computeTopicStickerPlacement(bounds, {}, 0),
    )
    expect(computeTopicStickerPlacement(bounds, {}, Number.NaN)).toEqual(
      computeTopicStickerPlacement(bounds, {}, 0),
    )
  })

  it('已经被拖过的贴纸用存下来的偏移，不再走默认落点', () => {
    const bounds = { x: 0, y: 0, width: 160, height: 69 }
    const placed = computeTopicStickerPlacement(bounds, { offsetX: 40, offsetY: -60 }, 5)

    expect(placed.offsetX).toBe(40)
    expect(placed.offsetY).toBe(-60)
  })

  it('落点 = 节点中心 + 偏移，尺寸与旋转取默认值', () => {
    const bounds = { x: 100, y: 200, width: 160, height: 40 }

    const explicit = computeTopicStickerPlacement(bounds, { offsetX: 0, offsetY: 0 })
    expect(explicit.cx).toBe(180)
    expect(explicit.cy).toBe(220)
    expect(explicit.size).toBe(TOPIC_STICKER_SIZE)
    expect(explicit.rotation).toBe(0)

    const moved = computeTopicStickerPlacement(bounds, {
      offsetX: -30,
      offsetY: 12,
      rotation: 45,
    })
    expect(moved.cx).toBe(150)
    expect(moved.cy).toBe(232)
    expect(moved.rotation).toBe(45)
  })

  it('实例 id 每次不同且带前缀', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createStickerInstanceId()))
    expect(ids.size).toBe(50)
    for (const id of ids) {
      expect(id.startsWith('sticker_')).toBe(true)
    }
  })

  it('数量上限是个正整数（面板据此禁用选择器）', () => {
    expect(Number.isInteger(TOPIC_STICKER_MAX_PER_TOPIC)).toBe(true)
    expect(TOPIC_STICKER_MAX_PER_TOPIC).toBeGreaterThan(0)
  })
})
