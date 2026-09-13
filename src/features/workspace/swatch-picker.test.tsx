/**
 * 色板浮层（分支色板 / 背景颜色 / 调色板）测试。
 *
 * 重点：选项内部**名称在上、色带在下**——这是对齐 XMind 配色方案浮层时
 * 用基准图 11 的竖直取色剖面确认的顺序；早先实现是反的（色带在上）。
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { SwatchPicker } from './swatch-picker'

const OPTIONS = [
  { id: 'rainbow', label: '彩虹', colors: ['#ff0000', '#00ff00'] },
  { id: 'ocean', label: '海洋', colors: ['#0000ff'] },
]

function renderPicker(value: string | null = 'rainbow', onChange = vi.fn()) {
  render(
    <SwatchPicker
      label="分支色板"
      value={value}
      options={OPTIONS}
      fallbackLabel="默认"
      onChange={onChange}
    />,
  )
  return onChange
}

function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: '分支色板' }))
  return within(screen.getByRole('dialog', { name: '分支色板' }))
}

describe('SwatchPicker', () => {
  it('触发器显示当前项名称，未命中预设时显示回退文案', () => {
    renderPicker('ocean')
    expect(screen.getByRole('button', { name: '分支色板' }).textContent).toContain('海洋')
  })

  it('选项内部顺序：名称在前、色带在后', () => {
    renderPicker()
    const popover = openPopover()
    const option = popover.getByRole('button', { name: '彩虹' })

    const kinds = Array.from(option.children).map((child) =>
      child.className.includes('option-name')
        ? 'name'
        : child.className.includes('strip')
          ? 'strip'
          : 'other',
    )
    expect(kinds).toEqual(['name', 'strip'])
  })

  it('色带按 colors 逐块渲染', () => {
    renderPicker()
    const popover = openPopover()
    const option = popover.getByRole('button', { name: '彩虹' })
    const strip = option.querySelector('.swatch-picker__strip')!

    expect(strip.children).toHaveLength(2)
  })

  it('选中项标记 aria-pressed=true，未选中项为 false', () => {
    renderPicker()
    const popover = openPopover()
    expect(popover.getByRole('button', { name: '彩虹' }).getAttribute('aria-pressed')).toBe('true')
    expect(popover.getByRole('button', { name: '海洋' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('点选上抛 id 并关闭浮层', () => {
    const onChange = renderPicker('rainbow')
    const popover = openPopover()

    fireEvent.click(popover.getByRole('button', { name: '海洋' }))

    expect(onChange).toHaveBeenCalledWith('ocean')
    expect(screen.queryByRole('dialog', { name: '分支色板' })).toBeNull()
  })

  it('值不在预设里时（自定义颜色）触发器显示该值本身', () => {
    renderPicker('#123456')
    expect(screen.getByRole('button', { name: '分支色板' }).textContent).toContain('#123456')
  })
})
