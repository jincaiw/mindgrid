/**
 * 骨架选择器测试。
 *
 * 重点：分组是否按 XMind 截图排齐、当前骨架是否回显、点选是否上抛、
 * 以及「树型表格」必须存在但不可点（XMind 有、MindGrid 暂无该布局引擎）。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StructurePicker } from './structure-picker'

const XMINI_GROUPS = [
  '思维导图',
  '逻辑图',
  '括号图',
  '组织结构图',
  '树形图',
  '时间轴',
  '鱼骨图',
  '树型表格',
  '矩阵图',
]

describe('StructurePicker', () => {
  it('触发按钮显示当前骨架名称', () => {
    render(<StructurePicker value="logic" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: '骨架：逻辑图' })).toBeTruthy()
    expect(screen.getByText('逻辑图')).toBeTruthy()
  })

  it('默认收起浮层', () => {
    render(<StructurePicker value="mindmap" onChange={vi.fn()} />)

    expect(screen.queryByRole('dialog', { name: '选择骨架' })).toBeNull()
  })

  it('点开后按 XMind 顺序展示 9 个分组', () => {
    render(<StructurePicker value="mindmap" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：思维导图' }))

    const popover = screen.getByRole('dialog', { name: '选择骨架' })
    for (const title of XMINI_GROUPS) {
      expect(popover.textContent).toContain(title)
    }
  })

  it('点击卡片上抛对应结构并关闭浮层', () => {
    const onChange = vi.fn()
    render(<StructurePicker value="mindmap" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：思维导图' }))
    fireEvent.click(screen.getByRole('button', { name: '鱼骨图' }))

    expect(onChange).toHaveBeenCalledWith('fishbone')
    expect(screen.queryByRole('dialog', { name: '选择骨架' })).toBeNull()
  })

  it('当前骨架在浮层里是选中态', () => {
    render(<StructurePicker value="timeline" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：时间线' }))

    expect(screen.getByRole('button', { name: '时间线' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '鱼骨图' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('树型表格存在但不可点（布局尚未实现）', () => {
    const onChange = vi.fn()
    render(<StructurePicker value="mindmap" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：思维导图' }))

    const card = screen.getByRole('button', { name: '树型表格' })
    expect((card as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(card)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('气泡图收在「思维导图」组下（MindGrid 有实现，不因截图没有而砍掉）', () => {
    render(<StructurePicker value="mindmap" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：思维导图' }))

    expect(screen.getByRole('button', { name: '气泡图' })).toBeTruthy()
  })

  it('Esc 关闭浮层', () => {
    render(<StructurePicker value="mindmap" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：思维导图' }))
    expect(screen.getByRole('dialog', { name: '选择骨架' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '选择骨架' })).toBeNull()
  })

  it('点击浮层外部关闭', () => {
    render(<StructurePicker value="mindmap" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：思维导图' }))
    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('dialog', { name: '选择骨架' })).toBeNull()
  })

  it('disabled 时不响应点击', () => {
    render(<StructurePicker value="mindmap" onChange={vi.fn()} disabled />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：思维导图' }))

    expect(screen.queryByRole('dialog', { name: '选择骨架' })).toBeNull()
  })
})
