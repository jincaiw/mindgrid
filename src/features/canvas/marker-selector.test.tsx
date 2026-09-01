import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import { MarkerSelector } from './marker-selector'
import type { TopicMarker } from '../../lib/document/types'

it('renders current markers as chips with labels', () => {
  const markers: TopicMarker[] = [
    { id: 'priority-1', label: '优先级 1' },
    { id: 'star', label: '星标' },
  ]
  renderWithApp(<MarkerSelector markers={markers} onChange={vi.fn()} />)

  expect(screen.getByText('优先级 1')).toBeInTheDocument()
  expect(screen.getByText('星标')).toBeInTheDocument()
})

it('opens the popover and adds a marker via the grid', () => {
  const onChange = vi.fn()
  renderWithApp(<MarkerSelector markers={[]} onChange={onChange} />)

  fireEvent.click(screen.getByRole('button', { name: /添加标记/ }))

  // popover 打开后应出现标记网格（dialog 角色）
  const dialog = screen.getByRole('dialog', { name: '选择标记' })
  expect(dialog).toBeInTheDocument()

  // 点击"进度 50%"选项应调用 onChange 并携带规范 ID
  fireEvent.click(screen.getByRole('button', { name: '进度 50%' }))

  expect(onChange).toHaveBeenCalledWith([{ id: 'progress-50', label: '进度 50%' }])
})

it('removes a marker via the chip remove button', () => {
  const onChange = vi.fn()
  const markers: TopicMarker[] = [
    { id: 'priority-1', label: '优先级 1' },
    { id: 'star', label: '星标' },
  ]
  renderWithApp(<MarkerSelector markers={markers} onChange={onChange} />)

  fireEvent.click(screen.getByRole('button', { name: '移除标记 优先级 1' }))

  expect(onChange).toHaveBeenCalledWith([{ id: 'star', label: '星标' }])
})

it('toggles an already-selected marker off via the grid', () => {
  const onChange = vi.fn()
  const markers: TopicMarker[] = [{ id: 'flag', label: '旗帜' }]
  renderWithApp(<MarkerSelector markers={markers} onChange={onChange} />)

  fireEvent.click(screen.getByRole('button', { name: /添加标记/ }))
  // 旗帜已选中，点击应移除
  fireEvent.click(screen.getByRole('button', { name: '旗帜' }))

  expect(onChange).toHaveBeenCalledWith([])
})

it('closes the popover on Escape', () => {
  renderWithApp(<MarkerSelector markers={[]} onChange={vi.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: /添加标记/ }))
  expect(screen.getByRole('dialog', { name: '选择标记' })).toBeInTheDocument()

  fireEvent.keyDown(window, { key: 'Escape' })

  expect(screen.queryByRole('dialog', { name: '选择标记' })).not.toBeInTheDocument()
})

it('does not render the trigger when disabled', () => {
  renderWithApp(
    <MarkerSelector markers={[{ id: 'star', label: '星标' }]} onChange={vi.fn()} disabled />,
  )

  expect(screen.queryByRole('button', { name: /添加标记/ })).not.toBeInTheDocument()
  // 已选 chip 仍然可见（无移除按钮）
  expect(screen.getByText('星标')).toBeInTheDocument()
})
