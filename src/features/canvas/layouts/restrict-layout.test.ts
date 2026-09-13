import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from '../../../lib/document/types'
import { computeLayout, restrictLayoutToTopicIds } from './index'

function makeTopic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

function makeRoot(): TopicSnapshot {
  return makeTopic('root', 'Root', [
    makeTopic('a', 'Alpha', [makeTopic('a1', 'Alpha-1'), makeTopic('a2', 'Alpha-2')]),
    makeTopic('b', 'Beta'),
  ])
}

describe('restrictLayoutToTopicIds', () => {
  it('只保留集合内的节点，以及两端都在集合内的边', () => {
    const layout = computeLayout(makeRoot(), 'mindmap')
    // 先确认基线里确实有我们要过滤掉的东西——否则下面的断言可能"永远成立"
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(['a', 'a1', 'a2', 'b', 'root'])

    const filtered = restrictLayoutToTopicIds(layout, new Set(['root', 'a', 'a1']))

    expect(filtered.nodes.map((n) => n.id).sort()).toEqual(['a', 'a1', 'root'])
    // 边必须两端都在集合里：root→a 保留，a→a1 保留，a→a2 去掉（a2 不可见）
    const edgeKeys = filtered.edges.map((e) => `${e.parentId}>${e.childId}`).sort()
    expect(edgeKeys).toEqual(['a>a1', 'root>a'])
    // 负向对照：错写成"只要求一端可见"时，a>a2 会留下来
    expect(edgeKeys).not.toContain('a>a2')
  })

  it('保留 width/height/offset：裁剪不能让相机数学跟着变', () => {
    const layout = computeLayout(makeRoot(), 'mindmap')
    const filtered = restrictLayoutToTopicIds(layout, new Set(['root']))

    // 这一条是"进入/退出聚焦时画面不跳动"的全部依据：
    // 若 offset 被重算，同一个主题在屏幕上的位置会在切换瞬间位移。
    expect(filtered.width).toBe(layout.width)
    expect(filtered.height).toBe(layout.height)
    expect(filtered.offsetX).toBe(layout.offsetX)
    expect(filtered.offsetY).toBe(layout.offsetY)
  })

  it('节点坐标保持原样（只隐藏，不重排）', () => {
    const layout = computeLayout(makeRoot(), 'mindmap')
    const filtered = restrictLayoutToTopicIds(layout, new Set(['root', 'b']))

    const originalB = layout.nodes.find((n) => n.id === 'b')!
    const filteredB = filtered.nodes.find((n) => n.id === 'b')!
    expect({ x: filteredB.x, y: filteredB.y }).toEqual({ x: originalB.x, y: originalB.y })
  })

  it('空集合裁到空布局，但不抛错、也不改尺寸', () => {
    const layout = computeLayout(makeRoot(), 'mindmap')
    const filtered = restrictLayoutToTopicIds(layout, new Set())

    expect(filtered.nodes).toEqual([])
    expect(filtered.edges).toEqual([])
    expect(filtered.width).toBe(layout.width)
  })
})
