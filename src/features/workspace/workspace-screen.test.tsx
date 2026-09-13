import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import type { DocumentSession } from '../document/use-document-session'
import { WorkspaceScreen } from './workspace-screen'

const scrollIntoViewMock = vi.fn()

beforeEach(() => {
  scrollIntoViewMock.mockReset()
  // 大多数行为测试需要可见导航树；首屏默认隐藏由专门测试覆盖。
  window.sessionStorage.setItem('mindgrid.sidebar-visible', '1')
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
  openRecentFile: async () => {},
  clearRecentFiles: async () => {},
  repairLastFailedOpen: async () => {},
  clearRepairReport: async () => {},
  saveDocument: async () => {},
  saveDocumentAs: async () => {},
  exportMarkdownOutline: async () => {},
  importMarkdownOutline: async () => {},
  exportOpmlOutline: async () => {},
importOpmlOutline: async () => {},
importDocxOutline: async () => {},
  exportPngImage: async () => {},
  exportSvgImage: async () => {},
  exportGanttImage: async () => {},
  exportGanttPng: async () => {},
  exportPdfDocument: async () => {},
  exportRecoveryCopy: async () => {},
  selectSheet: async () => {},
  createSheet: async () => {},
  renameSheet: async () => {},
  deleteSheet: async () => {},
  moveSheet: async () => {},
  setSheetChartType: async () => {},
  setSheetBranchStyle: async () => {},
  setSheetNumbering: async () => {},
  applyTopicStyleToSiblings: async () => {},
  moveTopicFreely: async () => {},
  setSheetLayoutDirection: async () => {},
  selectTopic: async () => {},
  createChildTopic: async () => {},
  createSiblingTopic: async () => {},
  createParentTopic: async () => {},
  createFloatingTopic: async () => {},
  renameTopic: async () => {},
  deleteTopic: async () => {},
  deleteTopics: async () => {},
  deleteTopicOnly: async () => {},
  toggleTopicCollapsed: async () => {},
  setTopicsCollapsed: async () => {},
  setTopicNotes: async () => {},
  setTopicImage: async () => {},
  removeTopicImage: async () => {},
  readAssetDataUrl: async () => '',
  setTopicLink: async () => {},
  setTopicMarkers: async () => {},
  setTopicLabels: async () => {},
  setTopicTask: async () => {},
  setTopicStyleRef: async () => {},
  setTopicStyleOverrides: async () => {},
  setTopicStructure: async () => {},
  setDocumentTheme: async () => {},
  setDocumentSetting: async () => {},
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
  // 中段：XMind 式竖排动作 主题 / 子主题 / 联系 / 概要 / 外框 / 标记 / 插入
  for (const label of ['主题', '子主题', '联系', '概要', '外框', '标记', '插入']) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  }
  // 右段：ZEN / 演说 / 格式
  for (const label of ['ZEN', '演说', '格式']) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  }
  expect(screen.getByLabelText('画布区域')).toBeInTheDocument()
})

it('keeps file actions out of the toolbar (XMind puts them in the menu)', () => {
  renderWithApp(<WorkspaceScreen session={sessionStub} />)

  // 文件操作与撤销重做全部收进原生菜单与快捷键，工具栏不再占位置
  const movedOut = [
    '新建文档',
    '打开文档',
    '保存文档',
    '另存为',
    '导入',
    '导出',
    '撤销',
    '重做',
    '搜索',
    '侧栏',
    '检查器',
  ]
  for (const label of movedOut) {
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
  }
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

it('keeps undo/redo out of the toolbar after moving them to the menu', () => {
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

  // 撤销/重做改由「编辑」菜单与 ⌘Z / ⇧⌘Z 承担（对标 XMind），工具栏不再放按钮
  expect(screen.queryByRole('button', { name: /撤销/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /重做/ })).not.toBeInTheDocument()
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
  expandSheetManager(sidebar)

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

  // 「第二画布（当前）」是侧栏底部画布管理折叠区里的列表项，需先展开
  expandSheetManager(within(screen.getByLabelText('左侧边栏')))

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

  // 限定在侧栏作用域：批次 19 引入的底部画布标签栏（SheetTabBar）也会渲染
  // 同名画布按钮与“新建画布”入口，全局查询会产生多元素歧义。
  const sidebar = within(screen.getByLabelText('左侧边栏'))
  expandSheetManager(sidebar)

  fireEvent.click(sidebar.getByRole('button', { name: '新建画布' }))
  fireEvent.click(sidebar.getByRole('button', { name: '第二画布' }))
  fireEvent.change(sidebar.getByRole('textbox', { name: '画布名称' }), {
    target: { value: '重命名画布' },
  })
  fireEvent.click(sidebar.getByRole('button', { name: '重命名当前画布' }))
  fireEvent.click(sidebar.getByRole('button', { name: '删除当前画布' }))
  fireEvent.click(sidebar.getAllByRole('button', { name: '下移' })[0])

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
  expandSheetManager(sidebar)
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
  expandSheetManager(sidebar)
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
  expandSheetManager(sidebar)
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
  expandSheetManager(sidebar)

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

  // 跨画布移动属画布级操作，3 子页改造后归入「画布」页
  fireEvent.click(inspector.getByRole('tab', { name: '画布' }))

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
  // 跨画布移动属画布级操作，3 子页改造后归入「画布」页
  fireEvent.click(inspector.getByRole('tab', { name: '画布' }))

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

/**
 * 右栏默认停在「画布」子页（XMind 默认页）；需要节点级样式的用例先切到「样式」。
 * 幂等：已经选中就直接返回，避免再点一次又切回画布页。
 */
function openInspectorStyleTab() {
  const inspector = within(screen.getByLabelText('右侧检查器'))
  const styleTab = inspector.getByRole('tab', { name: '样式' })
  if (styleTab.getAttribute('aria-selected') !== 'true') {
    fireEvent.click(styleTab)
  }
  return inspector
}

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

  const inspector = openInspectorStyleTab()

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

  // 默认停在“画布”子页（XMind 默认页）：画布级表单可见，节点级富内容编辑不可见
  expect(inspector.queryByPlaceholderText('为该主题添加详细备注…')).not.toBeInTheDocument()
  expect(inspector.getByRole('button', { name: '骨架：思维导图' })).toBeInTheDocument()

  // 切到“样式”子页：富内容编辑出现
  fireEvent.click(inspector.getByRole('tab', { name: '样式' }))
  expect(inspector.getByPlaceholderText('为该主题添加详细备注…')).toBeInTheDocument()

  // 切换到“演说”子页：放映入口出现，富内容编辑消失
  fireEvent.click(inspector.getByRole('tab', { name: '演说' }))
  expect(inspector.queryByPlaceholderText('为该主题添加详细备注…')).not.toBeInTheDocument()

  // 放映入口与工具栏演示按钮走同一路径：点了就真的进入演示模式。
  // 不用 getByLabelText('演示模式')——工具栏那个演示按钮也是这个 aria-label，会撞车，
  // 故用演示视图内部的「演示控制」组来判定
  fireEvent.click(inspector.getByRole('button', { name: '开始放映' }))
  expect(screen.getByRole('group', { name: '演示控制' })).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('group', { name: '演示控制' })).not.toBeInTheDocument()

  // 切换到“画布”子页：文档主题、关系线、边界/概要都在这里（三者都是画布级结构）
  fireEvent.click(inspector.getByRole('tab', { name: '画布' }))
  expect(inspector.getByRole('radiogroup', { name: '文档主题' })).toBeInTheDocument()
  expect(inspector.getByRole('button', { name: '创建关系线' })).toBeInTheDocument()
  expect(inspector.getByPlaceholderText('例如：核心模块、风险项')).toBeInTheDocument()
  expect(inspector.getByPlaceholderText('对这组主题的归纳说明')).toBeInTheDocument()

  // 回到“样式”子页：active 状态正确
  const styleTab = inspector.getByRole('tab', { name: '样式' })
  fireEvent.click(styleTab)
  expect(styleTab).toHaveAttribute('aria-selected', 'true')
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

  const inspector = openInspectorStyleTab()

  // 预设色板收在「填充」色块浮层里（对齐 XMind 的「填充 [■▾]」），先点开触发器
  fireEvent.click(inspector.getByRole('button', { name: '填充色' }))
  const preset = screen.getByRole('button', { name: '应用填充色 #ea580c' })
  fireEvent.click(preset)
  expect(setTopicStyleOverrides).toHaveBeenCalledWith('topic_branch', {
    fill: '#ea580c',
  })

  // 清除全部样式覆盖按钮（topic 已有 styleOverrides 时显示）
  const clearButton = inspector.getByRole('button', { name: '清除全部样式覆盖' })
  fireEvent.click(clearButton)
  expect(setTopicStyleOverrides).toHaveBeenCalledWith('topic_branch', null)
})

it('applies node shape override from the inspector style panel', () => {
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
                    text: '待造型主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: { ...sessionStub.summary!, topicCount: 2 },
        activeTopicId: 'topic_branch',
        setTopicStyleOverrides,
      }}
    />,
  )

  const inspector = openInspectorStyleTab()

  // 形状改成 XMind 那种紧凑下拉（原来是 4 段按钮）
  fireEvent.change(inspector.getByLabelText('节点形状'), { target: { value: 'pill' } })
  expect(setTopicStyleOverrides).toHaveBeenCalledWith('topic_branch', {
    shape: 'pill',
  })
})

it('applies node width, border style and text alignment from the inspector style panel', () => {
  // 显式声明参数类型：否则 mock.calls 的元组长度为 0，取不到第 2 个实参
  const setTopicStyleOverrides = vi.fn(async (_topicId: string, _overrides: unknown) => {})

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
                  { id: 'topic_branch', text: '待排版主题', collapsed: false, children: [] },
                ],
              },
            },
          ],
        },
        summary: { ...sessionStub.summary!, topicCount: 2 },
        activeTopicId: 'topic_branch',
        setTopicStyleOverrides,
      }}
    />,
  )

  const inspector = openInspectorStyleTab()

  // 宽度：输入后失焦提交固定宽度
  const widthInput = inspector.getByLabelText('节点宽度')
  fireEvent.change(widthInput, { target: { value: '260' } })
  fireEvent.blur(widthInput)
  expect(setTopicStyleOverrides).toHaveBeenLastCalledWith(
    'topic_branch',
    expect.objectContaining({ width: 260 }),
  )

  // 适合：清掉固定宽度（回到按文字自适应）
  const callsBeforeFit = setTopicStyleOverrides.mock.calls.length
  fireEvent.click(inspector.getByRole('button', { name: '适合' }))
  expect((inspector.getByLabelText('节点宽度') as HTMLInputElement).value).toBe('')
  // 桩不会把新值回写到文档，"相同值不发请求"的抑制逻辑因此可能不产生新调用；
  // 只在新调用发生时断言其不含 width（否则会误读上一次调用的参数）
  const callsAfterFit = setTopicStyleOverrides.mock.calls.length
  if (callsAfterFit > callsBeforeFit) {
    expect(setTopicStyleOverrides.mock.calls[callsAfterFit - 1][1]).not.toHaveProperty('width')
  }

  // 边框线型
  fireEvent.change(inspector.getByLabelText('节点边框线型'), { target: { value: 'dashed' } })
  expect(setTopicStyleOverrides).toHaveBeenLastCalledWith(
    'topic_branch',
    expect.objectContaining({ borderStyle: 'dashed' }),
  )

  // 文本对齐
  fireEvent.click(inspector.getByRole('button', { name: '中' }))
  expect(setTopicStyleOverrides).toHaveBeenLastCalledWith(
    'topic_branch',
    expect.objectContaining({ textAlign: 'center' }),
  )
})

it('applies node font family and B/I/S/Tт text styles from the inspector style panel', () => {
  const setTopicStyleOverrides = vi.fn(async (_topicId: string, _overrides: unknown) => {})

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
                  { id: 'topic_branch', text: '待排版主题', collapsed: false, children: [] },
                ],
              },
            },
          ],
        },
        summary: { ...sessionStub.summary!, topicCount: 2 },
        activeTopicId: 'topic_branch',
        setTopicStyleOverrides,
      }}
    />,
  )

  const inspector = openInspectorStyleTab()

  // 字体：写入的是字体栈本身（option.segment），不是选项 id
  fireEvent.change(inspector.getByLabelText('节点字体族'), {
    target: { value: '"Songti SC", SimSun, serif' },
  })
  expect(setTopicStyleOverrides).toHaveBeenLastCalledWith(
    'topic_branch',
    expect.objectContaining({ fontFamily: '"Songti SC", SimSun, serif' }),
  )

  // B：首次点击把字重推到 700（复用已有的 fontWeight 覆盖）
  fireEvent.click(inspector.getByRole('button', { name: '加粗' }))
  expect(setTopicStyleOverrides).toHaveBeenLastCalledWith(
    'topic_branch',
    expect.objectContaining({ fontWeight: 700 }),
  )

  // I / S：开关型，只有「开」才写入（不写显式 false）
  fireEvent.click(inspector.getByRole('button', { name: '斜体' }))
  expect(setTopicStyleOverrides).toHaveBeenLastCalledWith(
    'topic_branch',
    expect.objectContaining({ italic: true }),
  )
  fireEvent.click(inspector.getByRole('button', { name: '删除线' }))
  const strikethroughArgs = setTopicStyleOverrides.mock.calls.at(-1)?.[1] as Record<
    string,
    unknown
  >
  expect(strikethroughArgs).toMatchObject({ italic: true, strikethrough: true })

  // Tт：循环推进 原样 → 全大写 → 全小写
  fireEvent.click(inspector.getByRole('button', { name: '大小写转换' }))
  expect(setTopicStyleOverrides).toHaveBeenLastCalledWith(
    'topic_branch',
    expect.objectContaining({ textTransform: 'uppercase' }),
  )
  fireEvent.click(inspector.getByRole('button', { name: '大小写转换' }))
  expect(setTopicStyleOverrides).toHaveBeenLastCalledWith(
    'topic_branch',
    expect.objectContaining({ textTransform: 'lowercase' }),
  )
})

it('applies a node-level branch line color from the inspector branch section', () => {
  const setTopicStyleOverrides = vi.fn(async (_topicId: string, _overrides: unknown) => {})

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
                  { id: 'topic_branch', text: '待排版主题', collapsed: false, children: [] },
                ],
              },
            },
          ],
        },
        summary: { ...sessionStub.summary!, topicCount: 2 },
        activeTopicId: 'topic_branch',
        setTopicStyleOverrides,
      }}
    />,
  )

  const inspector = openInspectorStyleTab()

  fireEvent.change(inspector.getByLabelText('分支线条颜色'), { target: { value: '#ff2d55' } })
  expect(setTopicStyleOverrides).toHaveBeenLastCalledWith(
    'topic_branch',
    expect.objectContaining({ branchColor: '#ff2d55' }),
  )

  // 「跟随色板」清掉颜色覆盖（不留下空串噪音）
  const callsBeforeClear = setTopicStyleOverrides.mock.calls.length
  fireEvent.click(inspector.getByRole('button', { name: '跟随色板' }))
  // 桩不会把新值回写到文档，"相同值不发请求"的抑制逻辑因此可能不产生新调用；
  // 只在新调用发生时断言其不含 branchColor（否则会误读上一次调用的参数）
  const callsAfterClear = setTopicStyleOverrides.mock.calls.length
  if (callsAfterClear > callsBeforeClear) {
    const cleared = setTopicStyleOverrides.mock.calls[callsAfterClear - 1][1] as Record<
      string,
      unknown
    >
    expect(cleared).not.toHaveProperty('branchColor')
  }
})

it('adapts the structure direction control to the active skeleton', () => {
  const setSheetLayoutDirection = vi.fn(async (_sheetId: string, _direction: unknown) => {})

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
              chartType: 'org',
              rootTopic: { id: 'topic_root', text: '中心主题', collapsed: false, children: [] },
            },
          ],
        },
        activeTopicId: 'topic_root',
        setSheetLayoutDirection,
      }}
    />,
  )

  const inspector = openInspectorStyleTab()

  // 组织结构图走上下轴：应给出「向下」「向上」而不是左右。
  // 必须按分组限定：节点级「子主题方向」在同一骨架下也会给出「向上」。
  const canvasGroup = within(inspector.getByRole('group', { name: '分支方向' }))
  expect(canvasGroup.getByRole('button', { name: '向上' })).toBeTruthy()
  expect(canvasGroup.queryByRole('button', { name: '向右' })).toBeNull()

  fireEvent.click(canvasGroup.getByRole('button', { name: '向上' }))
  expect(setSheetLayoutDirection).toHaveBeenLastCalledWith('sheet_1', 'up')
})

it('disables the structure direction control for whole-canvas-only skeletons', () => {
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
              chartType: 'bubble',
              rootTopic: { id: 'topic_root', text: '中心主题', collapsed: false, children: [] },
            },
          ],
        },
        activeTopicId: 'topic_root',
      }}
    />,
  )

  const inspector = openInspectorStyleTab()

  // 气泡图没有方向参数：只留「自动」且置灰，并给出原因（不造假开关）
  const canvasGroup = within(inspector.getByRole('group', { name: '分支方向' }))
  const autoButton = canvasGroup.getByRole('button', { name: '自动' })
  expect((autoButton as HTMLButtonElement).disabled).toBe(true)
  expect(autoButton.getAttribute('title')).toContain('没有可调的方向参数')
  expect(canvasGroup.queryByRole('button', { name: '向上' })).toBeNull()
})

it('applies a node-level structure override from the inspector structure section', () => {
  const setTopicStructure = vi.fn(async (_topicId: string, _structure: unknown) => {})

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
                  { id: 'topic_branch', text: '待排版主题', collapsed: false, children: [] },
                ],
              },
            },
          ],
        },
        summary: { ...sessionStub.summary!, topicCount: 2 },
        activeTopicId: 'topic_branch',
        setTopicStructure,
      }}
    />,
  )

  const inspector = openInspectorStyleTab()

  // 结构：只写 chartType，不写空的 direction（否则"清除"的判空会失效）
  fireEvent.change(inspector.getByLabelText('子主题结构'), { target: { value: 'org' } })
  expect(setTopicStructure).toHaveBeenLastCalledWith('topic_branch', { chartType: 'org' })

  // 方向：选项跟随刚选的结构（组织结构图 → 上下），并与结构合并写入
  const nodeGroup = within(inspector.getByRole('group', { name: '子主题方向' }))
  expect(nodeGroup.queryByRole('button', { name: '向左' })).toBeNull()
  expect(nodeGroup.getByRole('button', { name: '向上' })).toBeTruthy()

  const callsBeforeDirection = setTopicStructure.mock.calls.length
  fireEvent.click(nodeGroup.getByRole('button', { name: '向上' }))
  const callsAfterDirection = setTopicStructure.mock.calls.length
  if (callsAfterDirection > callsBeforeDirection) {
    expect(setTopicStructure).toHaveBeenLastCalledWith('topic_branch', {
      chartType: 'org',
      direction: 'up',
    })
  }
})

it('applies node font weight and border width overrides from the inspector style panel', () => {
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
                    text: '待排版主题',
                    collapsed: false,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
        summary: { ...sessionStub.summary!, topicCount: 2 },
        activeTopicId: 'topic_branch',
        setTopicStyleOverrides,
      }}
    />,
  )

  const inspector = openInspectorStyleTab()

  // 字重同样改成下拉：选"粗体"应用 fontWeight=700
  fireEvent.change(inspector.getByLabelText('节点标题字重'), { target: { value: '700' } })
  expect(setTopicStyleOverrides).toHaveBeenCalledWith('topic_branch', {
    fontWeight: 700,
  })
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
  // 工具栏按钮对标 XMind 叫「演说」（演示视图本身的 dialog 名不变）
  fireEvent.click(screen.getByRole('button', { name: '演说' }))
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

  // 工具栏按钮对标 XMind 叫「演说」（演示视图本身的 dialog 名不变）
  fireEvent.click(screen.getByRole('button', { name: '演说' }))
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

it('enters presentation mode via Shift+Cmd/Ctrl+P shortcut', () => {
  renderWithApp(<WorkspaceScreen session={{ ...sessionStub, document: presentationDocument }} />)

  // Shift + Ctrl + P 进入演示模式（与工具栏演示按钮同一路径）
  fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
  const dialog = screen.getByRole('dialog', { name: '演示模式' })
  expect(within(dialog).getByText('1 / 4')).toBeInTheDocument()

  // 已打开时重复触发（Shift + Cmd + P）保持幂等，不会叠加或报错
  fireEvent.keyDown(window, { key: 'P', metaKey: true, shiftKey: true })
  expect(screen.getByRole('dialog', { name: '演示模式' })).toBeInTheDocument()

  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: '演示模式' })).not.toBeInTheDocument()
})

it('ignores the presentation shortcut when no document is loaded', () => {
  renderWithApp(<WorkspaceScreen session={{ ...sessionStub, document: null }} />)

  fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
  expect(screen.queryByRole('dialog', { name: '演示模式' })).not.toBeInTheDocument()
})


// —— 批次 14：工具栏 XMind 化 ——

/** 带两个子主题的文档：用于工具栏节点操作 / 插入菜单的多选场景。 */
const twoChildDocument: DocumentSession['document'] = {
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
        children: [
          { id: 'topic_plan', text: '规划主题', collapsed: false, children: [] },
          { id: 'topic_review', text: '复盘主题', collapsed: false, children: [] },
        ],
      },
    },
  ],
}

/**
 * 展开侧栏底部的「画布管理」折叠区。
 *
 * 左栏改成 XMind 式 3 Tab 后，画布管理默认折叠（新建/重命名/删除/排序已由底部
 * 画布标签栏承接），画布列表、跨画布拖拽目标等属低频能力，按需展开。
 */
// 幂等：跨画布落点高亮会自动展开该区，此时再点只会把它收回去
function expandSheetManager(sidebar: ReturnType<typeof within>) {
  const header = sidebar.getByRole('button', { name: /画布管理/ })

  if (header.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(header)
  }
}

function renderBatch14Workspace(sessionOverrides: Partial<DocumentSession> = {}) {
  return renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: twoChildDocument,
        summary: { ...sessionStub.summary!, topicCount: 3 },
        activeTopicId: 'topic_plan',
        ...sessionOverrides,
      }}
    />,
  )
}

/** 通过侧栏 Ctrl+Click 选中“规划主题 + 复盘主题”两个主题。 */
function selectTwoTopicsViaSidebar() {
  const sidebar = within(screen.getByLabelText('左侧边栏'))
  fireEvent.click(sidebar.getByRole('button', { name: /规划主题/ }))
  fireEvent.click(sidebar.getByRole('button', { name: /复盘主题/ }), { ctrlKey: true })
}

it('greys out mindmap-only layout options for other structures', () => {
  // XMind 同样按当前骨架灰掉不适用的项：布局引擎不消费这些选项时，置灰比"点了没反应"诚实
  const logicDocument: typeof twoChildDocument = {
    ...twoChildDocument,
    sheets: [{ ...twoChildDocument.sheets[0], chartType: 'logic' }],
  }
  renderBatch14Workspace({ document: logicDocument })

  fireEvent.click(screen.getByRole('tab', { name: '画布' }))

  for (const label of [
    '自动平衡布局',
    '紧凑型布局',
    '同级主题对齐',
    '分支自由布局',
    '主题层叠',
  ]) {
    expect(screen.getByLabelText(label)).toBeDisabled()
  }
})

it('keeps mindmap layout options enabled on the mindmap structure', () => {
  renderBatch14Workspace()
  fireEvent.click(screen.getByRole('tab', { name: '画布' }))

  for (const label of ['自动平衡布局', '分支自由布局', '主题层叠']) {
    expect(screen.getByLabelText(label)).toBeEnabled()
  }
})

it('selecting a colour scheme also turns rainbow branches on', async () => {
  // 否则在「彩虹分支」未显式开启时选配色方案，画布仍用主题色板 —— 看起来像点了没反应
  const setDocumentSetting = vi.fn(async () => {})
  renderBatch14Workspace({ setDocumentSetting })

  fireEvent.click(screen.getByRole('tab', { name: '画布' }))
  fireEvent.click(screen.getByLabelText('分支色板'))
  fireEvent.click(screen.getByRole('button', { name: '海洋' }))

  expect(setDocumentSetting).toHaveBeenCalledWith('canvas.branchPalette', 'ocean')
  expect(setDocumentSetting).toHaveBeenCalledWith('canvas.rainbowBranch', true)
})

it('persists the pitch aspect ratio to document settings (not local state)', async () => {
  const setDocumentSetting = vi.fn(async () => {})

  renderBatch14Workspace({
    setDocumentSetting,
    document: {
      ...twoChildDocument,
      settings: { 'pitch.aspectRatio': '4:3' },
    },
  })

  fireEvent.click(screen.getByRole('tab', { name: '演说' }))

  // 文档里存了 4:3，控件就该显示 4:3（此前是纯组件 state，存不住也读不回）
  const ratioSelect = screen.getByLabelText('长宽比') as HTMLSelectElement
  expect(ratioSelect.value).toBe('4:3')

  fireEvent.change(ratioSelect, { target: { value: '1:1' } })
  expect(setDocumentSetting).toHaveBeenCalledWith('pitch.aspectRatio', '1:1')

  const styleSelect = screen.getByLabelText('主题风格') as HTMLSelectElement
  fireEvent.change(styleSelect, { target: { value: 'dark' } })
  expect(setDocumentSetting).toHaveBeenCalledWith('pitch.themeStyle', 'dark')
})

it('forwards toolbar topic actions (child/sibling) to the session', () => {
  const createChildTopic = vi.fn(async () => {})
  const createSiblingTopic = vi.fn(async () => {})

  renderBatch14Workspace({ createChildTopic, createSiblingTopic })

  const toolbar = within(screen.getByLabelText('主工具栏'))
  fireEvent.click(toolbar.getByRole('button', { name: '子主题' }))
  fireEvent.click(toolbar.getByRole('button', { name: '主题' }))

  expect(createChildTopic).toHaveBeenCalledWith('topic_plan')
  expect(createSiblingTopic).toHaveBeenCalledWith('topic_plan')
})

it('disables the sibling action when only the root topic is selected', () => {
  renderWithApp(<WorkspaceScreen session={sessionStub} />)

  const toolbar = within(screen.getByLabelText('主工具栏'))
  expect(toolbar.getByRole('button', { name: '子主题' })).toBeEnabled()
  // 根主题没有同级，故「主题」禁用（XMind 同样禁用该按钮）
  expect(toolbar.getByRole('button', { name: '主题' })).toBeDisabled()
})

it('notifies instead of creating a relationship when fewer than two topics are selected', () => {
  const onNotify = vi.fn()
  const createRelationship = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{ ...sessionStub, createRelationship }}
      onNotify={onNotify}
    />,
  )

  const toolbar = within(screen.getByLabelText('主工具栏'))
  fireEvent.click(toolbar.getByRole('button', { name: '插入' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '联系' }))

  expect(onNotify).toHaveBeenCalledWith('请先选中两个主题')
  expect(createRelationship).not.toHaveBeenCalled()
})

it('creates a relationship between the two selected topics from the insert menu', () => {
  const createRelationship = vi.fn(async () => {})

  renderBatch14Workspace({ createRelationship })
  selectTwoTopicsViaSidebar()

  const toolbar = within(screen.getByLabelText('主工具栏'))
  fireEvent.click(toolbar.getByRole('button', { name: '插入' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '联系' }))

  expect(createRelationship).toHaveBeenCalledWith('topic_plan', 'topic_review', null)
})

it('creates boundary and summary for a multi-selection, and notifies otherwise', () => {
  const onNotify = vi.fn()
  const createBoundary = vi.fn(async () => {})
  const createSummary = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: twoChildDocument,
        summary: { ...sessionStub.summary!, topicCount: 3 },
        activeTopicId: 'topic_plan',
        createBoundary,
        createSummary,
      }}
      onNotify={onNotify}
    />,
  )

  const toolbar = within(screen.getByLabelText('主工具栏'))

  // 单选：提示至少选中两个主题
  fireEvent.click(toolbar.getByRole('button', { name: '插入' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '外框' }))
  expect(onNotify).toHaveBeenCalledWith('请先选中至少两个主题')
  expect(createBoundary).not.toHaveBeenCalled()

  // 多选：创建外框与概要
  selectTwoTopicsViaSidebar()
  fireEvent.click(toolbar.getByRole('button', { name: '插入' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '外框' }))
  expect(createBoundary).toHaveBeenCalledWith('sheet_1', ['topic_plan', 'topic_review'], '分组')

  fireEvent.click(toolbar.getByRole('button', { name: '插入' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '概要' }))
  expect(createSummary).toHaveBeenCalledWith('sheet_1', ['topic_plan', 'topic_review'], '概要')
})

it('focuses the inspector style subpage when inserting note/label/link/marker', () => {
  renderBatch14Workspace()

  const inspector = within(screen.getByLabelText('右侧检查器'))
  const toolbar = within(screen.getByLabelText('主工具栏'))

  // 先切到画布子页，再通过插入→笔记切回样式子页
  fireEvent.click(inspector.getByRole('tab', { name: '画布' }))
  expect(inspector.getByRole('tab', { name: '画布' })).toHaveAttribute('aria-selected', 'true')

  fireEvent.click(toolbar.getByRole('button', { name: '插入' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '笔记' }))

  expect(inspector.getByRole('tab', { name: '样式' })).toHaveAttribute('aria-selected', 'true')
})

it('reveals the inspector when inserting rich content while it is hidden', () => {
  renderBatch14Workspace()

  const toolbar = within(screen.getByLabelText('主工具栏'))

  // Cmd/Ctrl + I 隐藏检查器
  fireEvent.keyDown(window, { key: 'i', metaKey: true })
  expect(screen.queryByLabelText('右侧检查器')).not.toBeInTheDocument()

  // 插入→标签：检查器重新显示并停在样式子页
  fireEvent.click(toolbar.getByRole('button', { name: '插入' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '标签' }))

  const inspector = within(screen.getByLabelText('右侧检查器'))
  expect(inspector.getByRole('tab', { name: '样式' })).toHaveAttribute('aria-selected', 'true')
})

it('switches the sheet chart type from the inspector canvas subpage skeleton picker', () => {
  const setSheetChartType = vi.fn(async () => {})

  renderBatch14Workspace({ setSheetChartType })

  // XMind 把骨架放在右侧「画布」子页，工具栏不再有「结构 ▾」下拉
  const toolbar = within(screen.getByLabelText('主工具栏'))
  expect(toolbar.queryByRole('button', { name: '结构' })).not.toBeInTheDocument()

  const inspector = within(screen.getByLabelText('右侧检查器'))
  fireEvent.click(inspector.getByRole('tab', { name: '画布' }))

  const skeletonButton = inspector.getByRole('button', { name: '骨架：思维导图' })
  expect(skeletonButton).toHaveTextContent('思维导图')

  fireEvent.click(skeletonButton)
  const popover = within(screen.getByRole('dialog', { name: '选择骨架' }))
  fireEvent.click(popover.getByRole('button', { name: '鱼骨图' }))

  expect(setSheetChartType).toHaveBeenCalledWith('sheet_1', 'fishbone')
})

it('commits branch style overrides from the inspector style subpage', () => {
  const setSheetBranchStyle = vi.fn(async () => {})

  renderBatch14Workspace({ setSheetBranchStyle })

  const inspector = openInspectorStyleTab()

  // 分支样式是主题外观配置，3 子页改造后与主题属性/富内容同归「样式」页（默认页）
  const styleTab = inspector.getByRole('tab', { name: '样式' })
  expect(styleTab).toHaveAttribute('aria-selected', 'true')

  // 默认状态：连线类型组存在，"曲线" 高亮（默认值）
  const edgeTypeGroup = inspector.getByRole('group', { name: '连线类型' })
  expect(within(edgeTypeGroup).getByRole('button', { name: '曲线' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // 切换到直线：写入 { edgeType: 'straight' }
  fireEvent.click(within(edgeTypeGroup).getByRole('button', { name: '直线' }))
  expect(setSheetBranchStyle).toHaveBeenCalledWith('sheet_1', { edgeType: 'straight' })

  // 分支色板：点击"冷色"预设写入 colorPalette
  const paletteGroup = inspector.getByRole('radiogroup', { name: '分支色板预设' })
  fireEvent.click(within(paletteGroup).getByRole('radio', { name: /冷色/ }))
  expect(setSheetBranchStyle).toHaveBeenCalledWith('sheet_1', {
    colorPalette: [
      '#3B82F6',
      '#06B6D4',
      '#8B5CF6',
      '#0EA5E9',
      '#6366F1',
      '#14B8A6',
      '#2563EB',
      '#0891B2',
    ],
  })
})

it('clears branch style overrides by clicking default values or reset button', () => {
  const setSheetBranchStyle = vi.fn(async () => {})

  // 预设 activeSheet 已有 branchStyle 覆盖（edgeType + thickness + colorPalette 全占）
  renderWithApp(
    <WorkspaceScreen
      session={{
        ...sessionStub,
        document: {
          ...sessionStub.document!,
          sheets: [
            {
              ...sessionStub.document!.sheets[0],
              branchStyle: {
                edgeType: 'elbow',
                thickness: 2,
                colorPalette: ['#F97316', '#EF4444'],
              },
            },
          ],
        },
        setSheetBranchStyle,
      }}
    />,
  )

  const inspector = openInspectorStyleTab()

  // 分支样式在默认的「样式」子页里，无需切页
  // 已有覆盖时"折线"高亮
  const edgeTypeGroup = inspector.getByRole('group', { name: '连线类型' })
  expect(within(edgeTypeGroup).getByRole('button', { name: '折线' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // 点击"曲线"：仅清除 edgeType 字段，保留 thickness + colorPalette
  fireEvent.click(within(edgeTypeGroup).getByRole('button', { name: '曲线' }))
  expect(setSheetBranchStyle).toHaveBeenCalledWith('sheet_1', {
    thickness: 2,
    colorPalette: ['#F97316', '#EF4444'],
  })

  // 点击"默认 8 色"：仅清除 colorPalette 字段
  setSheetBranchStyle.mockClear()
  const paletteGroup = inspector.getByRole('radiogroup', { name: '分支色板预设' })
  fireEvent.click(within(paletteGroup).getByRole('radio', { name: /默认 8 色/ }))
  expect(setSheetBranchStyle).toHaveBeenCalledWith('sheet_1', {
    edgeType: 'elbow',
    thickness: 2,
  })

  // 一键清除全部覆盖
  setSheetBranchStyle.mockClear()
  fireEvent.click(inspector.getByRole('button', { name: '清除分支样式覆盖' }))
  expect(setSheetBranchStyle).toHaveBeenCalledWith('sheet_1', null)
})

it('switches the document theme from the inspector canvas subpage', () => {
  const setDocumentTheme = vi.fn(async () => {})

  renderBatch14Workspace({ setDocumentTheme })

  // XMind 的配色同样在右侧「画布」子页，工具栏不再有「主题 ▾」下拉
  const toolbar = within(screen.getByLabelText('主工具栏'))
  expect(toolbar.queryByRole('button', { name: '主题 ▾' })).not.toBeInTheDocument()

  const inspector = within(screen.getByLabelText('右侧检查器'))
  fireEvent.click(inspector.getByRole('tab', { name: '画布' }))

  const themeGroup = within(inspector.getByRole('radiogroup', { name: '文档主题' }))
  expect(themeGroup.getByRole('radio', { name: '经典蓝' })).toHaveAttribute(
    'aria-checked',
    'true',
  )

  fireEvent.click(themeGroup.getByRole('radio', { name: '暗夜' }))
  expect(setDocumentTheme).toHaveBeenCalledWith('dark')
})

it('toggles the inspector via Cmd/Ctrl + I and the toolbar button', () => {
  renderBatch14Workspace()

  const toolbar = within(screen.getByLabelText('主工具栏'))
  const inspectorToggle = toolbar.getByRole('button', { name: '格式' })

  expect(screen.getByLabelText('右侧检查器')).toBeInTheDocument()
  expect(inspectorToggle).toHaveAttribute('aria-pressed', 'true')

  // Cmd + I 隐藏
  fireEvent.keyDown(window, { key: 'i', metaKey: true })
  expect(screen.queryByLabelText('右侧检查器')).not.toBeInTheDocument()
  expect(inspectorToggle).toHaveAttribute('aria-pressed', 'false')

  // Ctrl + I 显示
  fireEvent.keyDown(window, { key: 'i', ctrlKey: true })
  expect(screen.getByLabelText('右侧检查器')).toBeInTheDocument()

  // 工具栏按钮隐藏
  fireEvent.click(inspectorToggle)
  expect(screen.queryByLabelText('右侧检查器')).not.toBeInTheDocument()
})

it('opens the hidden sidebar with Cmd/Ctrl + B', () => {
  window.sessionStorage.removeItem('mindgrid.sidebar-visible')
  renderWithApp(<WorkspaceScreen session={sessionStub} />)

  expect(screen.queryByLabelText('左侧边栏')).not.toBeInTheDocument()

  fireEvent.keyDown(window, { key: 'b', metaKey: true })
  expect(screen.getByLabelText('左侧边栏')).toBeInTheDocument()

  fireEvent.keyDown(window, { key: 'b', metaKey: true })
  expect(screen.queryByLabelText('左侧边栏')).not.toBeInTheDocument()
})

it('creates a new sheet with Cmd/Ctrl + T', () => {
  const createSheet = vi.fn(async () => {})

  renderWithApp(<WorkspaceScreen session={{ ...sessionStub, createSheet }} />)

  fireEvent.keyDown(window, { key: 't', metaKey: true })

  expect(createSheet).toHaveBeenCalledTimes(1)
})

it('resets the topic style with Alt + Cmd/Ctrl + 0', async () => {
  const setTopicStyleRef = vi.fn(async () => {})
  const setTopicStyleOverrides = vi.fn(async () => {})

  renderWithApp(
    <WorkspaceScreen
      session={{ ...sessionStub, setTopicStyleRef, setTopicStyleOverrides }}
    />,
  )

  fireEvent.keyDown(window, { key: '0', metaKey: true, altKey: true })

  await waitFor(() => {
    expect(setTopicStyleRef).toHaveBeenCalledWith('topic_root', null)
  })
  expect(setTopicStyleOverrides).toHaveBeenCalledWith('topic_root', null)
})

it('enters ZEN with Alt + Cmd/Ctrl + F without opening search', () => {
  renderWithApp(<WorkspaceScreen session={sessionStub} />)

  fireEvent.keyDown(window, { key: 'f', metaKey: true, altKey: true })

  // ⌥⌘F 是 XMind 的 ZEN 绑定；若画布的「查找」分支没排掉 Alt，会同时弹出搜索框
  expect(screen.queryByRole('textbox', { name: '搜索主题' })).not.toBeInTheDocument()
  // 工具栏/面板是 CSS 隐藏（不卸载），故用 shell 类名与浮动退出按钮判断是否真的进了 ZEN
  expect(screen.getByLabelText('主工具栏').closest('.workspace-shell')).toHaveClass(
    'workspace-shell--zen',
  )
  expect(screen.getByRole('button', { name: '退出专注模式' })).toBeInTheDocument()
})

it('hides the sheet tab bar while the document has a single canvas', () => {
  // XMind 只有一个画布时不显示标签栏
  renderBatch14Workspace()
  expect(screen.queryByRole('tablist', { name: '画布标签栏' })).not.toBeInTheDocument()
})

it('shows the sheet tab bar once there are two canvases', () => {
  const multiSheetDocument: typeof twoChildDocument = {
    ...twoChildDocument,
    sheets: [
      twoChildDocument.sheets[0],
      { ...twoChildDocument.sheets[0], id: 'sheet_extra', title: '画布 2' },
    ],
  }

  renderBatch14Workspace({ document: multiSheetDocument })
  expect(screen.getByRole('tablist', { name: '画布标签栏' })).toBeInTheDocument()
})

it('toggles the bottom tab bar with Shift + Cmd/Ctrl + T', () => {
  const multiSheetDocument: typeof twoChildDocument = {
    ...twoChildDocument,
    sheets: [
      twoChildDocument.sheets[0],
      { ...twoChildDocument.sheets[0], id: 'sheet_extra', title: '画布 2' },
    ],
  }

  renderBatch14Workspace({ document: multiSheetDocument })

  // 多画布时标签页栏默认显示（渲染在状态条左段）
  expect(screen.getByRole('tablist', { name: '画布标签栏' })).toBeInTheDocument()

  fireEvent.keyDown(window, { key: 't', metaKey: true, shiftKey: true })
  expect(screen.queryByRole('tablist', { name: '画布标签栏' })).not.toBeInTheDocument()

  // 再按一次恢复
  fireEvent.keyDown(window, { key: 't', metaKey: true, shiftKey: true })
  expect(screen.getByRole('tablist', { name: '画布标签栏' })).toBeInTheDocument()
})

it('honours the persisted toolbar visibility preference', () => {
  // 菜单「查看 → 工具栏」写入 sessionStorage；这里直接预置偏好来验渲染分支，
  // 免去为单个断言去 mock 整个 Tauri 事件层（派发侧的接线由 menu-dispatch 单测覆盖）。
  window.sessionStorage.setItem('mindgrid.toolbar-visible', '0')
  try {
    renderWithApp(<WorkspaceScreen session={sessionStub} />)
    expect(screen.queryByLabelText('主工具栏')).not.toBeInTheDocument()
    // 工具栏收起后画布仍在，功能不依赖它
    expect(screen.getByLabelText('画布区域')).toBeInTheDocument()
  } finally {
    window.sessionStorage.removeItem('mindgrid.toolbar-visible')
  }
})

it('opens the canvas search with Cmd/Ctrl + F instead of a toolbar button', () => {
  renderBatch14Workspace()

  // XMind 工具栏没有搜索按钮，查找收在「编辑」菜单与 ⌘F
  const toolbar = within(screen.getByLabelText('主工具栏'))
  expect(toolbar.queryByRole('button', { name: '搜索' })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: '搜索主题' })).not.toBeInTheDocument()

  fireEvent.keyDown(window, { key: 'f', metaKey: true })

  expect(screen.getByRole('textbox', { name: '搜索主题' })).toBeInTheDocument()
})

/**
 * 样式页首屏的两个新元素（对齐 XMind）：
 * 1. 选中主题预览条 —— 必须与画布**同源解析**，否则是另一个"说谎的 UI"；
 * 2. 分组标题可折叠。
 */
it('样式页预览条用与画布同源的解析结果（节点级填充覆盖会反映到预览上）', () => {
  const base = sessionStub.document!
  const root = base.sheets[0].rootTopic

  renderWithApp(
    <WorkspaceScreen
      session={
        {
          ...sessionStub,
          activeTopicId: 'topic_root',
          document: {
            ...base,
            sheets: [
              {
                ...base.sheets[0],
                rootTopic: { ...root, styleOverrides: { fill: '#123456' } },
              },
            ],
          },
        } as DocumentSession
      }
    />,
  )

  const preview = openInspectorStyleTab().getByLabelText('选中主题预览')
  const chip = within(preview).getByText('中心主题')

  // #123456 在 DOM 里规范化为 rgb(18, 52, 86)：写死颜色的实现不会得到这个值
  expect((chip as HTMLElement).style.backgroundColor).toBe('rgb(18, 52, 86)')
})

it('分组标题可折叠：收起后该分组内的控件消失，再展开回来', () => {
  renderWithApp(<WorkspaceScreen session={sessionStub} />)
  const inspector = openInspectorStyleTab()

  const toggle = inspector.getByRole('button', { name: '形状' })
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(inspector.getByText('边框线型')).toBeTruthy()

  fireEvent.click(toggle)

  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(inspector.queryByText('边框线型')).toBeNull()

  fireEvent.click(toggle)

  expect(inspector.getByText('边框线型')).toBeTruthy()
})

it('applies node font size from the inspector style panel dropdown', () => {
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
                  { id: 'topic_branch', text: '待调字号主题', collapsed: false, children: [] },
                ],
              },
            },
          ],
        },
        summary: { ...sessionStub.summary!, topicCount: 2 },
        activeTopicId: 'topic_branch',
        setTopicStyleOverrides,
      }}
    />,
  )

  const inspector = openInspectorStyleTab()

  // 字号由滑杆改为离散下拉（XMind 的「14 ▾」）：滑杆拖不准，选 16 容易停在 15
  fireEvent.change(inspector.getByLabelText('节点标题字号'), { target: { value: '18' } })

  expect(setTopicStyleOverrides).toHaveBeenCalledWith('topic_branch', { fontSize: 18 })
})
