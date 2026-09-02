import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import type { DocumentSessionSnapshot } from '../../lib/document/types'
import { renderWithApp } from '../../test/render'
import { useDocumentSession } from './use-document-session'

const commandMocks = vi.hoisted(() => ({
  clearRepairReport: vi.fn(),
  copyTopicToSheet: vi.fn(),
  copyTopicsToSheet: vi.fn(),
  createChildTopic: vi.fn(),
  createDocument: vi.fn(),
  createDocumentFromTemplate: vi.fn(),
  createSheet: vi.fn(),
  createSiblingTopic: vi.fn(),
  deleteSheet: vi.fn(),
  deleteTopic: vi.fn(),
  deleteTopics: vi.fn(),
  exportMarkdownFile: vi.fn(),
  exportOpmlFile: vi.fn(),
  exportPdfFile: vi.fn(),
  exportPngFile: vi.fn(),
  exportRecoveryCopy: vi.fn(),
  exportSvgFile: vi.fn(),
  getDocumentState: vi.fn(),
  importMarkdownFile: vi.fn(),
  importOpmlFile: vi.fn(),
  moveSheet: vi.fn(),
  setSheetChartType: vi.fn(),
  setSheetBranchStyle: vi.fn(),
  moveTopic: vi.fn(),
  moveTopics: vi.fn(),
  moveTopicInParent: vi.fn(),
  moveTopicToSheet: vi.fn(),
  moveTopicsToSheet: vi.fn(),
  openDocumentFile: vi.fn(),
  pasteTopics: vi.fn(),
  readAssetDataUrl: vi.fn(),
  redoDocumentCommand: vi.fn(),
  removeTopicImage: vi.fn(),
  renameSheet: vi.fn(),
  renameTopic: vi.fn(),
  repairDocumentFile: vi.fn(),
  saveDocumentFile: vi.fn(),
  saveDocumentToCurrentFile: vi.fn(),
  selectSheet: vi.fn(),
  selectTopic: vi.fn(),
  toggleTopicCollapsed: vi.fn(),
  setTopicNotes: vi.fn(),
  setTopicLink: vi.fn(),
  setTopicMarkers: vi.fn(),
  setTopicLabels: vi.fn(),
  setTopicTask: vi.fn(),
  setTopicStyleRef: vi.fn(),
  setTopicStyleOverrides: vi.fn(),
  setTopicImage: vi.fn(),
  setDocumentTheme: vi.fn(),
  setDocumentSetting: vi.fn(),
  undoDocumentCommand: vi.fn(),
}))

const dialogMocks = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
}))

const transportMocks = vi.hoisted(() => ({
  hasTauriRuntime: vi.fn(() => false),
}))

const renderMocks = vi.hoisted(() => ({
  renderSceneToPngBytes: vi.fn(),
  renderSceneToPdfBytes: vi.fn(),
  renderSceneToSvg: vi.fn(),
}))

vi.mock('../../lib/ipc/commands', () => commandMocks)
vi.mock('@tauri-apps/plugin-dialog', () => dialogMocks)
vi.mock('../../lib/ipc/transport', () => transportMocks)
vi.mock('../canvas/runtime/png-exporter', () => ({
  renderSceneToPngBytes: renderMocks.renderSceneToPngBytes,
}))
vi.mock('../canvas/runtime/svg-renderer', () => ({
  renderSceneToSvg: renderMocks.renderSceneToSvg,
}))
vi.mock('../canvas/runtime/pdf-exporter', () => ({
  renderSceneToPdfBytes: renderMocks.renderSceneToPdfBytes,
}))

beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn(() => true))
  transportMocks.hasTauriRuntime.mockReturnValue(false)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function createSnapshot(
  overrides: Partial<DocumentSessionSnapshot> = {},
): DocumentSessionSnapshot {
  return {
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
    canUndo: false,
    canRedo: false,
    nextUndoAction: null,
    nextRedoAction: null,
    activeTopicId: 'topic_root',
    filePath: null,
    lastSavedAtMs: null,
    lastAutosavedAtMs: null,
    hasUnsavedChanges: false,
    recoveredFromAutosave: false,
    repairReport: null,
    ...overrides,
  }
}

function SessionHarness() {
  const session = useDocumentSession()

  return (
    <div>
      <span>最近动作：{session.recentAction}</span>
      <span>记录数：{session.recentActions.length}</span>
      <span>首条记录：{session.recentActions[0]?.detail ?? '无'}</span>
      <button type="button" onClick={() => void session.createChildTopic('topic_root')}>
        创建子主题
      </button>
      <button type="button" onClick={() => void session.createNewDocument()}>
        新建文档
      </button>
      <button type="button" onClick={() => void session.openDocument()}>
        打开文档
      </button>
      <button type="button" onClick={() => void session.saveDocument()}>
        保存文档
      </button>
      <button type="button" onClick={() => void session.exportMarkdownOutline()}>
        导出 Markdown
      </button>
      <button type="button" onClick={() => void session.exportOpmlOutline()}>
        导出 OPML
      </button>
      <button type="button" onClick={() => void session.importMarkdownOutline()}>
        导入 Markdown
      </button>
      <button type="button" onClick={() => void session.importOpmlOutline()}>
        导入 OPML
      </button>
      <button type="button" onClick={() => void session.exportPngImage()}>
        导出 PNG
      </button>
      <button type="button" onClick={() => void session.exportSvgImage()}>
        导出 SVG
      </button>
      <button
        type="button"
        onClick={() =>
          void session.setTopicStyleOverrides('topic_branch', { fill: '#ea580c' })
        }
      >
        编辑节点样式
      </button>
      <button type="button" onClick={() => void session.setDocumentTheme('dark')}>
        切换文档主题
      </button>
    </div>
  )
}

it('clears recent action records when switching to a new document context', async () => {
  commandMocks.getDocumentState.mockResolvedValue(createSnapshot())
  commandMocks.createChildTopic.mockResolvedValue(
    createSnapshot({
      document: {
        schemaVersion: '1.0.0',
        documentId: 'doc_1',
        revision: 2,
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
                {
                  id: 'topic_child',
                  text: '新建子主题',
                  collapsed: false,
                  children: [],
                },
              ],
            },
          },
        ],
      },
      summary: {
        documentId: 'doc_1',
        revision: 2,
        activeSheetId: 'sheet_1',
        sheetCount: 1,
        topicCount: 2,
        rootTopicText: '中心主题',
      },
      canUndo: true,
      nextUndoAction: '创建子主题',
      activeTopicId: 'topic_child',
      hasUnsavedChanges: true,
    }),
  )
  commandMocks.createDocument.mockResolvedValue(
    createSnapshot({
      document: {
        schemaVersion: '1.0.0',
        documentId: 'doc_2',
        revision: 1,
        activeSheetId: 'sheet_new',
        sheets: [
          {
            id: 'sheet_new',
            title: '新画布',
            rootTopic: {
              id: 'topic_new_root',
              text: '新的中心主题',
              collapsed: false,
              children: [],
            },
          },
        ],
      },
      summary: {
        documentId: 'doc_2',
        revision: 1,
        activeSheetId: 'sheet_new',
        sheetCount: 1,
        topicCount: 1,
        rootTopicText: '新的中心主题',
      },
      activeTopicId: 'topic_new_root',
    }),
  )

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())
  expect(screen.getByText('记录数：0')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '创建子主题' }))

  await waitFor(() => expect(screen.getByText('记录数：1')).toBeInTheDocument())
  expect(screen.getByText('首条记录：创建子主题')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '新建文档' }))

  await waitFor(() => expect(screen.getByText('最近动作：已创建新文档')).toBeInTheDocument())
  expect(screen.getByText('记录数：0')).toBeInTheDocument()
  expect(screen.getByText('首条记录：无')).toBeInTheDocument()
})

it('clears recent action records after a successful save checkpoint', async () => {
  commandMocks.getDocumentState.mockResolvedValue(
    createSnapshot({
      filePath: '/tmp/mindgrid.mgd',
      hasUnsavedChanges: true,
    }),
  )
  commandMocks.createChildTopic.mockResolvedValue(
    createSnapshot({
      document: {
        schemaVersion: '1.0.0',
        documentId: 'doc_1',
        revision: 2,
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
                {
                  id: 'topic_child',
                  text: '新建子主题',
                  collapsed: false,
                  children: [],
                },
              ],
            },
          },
        ],
      },
      summary: {
        documentId: 'doc_1',
        revision: 2,
        activeSheetId: 'sheet_1',
        sheetCount: 1,
        topicCount: 2,
        rootTopicText: '中心主题',
      },
      canUndo: true,
      nextUndoAction: '创建子主题',
      activeTopicId: 'topic_child',
      filePath: '/tmp/mindgrid.mgd',
      hasUnsavedChanges: true,
    }),
  )
  commandMocks.saveDocumentToCurrentFile.mockResolvedValue(
    createSnapshot({
      document: {
        schemaVersion: '1.0.0',
        documentId: 'doc_1',
        revision: 2,
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
                {
                  id: 'topic_child',
                  text: '新建子主题',
                  collapsed: false,
                  children: [],
                },
              ],
            },
          },
        ],
      },
      summary: {
        documentId: 'doc_1',
        revision: 2,
        activeSheetId: 'sheet_1',
        sheetCount: 1,
        topicCount: 2,
        rootTopicText: '中心主题',
      },
      canUndo: true,
      nextUndoAction: '创建子主题',
      activeTopicId: 'topic_child',
      filePath: '/tmp/mindgrid.mgd',
      hasUnsavedChanges: false,
    }),
  )

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '创建子主题' }))

  await waitFor(() => expect(screen.getByText('记录数：1')).toBeInTheDocument())
  expect(screen.getByText('首条记录：创建子主题')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '保存文档' }))

  await waitFor(() => expect(screen.getByText('最近动作：已保存文档')).toBeInTheDocument())
  expect(screen.getByText('记录数：0')).toBeInTheDocument()
  expect(screen.getByText('首条记录：无')).toBeInTheDocument()
})

it('confirms before creating a new document when unsaved changes exist', async () => {
  const confirmMock = vi.fn(() => false)
  vi.stubGlobal('confirm', confirmMock)
  commandMocks.getDocumentState.mockResolvedValue(
    createSnapshot({
      filePath: '/tmp/mindgrid.mgd',
      hasUnsavedChanges: true,
    }),
  )

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '新建文档' }))

  expect(confirmMock).toHaveBeenCalledWith(
    '当前文档还有未保存更改。确定要新建文档吗？未保存内容仍可从恢复区继续找回。',
  )
  expect(commandMocks.createDocument).not.toHaveBeenCalled()
})

it('confirms before opening another document when unsaved changes exist', async () => {
  const confirmMock = vi.fn(() => false)
  vi.stubGlobal('confirm', confirmMock)
  commandMocks.getDocumentState.mockResolvedValue(
    createSnapshot({
      filePath: '/tmp/mindgrid.mgd',
      hasUnsavedChanges: true,
    }),
  )

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '打开文档' }))

  expect(confirmMock).toHaveBeenCalledWith(
    '当前文档还有未保存更改。确定要打开其他文档吗？未保存内容仍可从恢复区继续找回。',
  )
  expect(dialogMocks.open).not.toHaveBeenCalled()
  expect(commandMocks.openDocumentFile).not.toHaveBeenCalled()
})

it('exports the current document as a markdown outline in desktop runtime', async () => {
  transportMocks.hasTauriRuntime.mockReturnValue(true)
  dialogMocks.save.mockResolvedValue('/tmp/mindgrid-outline')
  commandMocks.getDocumentState.mockResolvedValue(
    createSnapshot({
      filePath: '/tmp/mindgrid.mgd',
      hasUnsavedChanges: true,
    }),
  )
  commandMocks.exportMarkdownFile.mockResolvedValue(undefined)

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '导出 Markdown' }))

  await waitFor(() =>
    expect(screen.getByText('最近动作：已导出 Markdown 大纲')).toBeInTheDocument(),
  )
  expect(dialogMocks.save).toHaveBeenCalledWith({
    defaultPath: '/tmp/mindgrid.md',
    filters: [{ name: 'Markdown 文档', extensions: ['md'] }],
  })
  expect(commandMocks.exportMarkdownFile).toHaveBeenCalledWith('/tmp/mindgrid-outline.md')
})

it('exports the current document as an opml outline in desktop runtime', async () => {
  transportMocks.hasTauriRuntime.mockReturnValue(true)
  dialogMocks.save.mockResolvedValue('/tmp/mindgrid-outline')
  commandMocks.getDocumentState.mockResolvedValue(
    createSnapshot({
      filePath: '/tmp/mindgrid.mgd',
      hasUnsavedChanges: true,
    }),
  )
  commandMocks.exportOpmlFile.mockResolvedValue(undefined)

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '导出 OPML' }))

  await waitFor(() =>
    expect(screen.getByText('最近动作：已导出 OPML 大纲')).toBeInTheDocument(),
  )
  expect(dialogMocks.save).toHaveBeenCalledWith({
    defaultPath: '/tmp/mindgrid.opml',
    filters: [{ name: 'OPML 文档', extensions: ['opml', 'xml'] }],
  })
  expect(commandMocks.exportOpmlFile).toHaveBeenCalledWith('/tmp/mindgrid-outline.opml')
})

it('imports a markdown outline into a new document in desktop runtime', async () => {
  transportMocks.hasTauriRuntime.mockReturnValue(true)
  dialogMocks.open.mockResolvedValue('/tmp/imported.md')
  commandMocks.getDocumentState.mockResolvedValue(createSnapshot())
  commandMocks.importMarkdownFile.mockResolvedValue(
    createSnapshot({
      document: {
        schemaVersion: '1.1.0',
        documentId: 'doc_imported',
        revision: 1,
        activeSheetId: 'sheet_imp',
        sheets: [
          {
            id: 'sheet_imp',
            title: '导入画布',
            rootTopic: { id: 'topic_imp', text: '导入主题', collapsed: false, children: [] },
          },
        ],
      },
      summary: {
        documentId: 'doc_imported',
        revision: 1,
        activeSheetId: 'sheet_imp',
        sheetCount: 1,
        topicCount: 1,
        rootTopicText: '导入主题',
      },
      activeTopicId: 'topic_imp',
    }),
  )

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '导入 Markdown' }))

  await waitFor(() =>
    expect(screen.getByText('最近动作：已导入 Markdown 大纲')).toBeInTheDocument(),
  )
  expect(dialogMocks.open).toHaveBeenCalledWith({
    multiple: false,
    directory: false,
    filters: [{ name: 'Markdown 文档', extensions: ['md', 'markdown', 'txt'] }],
  })
  expect(commandMocks.importMarkdownFile).toHaveBeenCalledWith('/tmp/imported.md')
})

it('imports an opml outline into a new document in desktop runtime', async () => {
  transportMocks.hasTauriRuntime.mockReturnValue(true)
  dialogMocks.open.mockResolvedValue('/tmp/imported.opml')
  commandMocks.getDocumentState.mockResolvedValue(createSnapshot())
  commandMocks.importOpmlFile.mockResolvedValue(
    createSnapshot({
      document: {
        schemaVersion: '1.1.0',
        documentId: 'doc_opml',
        revision: 1,
        activeSheetId: 'sheet_opml',
        sheets: [
          {
            id: 'sheet_opml',
            title: 'OPML 画布',
            rootTopic: { id: 'topic_opml', text: 'OPML 主题', collapsed: false, children: [] },
          },
        ],
      },
      summary: {
        documentId: 'doc_opml',
        revision: 1,
        activeSheetId: 'sheet_opml',
        sheetCount: 1,
        topicCount: 1,
        rootTopicText: 'OPML 主题',
      },
      activeTopicId: 'topic_opml',
    }),
  )

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '导入 OPML' }))

  await waitFor(() =>
    expect(screen.getByText('最近动作：已导入 OPML 大纲')).toBeInTheDocument(),
  )
  expect(dialogMocks.open).toHaveBeenCalledWith({
    multiple: false,
    directory: false,
    filters: [{ name: 'OPML 文档', extensions: ['opml', 'xml'] }],
  })
  expect(commandMocks.importOpmlFile).toHaveBeenCalledWith('/tmp/imported.opml')
})

it('exports the current document as a png image in desktop runtime', async () => {
  transportMocks.hasTauriRuntime.mockReturnValue(true)
  dialogMocks.save.mockResolvedValue('/tmp/mindgrid-image')
  commandMocks.getDocumentState.mockResolvedValue(
    createSnapshot({
      filePath: '/tmp/mindgrid.mgd',
    }),
  )
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  renderMocks.renderSceneToPngBytes.mockResolvedValue(pngBytes)
  commandMocks.exportPngFile.mockResolvedValue(undefined)

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))

  await waitFor(() =>
    expect(screen.getByText('最近动作：已导出 PNG 图片')).toBeInTheDocument(),
  )
  expect(dialogMocks.save).toHaveBeenCalledWith({
    defaultPath: '/tmp/mindgrid.png',
    filters: [{ name: 'PNG 图片', extensions: ['png'] }],
  })
  expect(renderMocks.renderSceneToPngBytes).toHaveBeenCalledWith(
    expect.objectContaining({ nodes: expect.any(Array) }),
    { scale: 2 },
  )
  expect(commandMocks.exportPngFile).toHaveBeenCalledWith('/tmp/mindgrid-image.png', pngBytes)
})

it('exports the current document as an svg image in desktop runtime', async () => {
  transportMocks.hasTauriRuntime.mockReturnValue(true)
  dialogMocks.save.mockResolvedValue('/tmp/mindgrid-vector')
  commandMocks.getDocumentState.mockResolvedValue(
    createSnapshot({
      filePath: '/tmp/mindgrid.mgd',
    }),
  )
  const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
  renderMocks.renderSceneToSvg.mockReturnValue(svgContent)
  commandMocks.exportSvgFile.mockResolvedValue(undefined)

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '导出 SVG' }))

  await waitFor(() =>
    expect(screen.getByText('最近动作：已导出 SVG 矢量图')).toBeInTheDocument(),
  )
  expect(dialogMocks.save).toHaveBeenCalledWith({
    defaultPath: '/tmp/mindgrid.svg',
    filters: [{ name: 'SVG 矢量图', extensions: ['svg'] }],
  })
  expect(renderMocks.renderSceneToSvg).toHaveBeenCalledWith(
    expect.objectContaining({ nodes: expect.any(Array) }),
  )
  expect(commandMocks.exportSvgFile).toHaveBeenCalledWith('/tmp/mindgrid-vector.svg', svgContent)
})

it('applies topic style overrides through the session hook', async () => {
  commandMocks.getDocumentState.mockResolvedValue(createSnapshot())
  commandMocks.setTopicStyleOverrides.mockResolvedValue(createSnapshot())

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '编辑节点样式' }))

  await waitFor(() =>
    expect(commandMocks.setTopicStyleOverrides).toHaveBeenCalledWith('topic_branch', {
      fill: '#ea580c',
    }),
  )
  await waitFor(() => expect(screen.getByText('最近动作：已编辑样式')).toBeInTheDocument())
})

it('switches the document theme through the session hook', async () => {
  commandMocks.getDocumentState.mockResolvedValue(createSnapshot())
  commandMocks.setDocumentTheme.mockResolvedValue(createSnapshot())

  renderWithApp(<SessionHarness />)

  await waitFor(() => expect(screen.getByText('最近动作：已恢复当前文档')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '切换文档主题' }))

  await waitFor(() =>
    expect(commandMocks.setDocumentTheme).toHaveBeenCalledWith('dark'),
  )
  await waitFor(() => expect(screen.getByText('最近动作：已切换文档主题')).toBeInTheDocument())
})
