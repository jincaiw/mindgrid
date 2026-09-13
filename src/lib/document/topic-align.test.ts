import { describe, expect, it } from 'vitest'
import {
  computeTopicAlignment,
  type TopicAlignBox,
  type TopicAlignMode,
} from './topic-align'

/** 便捷构造：只关心中心与尺寸。 */
function box(topicId: string, centerX: number, centerY: number, width = 100, height = 40): TopicAlignBox {
  return { topicId, centerX, centerY, width, height }
}

function positionsOf(boxes: TopicAlignBox[], mode: TopicAlignMode) {
  const result = computeTopicAlignment(boxes, mode)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('unreachable')
  return new Map(result.positions.map((p) => [p.topicId, p]))
}

describe('computeTopicAlignment · 对齐', () => {
  it('左对齐：左边界全部落到最小左边界，纵向不动', () => {
    const boxes = [box('a', 0, 10), box('b', 100, 20), box('c', 60, 30)]
    const positions = positionsOf(boxes, 'left')

    // 最小左边界 = 0 - 50 = -50 → 每个中心 = -50 + 宽/2 = 0
    for (const id of ['a', 'b', 'c']) {
      expect(positions.get(id)!.offsetX).toBeCloseTo(0)
    }
    // 只该动一根轴
    expect(positions.get('a')!.offsetY).toBe(10)
    expect(positions.get('b')!.offsetY).toBe(20)
    expect(positions.get('c')!.offsetY).toBe(30)
  })

  it('右对齐：右边界对齐到最大右边界', () => {
    const boxes = [box('a', 0, 0, 40), box('b', 100, 0, 200)]
    const positions = positionsOf(boxes, 'right')

    // 最大右边界 = 100 + 100 = 200
    expect(positions.get('a')!.offsetX).toBeCloseTo(200 - 20)
    expect(positions.get('b')!.offsetX).toBeCloseTo(200 - 100)
  })

  it('水平居中：对齐到**包围盒中心**，不是各中心点的平均值', () => {
    // 宽窄不一时刻意让两者不同：包围盒中心 90，中心点均值 50
    const boxes = [box('a', 0, 0, 40), box('b', 100, 0, 200)]
    const positions = positionsOf(boxes, 'center-h')

    expect(positions.get('a')!.offsetX).toBeCloseTo(90)
    expect(positions.get('b')!.offsetX).toBeCloseTo(90)
    // 负向对照：若写成"中心点取平均"会得到 50，上面两条都会红
    expect(positions.get('a')!.offsetX).not.toBeCloseTo(50)
  })

  it('顶端对齐 / 垂直居中 / 底端对齐镜像成立', () => {
    const boxes = [box('a', 0, 0, 100, 40), box('b', 0, 100, 100, 200)]

    const top = positionsOf(boxes, 'top')
    // a 的顶边 = 0 - 20 = -20 本来就是最靠上的 → 它不该动；b 的顶边被抬到 -20 → 中心 = -20 + 100
    expect(top.get('a')!.offsetY).toBeCloseTo(0)
    expect(top.get('b')!.offsetY).toBeCloseTo(80)

    const bottom = positionsOf(boxes, 'bottom')
    // 最大下边界 = 100 + 100 = 200
    expect(bottom.get('a')!.offsetY).toBeCloseTo(180)
    expect(bottom.get('b')!.offsetY).toBeCloseTo(100)

    const middle = positionsOf(boxes, 'middle-v')
    // 包围盒 = [-20, 200] → 中心 90
    expect(middle.get('a')!.offsetY).toBeCloseTo(90)
    expect(middle.get('b')!.offsetY).toBeCloseTo(90)
  })
})

describe('computeTopicAlignment · 分布', () => {
  it('水平分布：两端不动，且**相邻间距相等**', () => {
    // 宽度不一，才能分辨"间距相等"与"中心点等距"
    const boxes = [box('a', 0, 0, 40), box('b', 60, 0, 100), box('c', 300, 0, 40)]
    const positions = positionsOf(boxes, 'distribute-h')

    // 两端固定
    expect(positions.get('a')!.offsetX).toBeCloseTo(0)
    expect(positions.get('c')!.offsetX).toBeCloseTo(300)

    // 中间那个：跨度 [-20, 320]，尺寸和 180 → 间距 (340-180)/2 = 80
    // a 的右边界 = 20 → b 的左边界 = 100 → b 的中心 = 150
    expect(positions.get('b')!.offsetX).toBeCloseTo(150)

    // 语义级断言：两段间距必须相等（换个实现也能守住）
    const left = positions.get('b')!.offsetX - 50 - (positions.get('a')!.offsetX + 20)
    const right = positions.get('c')!.offsetX - 20 - (positions.get('b')!.offsetX + 50)
    expect(left).toBeCloseTo(right)
  })

  it('垂直分布只看纵轴，横向保持原样', () => {
    const boxes = [box('a', 7, 0), box('b', 8, 50), box('c', 9, 200)]
    const positions = positionsOf(boxes, 'distribute-v')

    expect(positions.get('a')!.offsetY).toBeCloseTo(0)
    expect(positions.get('c')!.offsetY).toBeCloseTo(200)
    expect(positions.get('b')!.offsetY).toBeCloseTo(100)
    expect(positions.get('a')!.offsetX).toBe(7)
    expect(positions.get('b')!.offsetX).toBe(8)
    expect(positions.get('c')!.offsetX).toBe(9)
  })

  it('输入顺序不影响结果（内部按起始边排序）', () => {
    const ordered = [box('a', 0, 0, 40), box('b', 60, 0, 100), box('c', 300, 0, 40)]
    const shuffled = [ordered[2], ordered[0], ordered[1]]

    const a = positionsOf(ordered, 'distribute-h')
    const b = positionsOf(shuffled, 'distribute-h')
    for (const id of ['a', 'b', 'c']) {
      expect(a.get(id)!.offsetX).toBeCloseTo(b.get(id)!.offsetX)
    }
  })
})

describe('computeTopicAlignment · 前置条件', () => {
  it('数量不足时显式失败并给出所需数量，而不是静默返回空', () => {
    expect(computeTopicAlignment([], 'left')).toEqual({
      ok: false,
      reason: 'too-few-topics',
      required: 2,
    })
    expect(computeTopicAlignment([box('a', 0, 0)], 'center-h')).toEqual({
      ok: false,
      reason: 'too-few-topics',
      required: 2,
    })
    // 分布要三个：两端固定，中间才有东西可分
    expect(computeTopicAlignment([box('a', 0, 0), box('b', 10, 0)], 'distribute-h')).toEqual({
      ok: false,
      reason: 'too-few-topics',
      required: 3,
    })
  })

  it('已经对齐的输入得到原值（下游据此可以判空、不产生撤销记录）', () => {
    const boxes = [box('a', 0, 0), box('b', 100, 0)]
    const positions = positionsOf(boxes, 'top')

    expect(positions.get('a')!.offsetY).toBe(0)
    expect(positions.get('b')!.offsetY).toBe(0)
    expect(positions.get('a')!.offsetX).toBe(0)
    expect(positions.get('b')!.offsetX).toBe(100)
  })
})
