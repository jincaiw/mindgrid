/**
 * 节点尺寸估算的双实现一致性 + 字号覆盖缩放。
 *
 * `mindmap-layout.estimateNodeSize` 与 `layouts/layout-utils.estimateNodeSize`
 * 是历史遗留的两份副本，一处漂移就会让思维导图与其它骨架的同深度节点大小不同。
 * 这里用同一批输入对两份实现逐项比对，把"两处保持一致"从注释约定变成可执行断言。
 */

import { describe, expect, it } from 'vitest'

import type { TopicSnapshot } from '../../lib/document/types'
import { estimateNodeSize as estimateFromMindMap } from './mindmap-layout'
import { estimateNodeSize as estimateFromLayoutUtils } from './layouts/layout-utils'

function makeTopic(overrides: Partial<TopicSnapshot> = {}): TopicSnapshot {
  return {
    id: 'topic_1',
    text: '一个普通长度的主题文本',
    collapsed: false,
    children: [],
    ...overrides,
  }
}

const DEPTHS = [0, 1, 2, 3] as const

describe('estimateNodeSize 双实现一致性', () => {
  it('默认（无覆盖）在各深度下两处完全一致', () => {
    for (const depth of DEPTHS) {
      expect(estimateFromMindMap(makeTopic(), depth)).toEqual(
        estimateFromLayoutUtils(makeTopic(), depth),
      )
    }
  })

  it('固定宽度覆盖下两处完全一致', () => {
    for (const depth of DEPTHS) {
      const topic = makeTopic({ styleOverrides: { width: 300 } })
      expect(estimateFromMindMap(topic, depth)).toEqual(estimateFromLayoutUtils(topic, depth))
    }
  })

  it('字号覆盖下两处完全一致', () => {
    for (const depth of DEPTHS) {
      const topic = makeTopic({ styleOverrides: { fontSize: 24 } })
      expect(estimateFromMindMap(topic, depth)).toEqual(estimateFromLayoutUtils(topic, depth))
    }
  })
})

describe('estimateNodeSize 字号覆盖缩放', () => {
  it('未设置字号时几何与历史一致（比例 1）', () => {
    for (const depth of DEPTHS) {
      expect(estimateFromMindMap(makeTopic(), depth)).toEqual(
        estimateFromMindMap(makeTopic({ styleOverrides: {} }), depth),
      )
    }
  })

  it('放大字号会同时放大行高与字宽（否则文字溢出节点框）', () => {
    // 用短文本避免撞上 maxW 夹取，才能断言精确行高：
    // 深度 1 默认字号 14 / 行高 19 → 覆盖成 28 时行高 38，padY 11×2 = 22 不变
    const short = makeTopic({ text: '短标题' })
    const base = estimateFromMindMap(short, 1)
    const doubled = estimateFromMindMap(
      makeTopic({ text: '短标题', styleOverrides: { fontSize: 28 } }),
      1,
    )

    expect(base.height).toBe(22 + 19)
    expect(doubled.height).toBe(22 + 38)
    expect(doubled.width).toBeGreaterThan(base.width)
  })

  it('缩小字号同样生效，且不低于最小宽', () => {
    const base = estimateFromMindMap(makeTopic(), 1)
    const smaller = estimateFromMindMap(makeTopic({ styleOverrides: { fontSize: 8 } }), 1)

    expect(smaller.height).toBeLessThan(base.height)
    expect(smaller.width).toBeGreaterThanOrEqual(100)
  })

  it('非法字号回落默认几何（不产生 NaN / 负尺寸）', () => {
    const base = estimateFromMindMap(makeTopic(), 1)
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(estimateFromMindMap(makeTopic({ styleOverrides: { fontSize: bad } }), 1)).toEqual(base)
    }
  })

  it('固定宽度与字号覆盖可以叠加（宽度锁定、高度随字号增长）', () => {
    const small = estimateFromMindMap(
      makeTopic({ styleOverrides: { width: 200, fontSize: 14 } }),
      1,
    )
    const large = estimateFromMindMap(
      makeTopic({ styleOverrides: { width: 200, fontSize: 28 } }),
      1,
    )

    expect(small.width).toBe(200)
    expect(large.width).toBe(200)
    expect(large.height).toBeGreaterThan(small.height)
  })
})
