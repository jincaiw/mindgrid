import { describe, expect, it } from 'vitest'
import {
  TOPIC_IMAGE_BLOCK,
  TOPIC_IMAGE_GAP,
  TOPIC_IMAGE_MAX_HEIGHT,
  TOPIC_IMAGE_MAX_WIDTH,
  TOPIC_IMAGE_MIN_WIDTH,
  TOPIC_IMAGE_TITLE_OFFSET,
  computeTopicImageFittedRect,
  computeTopicImageRect,
} from './topic-image-constants'

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

describe('主题图片几何常量', () => {
  it('预留高度 = 图片区高度 + 间距', () => {
    expect(TOPIC_IMAGE_BLOCK).toBe(TOPIC_IMAGE_MAX_HEIGHT + TOPIC_IMAGE_GAP)
    expect(TOPIC_IMAGE_BLOCK).toBe(96)
  })

  it('标题下移量等于预留高度，图片与标题正好填满预留区', () => {
    expect(TOPIC_IMAGE_TITLE_OFFSET).toBe(TOPIC_IMAGE_BLOCK)
  })
})

describe('computeTopicImageRect', () => {
  it('水平居中：等价于 CSS 的 margin: 0 auto', () => {
    // 节点宽 200、内边距 12 → 内宽 176，图片宽 176，左右各留 12
    const result = computeTopicImageRect(rect(100, 50, 200, 140), 12)

    expect(result.width).toBe(176)
    expect(result.x).toBe(100 + 12)
    // 右边缘也应留出同样的内边距
    expect(result.x + result.width).toBe(100 + 200 - 12)
  })

  it('宽度受节点内宽约束，不会撑破小节点', () => {
    // 带图节点最小宽度 120、内边距 10 → 内宽 100，应取 100 而非 TOPIC_IMAGE_MAX_WIDTH
    const result = computeTopicImageRect(rect(0, 0, TOPIC_IMAGE_MIN_WIDTH, 140), 10)

    expect(result.width).toBe(100)
    expect(result.width).toBeLessThan(TOPIC_IMAGE_MAX_WIDTH)
  })

  it('宽度受最大宽度约束', () => {
    const result = computeTopicImageRect(rect(0, 0, 1000, 400), 16)

    expect(result.width).toBe(TOPIC_IMAGE_MAX_WIDTH)
  })

  it('顶边落在节点内边距处，高度为图片区高度', () => {
    const result = computeTopicImageRect(rect(40, 80, 300, 200), 16)

    expect(result.y).toBe(80 + 16)
    expect(result.height).toBe(TOPIC_IMAGE_MAX_HEIGHT)
  })

  it('内宽为负（病态窄节点）时宽度退化为 0，不产生负尺寸', () => {
    const result = computeTopicImageRect(rect(0, 0, 10, 40), 16)

    expect(result.width).toBe(0)
  })

  it('标题下移量 == 有图与无图两种标题位置的差值', () => {
    const padding = 12
    const bounds = rect(0, 0, 300, 200)
    const result = computeTopicImageRect(bounds, padding)

    // 无图时标题起点：节点顶边 + 内边距
    const titleYWithoutImage = bounds.y + padding
    // 有图时标题起点：图片底边 + 间距
    const titleYWithImage = result.y + result.height + TOPIC_IMAGE_GAP

    expect(titleYWithImage - titleYWithoutImage).toBe(TOPIC_IMAGE_TITLE_OFFSET)
  })
})

/**
 * 图片实际绘制区域（contain 适配 + 居中）。
 *
 * 这是 PNG 的圆角裁剪与 SVG 的 `<clipPath>` 共用的唯一几何来源；
 * 算错会让两端裁到不同的位置，所以数学要逐项钉住。
 */
describe('computeTopicImageFittedRect', () => {
  // bounds 200×200、padding 12 → 槽位：176 宽 × 88 高，顶边 y=12，水平居中 x=12
  const bounds = { x: 0, y: 0, width: 200, height: 200 }
  const padding = 12

  it('宽图按宽度铺满，纵向居中留边', () => {
    const rect = computeTopicImageFittedRect(bounds, padding, { width: 400, height: 100 })!
    expect(rect.width).toBeCloseTo(176, 6)
    expect(rect.height).toBeCloseTo(44, 6)
    expect(rect.x).toBeCloseTo(12, 6)
    expect(rect.y).toBeCloseTo(12 + (88 - 44) / 2, 6)
  })

  it('高图按高度铺满，横向居中留边', () => {
    const rect = computeTopicImageFittedRect(bounds, padding, { width: 100, height: 400 })!
    expect(rect.width).toBeCloseTo(22, 6)
    expect(rect.height).toBeCloseTo(88, 6)
    expect(rect.x).toBeCloseTo(12 + (176 - 22) / 2, 6)
    expect(rect.y).toBeCloseTo(12, 6)
  })

  it('比例正好匹配时等于槽位本身（不留边）', () => {
    const rect = computeTopicImageFittedRect(bounds, padding, { width: 176 * 3, height: 88 * 3 })!
    expect(rect.width).toBeCloseTo(176, 6)
    expect(rect.height).toBeCloseTo(88, 6)
    expect(rect.x).toBeCloseTo(12, 6)
    expect(rect.y).toBeCloseTo(12, 6)
  })

  it('尺寸非法时返回 null（调用方据此跳过裁剪，而不是裁错）', () => {
    expect(computeTopicImageFittedRect(bounds, padding, { width: 0, height: 100 })).toBeNull()
    expect(computeTopicImageFittedRect(bounds, padding, { width: 100, height: 0 })).toBeNull()
    expect(computeTopicImageFittedRect(bounds, padding, { width: -5, height: 100 })).toBeNull()
  })
})
