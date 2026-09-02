import { describe, expect, it } from 'vitest'
import {
  TOPIC_IMAGE_BLOCK,
  TOPIC_IMAGE_GAP,
  TOPIC_IMAGE_MAX_HEIGHT,
  TOPIC_IMAGE_MAX_WIDTH,
  TOPIC_IMAGE_MIN_WIDTH,
  TOPIC_IMAGE_TITLE_OFFSET,
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
