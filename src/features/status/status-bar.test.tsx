import { fireEvent, screen } from '@testing-library/react'
import { describe, it, vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import type { TopicSnapshot } from '../../lib/document/types'
import { StatusBar } from './status-bar'
import { collectTopicStats } from './topic-stats'
import type { DocumentSession } from '../document/use-document-session'

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
    topicCount: 1,
    rootTopicText: '中心主题',
  },
  activeTopicId: 'topic_root',
  canUndo: true,
  canRedo: true,
  nextUndoAction: '删除 2 个主题',
  nextRedoAction: '批量移动 2 个主题到其他画布',
  filePath: null,
  lastSavedAtMs: null,
  lastAutosavedAtMs: null,
  hasUnsavedChanges: false,
  recoveredFromAutosave: false,
  repairReport: null,
  error: null,
  canRepairLastFailedOpen: false,
  recentAction: '已删除 2 个主题',
  recentActions: [
    {
      label: '删除',
      scope: null,
      detail: '删除 2 个主题',
      count: 1,
    },
    {
      label: '跨画布',
      scope: '执行画布',
      detail: '批量移动 2 个主题到画布“执行画布”的“执行中心 / 归档区”下面',
      count: 2,
    },
  ],
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
  exportSelectedTopicsPng: async () => {},
  renderPrintImage: async () => null,
  exportSvgImage: async () => {},
  exportGanttImage: async () => {},
  exportGanttPng: async () => {},
  exportPdfDocument: async () => {},
  exportRecoveryCopy: async () => {},
  selectSheet: async () => {},
  createSheet: async () => {},
  createSheetFromTopic: async () => {},
  renameSheet: async () => {},
  deleteSheet: async () => {},
  moveSheet: async () => {},
  setSheetChartType: async () => {},
  setSheetBranchStyle: async () => {},
  setSheetNumbering: async () => {},
  setSheetIllustrations: async () => {},
  mergeDocument: async () => null,
  applyTopicStyleToSiblings: async () => {},
  moveTopicFreely: async () => {},
  setTopicsPosition: async () => {},
  setTopicAttachment: async () => {},
  removeTopicAttachment: async () => {},
  openTopicAttachment: async () => '',
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
  setTopicStickers: async () => {},
  setTopicCallout: async () => {},
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

// XMind 式状态条：左段为画布分页标签插槽，右段为统计信息 / 缩放比例 / 大纲切换。
// 旧版的「状态 / 文档 / 画布」三项已移出状态条——文档名与保存状态由工具栏承载。

it('renders the sheet tabs slot in the left group', () => {
  renderWithApp(<StatusBar session={sessionStub} sheetTabs={<span>分页标签占位</span>} />)

  const statusBar = screen.getByLabelText('状态栏')
  const left = statusBar.querySelector('.status-bar__left')

  expect(left).not.toBeNull()
  expect(left).toHaveTextContent('分页标签占位')
})

it('shows the XMind style "主题: 序号/总数" counter in the right group', () => {
  renderWithApp(<StatusBar session={sessionStub} />)

  // 当前画布仅根主题「中心主题」，且它正被选中 → 主题: 1/1
  expect(screen.getByText('主题: 1/1')).toBeInTheDocument()
})

it('keeps word counts and the recent action in the counter tooltip', () => {
  renderWithApp(<StatusBar session={sessionStub} />)

  // 字数与最近动作不再占右段空间，但信息不能丢——挂在计数标签的 title 上
  expect(screen.getByText('主题: 1/1')).toHaveAttribute(
    'title',
    '共 1 个主题，4 字，4 个字符\n最近动作：已删除 2 个主题',
  )
})

it('omits the recent action line from the tooltip when there is none', () => {
  renderWithApp(<StatusBar session={{ ...sessionStub, recentAction: '' }} />)

  expect(screen.getByText('主题: 1/1')).toHaveAttribute('title', '共 1 个主题，4 字，4 个字符')
})

it('reports only the total when no topic is active', () => {
  renderWithApp(
    <StatusBar
      session={{
        ...sessionStub,
        activeTopicId: null,
      }}
    />,
  )

  expect(screen.getByText('主题: 1')).toBeInTheDocument()
})

it('switches to "已选 n/总数" for a multi-selection', () => {
  renderWithApp(<StatusBar session={sessionStub} selectedTopicCount={3} />)

  expect(screen.getByText('已选 3/1')).toBeInTheDocument()
})

it('reports zoom steps from the percentage arrows', () => {
  const onZoomStep = vi.fn()

  renderWithApp(
    <StatusBar
      session={sessionStub}
      zoom={1}
      onResetZoom={vi.fn()}
      onZoomStep={onZoomStep}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: '放大' }))
  expect(onZoomStep).toHaveBeenLastCalledWith(1)

  fireEvent.click(screen.getByRole('button', { name: '缩小' }))
  expect(onZoomStep).toHaveBeenLastCalledWith(-1)
})

it('numbers the selected topic by visible outline order', () => {
  // 根主题 3 个子节点，选中第 2 个 → 主题: 3/4（根占第 1 位）
  const session: DocumentSession = {
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
              { id: 'topic_a', text: '规划', collapsed: false, children: [] },
              { id: 'topic_b', text: '复盘', collapsed: false, children: [] },
              { id: 'topic_c', text: '归档', collapsed: false, children: [] },
            ],
          },
        },
      ],
    },
    activeTopicId: 'topic_b',
  }

  renderWithApp(<StatusBar session={session} />)

  expect(screen.getByText('主题: 3/4')).toBeInTheDocument()
})

it('shows the zoom percentage and forwards a reset request on click', () => {
  const onResetZoom = vi.fn()

  renderWithApp(<StatusBar session={sessionStub} zoom={1.5} onResetZoom={onResetZoom} />)

  const zoomButton = screen.getByRole('button', { name: '150%' })
  fireEvent.click(zoomButton)

  expect(onResetZoom).toHaveBeenCalledTimes(1)
})

it('renders the outline toggle with a pressed state driven by the current mode', () => {
  renderWithApp(<StatusBar session={sessionStub} isOutlinerMode onToggleOutliner={() => {}} />)

  expect(screen.getByRole('button', { name: '大纲' })).toHaveAttribute('aria-pressed', 'true')
})

it('omits zoom and outline controls when no handlers are provided', () => {
  renderWithApp(<StatusBar session={sessionStub} />)

  expect(screen.queryByRole('button', { name: '大纲' })).not.toBeInTheDocument()
  // zoom 缺省为 1，但未提供复位回调时不渲染按钮
  expect(screen.queryByRole('button', { name: '100%' })).not.toBeInTheDocument()
})

describe('collectTopicStats', () => {
  const topic = (id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot => ({
    id,
    text,
    collapsed: false,
    children,
  })

  it('counts nested topics, characters and CJK words', () => {
    const root = topic('root', '中心主题', [
      topic('a', '规划', [topic('a1', '执行步骤')]),
      topic('b', '复盘'),
    ])

    expect(collectTopicStats(root)).toEqual({
      topicCount: 4,
      // 中心主题(4) + 规划(2) + 执行步骤(4) + 复盘(2) = 12 字
      wordCount: 12,
      charCount: 12,
    })
  })

  it('counts latin text by whitespace-separated words', () => {
    const root = topic('root', 'Roadmap Q4', [topic('a', 'ship the updater')])

    // Roadmap + Q4 = 2 词；ship/the/updater = 3 词
    expect(collectTopicStats(root).wordCount).toBe(5)
    // 字符数不计空白：RoadmapQ4(9) + shiptheupdater(14) = 23
    expect(collectTopicStats(root).charCount).toBe(23)
  })

  it('returns zeros when there is no root topic', () => {
    expect(collectTopicStats(null)).toEqual({ topicCount: 0, wordCount: 0, charCount: 0 })
  })
})

it('does not expose debug fields like topic id, undo stack or recovery snapshot', () => {
  renderWithApp(<StatusBar session={sessionStub} />)

  expect(screen.queryByText(/topic_root/)).not.toBeInTheDocument()
  expect(screen.queryByText(/撤销栈/)).not.toBeInTheDocument()
  expect(screen.queryByText(/恢复快照/)).not.toBeInTheDocument()
  expect(screen.queryByText(/修复：/)).not.toBeInTheDocument()
  expect(screen.queryByText(/历史：/)).not.toBeInTheDocument()
  expect(screen.queryByText(/记录：/)).not.toBeInTheDocument()
})
