import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrintSheet } from './print-sheet'
import { usePrintSheet } from './use-print-sheet'

/**
 * jsdom 没有 URL.createObjectURL，而"有没有释放上一份位图"正是这里最容易漏的地方
 * （不释放 = 每次打印泄漏一张几 MB 的图），所以必须把它做成可观测的桩。
 */
function stubObjectUrl() {
  let counter = 0
  const created: string[] = []
  const revoked: string[] = []

  const create = vi.fn(() => {
    counter += 1
    const url = `blob:mindgrid/${counter}`
    created.push(url)
    return url
  })
  const revoke = vi.fn((url: string) => {
    revoked.push(url)
  })

  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: create })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revoke })

  return { created, revoked }
}

afterEach(() => {
  // 删除桩，避免污染同一文件里其它用例
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
})

describe('usePrintSheet', () => {
  it('装进位图后给出 URL；替换时释放上一份', () => {
    const { created, revoked } = stubObjectUrl()
    const { result } = renderHook(() => usePrintSheet())

    act(() => {
      result.current.showPrintSheet(new Uint8Array([1]), '第一张')
    })
    expect(result.current.printSheet?.url).toBe(created[0])
    expect(revoked).toEqual([])

    act(() => {
      result.current.showPrintSheet(new Uint8Array([2]), '第二张')
    })

    // 新的生效，旧的被释放——不释放就会一直占着一张位图
    expect(result.current.printSheet?.url).toBe(created[1])
    expect(revoked).toEqual([created[0]])
  })

  it('卸载时释放当前位图', () => {
    const { created, revoked } = stubObjectUrl()
    const { result, unmount } = renderHook(() => usePrintSheet())

    act(() => {
      result.current.showPrintSheet(new Uint8Array([1]), '一张')
    })
    unmount()

    expect(revoked).toEqual([created[0]])
  })
})

describe('PrintSheet', () => {
  it('没有位图时不渲染任何东西', () => {
    const { container } = render(<PrintSheet sheet={null} />)
    expect(container.querySelector('.print-sheet')).toBeNull()
  })

  it('挂到 body 上（不在应用外壳内），这样打印样式只需藏掉整棵 #root', () => {
    render(
      <div id="fake-root">
        <PrintSheet sheet={{ url: 'blob:mindgrid/1', title: '产品规划' }} />
      </div>,
    )

    const sheet = document.querySelector('.print-sheet')
    expect(sheet).not.toBeNull()
    // 关键：父节点是 body 而不是外壳——否则藏 #root 会把打印页一起藏掉
    expect(sheet?.parentElement).toBe(document.body)
    expect(screen.getByText('产品规划')).toBeInTheDocument()
    expect(document.querySelector('.print-sheet__image')?.getAttribute('src')).toBe(
      'blob:mindgrid/1',
    )
  })
})
