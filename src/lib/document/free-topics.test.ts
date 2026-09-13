import { describe, expect, it } from 'vitest'
import { isFreelyPositionableTopic } from './free-topics'

/**
 * 「能不能自由摆放」这条规则必须只有一处实现：画布的拖动与菜单的「自由主题对齐」都用它。
 * 上一版它只写在画布的一个条件里，浮动主题因此被漏掉——拖动静默失效，
 * 而菜单里"创建后拖到想放的位置即可"这句说明是假的。
 */
describe('isFreelyPositionableTopic', () => {
  it('浮动主题恒可摆放（与分支自由布局开关无关）', () => {
    expect(
      isFreelyPositionableTopic({
        isFloatingTopic: true,
        isFirstLevelBranch: false,
        freeBranchLayout: false,
      }),
    ).toBe(true)
    expect(
      isFreelyPositionableTopic({
        isFloatingTopic: true,
        isFirstLevelBranch: false,
        freeBranchLayout: true,
      }),
    ).toBe(true)
  })

  it('一级分支只在开启分支自由布局时可摆放', () => {
    expect(
      isFreelyPositionableTopic({
        isFloatingTopic: false,
        isFirstLevelBranch: true,
        freeBranchLayout: true,
      }),
    ).toBe(true)
    expect(
      isFreelyPositionableTopic({
        isFloatingTopic: false,
        isFirstLevelBranch: true,
        freeBranchLayout: false,
      }),
    ).toBe(false)
  })

  it('更深层的主题无论如何都不可自由摆放（写了 layoutHints 也没人消费）', () => {
    expect(
      isFreelyPositionableTopic({
        isFloatingTopic: false,
        isFirstLevelBranch: false,
        freeBranchLayout: true,
      }),
    ).toBe(false)
    expect(
      isFreelyPositionableTopic({
        isFloatingTopic: false,
        isFirstLevelBranch: false,
        freeBranchLayout: false,
      }),
    ).toBe(false)
  })
})
