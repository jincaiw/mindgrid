import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import { PaletteEditor } from './palette-editor'

describe('PaletteEditor', () => {
  it('seeds colors from the current palette when creating a new one', () => {
    renderWithApp(
      <PaletteEditor
        palette={null}
        seedColors={['#111111', '#222222', '#333333']}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('第 1 个颜色')).toHaveValue('#111111')
    expect(screen.getByLabelText('第 2 个颜色')).toHaveValue('#222222')
    expect(screen.getByLabelText('第 3 个颜色')).toHaveValue('#333333')
  })

  it('requires a name and at least two colors before saving', () => {
    const onSave = vi.fn()
    renderWithApp(
      <PaletteEditor
        palette={null}
        seedColors={['#111111', '#222222']}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    )

    const save = screen.getByRole('button', { name: '保存' })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText('配色方案名称'), {
      target: { value: '品牌色' },
    })
    expect(save).toBeEnabled()

    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({
      name: '品牌色',
      colors: ['#111111', '#222222'],
    })
  })

  it('adds and removes colors within the allowed range', () => {
    renderWithApp(
      <PaletteEditor
        palette={{ id: 'custom-a', name: 'A', colors: ['#111111', '#222222'] }}
        seedColors={[]}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '添加颜色' }))
    expect(screen.getByLabelText('第 3 个颜色')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '删除第 3 个颜色' }))
    expect(screen.queryByLabelText('第 3 个颜色')).not.toBeInTheDocument()

    // 只剩 2 个颜色时不允许再删（色板至少两色才有分支编码的意义）
    expect(screen.getByRole('button', { name: '删除第 1 个颜色' })).toBeDisabled()
  })

  it('keeps the palette id when editing so the selection stays valid', () => {
    const onSave = vi.fn()
    renderWithApp(
      <PaletteEditor
        palette={{ id: 'custom-existing', name: '旧名', colors: ['#111111', '#222222'] }}
        seedColors={[]}
        onCancel={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('配色方案名称'), { target: { value: '新名' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(onSave.mock.calls[0][0]).toMatchObject({ id: 'custom-existing', name: '新名' })
  })

  it('offers delete only when editing an existing palette', () => {
    const onDelete = vi.fn()
    const { unmount } = renderWithApp(
      <PaletteEditor
        palette={{ id: 'custom-x', name: 'X', colors: ['#111111', '#222222'] }}
        seedColors={[]}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onDelete).toHaveBeenCalledWith('custom-x')
    unmount()

    renderWithApp(
      <PaletteEditor
        palette={null}
        seedColors={['#111111', '#222222']}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    )
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
  })
})
