import { fireEvent, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import type { DocumentSession } from '../document/use-document-session'
import type { TopicSnapshot } from '../../lib/document/types'
import { NavPanel } from './nav-panel'

function makeTopic(
  id: string,
  text: string,
  extra: Partial<TopicSnapshot> = {},
  children: TopicSnapshot[] = [],
): TopicSnapshot {
  return { id, text, collapsed: false, children, ...extra }
}

/** 中心主题（带备注）下挂两个主题：一个星标 + 已就绪，一个同标签「前端」。 */
const rootTopic = makeTopic(
  'topic_root',
  '中心主题',
  { notes: '初始备注' },
  [
    makeTopic('topic_a', '规划主题', {
      markers: [{ id: 'star' }],
      labels: ['前端'],
    }),
    makeTopic('topic_b', '复盘主题', {
      markers: [{ id: 'star' }],
      labels: ['前端'],
    }),
    makeTopic('topic_c', '归档主题', { labels: ['后端'] }),
  ],
)

function makeSession(overrides: Partial<DocumentSession> = {}): DocumentSession {
  return {
    status: 'ready',
    document: {
      schemaVersion: '1.0.0',
      documentId: 'doc_1',
      revision: 1,
      activeSheetId: 'sheet_1',
      sheets: [{ id: 'sheet_1', title: '主画布', rootTopic }],
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
    canRepairLastFailedOpen: false,
    error: null,
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
    selectTopic: async () => {},
    createChildTopic: async () => {},
    createSiblingTopic: async () => {},
    createParentTopic: async () => {},
    createFloatingTopic: async () => {},
    renameTopic: async () => {},
    deleteTopic: async () => {},
    deleteTopics: async () => {},
    toggleTopicCollapsed: async () => {},
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
    ...overrides,
  }
}

function renderNavPanel(session: DocumentSession, onSelectedTopicIdsChange = vi.fn()) {
  renderWithApp(
    <NavPanel
      session={session}
      selectedTopicIds={[]}
      onSelectedTopicIdsChange={onSelectedTopicIdsChange}
    />,
  )

  return within(screen.getByLabelText('左侧边栏'))
}

function clickTab(sidebar: ReturnType<typeof within>, name: string) {
  fireEvent.click(sidebar.getByRole('tab', { name }))
}

it('renders the three XMind-style tabs with 主题 selected by default', () => {
  const sidebar = renderNavPanel(makeSession())

  const tabs = sidebar.getAllByRole('tab')
  expect(tabs.map((tab) => tab.textContent)).toEqual(['主题', '笔记', '标记 & 标签'])

  expect(sidebar.getByRole('tab', { name: '主题' })).toHaveAttribute('aria-selected', 'true')
  expect(sidebar.getByRole('tab', { name: '笔记' })).toHaveAttribute('aria-selected', 'false')
  // 主题页默认渲染大纲树
  expect(sidebar.getByLabelText('当前画布大纲')).toBeInTheDocument()
})

it('keeps the outline aria contract that other suites rely on', () => {
  renderNavPanel(makeSession())

  // workspace-screen 的测试一律用 getByLabelText('左侧边栏') 定位，
  // Tab 化后这个标签与 panel--sidebar 类（边框/背景样式挂在其上）必须保留
  expect(screen.getByLabelText('左侧边栏')).toHaveClass('panel--sidebar')
})

it('edits notes for the active topic in the 笔记 tab and commits on blur', () => {
  const setTopicNotes = vi.fn(async () => {})
  const sidebar = renderNavPanel(makeSession({ setTopicNotes }))

  clickTab(sidebar, '笔记')

  const textarea = sidebar.getByRole('textbox', { name: '备注内容' })
  expect(textarea).toHaveValue('初始备注')
  expect(sidebar.getByText('中心主题')).toBeInTheDocument()

  fireEvent.change(textarea, { target: { value: '改写后的备注' } })
  fireEvent.blur(textarea)

  expect(setTopicNotes).toHaveBeenCalledWith('topic_root', '改写后的备注')
})

it('clears notes when the editor is emptied', () => {
  const setTopicNotes = vi.fn(async () => {})
  const sidebar = renderNavPanel(makeSession({ setTopicNotes }))

  clickTab(sidebar, '笔记')

  const textarea = sidebar.getByRole('textbox', { name: '备注内容' })
  fireEvent.change(textarea, { target: { value: '   ' } })
  fireEvent.blur(textarea)

  // 空串/纯空白按「清除备注」处理，与 Inspector 的行为一致
  expect(setTopicNotes).toHaveBeenCalledWith('topic_root', null)
})

it('does not commit notes when the text is unchanged', () => {
  const setTopicNotes = vi.fn(async () => {})
  const sidebar = renderNavPanel(makeSession({ setTopicNotes }))

  clickTab(sidebar, '笔记')
  fireEvent.blur(sidebar.getByRole('textbox', { name: '备注内容' }))

  expect(setTopicNotes).not.toHaveBeenCalled()
})

it('shows an empty state in the 笔记 tab when no topic is selected', () => {
  const sidebar = renderNavPanel(makeSession({ activeTopicId: null }))

  clickTab(sidebar, '笔记')

  expect(sidebar.getByText('未选中主题')).toBeInTheDocument()
  expect(sidebar.queryByRole('textbox', { name: '备注内容' })).not.toBeInTheDocument()
})

it('groups markers and labels with counts in the 标记 & 标签 tab', () => {
  const sidebar = renderNavPanel(makeSession())

  clickTab(sidebar, '标记 & 标签')

  // 星标记在「规划主题」与「复盘主题」上，计数 2
  expect(sidebar.getByRole('button', { name: /星标/ })).toHaveTextContent('2')
  // 标签「前端」两处、「后端」一处
  expect(sidebar.getByRole('button', { name: /前端/ })).toHaveTextContent('2')
  expect(sidebar.getByRole('button', { name: /后端/ })).toHaveTextContent('1')
})

it('selects every topic carrying a marker when its row is clicked', () => {
  const onSelectedTopicIdsChange = vi.fn()
  const selectTopic = vi.fn(async () => {})
  const sidebar = renderNavPanel(makeSession({ selectTopic }), onSelectedTopicIdsChange)

  clickTab(sidebar, '标记 & 标签')
  fireEvent.click(sidebar.getByRole('button', { name: /星标/ }))

  expect(onSelectedTopicIdsChange).toHaveBeenCalledWith(['topic_a', 'topic_b'])
  // 选区生效的同时把画布定位到第一个匹配主题
  expect(selectTopic).toHaveBeenCalledWith('topic_a')
})

it('selects every topic carrying a label when its row is clicked', () => {
  const onSelectedTopicIdsChange = vi.fn()
  const sidebar = renderNavPanel(makeSession(), onSelectedTopicIdsChange)

  clickTab(sidebar, '标记 & 标签')
  fireEvent.click(sidebar.getByRole('button', { name: /后端/ }))

  expect(onSelectedTopicIdsChange).toHaveBeenCalledWith(['topic_c'])
})

it('explains how to add markers and labels when the sheet has none', () => {
  const session = makeSession()
  const bare: DocumentSession = {
    ...session,
    document: {
      ...session.document!,
      sheets: [
        {
          id: 'sheet_1',
          title: '主画布',
          rootTopic: makeTopic('topic_root', '中心主题', { notes: '' }),
        },
      ],
    },
  }
  const sidebar = renderNavPanel(bare)

  clickTab(sidebar, '标记 & 标签')

  expect(sidebar.getByText('当前画布还没有任何标记。可在右侧检查器里为主题添加标记。')).toBeInTheDocument()
  expect(sidebar.getByText('当前画布还没有任何标签。可在右侧检查器里为主题添加标签。')).toBeInTheDocument()
})
