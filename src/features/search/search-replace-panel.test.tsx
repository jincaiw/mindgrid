import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import type { TopicSearchEntry } from '../canvas/topic-search'
import { SearchReplacePanel, type SearchReplacePanelProps } from './search-replace-panel'

function entry(topicId: string, text: string, path = [text]): TopicSearchEntry {
  return { topicId, text, depth: 0, path, sheetId: 'sheet_1', sheetTitle: '主画布' }
}

function makeProps(
  overrides: Partial<SearchReplacePanelProps> = {},
): SearchReplacePanelProps {
  return {
    searchQuery: '',
    onSearchQueryChange: vi.fn(),
    replaceQuery: '',
    onReplaceQueryChange: vi.fn(),
    results: [],
    activeIndex: 0,
    onActivateResult: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onReplaceCurrent: vi.fn(),
    onReplaceAll: vi.fn(),
    replaceAllPlan: { topicCount: 0, occurrenceCount: 0 },
    ...overrides,
  }
}

function renderPanel(props: Partial<SearchReplacePanelProps> = {}) {
  const merged = makeProps(props)
  renderWithApp(<SearchReplacePanel {...merged} />)
  return { panel: within(screen.getByRole('search', { name: '查找与替换' })), props: merged }
}

describe('SearchReplacePanel', () => {
  it('暴露查找与替换两个输入框', () => {
    const { panel } = renderPanel()

    expect(panel.getByLabelText('查找')).toBeTruthy()
    expect(panel.getByLabelText('替换为')).toBeTruthy()
  })

  it('无查询时计数显示占位，且跳转按钮禁用', () => {
    const { panel } = renderPanel()

    expect(panel.getByText('—')).toBeTruthy()
    expect(panel.getByRole('button', { name: '上一个' }).hasAttribute('disabled')).toBe(true)
    expect(panel.getByRole('button', { name: '下一个' }).hasAttribute('disabled')).toBe(true)
  })

  it('有结果时显示当前序号与总数', () => {
    const { panel } = renderPanel({
      searchQuery: '主题',
      results: [entry('t1', '规划主题'), entry('t2', '复盘主题')],
      activeIndex: 1,
    })

    expect(panel.getByText('2 / 2')).toBeTruthy()
  })

  it('查询无匹配时显示无匹配', () => {
    const { panel } = renderPanel({ searchQuery: 'zzz', results: [] })

    expect(panel.getByText('无匹配')).toBeTruthy()
  })

  it('输入查找词会向上冒泡', () => {
    const { panel, props } = renderPanel()

    fireEvent.change(panel.getByLabelText('查找'), { target: { value: '规划' } })

    expect(props.onSearchQueryChange).toHaveBeenCalledWith('规划')
  })

  it('Enter 下一个、Shift+Enter 上一个', () => {
    const { panel, props } = renderPanel({ results: [entry('t1', 'a')] })
    const input = panel.getByLabelText('查找')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onNext).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(props.onPrevious).toHaveBeenCalledTimes(1)
  })

  it('Esc 清空查询', () => {
    const { panel, props } = renderPanel({ searchQuery: 'abc' })

    fireEvent.keyDown(panel.getByLabelText('查找'), { key: 'Escape' })

    expect(props.onSearchQueryChange).toHaveBeenCalledWith('')
  })

  it('列出结果并在点击时激活对应项', () => {
    const { panel, props } = renderPanel({
      results: [entry('t1', '规划主题'), entry('t2', '复盘主题', ['中心主题', '复盘主题'])],
    })

    fireEvent.click(panel.getByText('复盘主题'))

    expect(props.onActivateResult).toHaveBeenCalledWith(1)
  })

  it('展示结果的祖先路径，便于区分同名主题', () => {
    const { panel } = renderPanel({
      results: [entry('t2', '复盘主题', ['中心主题', '复盘主题'])],
    })

    expect(panel.getByText('中心主题')).toBeTruthy()
  })

  it('全部替换按钮在无可替换项时禁用', () => {
    const { panel } = renderPanel({ replaceAllPlan: { topicCount: 0, occurrenceCount: 0 } })

    expect(panel.getByRole('button', { name: '全部替换' }).hasAttribute('disabled')).toBe(true)
  })

  it('全部替换按钮显示影响面（主题数）', () => {
    const { panel } = renderPanel({ replaceAllPlan: { topicCount: 3, occurrenceCount: 7 } })

    const button = panel.getByRole('button', { name: '全部替换 (3)' })
    expect(button.getAttribute('title')).toBe('将替换 3 个主题、共 7 处')
  })

  it('触发替换当前与全部替换', () => {
    const { panel, props } = renderPanel({
      results: [entry('t1', 'a')],
      replaceAllPlan: { topicCount: 1, occurrenceCount: 1 },
    })

    fireEvent.click(panel.getByRole('button', { name: '替换当前' }))
    fireEvent.click(panel.getByRole('button', { name: '全部替换 (1)' }))

    expect(props.onReplaceCurrent).toHaveBeenCalledTimes(1)
    expect(props.onReplaceAll).toHaveBeenCalledTimes(1)
  })

  it('结果超过 50 条时截断并提示总数', () => {
    const results = Array.from({ length: 60 }, (_, i) => entry(`t${i}`, `主题${i}`))
    const { panel } = renderPanel({ results })

    expect(panel.getByText('仅显示前 50 条，共 60 条')).toBeTruthy()
  })
})
