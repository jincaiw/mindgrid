import { screen } from '@testing-library/react'
import { renderWithApp } from '../../test/render'
import { StatusBar } from './status-bar'
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

it('shows status, document name, sheet title, selection count and recent action', () => {
  renderWithApp(<StatusBar session={sessionStub} />)

  expect(screen.getByText('状态：就绪')).toBeInTheDocument()
  expect(screen.getByText('文档：未命名')).toBeInTheDocument()
  expect(screen.getByText('画布：主画布')).toBeInTheDocument()
  expect(screen.getByText('选中：1 个主题')).toBeInTheDocument()
  expect(screen.getByText('最近动作：已删除 2 个主题')).toBeInTheDocument()
})

it('shows the file name with an unsaved marker for a dirty document', () => {
  renderWithApp(
    <StatusBar
      session={{
        ...sessionStub,
        filePath: '/Users/jason/工作计划.mgd',
        hasUnsavedChanges: true,
      }}
    />,
  )

  expect(screen.getByText('文档：工作计划.mgd（未保存）')).toBeInTheDocument()
})

it('shows zero selected topics when no topic is active', () => {
  renderWithApp(
    <StatusBar
      session={{
        ...sessionStub,
        activeTopicId: null,
      }}
    />,
  )

  expect(screen.getByText('选中：0 个主题')).toBeInTheDocument()
})

it('shows the real multi-selection count when provided by the workspace', () => {
  renderWithApp(<StatusBar session={sessionStub} selectedTopicCount={3} />)

  expect(screen.getByText('选中：3 个主题')).toBeInTheDocument()
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
