/**
 * 「仅显示该分支」的保留集计算。
 *
 * 关键在于**同级分支必须被排除**——只测"目标分支还在"是测不出错的，
 * 把同级也留着的那种实现同样会让前半句断言通过。
 */

import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from './types'
import {
  resolveBranchFocusTarget,
  resolveFocusVisibleTopicIds,
  resolveSelectionVisibleTopicIds,
  restrictToVisibleTopics,
} from './focus'

/** root → [a → [a1, a2], b → [b1], c] */
function makeRoot(): TopicSnapshot {
  return {
    id: 'root',
    text: '中心主题',
    collapsed: false,
    children: [
      {
        id: 'a',
        text: 'A',
        collapsed: false,
        children: [
          { id: 'a1', text: 'A1', collapsed: false, children: [] },
          { id: 'a2', text: 'A2', collapsed: false, children: [] },
        ],
      },
      {
        id: 'b',
        text: 'B',
        collapsed: false,
        children: [{ id: 'b1', text: 'B1', collapsed: false, children: [] }],
      },
      { id: 'c', text: 'C', collapsed: false, children: [] },
    ],
  }
}

describe('resolveFocusVisibleTopicIds', () => {
  it('聚焦叶子：保留中心主题 + 路径 + 自身，同级全部排除', () => {
    const visible = resolveFocusVisibleTopicIds(makeRoot(), 'a1')!

    expect([...visible].sort()).toEqual(['a', 'a1', 'root'])
    // 同级分支与其它分支必须被排除——只断言"目标还在"是测不出错的
    expect(visible.has('a2')).toBe(false)
    expect(visible.has('b')).toBe(false)
    expect(visible.has('b1')).toBe(false)
    expect(visible.has('c')).toBe(false)
  })

  it('聚焦带子树的分支：整棵子树都保留', () => {
    const visible = resolveFocusVisibleTopicIds(makeRoot(), 'a')!

    expect([...visible].sort()).toEqual(['a', 'a1', 'a2', 'root'])
    expect(visible.has('b')).toBe(false)
  })

  it('未指定主题时不聚焦', () => {
    expect(resolveFocusVisibleTopicIds(makeRoot(), null)).toBeNull()
    expect(resolveFocusVisibleTopicIds(makeRoot(), undefined)).toBeNull()
    expect(resolveFocusVisibleTopicIds(makeRoot(), '')).toBeNull()
  })

  it('指定中心主题等于退出聚焦（否则只会剩下它自己）', () => {
    expect(resolveFocusVisibleTopicIds(makeRoot(), 'root')).toBeNull()
  })

  it('主题不存在时返回 null（不能把画布清空）', () => {
    expect(resolveFocusVisibleTopicIds(makeRoot(), 'no-such-topic')).toBeNull()
  })
})

/**
 * 「能不能聚焦」的判定必须只有一处：快捷键与菜单项都调它。
 * 两边各写一套的话，同一主题会出现"菜单说不行、快捷键照做"的分裂。
 */
describe('resolveBranchFocusTarget', () => {
  it('普通主题原样返回', () => {
    expect(resolveBranchFocusTarget(makeRoot(), 'a')).toBe('a')
    expect(resolveBranchFocusTarget(makeRoot(), 'a1')).toBe('a1')
  })

  it('中心主题不可聚焦（只显示它的分支就是整幅图）', () => {
    expect(resolveBranchFocusTarget(makeRoot(), 'root')).toBeNull()
  })

  it('空值与不存在的 id 都不可聚焦', () => {
    expect(resolveBranchFocusTarget(makeRoot(), null)).toBeNull()
    expect(resolveBranchFocusTarget(makeRoot(), undefined)).toBeNull()
    expect(resolveBranchFocusTarget(makeRoot(), '')).toBeNull()
    expect(resolveBranchFocusTarget(makeRoot(), 'ghost')).toBeNull()
  })
})

/**
 * 装饰元素（联系线 / 外框 / 概要）必须一起裁剪。
 * 不过滤的后果是「连到看不见的主题」的线与缩水的外框——它们不是"看不见"，
 * 而是画在错误的位置上。
 */
describe('restrictToVisibleTopics', () => {
  it('引用全部可见才保留', () => {
    const items = [
      { id: 'r1', refs: ['a', 'a1'] }, // 两端都在 → 留
      { id: 'r2', refs: ['a', 'b'] }, // b 不可见 → 去
      { id: 'r3', refs: ['b'] }, // 单端不可见 → 去
      { id: 'r4', refs: ['a'] }, // 单端可见 → 留
    ]

    const kept = restrictToVisibleTopics(items, (item) => item.refs, new Set(['root', 'a', 'a1']))

    expect(kept.map((item) => item.id)).toEqual(['r1', 'r4'])
  })

  it('空引用视为可见（外框/概要理论上不会为空，但不应因此被误删）', () => {
    const items = [{ id: 'empty', refs: [] as string[] }]
    expect(restrictToVisibleTopics(items, (item) => item.refs, new Set()).length).toBe(1)
  })
})

/**
 * 「导出选中主题」的保留集。
 *
 * 与「仅显示该分支」同一套语义（根→目标路径 + 目标子树），但目标可以是多个：
 * 逐个求可见集再取并集。这里盯住三件事：并集正确、含中心主题时不裁剪、
 * 以及"一个都找不到"时不裁剪（否则会导出一张空图）。
 */
describe('resolveSelectionVisibleTopicIds', () => {
  it('单个目标：等于「仅显示该分支」的可见集', () => {
    const root = makeRoot()

    expect(resolveSelectionVisibleTopicIds(root, ['a'])).toEqual(
      resolveFocusVisibleTopicIds(root, 'a'),
    )
  })

  it('多个目标：取各自可见集的并集（同级分支互不影响）', () => {
    const visible = resolveSelectionVisibleTopicIds(makeRoot(), ['a1', 'b1'])

    expect(visible).not.toBeNull()
    // 两个目标的路径都保留：root → a → a1 与 root → b → b1
    expect([...(visible as Set<string>)].sort()).toEqual(['a', 'a1', 'b', 'b1', 'root'])
    // 没有被选中的同级不该被带进来
    expect((visible as Set<string>).has('a2')).toBe(false)
    expect((visible as Set<string>).has('c')).toBe(false)
  })

  it('选中里含中心主题 → 不裁剪（等于导出整幅图）', () => {
    // 与聚焦不同：聚焦会**拒绝**中心主题，而导出应当照常工作
    expect(resolveSelectionVisibleTopicIds(makeRoot(), ['root', 'a'])).toBeNull()
  })

  it('没有选中、或 id 全都找不到 → 不裁剪（避免导出一张空图）', () => {
    expect(resolveSelectionVisibleTopicIds(makeRoot(), [])).toBeNull()
    expect(resolveSelectionVisibleTopicIds(makeRoot(), ['不存在', '也不存在'])).toBeNull()
  })

  it('部分 id 失效时用剩下那些（旧文档里删除过主题的常见情形）', () => {
    const visible = resolveSelectionVisibleTopicIds(makeRoot(), ['a1', '已被删除的主题'])

    expect([...(visible as Set<string>)].sort()).toEqual(['a', 'a1', 'root'])
  })
})
