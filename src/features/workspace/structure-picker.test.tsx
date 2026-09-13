/**
 * 骨架选择器测试。
 *
 * 重点：分组是否按 XMind 基准图排齐、**组内方向变体**是否齐全、
 * 当前（骨架 + 方向）是否回显为选中态、点选是否同时上抛骨架与方向。
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

    // 自然方向的那张卡不带 direction，显式传 undefined 以清掉画布上的旧方向
    expect(onChange).toHaveBeenCalledWith('fishbone', undefined)
    expect(screen.queryByRole('dialog', { name: '选择骨架' })).toBeNull()
  })

  it('当前骨架在浮层里是选中态', () => {
    render(<StructurePicker value="timeline" onChange={vi.fn()} />)

    // 时间轴的自然方向是水平，触发按钮回显的也是这张卡
    fireEvent.click(screen.getByRole('button', { name: '骨架：时间轴（水平）' }))

    expect(
      screen.getByRole('button', { name: '时间轴（水平）' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: '鱼骨图' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('树型表格可选中（布局已实现，不再置灰）', () => {
    const onChange = vi.fn()
    render(<StructurePicker value="mindmap" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：思维导图' }))

    const card = screen.getByRole('button', { name: '树型表格' })
    // 曾经的置灰占位项已补齐布局引擎，卡片必须可点
    expect((card as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(card)
    expect(onChange).toHaveBeenCalledWith('treetable', undefined)
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

  it('组内列出方向变体，且点选同时上抛方向', () => {
    const onChange = vi.fn()
    render(<StructurePicker value="mindmap" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：思维导图' }))

    // 每个方向变体一张卡（XMind 也是把变体列在同一组里，不新开组）
    for (const name of [
      '思维导图（向右）',
      '思维导图（向左）',
      '逻辑图（向左）',
      '括号图（向左）',
      '组织结构图（向上）',
      '树形图（向上）',
      '时间轴（垂直）',
    ]) {
      expect(screen.getByRole('button', { name }), name).toBeTruthy()
    }

    fireEvent.click(screen.getByRole('button', { name: '组织结构图（向上）' }))
    expect(onChange).toHaveBeenCalledWith('org', 'up')
  })

  it('方向回显：显式存了自然方向也要高亮对应卡片', () => {
    // 文档里存了 down（组织结构图的自然方向），归一化后仍应命中「向下」那张卡
    render(<StructurePicker value="org" valueDirection="down" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: '骨架：组织结构图（向下）' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '骨架：组织结构图（向下）' }))
    expect(
      screen.getByRole('button', { name: '组织结构图（向下）' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByRole('button', { name: '组织结构图（向上）' }).getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('方向不同则选中态不同（同一骨架的两张变体卡片互斥）', () => {
    render(<StructurePicker value="org" valueDirection="up" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：组织结构图（向上）' }))
    expect(
      screen.getByRole('button', { name: '组织结构图（向上）' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByRole('button', { name: '组织结构图（向下）' }).getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('disabled 时不响应点击', () => {
    render(<StructurePicker value="mindmap" onChange={vi.fn()} disabled />)

    fireEvent.click(screen.getByRole('button', { name: '骨架：思维导图' }))

    expect(screen.queryByRole('dialog', { name: '选择骨架' })).toBeNull()
  })
})
