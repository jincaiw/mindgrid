import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import type { TopicSnapshot } from '../../lib/document/types'
import type { DocumentSession } from '../document/use-document-session'
import { GanttView } from './gantt-view'

const DAY_MS = 86_400_000

function makeTopic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

/** 构造带任务日期的最小 DocumentSession（甘特图只用 document / selectTopic / setTopicTask / exportGanttImage）。 */
function makeSession(
  sheets: { id: string; title: string; rootTopic: TopicSnapshot }[],
  overrides: {
    selectTopic?: ReturnType<typeof vi.fn>
    setTopicTask?: ReturnType<typeof vi.fn>
    exportGanttImage?: ReturnType<typeof vi.fn>
    exportGanttPng?: ReturnType<typeof vi.fn>
  } = {},
): DocumentSession {
  const noop = vi.fn(async () => {})
  return {
    status: 'ready',
    document: {
      schemaVersion: '1.0.0',
      documentId: 'doc_1',
      revision: 1,
      activeSheetId: sheets[0]?.id ?? 'sheet_1',
      sheets,
    },
    summary: {
      documentId: 'doc_1',
      revision: 1,
      activeSheetId: sheets[0]?.id ?? 'sheet_1',
      sheetCount: sheets.length,
      topicCount: 0,
      rootTopicText: '',
    },
    activeTopicId: null,
    canUndo: false,
    canRedo: false,
    nextUndoAction: null,
    nextRedoAction: null,
    filePath: null,
    lastSavedAtMs: null,
    lastAutosavedAtMs: null,
    hasUnsavedChanges: false,
    recoveredFromAutosave: false,
    repairReport: null,
    error: null,
    canRepairLastFailedOpen: false,
    recentAction: '',
    recentActions: [],
    selectTopic: overrides.selectTopic ?? noop,
    setTopicTask: overrides.setTopicTask ?? noop,
    exportGanttImage: overrides.exportGanttImage ?? noop,
    exportGanttPng: overrides.exportGanttPng ?? noop,
  } as unknown as DocumentSession
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GanttView', () => {
  it('无任务时显示空态', () => {
    const session = makeSession([
      { id: 'sheet_1', title: '主画布', rootTopic: makeTopic('t_root', '项目') },
    ])
    renderWithApp(
      <GanttView session={session} selectedTopicIds={[]} onSelectedTopicIdsChange={() => {}} onExit={() => {}} />,
    )
    expect(screen.getByText('暂无可展示的任务')).toBeTruthy()
  })

  it('按画布分组渲染任务名与状态条形，点击行选中主题', () => {
    const day1 = Date.UTC(2026, 8, 1)
    const day3 = Date.UTC(2026, 8, 3)
    const root = makeTopic('t_root', '项目', [
      { ...makeTopic('t_a', '设计'), task: { status: 'started', startDateMs: day1, dueDateMs: day3 } },
      { ...makeTopic('t_b', '开发'), task: { status: 'completed', dueDateMs: day3 } },
    ])
    const selectTopic = vi.fn(async () => {})
    const session = makeSession([{ id: 'sheet_1', title: '主画布', rootTopic: root }], { selectTopic })
    const onSelectedTopicIdsChange = vi.fn()

    renderWithApp(
      <GanttView session={session} selectedTopicIds={[]} onSelectedTopicIdsChange={onSelectedTopicIdsChange} onExit={() => {}} />,
    )

    expect(screen.getByText('1 个画布')).toBeTruthy()
    expect(screen.getByText('2 个任务')).toBeTruthy()
    expect(screen.getByTitle('项目 / 设计')).toBeTruthy()
    expect(screen.getByTitle('项目 / 开发')).toBeTruthy()
    expect(screen.getByLabelText('项目 / 设计 进行中')).toBeTruthy()
    expect(screen.getByLabelText('项目 / 开发 已完成')).toBeTruthy()

    fireEvent.click(screen.getByTitle('项目 / 设计'))
    expect(onSelectedTopicIdsChange).toHaveBeenCalledWith(['t_a'])
    expect(selectTopic).toHaveBeenCalledWith('t_a')
  })

  it('渲染今日标记与返回按钮，Esc 退出', () => {
    const today = new Date()
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    const root = makeTopic('t_root', '项目', [
      {
        ...makeTopic('t_a', '任务'),
        task: { status: 'pending', startDateMs: todayUtc - DAY_MS, dueDateMs: todayUtc + DAY_MS },
      },
    ])
    const session = makeSession([{ id: 'sheet_1', title: '主画布', rootTopic: root }])
    const onExit = vi.fn()

    renderWithApp(
      <GanttView session={session} selectedTopicIds={[]} onSelectedTopicIdsChange={() => {}} onExit={onExit} />,
    )

    expect(screen.getByRole('region', { name: '甘特图全屏视图' }).querySelector('.gantt-view__today-marker')).toBeTruthy()

    fireEvent.click(screen.getByText('返回画布'))
    expect(onExit).toHaveBeenCalled()
  })

  it('逾期未完成任务渲染 overdue 标记', () => {
    const overdueDue = Date.now() - 3 * DAY_MS
    const overdueStart = Date.now() - 5 * DAY_MS
    const root = makeTopic('t_root', '项目', [
      { ...makeTopic('t_late', '逾期任务'), task: { status: 'pending', startDateMs: overdueStart, dueDateMs: overdueDue } },
    ])
    const session = makeSession([{ id: 'sheet_1', title: '主画布', rootTopic: root }])

    renderWithApp(
      <GanttView session={session} selectedTopicIds={[]} onSelectedTopicIdsChange={() => {}} onExit={() => {}} />,
    )

    const bar = screen.getByLabelText('项目 / 逾期任务 待办 已逾期')
    expect(bar.className).toContain('gantt-view__bar--overdue')
  })

  it('日/周/月粒度切换更新按钮激活态', () => {
    const todayUtc = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
    const root = makeTopic('t_root', '项目', [
      { ...makeTopic('t_a', '任务'), task: { status: 'pending', startDateMs: todayUtc, dueDateMs: todayUtc } },
    ])
    const session = makeSession([{ id: 'sheet_1', title: '主画布', rootTopic: root }])

    renderWithApp(
      <GanttView session={session} selectedTopicIds={[]} onSelectedTopicIdsChange={() => {}} onExit={() => {}} />,
    )

    const dayBtn = screen.getByRole('button', { name: '日' })
    const weekBtn = screen.getByRole('button', { name: '周' })
    const monthBtn = screen.getByRole('button', { name: '月' })
    expect(dayBtn.getAttribute('aria-pressed')).toBe('true')
    expect(weekBtn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(weekBtn)
    expect(weekBtn.getAttribute('aria-pressed')).toBe('true')
    expect(dayBtn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(monthBtn)
    expect(monthBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('拖拽条形整体平移任务日期并提交 setTopicTask', () => {
    const start = Date.UTC(2026, 8, 1)
    const due = Date.UTC(2026, 8, 3)
    const root = makeTopic('t_root', '项目', [
      { ...makeTopic('t_a', '设计'), task: { status: 'started', startDateMs: start, dueDateMs: due, priority: 2 } },
    ])
    const setTopicTask = vi.fn(async () => {})
    const session = makeSession([{ id: 'sheet_1', title: '主画布', rootTopic: root }], { setTopicTask })
    const onSelectedTopicIdsChange = vi.fn()

    renderWithApp(
      <GanttView session={session} selectedTopicIds={[]} onSelectedTopicIdsChange={onSelectedTopicIdsChange} onExit={() => {}} />,
    )

    const bar = screen.getByLabelText('项目 / 设计 进行中')
    // 日粒度 dayWidth=32，右移 64px → +2 天
    fireEvent.pointerDown(bar, { button: 0, pointerId: 1, clientX: 100 })
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 164 })
    fireEvent.pointerUp(bar, { pointerId: 1, clientX: 164 })

    expect(setTopicTask).toHaveBeenCalledTimes(1)
    expect(setTopicTask).toHaveBeenCalledWith('t_a', {
      status: 'started',
      priority: 2,
      startDateMs: start + 2 * DAY_MS,
      dueDateMs: due + 2 * DAY_MS,
    })
    // 拖拽结束不触发点击选中
    expect(onSelectedTopicIdsChange).not.toHaveBeenCalled()
  })

  it('未超过拖拽阈值的按下抬起按点击选中处理', () => {
    const todayUtc = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
    const root = makeTopic('t_root', '项目', [
      { ...makeTopic('t_a', '任务'), task: { status: 'pending', startDateMs: todayUtc, dueDateMs: todayUtc } },
    ])
    const selectTopic = vi.fn(async () => {})
    const setTopicTask = vi.fn(async () => {})
    const session = makeSession([{ id: 'sheet_1', title: '主画布', rootTopic: root }], { selectTopic, setTopicTask })

    renderWithApp(
      <GanttView session={session} selectedTopicIds={[]} onSelectedTopicIdsChange={() => {}} onExit={() => {}} />,
    )

    const bar = screen.getByLabelText('项目 / 任务 待办')
    fireEvent.pointerDown(bar, { button: 0, pointerId: 1, clientX: 50 })
    fireEvent.pointerUp(bar, { pointerId: 1, clientX: 51 })

    expect(selectTopic).toHaveBeenCalledWith('t_a')
    expect(setTopicTask).not.toHaveBeenCalled()
  })

  it('拖右缘手柄仅延长截止日期', () => {
    const start = Date.UTC(2026, 8, 1)
    const due = Date.UTC(2026, 8, 3)
    const root = makeTopic('t_root', '项目', [
      { ...makeTopic('t_a', '设计'), task: { status: 'started', startDateMs: start, dueDateMs: due } },
    ])
    const setTopicTask = vi.fn(async () => {})
    const session = makeSession([{ id: 'sheet_1', title: '主画布', rootTopic: root }], { setTopicTask })

    const { container } = renderWithApp(
      <GanttView session={session} selectedTopicIds={[]} onSelectedTopicIdsChange={() => {}} onExit={() => {}} />,
    )

    const endHandle = container.querySelector<HTMLElement>('.gantt-view__handle--end')
    expect(endHandle).toBeTruthy()
    // 日粒度 dayWidth=32，右缘拖 96px → 截止 +3 天，开始不变
    fireEvent.pointerDown(endHandle!, { button: 0, pointerId: 1, clientX: 200 })
    fireEvent.pointerMove(endHandle!, { pointerId: 1, clientX: 296 })
    fireEvent.pointerUp(endHandle!, { pointerId: 1, clientX: 296 })

    expect(setTopicTask).toHaveBeenCalledTimes(1)
    expect(setTopicTask).toHaveBeenCalledWith('t_a', {
      status: 'started',
      startDateMs: start,
      dueDateMs: due + 3 * DAY_MS,
    })
  })

  it('按文档关系线渲染依赖箭头', () => {
    const day1 = Date.UTC(2026, 8, 1)
    const day3 = Date.UTC(2026, 8, 3)
    const day5 = Date.UTC(2026, 8, 5)
    const root = makeTopic('t_root', '项目', [
      { ...makeTopic('t_a', '前置'), task: { status: 'started', startDateMs: day1, dueDateMs: day3 } },
      { ...makeTopic('t_b', '后继'), task: { status: 'pending', startDateMs: day3, dueDateMs: day5 } },
      makeTopic('t_c', '无关'),
    ])
    const noop = vi.fn(async () => {})
    const session = {
      status: 'ready',
      document: {
        schemaVersion: '1.0.0',
        documentId: 'doc_1',
        revision: 1,
        activeSheetId: 'sheet_1',
        sheets: [{ id: 'sheet_1', title: '主画布', rootTopic: root }],
        relationships: [{ id: 'r1', fromTopicId: 't_a', toTopicId: 't_b' }],
      },
      summary: null,
      activeTopicId: null,
      selectTopic: noop,
      setTopicTask: noop,
    } as unknown as DocumentSession

    const { container } = renderWithApp(
      <GanttView session={session} selectedTopicIds={[]} onSelectedTopicIdsChange={() => {}} onExit={() => {}} />,
    )

    const paths = container.querySelectorAll('svg.gantt-view__deps path.gantt-view__dep-path')
    expect(paths).toHaveLength(1)
    const d = paths[0].getAttribute('d') ?? ''
    // 起点在前置条形右缘，终点在后继条形左缘附近
    expect(d.startsWith('M ')).toBe(true)
    expect(d).toContain('V ')
  })

  it('点击导出按钮调用会话导出并携带当前粒度', () => {
    const todayUtc = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
    const root = makeTopic('t_root', '项目', [
      { ...makeTopic('t_a', '任务'), task: { status: 'pending', startDateMs: todayUtc, dueDateMs: todayUtc } },
    ])
    const exportGanttImage = vi.fn(async () => {})
    const exportGanttPng = vi.fn(async () => {})
    const session = makeSession([{ id: 'sheet_1', title: '主画布', rootTopic: root }], { exportGanttImage, exportGanttPng })

    renderWithApp(
      <GanttView session={session} selectedTopicIds={[]} onSelectedTopicIdsChange={() => {}} onExit={() => {}} />,
    )

    fireEvent.click(screen.getByText('导出 SVG'))
    expect(exportGanttImage).toHaveBeenCalledTimes(1)
    expect(exportGanttImage).toHaveBeenCalledWith('day')

    fireEvent.click(screen.getByText('导出 PNG'))
    expect(exportGanttPng).toHaveBeenCalledTimes(1)
    expect(exportGanttPng).toHaveBeenCalledWith('day')

    // 切到周粒度后导出应携带 week
    fireEvent.click(screen.getByRole('button', { name: '周' }))
    fireEvent.click(screen.getByText('导出 SVG'))
    expect(exportGanttImage).toHaveBeenLastCalledWith('week')
  })
})
