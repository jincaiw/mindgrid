import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from '../../lib/document/types'
import {
  buildPitchActs,
  computePitchStageSize,
  PITCH_ASPECT_RATIOS,
  resolvePitchThemeId,
} from './pitch-controller'

function topic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

/** 根节点下挂两个分支：规划（2 个要点）、复盘（1 个要点） */
const root = topic('root', '产品规划', [
  topic('b1', '规划', [topic('b1c1', '调研'), topic('b1c2', '立项')]),
  topic('b2', '复盘', [topic('b2c1', '数据回顾')]),
])

describe('buildPitchActs', () => {
  it('第 0 幕是总览，只含根节点与一级分支', () => {
    const acts = buildPitchActs(root)
    const overview = acts[0]

    expect(overview.title).toBe('总览')
    expect(overview.topicId).toBe('root')
    expect([...overview.revealed].sort()).toEqual(['b1', 'b2', 'root'])
  })

  it('总览幕不展开更深层级（开场只交代结构）', () => {
    const acts = buildPitchActs(root)

    expect(acts[0].revealed.has('b1c1')).toBe(false)
    expect(acts[0].revealed.has('b2c1')).toBe(false)
  })

  it('幕数 = 一级分支数 + 1', () => {
    const acts = buildPitchActs(root)

    expect(acts.length).toBe(3)
    expect(acts.map((act) => act.title)).toEqual(['总览', '规划', '复盘'])
  })

  it('分支幕揭示根节点 + 该分支完整子树', () => {
    const acts = buildPitchActs(root)

    expect([...acts[1].revealed].sort()).toEqual(['b1', 'b1c1', 'b1c2', 'root'])
    expect(acts[1].revealed.has('b2')).toBe(false)
    expect([...acts[2].revealed].sort()).toEqual(['b2', 'b2c1', 'root'])
  })

  it('各幕之间互不串台：分支幕只含自己那条分支', () => {
    const acts = buildPitchActs(root)

    for (const act of acts.slice(1)) {
      expect(act.revealed.has('root')).toBe(true)
    }
    expect(acts[1].revealed.has('b2c1')).toBe(false)
    expect(acts[2].revealed.has('b1c1')).toBe(false)
  })

  it('pointCount 为本分支的直接子主题数，总览幕为分支数', () => {
    const acts = buildPitchActs(root)

    expect(acts.map((act) => act.pointCount)).toEqual([2, 2, 1])
  })

  it('根节点无子分支时只产出总览幕', () => {
    const acts = buildPitchActs(topic('solo', '孤立主题'))

    expect(acts.length).toBe(1)
    expect(acts[0].title).toBe('总览')
    expect([...acts[0].revealed]).toEqual(['solo'])
    expect(acts[0].pointCount).toBe(0)
  })

  it('index 与数组下标一致，便于 UI 直接用作 key', () => {
    const acts = buildPitchActs(root)

    acts.forEach((act, i) => {
      expect(act.index).toBe(i)
    })
  })

  it('深层级孙节点也被纳入对应分支幕', () => {
    const deep = topic('root', '根', [
      topic('a', 'A', [topic('a1', 'A1', [topic('a11', 'A11')])]),
    ])
    const acts = buildPitchActs(deep)

    expect([...acts[1].revealed].sort()).toEqual(['a', 'a1', 'a11', 'root'])
  })
})

describe('computePitchStageSize', () => {
  it('16:9 在宽容器内按高度取最大内接矩形', () => {
    const size = computePitchStageSize({ width: 1920, height: 1080 }, '16:9')
    expect(size).toEqual({ width: 1920, height: 1080 })
  })

  it('16:9 在窄高容器内按宽度受限', () => {
    const size = computePitchStageSize({ width: 800, height: 1000 }, '16:9')
    expect(size.width).toBe(800)
    expect(size.height).toBe(450)
  })

  it('4:3 保持比例', () => {
    const size = computePitchStageSize({ width: 1024, height: 768 }, '4:3')
    expect(size).toEqual({ width: 1024, height: 768 })
  })

  it('1:1 取边长较小者', () => {
    const size = computePitchStageSize({ width: 900, height: 600 }, '1:1')
    expect(size).toEqual({ width: 600, height: 600 })
  })

  it('fit 铺满容器', () => {
    const size = computePitchStageSize({ width: 1234, height: 567 }, 'fit')
    expect(size).toEqual({ width: 1234, height: 567 })
  })

  it('容器未测量（0 尺寸）时返回 0，调用方据此跳过绘制', () => {
    expect(computePitchStageSize({ width: 0, height: 0 }, '16:9')).toEqual({ width: 0, height: 0 })
  })

  it('所有预设比例都能产出非负尺寸', () => {
    for (const preset of PITCH_ASPECT_RATIOS) {
      const size = computePitchStageSize({ width: 640, height: 480 }, preset.id)
      expect(size.width).toBeGreaterThan(0)
      expect(size.height).toBeGreaterThan(0)
    }
  })

  it('未知比例回退为铺满容器（不抛错）', () => {
    const size = computePitchStageSize({ width: 300, height: 200 }, 'nope' as never)
    expect(size).toEqual({ width: 300, height: 200 })
  })
})

describe('resolvePitchThemeId', () => {
  it('跟随文档时返回文档主题', () => {
    expect(resolvePitchThemeId('document', 'cool')).toBe('cool')
  })

  it('强制暗色时覆盖文档主题', () => {
    expect(resolvePitchThemeId('dark', 'cool')).toBe('dark')
  })

  it('强制浅色时使用经典蓝', () => {
    expect(resolvePitchThemeId('light', 'dark')).toBe('classic-blue')
  })

  it('文档无主题且跟随文档时返回 undefined（交由渲染层取默认）', () => {
    expect(resolvePitchThemeId('document', undefined)).toBeUndefined()
  })
})
