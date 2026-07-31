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

it('shows detailed undo and redo history labels in the status bar', () => {
  renderWithApp(<StatusBar session={sessionStub} />)

  expect(
    screen.getByText('历史：可撤销 删除 2 个主题 / 可重做 批量移动 2 个主题到其他画布'),
  ).toBeInTheDocument()
  expect(screen.getByText('记录：')).toBeInTheDocument()
  expect(screen.getByText('最近动作：已删除 2 个主题')).toBeInTheDocument()
  expect(screen.getByText('删除')).toBeInTheDocument()
  expect(screen.getByText('跨画布')).toBeInTheDocument()
  expect(screen.getByText('执行画布')).toBeInTheDocument()
  expect(screen.getByText('×2')).toBeInTheDocument()
})

it('shows a recovery-stage hint when no structural records exist after restore', () => {
  renderWithApp(
    <StatusBar
      session={{
        ...sessionStub,
        recentAction: '已恢复当前文档',
        recentActions: [],
        recoveredFromAutosave: true,
      }}
    />,
  )

  expect(screen.getByText('恢复起点')).toBeInTheDocument()
  expect(screen.getByText('已从恢复快照回到当前文档，新的整理会从这里开始。')).toBeInTheDocument()
})

it('shows a save-stage hint when records were cleared after save', () => {
  renderWithApp(
    <StatusBar
      session={{
        ...sessionStub,
        recentAction: '已保存文档',
        recentActions: [],
        recoveredFromAutosave: false,
      }}
    />,
  )

  expect(screen.getByText('已保存')).toBeInTheDocument()
  expect(screen.getByText('当前整理已经落盘，下一段结构操作会从空白记录重新开始。')).toBeInTheDocument()
})

it('shows a soft autosave hint when the recovery snapshot was refreshed recently', () => {
  renderWithApp(
    <StatusBar
      session={{
        ...sessionStub,
        recentAction: '已选中主题',
        recentActions: [],
        hasUnsavedChanges: true,
        lastSavedAtMs: Date.now() - 5 * 60 * 1000,
        lastAutosavedAtMs: Date.now() - 30 * 1000,
        recoveredFromAutosave: false,
      }}
    />,
  )

  expect(screen.getByText('恢复区已更新')).toBeInTheDocument()
  expect(screen.getByText('最近的结构变更已经写入恢复快照，异常退出后也能从这里继续。')).toBeInTheDocument()
})
