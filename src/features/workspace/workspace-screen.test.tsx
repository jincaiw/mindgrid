import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import type { DocumentSession } from '../document/use-document-session'
import { WorkspaceScreen } from './workspace-screen'

const scrollIntoViewMock = vi.fn()

beforeEach(() => {
  scrollIntoViewMock.mockReset()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewMock,
  })
})

const sessionStub: DocumentSession = {
  status: 'ready',
  document: {
    schemaVersion: '1.0.0',
    documentId: 'doc_1',
    revision: 1,
    activeSheetId: 'sheet_1',
    sheets: [
      {
        id: 'sheet_1',
        title: '主画布',
        rootTopic: {
          id: 'topic_root',
          text: '中心主题',
          collapsed: false,
          children: [],
        },
      },
    ],
  },
  summary: {
    documentId: 'doc_1',
    revision: 1,
    activeSheetId: 'sheet_1',
    sheetCount: 1,
    topicCount: 4,
    rootTopicText: '中心主题',
  },
  activeTopicId: 'topic_root',
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
  recentAction: '已创建默认文档',
  recentActions: [],
  createNewDocument: async () => {},
    createFromTemplate: async () => {},
  openDocument: async () => {},
  repairLastFailedOpen: async () => {},
  clearRepairReport: async () => {},
  saveDocument: async () => {},
  saveDocumentAs: async () => {},
  exportMarkdownOutline: async () => {},
  importMarkdownOutline: async () => {},
  exportOpmlOutline: async () => {},
  importOpmlOutline: async () => {},
  exportPngImage: async () => {},
  exportSvgImage: async () => {},
  exportRecoveryCopy: async () => {},
  selectSheet: async () => {},
  createSheet: async () => {},
  renameSheet: async () => {},
  deleteSheet: async () => {},
  moveSheet: async () => {},
  setSheetChartType: async () => {},
  selectTopic: async () => {},
  createChildTopic: async () => {},
  createSiblingTopic: async () => {},
  renameTopic: async () => {},
  deleteTopic: async () => {},
  deleteTopics: async () => {},
  toggleTopicCollapsed: async () => {},
  setTopicNotes: async () => {},
  setTopicLink: async () => {},
  setTopicMarkers: async () => {},
  setTopicLabels: async () => {},
  setTopicTask: async () => {},
  setTopicStyleRef: async () => {},
  setTopicStyleOverrides: async () => {},
  setDocumentTheme: async () => {},
  createRelationship: async () => {},
  deleteRelationship: async () => {},
  createBoundary: async () => {},
  deleteBoundary: async () => {},
  createSummary: async () => {},
  deleteSummary: async () => {},
  moveTopic: async () => {},
  moveTopics: async () => {},
  moveTopicInParent: async () => {},
  moveTopicToSheet: async () => {},
  moveTopicsToSheet: async () => {},
  copyTopicToSheet: async () => {},
  copyTopicsToSheet: async () => {},
  pasteTopics: async () => {},
  undo: async () => {},
  redo: async () => {},
}

it('renders toolbar and canvas host', () => {
  renderWithApp(<WorkspaceScreen session={sessionStub} />)

  expect(screen.getByLabelText('主工具栏')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '打开文档' })).toHaveAttribute(
    'title',
    '打开文档（Cmd/Ctrl + O）',
  )
  expect(screen.getByRole('button', { name: '保存文档' })).toHaveAttribute(
    'title',
    '保存文档（Cmd/Ctrl + S）',
  )
  expect(screen.getByRole('button', { name: '另存为' })).toHaveAttribute(
    'title',
    '另存为（Shift + Cmd/Ctrl + S）',
  )
  // 导入/导出按钮在下拉菜单中
  expect(screen.getByRole('button', { name: '导出' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '导入' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '新建文档' })).toHaveAttribute(
    'title',
    '新建文档（Cmd/Ctrl + N）',
  )
  expect(screen.getByLabelText('画布区域')).toBeInTheDocument()
})

it('shows save and recovery timestamps in the toolbar as time information', () => {
  const lastSavedAtMs = 1_726_000_000_000
  const lastAutosavedAtMs = 1_726_000_123_000
  const expectedLabel = `保存 ${new Date(lastSavedAtMs).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })} · 恢复区 ${new Date(lastAutosavedAtMs).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        filePath: '/tmp/mindgrid-demo.mgd',
        lastSavedAtMs,
        lastAutosavedAtMs,
      }}
    />,
  )

  expect(screen.getByText(expectedLabel)).toBeInTheDocument()
  expect(screen.queryByText(/已自动保存/)).not.toBeInTheDocument()
})

it('exposes detailed undo and redo history labels on toolbar buttons', () => {
  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        canUndo: true,
        canRedo: true,
        nextUndoAction: '删除 2 个主题',
        nextRedoAction: '批量移动 2 个主题到其他画布',
      }}
    />,
  )

  expect(screen.getByRole('button', { name: '撤销 删除 2 个主题' })).toHaveAttribute(
    'title',
    '删除 2 个主题',
  )
  expect(
    screen.getByRole('button', { name: '重做 批量移动 2 个主题到其他画布' }),
  ).toHaveAttribute('title', '批量移动 2 个主题到其他画布')
})

it('highlights the restored topic in sidebar and canvas after undo', async () => {
  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 2,
        },
        activeTopicId: 'topic_plan',
        recentAction: '已撤销 批量移动 2 个主题到其他画布',
        nextRedoAction: '批量移动 2 个主题到其他画布',
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))
  const scene = within(screen.getByLabelText('思维导图舞台'))

  await waitFor(() =>
    expect(sidebar.getByRole('button', { name: /规划主题/ })).toHaveClass(
      'topic-tree__button--history-focus',
    ),
  )
  expect(scrollIntoViewMock).toHaveBeenCalled()

  await waitFor(() =>
    expect(scene.getByRole('button', { name: /规划主题/ })).toHaveClass(
      'mindmap-node--history-focus',
    ),
  )
})

it('restores cross-sheet target parent highlight after redo', async () => {
  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          activeSheetId: 'sheet_2',
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
            {
              id: 'sheet_2',
              title: '执行画布',
              rootTopic: {
                id: 'topic_root_2',
                text: '执行中心',
                collapsed: false,
                children: [
                  {
                    id: 'topic_bucket',
                    text: '归档区',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          activeSheetId: 'sheet_2',
          sheetCount: 2,
          topicCount: 2,
          rootTopicText: '执行中心',
        },
        activeTopicId: 'topic_plan',
        recentAction: '已重做 批量移动 2 个主题到画布“执行画布”的“执行中心 / 归档区”下面',
        nextUndoAction: '批量移动 2 个主题到画布“执行画布”的“执行中心 / 归档区”下面',
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))

  await waitFor(() =>
    expect(sidebar.getByRole('button', { name: '执行中心 / 归档区' })).toHaveClass(
      'sheet-drop-target--success',
    ),
  )
  expect(scrollIntoViewMock).toHaveBeenCalled()
})

it('shows a toolbar multi-selection banner and can clear it', () => {
  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [],
                  },
                  {
                    id: 'topic_review',
                    text: '复盘主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 3,
        },
        activeTopicId: 'topic_plan',
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))
  fireEvent.click(sidebar.getByRole('button', { name: /规划主题/ }))
  fireEvent.click(sidebar.getByRole('button', { name: /复盘主题/ }), { ctrlKey: true })

  expect(screen.getByText('多选中')).toBeInTheDocument()
  expect(screen.getByText('已选中 2 个主题，按 `Esc` 可回到单选')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '清空多选' }))

  expect(screen.queryByText('多选中')).not.toBeInTheDocument()
})

it('renders repair summary when the current document comes from a repaired copy', () => {
  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        repairReport: {
          sourcePath: '/tmp/broken.mgd',
          destinationPath: '/tmp/broken-修复副本.mgd',
          repairedAtMs: 1_726_000_000_000,
          changes: ['已重新指定有效的活动画布', '已重建 2 个主题 ID'],
        },
      }}
    />,
  )

  expect(screen.getByText('最近修复')).toBeInTheDocument()
  expect(screen.getByText('broken.mgd')).toBeInTheDocument()
  expect(screen.getByText('broken-修复副本.mgd')).toBeInTheDocument()
  expect(screen.getByText('已重建 2 个主题 ID')).toBeInTheDocument()
})

it('dismisses the repair summary after confirmation', async () => {
  function RepairSummaryHarness() {
    const [repairReport, setRepairReport] = useState<DocumentSession['repairReport']>({
      sourcePath: '/tmp/broken.mgd',
      destinationPath: '/tmp/broken-修复副本.mgd',
      repairedAtMs: 1_726_000_000_000,
      changes: ['已重新指定有效的活动画布'],
    })

    return (
      <WorkspaceScreen
        session={{
          ...sessionStub,
          repairReport,
          clearRepairReport: async () => {
            setRepairReport(null)
          },
        }}
      />
    )
  }

  renderWithApp(<RepairSummaryHarness />)

  fireEvent.click(screen.getByRole('button', { name: '已了解，收起摘要' }))

  await waitFor(() => {
    expect(screen.queryByText('最近修复')).not.toBeInTheDocument()
  })
})

it('renders the active sheet content instead of the first sheet', () => {
  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          activeSheetId: 'sheet_2',
          sheets: [
            sessionStub.document!.sheets[0],
            {
              id: 'sheet_2',
              title: '第二画布',
              rootTopic: {
                id: 'topic_root_2',
                text: '第二中心主题',
                collapsed: false,
                children: [],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          activeSheetId: 'sheet_2',
          sheetCount: 2,
          topicCount: 1,
          rootTopicText: '第二中心主题',
        },
        activeTopicId: 'topic_root_2',
      }}
    />,
  )

  expect(screen.getByText('第二画布（当前）')).toBeInTheDocument()
  expect(screen.getAllByText('第二中心主题').length).toBeGreaterThan(0)
})

it('forwards sidebar sheet actions to the session', () => {
  const createSheet = vi.fn(async () => {})
  const selectSheet = vi.fn(async () => {})
  const renameSheet = vi.fn(async () => {})
  const deleteSheet = vi.fn(async () => {})
  const moveSheet = vi.fn(async () => {})
  const moveTopicToSheet = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            sessionStub.document!.sheets[0],
            {
              id: 'sheet_2',
              title: '第二画布',
              rootTopic: {
                id: 'topic_root_2',
                text: '第二中心主题',
                collapsed: false,
                children: [],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          sheetCount: 2,
        },
        createSheet,
        selectSheet,
        renameSheet,
        deleteSheet,
        moveSheet,
        moveTopicToSheet,
      }}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: '新建画布' }))
  fireEvent.click(screen.getByRole('button', { name: '第二画布' }))
  fireEvent.change(screen.getByRole('textbox', { name: '画布名称' }), {
    target: { value: '重命名画布' },
  })
  fireEvent.click(screen.getByRole('button', { name: '重命名当前画布' }))
  fireEvent.click(screen.getByRole('button', { name: '删除当前画布' }))
  fireEvent.click(screen.getAllByRole('button', { name: '下移' })[0])

  expect(createSheet).toHaveBeenCalledTimes(1)
  expect(selectSheet).toHaveBeenCalledWith('sheet_2')
  expect(renameSheet).toHaveBeenCalledWith('sheet_1', '重命名画布')
  expect(deleteSheet).toHaveBeenCalledWith('sheet_1')
  expect(moveSheet).toHaveBeenCalledWith('sheet_1', 'down')
})

it('renders the active sheet outline in the sidebar and forwards topic actions', () => {
  const selectTopic = vi.fn(async () => {})
  const toggleTopicCollapsed = vi.fn(async () => {})
  const renameTopic = vi.fn(async () => {})
  const createChildTopic = vi.fn(async () => {})
  const moveTopicInParent = vi.fn(async () => {})
  const createSiblingTopic = vi.fn(async () => {})
  const deleteTopic = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [
                      {
                        id: 'topic_plan_child',
                        text: '执行步骤',
                        collapsed: false,
                        children: [],
                      },
                    ],
                  },
                  {
                    id: 'topic_review',
                    text: '复盘主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 4,
        },
        activeTopicId: 'topic_plan',
        selectTopic,
        toggleTopicCollapsed,
          renameTopic,
        createChildTopic,
        moveTopicInParent,
        createSiblingTopic,
        deleteTopic,
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))

  expect(sidebar.getByRole('heading', { name: '当前画布大纲' })).toBeInTheDocument()
  expect(sidebar.getByText('当前画布共有 4 个主题，可直接在这里切换选中与折叠状态。')).toBeInTheDocument()
  expect(sidebar.getByRole('button', { name: '提交重命名' })).toBeDisabled()

  fireEvent.click(sidebar.getByRole('button', { name: /规划主题/ }))
  fireEvent.click(sidebar.getAllByRole('button', { name: '折叠主题' })[0])
  fireEvent.change(sidebar.getByRole('textbox', { name: '主题名称' }), {
    target: { value: '已澄清规划' },
  })
  fireEvent.click(sidebar.getByRole('button', { name: '提交重命名' }))
  fireEvent.click(sidebar.getByRole('button', { name: '新建子主题' }))
  fireEvent.click(sidebar.getByRole('button', { name: '下移主题' }))
  fireEvent.click(sidebar.getByRole('button', { name: '新建同级' }))
  fireEvent.click(sidebar.getByRole('button', { name: '删除当前主题' }))

  expect(selectTopic).toHaveBeenCalledWith('topic_plan')
  expect(toggleTopicCollapsed).toHaveBeenCalledWith('topic_root')
  expect(renameTopic).toHaveBeenCalledWith('topic_plan', '已澄清规划')
  expect(createChildTopic).toHaveBeenCalledWith('topic_plan')
  expect(moveTopicInParent).toHaveBeenCalledWith('topic_plan', 'down')
  expect(createSiblingTopic).toHaveBeenCalledWith('topic_plan')
  expect(deleteTopic).toHaveBeenCalledWith('topic_plan')
})

it('disables reordering, sibling, and delete actions for the root topic in the sidebar', () => {
  renderWithApp(<WorkspaceScreen session={sessionStub} />)

  const sidebar = within(screen.getByLabelText('左侧边栏'))

  expect(sidebar.getByRole('textbox', { name: '主题名称' })).toHaveValue('中心主题')
  expect(sidebar.getByRole('button', { name: '提交重命名' })).toBeDisabled()
  expect(sidebar.getByRole('button', { name: '新建子主题' })).toBeEnabled()
  expect(sidebar.getByRole('button', { name: '上移主题' })).toBeDisabled()
  expect(sidebar.getByRole('button', { name: '下移主题' })).toBeDisabled()
  expect(sidebar.getByRole('button', { name: '新建同级' })).toBeDisabled()
  expect(sidebar.getByRole('button', { name: '删除当前主题' })).toBeDisabled()
  expect(sidebar.getByRole('button', { name: '移动到当前画布父主题' })).toBeDisabled()
  expect(sidebar.getByRole('button', { name: '移动到其他画布' })).toBeDisabled()
  expect(sidebar.getByRole('button', { name: '复制到其他画布' })).toBeDisabled()
})

it('restores the sidebar rename draft with Escape', () => {
  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 2,
        },
        activeTopicId: 'topic_plan',
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))
  const input = sidebar.getByRole('textbox', { name: '主题名称' })

  fireEvent.change(input, { target: { value: '临时草稿' } })
  fireEvent.keyDown(input, { key: 'Escape' })

  expect(input).toHaveValue('规划主题')
})

it('forwards sidebar move-to-parent action to the session and highlights the target', async () => {
  const moveTopic = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [
                      {
                        id: 'topic_plan_child',
                        text: '执行步骤',
                        collapsed: false,
                        children: [],
                      },
                    ],
                  },
                  {
                    id: 'topic_review',
                    text: '复盘主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 4,
        },
        activeTopicId: 'topic_plan_child',
        moveTopic,
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))

  fireEvent.change(sidebar.getByRole('combobox', { name: '当前画布目标父主题' }), {
    target: { value: 'topic_review' },
  })

  await act(async () => {
    fireEvent.click(sidebar.getByRole('button', { name: '移动到当前画布父主题' }))
    await Promise.resolve()
  })

  expect(moveTopic).toHaveBeenCalledWith(
    'topic_plan_child',
    'topic_review',
    '移动主题到“中心主题 / 复盘主题”下面',
  )

  await waitFor(() =>
    expect(sidebar.getByRole('button', { name: /复盘主题/ })).toHaveClass(
      'topic-tree__button--drop-success',
    ),
  )
  expect(scrollIntoViewMock).toHaveBeenCalled()
})

it('supports batch move-to-parent actions from the sidebar outline', async () => {
  const moveTopics = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [],
                  },
                  {
                    id: 'topic_review',
                    text: '复盘主题',
                    collapsed: false,
                    children: [],
                  },
                  {
                    id: 'topic_bucket',
                    text: '归档区',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 4,
        },
        activeTopicId: 'topic_plan',
        moveTopics,
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))

  fireEvent.click(sidebar.getByRole('button', { name: /规划主题/ }))
  fireEvent.click(sidebar.getByRole('button', { name: /复盘主题/ }), { ctrlKey: true })

  expect(sidebar.getByText('已选中 2 个主题')).toBeInTheDocument()

  fireEvent.change(sidebar.getByRole('combobox', { name: '当前画布目标父主题' }), {
    target: { value: 'topic_bucket' },
  })

  await act(async () => {
    fireEvent.click(sidebar.getByRole('button', { name: '批量移动到当前画布父主题' }))
    await Promise.resolve()
  })

  expect(moveTopics).toHaveBeenCalledWith(
    ['topic_plan', 'topic_review'],
    'topic_bucket',
    '批量移动 2 个主题到“中心主题 / 归档区”下面',
  )

  await waitFor(() =>
    expect(sidebar.getByRole('button', { name: /归档区/ })).toHaveClass(
      'topic-tree__button--drop-success',
    ),
  )
  expect(scrollIntoViewMock).toHaveBeenCalled()
})

it('supports dragging a topic onto another topic in the sidebar tree', async () => {
  const moveTopic = vi.fn(async () => {})
  const dataTransfer = {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: vi.fn(),
  }

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [
                      {
                        id: 'topic_plan_child',
                        text: '执行步骤',
                        collapsed: false,
                        children: [],
                      },
                    ],
                  },
                  {
                    id: 'topic_review',
                    text: '复盘主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 4,
        },
        activeTopicId: 'topic_root',
        moveTopic,
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))
  const draggedTopic = sidebar.getByRole('button', { name: /执行步骤/ })
  const dropTarget = sidebar.getByRole('button', { name: /复盘主题/ })

  fireEvent.dragStart(draggedTopic, { dataTransfer })

  expect(sidebar.getByRole('status')).toHaveTextContent(
    '正在拖拽“执行步骤”。可以把它放到当前画布的其他主题下，或直接拖到左侧目标画布里。',
  )

  fireEvent.dragOver(dropTarget, { dataTransfer })

  expect(sidebar.getByRole('status')).toHaveTextContent(
    '正在移动“执行步骤”，释放后会成为“复盘主题”的子主题。',
  )

  await act(async () => {
    fireEvent.drop(dropTarget, { dataTransfer })
    await Promise.resolve()
  })

  expect(moveTopic).toHaveBeenCalledWith(
    'topic_plan_child',
    'topic_review',
    '拖拽移动主题到“复盘主题”下面',
  )

  await waitFor(() =>
    expect(dropTarget).toHaveClass('topic-tree__button--drop-success'),
  )
  expect(scrollIntoViewMock).toHaveBeenCalled()
})

it('shows a readable hint for invalid topic drop targets in the sidebar tree', () => {
  const dataTransfer = {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: vi.fn(),
  }

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [
                      {
                        id: 'topic_plan_child',
                        text: '执行步骤',
                        collapsed: false,
                        children: [],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 3,
        },
        activeTopicId: 'topic_root',
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))
  const draggedTopic = sidebar.getByRole('button', { name: /执行步骤/ })
  const currentParent = sidebar.getByRole('button', { name: /规划主题/ })

  fireEvent.dragStart(draggedTopic, { dataTransfer })
  fireEvent.dragOver(currentParent, { dataTransfer })

  expect(sidebar.getByRole('status')).toHaveTextContent(
    '当前主题已经在这个父主题下面了。',
  )
})

it('restores same-sheet target parent highlight after redo', async () => {
  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [],
                  },
                  {
                    id: 'topic_bucket',
                    text: '归档区',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 3,
        },
        activeTopicId: 'topic_plan',
        recentAction: '已重做 批量移动 2 个主题到“中心主题 / 归档区”下面',
        nextUndoAction: '批量移动 2 个主题到“中心主题 / 归档区”下面',
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))

  await waitFor(() =>
    expect(sidebar.getByRole('button', { name: /归档区/ })).toHaveClass(
      'topic-tree__button--drop-success',
    ),
  )
  expect(scrollIntoViewMock).toHaveBeenCalled()
})

it('auto-expands a collapsed topic after hovering during drag', async () => {
  vi.useFakeTimers()
  const toggleTopicCollapsed = vi.fn(async () => {})
  const dataTransfer = {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: vi.fn(),
  }

  try {
    renderWithApp(
      <WorkspaceScreen
        session={{
          ...sessionStub,
          document: {
            ...sessionStub.document!,
            sheets: [
              {
                id: 'sheet_1',
                title: '主画布',
                rootTopic: {
                  id: 'topic_root',
                  text: '中心主题',
                  collapsed: false,
                  children: [
                    {
                      id: 'topic_dragged',
                      text: '待整理主题',
                      collapsed: false,
                      children: [],
                    },
                    {
                      id: 'topic_bucket',
                      text: '待展开主题',
                      collapsed: true,
                      children: [
                        {
                          id: 'topic_bucket_child',
                          text: '已有子主题',
                          collapsed: false,
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
          summary: {
            ...sessionStub.summary!,
            topicCount: 4,
          },
          activeTopicId: 'topic_root',
          toggleTopicCollapsed,
        }}
      />,
    )

    const sidebar = within(screen.getByLabelText('左侧边栏'))
    const draggedTopic = sidebar.getByRole('button', { name: /待整理主题/ })
    const collapsedTarget = sidebar.getByRole('button', { name: /待展开主题/ })

    fireEvent.dragStart(draggedTopic, { dataTransfer })
    fireEvent.dragOver(collapsedTarget, { dataTransfer })
    await vi.advanceTimersByTimeAsync(450)

    expect(toggleTopicCollapsed).toHaveBeenCalledWith('topic_bucket')
  } finally {
    vi.useRealTimers()
  }
})

it('supports dragging a topic onto another sheet in the sidebar list', async () => {
  const moveTopicToSheet = vi.fn(async () => {})
  const dataTransfer = {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: vi.fn(),
  }

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_branch',
                    text: '待迁移主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
            {
              id: 'sheet_2',
              title: '执行画布',
              rootTopic: {
                id: 'topic_root_2',
                text: '执行中心',
                collapsed: false,
                children: [],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          sheetCount: 2,
          topicCount: 2,
        },
        activeTopicId: 'topic_root',
        moveTopicToSheet,
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))
  const draggedTopic = sidebar.getByRole('button', { name: /待迁移主题/ })
  const sheetTarget = sidebar.getByRole('button', { name: '执行画布' })

  fireEvent.dragStart(draggedTopic, { dataTransfer })
  fireEvent.dragOver(sheetTarget, { dataTransfer })

  expect(sidebar.getByRole('status')).toHaveTextContent(
    '正在移动“待迁移主题”，释放后会进入画布“执行画布”的根主题。',
  )

  await act(async () => {
    fireEvent.drop(sheetTarget, { dataTransfer })
    await Promise.resolve()
  })

  expect(moveTopicToSheet).toHaveBeenCalledWith(
    'topic_branch',
    'sheet_2',
    'topic_root_2',
    '拖拽移动主题到画布“执行画布”根主题',
  )
})

it('supports dragging a topic onto a specific parent in another sheet', async () => {
  const moveTopicToSheet = vi.fn(async () => {})
  const dataTransfer = {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: vi.fn(),
  }

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_branch',
                    text: '待迁移主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
            {
              id: 'sheet_2',
              title: '执行画布',
              rootTopic: {
                id: 'topic_root_2',
                text: '执行中心',
                collapsed: false,
                children: [
                  {
                    id: 'topic_bucket',
                    text: '归档区',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          sheetCount: 2,
          topicCount: 3,
        },
        activeTopicId: 'topic_root',
        moveTopicToSheet,
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))
  const draggedTopic = sidebar.getByRole('button', { name: /待迁移主题/ })
  const sheetTarget = sidebar.getByRole('button', { name: '执行画布' })

  fireEvent.dragStart(draggedTopic, { dataTransfer })
  fireEvent.dragOver(sheetTarget, { dataTransfer })

  const parentTarget = sidebar.getByRole('button', { name: '执行中心 / 归档区' })

  fireEvent.dragOver(parentTarget, { dataTransfer })

  expect(sidebar.getByRole('status')).toHaveTextContent(
    '正在移动“待迁移主题”，释放后会进入画布“执行画布”的“执行中心 / 归档区”下面。',
  )

  await act(async () => {
    fireEvent.drop(parentTarget, { dataTransfer })
    await Promise.resolve()
  })

  expect(moveTopicToSheet).toHaveBeenCalledWith(
    'topic_branch',
    'sheet_2',
    'topic_bucket',
    '拖拽移动主题到画布“执行画布”的“执行中心 / 归档区”下面',
  )

  await waitFor(() =>
    expect(sidebar.getByRole('button', { name: '执行中心 / 归档区' })).toHaveClass(
      'sheet-drop-target--success',
    ),
  )
  expect(scrollIntoViewMock).toHaveBeenCalled()
})

it('shows a readable hint for invalid sheet drop targets in the sidebar list', () => {
  const dataTransfer = {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: vi.fn(),
  }

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_branch',
                    text: '待迁移主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
            {
              id: 'sheet_2',
              title: '执行画布',
              rootTopic: {
                id: 'topic_root_2',
                text: '执行中心',
                collapsed: false,
                children: [],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          sheetCount: 2,
          topicCount: 2,
        },
        activeTopicId: 'topic_root',
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))
  const draggedTopic = sidebar.getByRole('button', { name: /待迁移主题/ })
  const currentSheet = sidebar.getByRole('button', { name: '主画布（当前）' })

  fireEvent.dragStart(draggedTopic, { dataTransfer })
  fireEvent.dragOver(currentSheet, { dataTransfer })

  expect(sidebar.getByRole('status')).toHaveTextContent(
    '当前主题已经在这张画布里了。',
  )
})

it('forwards sidebar move-to-sheet actions to the session and highlights the target', async () => {
  const moveTopicToSheet = vi.fn(async () => {})
  const copyTopicToSheet = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_branch',
                    text: '待迁移主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
            {
              id: 'sheet_2',
              title: '执行画布',
              rootTopic: {
                id: 'topic_root_2',
                text: '执行中心',
                collapsed: false,
                children: [
                  {
                    id: 'topic_bucket',
                    text: '归档区',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          sheetCount: 2,
          topicCount: 2,
        },
        activeTopicId: 'topic_branch',
        moveTopicToSheet,
        copyTopicToSheet,
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))

  fireEvent.change(sidebar.getByRole('combobox', { name: '目标画布' }), {
    target: { value: 'sheet_2' },
  })
  fireEvent.change(sidebar.getByRole('combobox', { name: '目标父主题' }), {
    target: { value: 'topic_bucket' },
  })

  await act(async () => {
    fireEvent.click(sidebar.getByRole('button', { name: '移动到其他画布' }))
    await Promise.resolve()
  })

  expect(moveTopicToSheet).toHaveBeenCalledWith(
    'topic_branch',
    'sheet_2',
    'topic_bucket',
    '移动主题到画布“执行画布”的“执行中心 / 归档区”下面',
  )

  await waitFor(() =>
    expect(sidebar.getByRole('button', { name: '执行中心 / 归档区' })).toHaveClass(
      'sheet-drop-target--success',
    ),
  )
  expect(scrollIntoViewMock).toHaveBeenCalled()

  await act(async () => {
    fireEvent.click(sidebar.getByRole('button', { name: '复制到其他画布' }))
    await Promise.resolve()
  })

  expect(copyTopicToSheet).toHaveBeenCalledWith(
    'topic_branch',
    'sheet_2',
    'topic_bucket',
    '复制主题到画布“执行画布”的“执行中心 / 归档区”下面',
  )
})

it('supports batch move and copy to another sheet from the sidebar outline', async () => {
  const moveTopicsToSheet = vi.fn(async () => {})
  const copyTopicsToSheet = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [],
                  },
                  {
                    id: 'topic_review',
                    text: '复盘主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
            {
              id: 'sheet_2',
              title: '执行画布',
              rootTopic: {
                id: 'topic_root_2',
                text: '执行中心',
                collapsed: false,
                children: [
                  {
                    id: 'topic_bucket',
                    text: '归档区',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 3,
          sheetCount: 2,
        },
        activeTopicId: 'topic_plan',
        moveTopicsToSheet,
        copyTopicsToSheet,
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))

  fireEvent.click(sidebar.getByRole('button', { name: /规划主题/ }))
  fireEvent.click(sidebar.getByRole('button', { name: /复盘主题/ }), { ctrlKey: true })
  fireEvent.change(sidebar.getByRole('combobox', { name: '目标画布' }), {
    target: { value: 'sheet_2' },
  })
  fireEvent.change(sidebar.getByRole('combobox', { name: '目标父主题' }), {
    target: { value: 'topic_bucket' },
  })

  await act(async () => {
    fireEvent.click(sidebar.getByRole('button', { name: '批量移动到其他画布' }))
    await Promise.resolve()
  })

  expect(moveTopicsToSheet).toHaveBeenCalledWith(
    ['topic_plan', 'topic_review'],
    'sheet_2',
    'topic_bucket',
    '批量移动 2 个主题到画布“执行画布”的“执行中心 / 归档区”下面',
  )

  await act(async () => {
    fireEvent.click(sidebar.getByRole('button', { name: '批量复制到其他画布' }))
    await Promise.resolve()
  })

  expect(copyTopicsToSheet).toHaveBeenCalledWith(
    ['topic_plan', 'topic_review'],
    'sheet_2',
    'topic_bucket',
    '批量复制 2 个主题到画布“执行画布”的“执行中心 / 归档区”下面',
  )
})

it('forwards inspector move-to-sheet action to the session', () => {
  const moveTopicToSheet = vi.fn(async () => {})
  const copyTopicToSheet = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_branch',
                    text: '待迁移主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
            {
              id: 'sheet_2',
              title: '执行画布',
              rootTopic: {
                id: 'topic_root_2',
                text: '执行中心',
                collapsed: false,
                  children: [
                    {
                      id: 'topic_bucket',
                      text: '归档区',
                      collapsed: false,
                      children: [],
                    },
                  ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          sheetCount: 2,
          topicCount: 2,
        },
        activeTopicId: 'topic_branch',
        moveTopicToSheet,
          copyTopicToSheet,
      }}
    />,
  )

  const inspector = within(screen.getByLabelText('右侧检查器'))

  fireEvent.change(inspector.getByRole('combobox', { name: '目标画布' }), {
    target: { value: 'sheet_2' },
  })
  fireEvent.change(inspector.getByRole('combobox', { name: '目标父主题' }), {
    target: { value: 'topic_bucket' },
  })
  fireEvent.click(inspector.getByRole('button', { name: '移动到目标画布' }))

  expect(moveTopicToSheet).toHaveBeenCalledWith(
    'topic_branch',
    'sheet_2',
    'topic_bucket',
    '移动主题到画布“执行画布”的“执行中心 / 归档区”下面',
  )

  fireEvent.click(inspector.getByRole('button', { name: '复制到目标画布' }))

  expect(copyTopicToSheet).toHaveBeenCalledWith(
    'topic_branch',
    'sheet_2',
    'topic_bucket',
    '复制主题到画布“执行画布”的“执行中心 / 归档区”下面',
  )
})

it('supports batch move-to-sheet actions from the inspector', () => {
  const moveTopicsToSheet = vi.fn(async () => {})
  const copyTopicsToSheet = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [],
                  },
                  {
                    id: 'topic_review',
                    text: '复盘主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
            {
              id: 'sheet_2',
              title: '执行画布',
              rootTopic: {
                id: 'topic_root_2',
                text: '执行中心',
                collapsed: false,
                children: [
                  {
                    id: 'topic_bucket',
                    text: '归档区',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 3,
          sheetCount: 2,
        },
        activeTopicId: 'topic_plan',
        moveTopicsToSheet,
        copyTopicsToSheet,
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))
  fireEvent.click(sidebar.getByRole('button', { name: /规划主题/ }))
  fireEvent.click(sidebar.getByRole('button', { name: /复盘主题/ }), { ctrlKey: true })

  const inspector = within(screen.getByLabelText('右侧检查器'))
  fireEvent.change(inspector.getByRole('combobox', { name: '目标画布' }), {
    target: { value: 'sheet_2' },
  })
  fireEvent.change(inspector.getByRole('combobox', { name: '目标父主题' }), {
    target: { value: 'topic_bucket' },
  })
  fireEvent.click(inspector.getByRole('button', { name: '批量移动到目标画布' }))

  expect(moveTopicsToSheet).toHaveBeenCalledWith(
    ['topic_plan', 'topic_review'],
    'sheet_2',
    'topic_bucket',
    '批量移动 2 个主题到画布“执行画布”的“执行中心 / 归档区”下面',
  )

  fireEvent.click(inspector.getByRole('button', { name: '批量复制到目标画布' }))

  expect(copyTopicsToSheet).toHaveBeenCalledWith(
    ['topic_plan', 'topic_review'],
    'sheet_2',
    'topic_bucket',
    '批量复制 2 个主题到画布“执行画布”的“执行中心 / 归档区”下面',
  )
})

it('forwards inspector rich field edits to the session', () => {
  const setTopicNotes = vi.fn(async () => {})
  const setTopicLink = vi.fn(async () => {})
  const setTopicLabels = vi.fn(async () => {})
  const setTopicTask = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_branch',
                    text: '待编辑主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 2,
        },
        activeTopicId: 'topic_branch',
        setTopicNotes,
        setTopicLink,
        setTopicLabels,
        setTopicTask,
      }}
    />,
  )

  const inspector = within(screen.getByLabelText('右侧检查器'))

  // 备注编辑：输入后失焦触发保存
  const notesField = inspector.getByPlaceholderText('为该主题添加详细备注…')
  fireEvent.change(notesField, { target: { value: '详细备注内容' } })
  fireEvent.blur(notesField)
  expect(setTopicNotes).toHaveBeenCalledWith('topic_branch', '详细备注内容')

  // 链接编辑
  const linkUrlField = inspector.getByPlaceholderText('https://example.com')
  fireEvent.change(linkUrlField, { target: { value: 'https://mindgrid.app' } })
  fireEvent.blur(linkUrlField)
  expect(setTopicLink).toHaveBeenCalledWith('topic_branch', { url: 'https://mindgrid.app' })

  // 标签编辑
  const labelsField = inspector.getByPlaceholderText('重要, 待办, 项目A')
  fireEvent.change(labelsField, { target: { value: '重要, 待办' } })
  fireEvent.blur(labelsField)
  expect(setTopicLabels).toHaveBeenCalledWith('topic_branch', ['重要', '待办'])

  // 任务状态切换（select onChange 立即触发）
  const taskStatusSelect = inspector.getByRole('combobox', { name: '任务状态' })
  fireEvent.change(taskStatusSelect, { target: { value: 'started' } })
  expect(setTopicTask).toHaveBeenCalledWith('topic_branch', { status: 'started' })
})

it('switches the document theme from the inspector theme selector', () => {
  const setDocumentTheme = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          theme: { id: 'dark' },
        },
        setDocumentTheme,
      }}
    />,
  )

  const inspector = within(screen.getByLabelText('右侧检查器'))

  // 主题选择器在“画布” tab 下，先切换过去
  fireEvent.click(inspector.getByRole('tab', { name: '画布' }))

  // 当前 dark 高亮，点击经典蓝主题
  const classicSwatch = inspector.getByRole('radio', { name: /经典蓝/ })
  fireEvent.click(classicSwatch)
  expect(setDocumentTheme).toHaveBeenCalledWith('classic-blue')

  // 恢复默认主题按钮（当前非默认主题时显示）
  const resetButton = inspector.getByRole('button', { name: '恢复默认主题' })
  fireEvent.click(resetButton)
  expect(setDocumentTheme).toHaveBeenCalledWith(null)
})

it('switches inspector tabs to reveal context-aware panels', () => {
  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_branch',
                    text: '待编辑主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 2,
        },
        activeTopicId: 'topic_branch',
      }}
    />,
  )

  const inspector = within(screen.getByLabelText('右侧检查器'))

  // 默认在“主题” tab：富内容编辑可见，关系线创建表单不可见
  expect(inspector.getByPlaceholderText('为该主题添加详细备注…')).toBeInTheDocument()
  expect(inspector.queryByRole('button', { name: '创建关系线' })).not.toBeInTheDocument()

  // 切换到“关系线” tab：创建表单出现，富内容编辑消失
  fireEvent.click(inspector.getByRole('tab', { name: '关系线' }))
  expect(inspector.getByRole('button', { name: '创建关系线' })).toBeInTheDocument()
  expect(inspector.queryByPlaceholderText('为该主题添加详细备注…')).not.toBeInTheDocument()

  // 切换到“画布” tab：文档主题选择器出现
  fireEvent.click(inspector.getByRole('tab', { name: '画布' }))
  expect(inspector.getByRole('radiogroup', { name: '文档主题' })).toBeInTheDocument()

  // 切换到“分组” tab：边界/概要创建表单出现
  fireEvent.click(inspector.getByRole('tab', { name: '分组' }))
  expect(inspector.getByPlaceholderText('例如：核心模块、风险项')).toBeInTheDocument()
  expect(inspector.getByPlaceholderText('对这组主题的归纳说明')).toBeInTheDocument()

  // 回到“主题” tab：active 状态正确
  const topicTab = inspector.getByRole('tab', { name: '主题' })
  fireEvent.click(topicTab)
  expect(topicTab).toHaveAttribute('aria-selected', 'true')
})

it('applies node color overrides from the inspector color editor', () => {
  const setTopicStyleOverrides = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_branch',
                    text: '待着色主题',
                    collapsed: false,
                    children: [],
                    styleOverrides: { fill: '#5b8cff' },
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 2,
        },
        activeTopicId: 'topic_branch',
        setTopicStyleOverrides,
      }}
    />,
  )

  const inspector = within(screen.getByLabelText('右侧检查器'))

  // 快速预设色板：点击应用 fill 覆盖
  const preset = inspector.getByRole('button', { name: '应用填充色 #ea580c' })
  fireEvent.click(preset)
  expect(setTopicStyleOverrides).toHaveBeenCalledWith('topic_branch', {
    fill: '#ea580c',
  })

  // 清除颜色覆盖按钮（topic 已有 styleOverrides 时显示）
  const clearButton = inspector.getByRole('button', { name: '清除颜色覆盖' })
  fireEvent.click(clearButton)
  expect(setTopicStyleOverrides).toHaveBeenCalledWith('topic_branch', null)
})

it('hides the rich field editor when multiple topics are selected', () => {
  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              id: 'sheet_1',
              title: '主画布',
              rootTopic: {
                id: 'topic_root',
                text: '中心主题',
                collapsed: false,
                children: [
                  {
                    id: 'topic_plan',
                    text: '规划主题',
                    collapsed: false,
                    children: [],
                  },
                  {
                    id: 'topic_review',
                    text: '复盘主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: {
          ...sessionStub.summary!,
          topicCount: 3,
        },
        activeTopicId: 'topic_plan',
      }}
    />,
  )

  const sidebar = within(screen.getByLabelText('左侧边栏'))
  fireEvent.click(sidebar.getByRole('button', { name: /规划主题/ }))
  fireEvent.click(sidebar.getByRole('button', { name: /复盘主题/ }), { ctrlKey: true })

  const inspector = within(screen.getByLabelText('右侧检查器'))
  expect(inspector.queryByPlaceholderText('为该主题添加详细备注…')).not.toBeInTheDocument()
})

const presentationDocument = {
  ...sessionStub.document!,
  sheets: [
    {
      id: 'sheet_1',
      title: '主画布',
      rootTopic: {
        id: 'topic_root',
        text: '中心主题',
        collapsed: false,
        children: [
          { id: 'topic_a', text: '分支 A', collapsed: false, children: [
            { id: 'topic_a1', text: 'A1', collapsed: false, children: [] },
          ] },
          { id: 'topic_b', text: '分支 B', collapsed: false, children: [] },
        ],
      },
    },
  ],
}

it('enters presentation mode, advances slides, and exits via controls', () => {
  renderWithApp(<WorkspaceScreen session={{ ...sessionStub, document: presentationDocument }} />)

  // 进入演示模式
  fireEvent.click(screen.getByRole('button', { name: '演示模式' }))
  const dialog = screen.getByRole('dialog', { name: '演示模式' })
  // 4 个主题 → 4 张幻灯片，首张计数 1 / 4
  expect(within(dialog).getByText('1 / 4')).toBeInTheDocument()

  // 下一张
  fireEvent.click(within(dialog).getByRole('button', { name: '下一张' }))
  expect(within(dialog).getByText('2 / 4')).toBeInTheDocument()

  // 上一张
  fireEvent.click(within(dialog).getByRole('button', { name: '上一张' }))
  expect(within(dialog).getByText('1 / 4')).toBeInTheDocument()

  // 退出
  fireEvent.click(within(dialog).getByRole('button', { name: '退出' }))
  expect(screen.queryByRole('dialog', { name: '演示模式' })).not.toBeInTheDocument()
})

it('supports keyboard navigation in presentation mode', () => {
  renderWithApp(<WorkspaceScreen session={{ ...sessionStub, document: presentationDocument }} />)

  fireEvent.click(screen.getByRole('button', { name: '演示模式' }))
  const dialog = screen.getByRole('dialog', { name: '演示模式' })
  expect(within(dialog).getByText('1 / 4')).toBeInTheDocument()

  // → 推进到第 2 张
  fireEvent.keyDown(window, { key: 'ArrowRight' })
  expect(within(dialog).getByText('2 / 4')).toBeInTheDocument()

  // Space 推进到第 3 张
  fireEvent.keyDown(window, { key: ' ' })
  expect(within(dialog).getByText('3 / 4')).toBeInTheDocument()

  // ← 回退到第 2 张
  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  expect(within(dialog).getByText('2 / 4')).toBeInTheDocument()

  // Home 回到首张
  fireEvent.keyDown(window, { key: 'Home' })
  expect(within(dialog).getByText('1 / 4')).toBeInTheDocument()

  // End 跳到末张
  fireEvent.keyDown(window, { key: 'End' })
  expect(within(dialog).getByText('4 / 4')).toBeInTheDocument()

  // Esc 退出
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: '演示模式' })).not.toBeInTheDocument()
})
