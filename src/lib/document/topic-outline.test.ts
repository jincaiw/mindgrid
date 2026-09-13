/**
 * 缩进 / 减少缩进的目标计算。
 *
 * 这层单测的存在理由：**两条触发路径都无法在 jsdom 里驱动**——
 * 原生菜单项点不到，画布的 ⌘] / ⌘[ 即使能按键，「目标算错了」也只在
 * 树结构上体现、不易断言。把目标计算抽成纯函数后，语义可以逐条钉死。
 */

import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from './types'
import { resolveIndentTarget, resolveOutdentTarget } from './topic-outline'

/** root → [a → [a1, a2], b, c] */
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
      { id: 'b', text: 'B', collapsed: false, children: [] },
      { id: 'c', text: 'C', collapsed: false, children: [] },
    ],
  }
}

describe('resolveIndentTarget', () => {
  it('缩进 = 挂到上一个同级主题下面', () => {
    expect(resolveIndentTarget(makeRoot(), 'b')).toEqual({ parentId: 'a' })
    expect(resolveIndentTarget(makeRoot(), 'c')).toEqual({ parentId: 'b' })
  })

  it('深层同理：a2 挂到 a1 下面', () => {
    expect(resolveIndentTarget(makeRoot(), 'a2')).toEqual({ parentId: 'a1' })
  })

  it('已是第一个同级主题时无处可缩', () => {
    expect(resolveIndentTarget(makeRoot(), 'a')).toBeNull()
    expect(resolveIndentTarget(makeRoot(), 'a1')).toBeNull()
  })

  it('根主题没有父级，不能缩进', () => {
    expect(resolveIndentTarget(makeRoot(), 'root')).toBeNull()
  })

  it('找不到的主题返回 null', () => {
    expect(resolveIndentTarget(makeRoot(), 'no-such-topic')).toBeNull()
  })
})

describe('resolveOutdentTarget', () => {
  it('减少缩进 = 挂到祖父之下、位置落在原父主题之后', () => {
    // a1 的父是 a，a 在 root 里排第 0 → 目标下标 1（紧跟 a 之后）
    expect(resolveOutdentTarget(makeRoot(), 'a1')).toEqual({ parentId: 'root', index: 1 })
  })

  it('原父主题排在中间时下标随之变化', () => {
    // b 的父是 root → root 没有祖父，b 无法减少缩进
    expect(resolveOutdentTarget(makeRoot(), 'b')).toBeNull()
    // a2 同理落在 a 之后
    expect(resolveOutdentTarget(makeRoot(), 'a2')).toEqual({ parentId: 'root', index: 1 })
  })

  it('父主题已是中心主题时无处可退', () => {
    expect(resolveOutdentTarget(makeRoot(), 'a')).toBeNull()
  })

  it('根主题不能减少缩进', () => {
    expect(resolveOutdentTarget(makeRoot(), 'root')).toBeNull()
  })

  it('找不到的主题返回 null', () => {
    expect(resolveOutdentTarget(makeRoot(), 'no-such-topic')).toBeNull()
  })
})

describe('缩进与减少缩进互为反向', () => {
  it('把 b 缩进到 a 下后，再减少缩进应回到 a 之后（原位置）', () => {
    const root = makeRoot()
    const indent = resolveIndentTarget(root, 'b')
    expect(indent).toEqual({ parentId: 'a' })

    // 模拟缩进后的树：b 成为 a 的最后一个子主题
    const [b] = root.children.splice(1, 1)
    root.children[0].children.push(b)

    const outdent = resolveOutdentTarget(root, 'b')
    // 原父 a 在 root 里排第 0 → 放回下标 1，即它缩进前所在的位置
    expect(outdent).toEqual({ parentId: 'root', index: 1 })
  })
})
