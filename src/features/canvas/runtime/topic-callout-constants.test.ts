import { describe, expect, it } from 'vitest'
import {
  TOPIC_CALLOUT_LEAD,
  TOPIC_CALLOUT_MIN_HEIGHT,
  TOPIC_CALLOUT_WIDTH,
  computeTopicCalloutLead,
  computeTopicCalloutPlacement,
} from './topic-callout-constants'

const bounds = { x: 100, y: 200, width: 160, height: 40 }

describe('computeTopicCalloutPlacement', () => {
  it('默认贴在节点右侧外，垂直居中', () => {
    const placement = computeTopicCalloutPlacement(bounds, { text: '一行' }, 1, 'right')

    expect(placement.side).toBe('right')
    // 框左边缘 = 节点右边缘 + 引线与距离
    expect(placement.x - (bounds.x + bounds.width)).toBeCloseTo(TOPIC_CALLOUT_LEAD)
    expect(placement.y + placement.height / 2).toBeCloseTo(bounds.y + bounds.height / 2)
    expect(placement.width).toBe(TOPIC_CALLOUT_WIDTH)
  })

  it('左侧分支镜像到左侧（否则会压在子主题上）', () => {
    const placement = computeTopicCalloutPlacement(bounds, { text: 'x' }, 1, 'left')

    expect(placement.side).toBe('left')
    expect(bounds.x - (placement.x + placement.width)).toBeCloseTo(TOPIC_CALLOUT_LEAD)
  })

  it('框高随行数增长，并且有下限（空文本也不塌成一条线）', () => {
    const one = computeTopicCalloutPlacement(bounds, { text: 'x' }, 1, 'right')
    const three = computeTopicCalloutPlacement(bounds, { text: 'x\ny\nz' }, 3, 'right')
    const empty = computeTopicCalloutPlacement(bounds, { text: '' }, 1, 'right')

    expect(three.height).toBeGreaterThan(one.height)
    expect(empty.height).toBeGreaterThanOrEqual(TOPIC_CALLOUT_MIN_HEIGHT)
  })

  it('被拖动过的标注用存下来的偏移，不再走默认落点', () => {
    const placement = computeTopicCalloutPlacement(
      bounds,
      { text: 'x', offsetX: 400, offsetY: -120 },
      1,
      'right',
    )

    expect(placement.offsetX).toBe(400)
    expect(placement.offsetY).toBe(-120)
    // 世界坐标与偏移保持同一个语义（否则 DOM 与导出会算出两个位置）
    expect(placement.x + placement.width / 2).toBeCloseTo(bounds.x + bounds.width / 2 + 400)

    // 负向对照：把实现改成"always 默认落点"，上面这条就会红
    const offsetPlacement = computeTopicCalloutPlacement(bounds, { text: 'x', offsetX: 400 }, 1, 'right')
    expect(offsetPlacement.offsetX).not.toBe(
      computeTopicCalloutPlacement(bounds, { text: 'x' }, 1, 'right').offsetX,
    )
  })
})

describe('computeTopicCalloutLead', () => {
  it('引线从节点边缘画到框边缘，且是一条水平线', () => {
    const placement = computeTopicCalloutPlacement(bounds, { text: 'x' }, 1, 'right')
    const lead = computeTopicCalloutLead(bounds, placement)

    expect(lead.y1).toBeCloseTo(lead.y2)
    expect(lead.x1).toBeCloseTo(bounds.x + bounds.width)
    expect(lead.x2).toBeCloseTo(placement.x)
  })

  it('左侧时引线的两个端点也随之镜像', () => {
    const placement = computeTopicCalloutPlacement(bounds, { text: 'x', offsetY: -40 }, 1, 'left')
    const lead = computeTopicCalloutLead(bounds, placement)
    expect(lead.x1).toBeCloseTo(bounds.x)
    // 标注被拖上去之后引线跟着走（y 与标注的偏移一致）。
    expect(lead.y1).toBeCloseTo(bounds.y + bounds.height / 2 - 40)
  })
})
