import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import { CanvasHost } from './canvas-host'
import type { DocumentSession } from '../document/use-document-session'
import { serializeTopicsForClipboard } from './topic-system-clipboard'

function createSessionStub(overrides: Partial<DocumentSession> = {}): DocumentSession {
  return {
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
            children: [
              {
                id: 'topic_insight',
                text: '关键洞察',
                collapsed: false,
                  children: [
                    {
                      id: 'topic_insight_child',
                      text: '洞察子主题',
                      collapsed: false,
                      children: [],
                    },
                  ],
              },
              {
                id: 'topic_action',
                text: '行动项',
                collapsed: false,
                children: [],
              },
              {
                id: 'topic_hypothesis',
                text: '待验证假设',
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
      revision: 1,
      activeSheetId: 'sheet_1',
      sheetCount: 1,
      topicCount: 5,
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
    ...overrides,
  }
}

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  })
})

it('deletes the current multi-selection with the keyboard', () => {
  const deleteTopics = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ deleteTopics, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })
  const actionNode = within(scene).getByRole('button', { name: /行动项/ })

  fireEvent.click(insightNode)
  fireEvent.click(actionNode, { ctrlKey: true })

  expect(screen.getByText('已选中 2 个主题')).toBeInTheDocument()

  fireEvent.keyDown(window, { key: 'Delete' })

  expect(deleteTopics).toHaveBeenCalledWith(
    ['topic_insight', 'topic_action'],
    '删除 2 个主题',
  )
  expect(selectTopic).toHaveBeenCalledWith('topic_action')
})

it('supports inline editing on a mind map node', async () => {
  const renameTopic = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ renameTopic, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })

  fireEvent.doubleClick(insightNode)

  const inlineEditor = within(scene).getByRole('textbox', { name: '内联编辑主题' })

  fireEvent.change(inlineEditor, { target: { value: '已澄清洞察' } })
  fireEvent.keyDown(inlineEditor, { key: 'Enter', ctrlKey: true })

  await waitFor(() => {
    expect(renameTopic).toHaveBeenCalledWith('topic_insight', '已澄清洞察')
  })
  expect(selectTopic).toHaveBeenCalledWith('topic_insight')
})

it('opens floating search and selects the matching topic', async () => {
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  fireEvent.keyDown(window, { key: 'f', ctrlKey: true })

  const searchInput = screen.getByRole('textbox', { name: '搜索主题' })

  fireEvent.change(searchInput, { target: { value: '待验证' } })

  await waitFor(() => {
    expect(selectTopic).toHaveBeenCalledWith('topic_hypothesis')
  })

  expect(screen.getByText('1 / 1')).toBeInTheDocument()
  const searchPanel = screen.getByRole('search')
  expect(within(searchPanel).getByRole('button', { name: /待验证假设/ })).toBeInTheDocument()
})

it('switches to the matching sheet when search hits another canvas', async () => {
  const selectTopic = vi.fn(async () => {})
  const selectSheet = vi.fn(async (_sheetId: string) => {})

  function SearchHarness() {
    const [sessionState, setSessionState] = useState(() =>
      createSessionStub({
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
            {
              id: 'sheet_2',
              title: '执行画布',
              rootTopic: {
                id: 'topic_root_2',
                text: '执行中心',
                collapsed: false,
                children: [
                  {
                    id: 'topic_execution',
                    text: '跨画布执行项',
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
          revision: 1,
          activeSheetId: 'sheet_1',
          sheetCount: 2,
          topicCount: 1,
          rootTopicText: '中心主题',
        },
        selectSheet: async (sheetId: string) => {
          selectSheet(sheetId)
          setSessionState((current) => ({
            ...current,
            document: current.document
              ? {
                  ...current.document,
                  activeSheetId: sheetId,
                }
              : current.document,
            summary: current.summary
              ? {
                  ...current.summary,
                  activeSheetId: sheetId,
                  rootTopicText: sheetId === 'sheet_2' ? '执行中心' : '中心主题',
                }
              : current.summary,
          }))
        },
        selectTopic,
        activeTopicId: 'topic_root',
      }),
    )

    return <CanvasHost session={sessionState} />
  }

  renderWithApp(<SearchHarness />)

  fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
  fireEvent.change(screen.getByRole('textbox', { name: '搜索主题' }), {
    target: { value: '跨画布执行项' },
  })

  await waitFor(() => {
    expect(selectSheet).toHaveBeenCalledWith('sheet_2')
  })
  await waitFor(() => {
    expect(selectTopic).toHaveBeenCalledWith('topic_execution')
  })

  const searchPanel = screen.getByRole('search')
  expect(within(searchPanel).getByRole('button', { name: /跨画布执行项/ })).toBeInTheDocument()
  expect(within(searchPanel).getByText('执行画布 / 执行中心 / 跨画布执行项')).toBeInTheDocument()
})

it('remembers viewport zoom for each sheet independently', () => {
  const getZoomLabel = () =>
    within(screen.getByLabelText('思维导图舞台')).getByText(/%/, {
      selector: '.editor-card__hint',
    })
  const document = {
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
  }
  const { rerender } = renderWithApp(
    <CanvasHost
      session={createSessionStub({
        document,
        summary: {
          documentId: 'doc_1',
          revision: 1,
          activeSheetId: 'sheet_1',
          sheetCount: 2,
          topicCount: 1,
          rootTopicText: '中心主题',
        },
      })}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: '+' }))
  expect(getZoomLabel()).toHaveTextContent('115%')

  rerender(
    <CanvasHost
      session={createSessionStub({
        document: {
          ...document,
          activeSheetId: 'sheet_2',
        },
        summary: {
          documentId: 'doc_1',
          revision: 1,
          activeSheetId: 'sheet_2',
          sheetCount: 2,
          topicCount: 1,
          rootTopicText: '第二中心主题',
        },
        activeTopicId: 'topic_root_2',
      })}
    />,
  )

  expect(getZoomLabel()).toHaveTextContent('100%')

  rerender(
    <CanvasHost
      session={createSessionStub({
        document,
        summary: {
          documentId: 'doc_1',
          revision: 1,
          activeSheetId: 'sheet_1',
          sheetCount: 2,
          topicCount: 1,
          rootTopicText: '中心主题',
        },
      })}
    />,
  )

  expect(getZoomLabel()).toHaveTextContent('115%')
})

it('toggles collapse with the space key', () => {
  const toggleTopicCollapsed = vi.fn(async () => {})
  const session = createSessionStub({ toggleTopicCollapsed })

  renderWithApp(<CanvasHost session={session} />)

  fireEvent.keyDown(window, { key: ' ' })

  expect(toggleTopicCollapsed).toHaveBeenCalledWith('topic_root')
})

it('hides descendants of collapsed topics in the outline and canvas', () => {
  const session = createSessionStub({
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
            children: [
              {
                id: 'topic_insight',
                text: '关键洞察',
                collapsed: true,
                children: [
                  {
                    id: 'topic_hidden',
                    text: '隐藏子主题',
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
      documentId: 'doc_1',
      revision: 1,
      activeSheetId: 'sheet_1',
      sheetCount: 1,
      topicCount: 3,
      rootTopicText: '中心主题',
    },
  })

  renderWithApp(<CanvasHost session={session} />)

  expect(screen.queryByRole('button', { name: /隐藏子主题 Depth/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^隐藏子主题1$/ })).not.toBeInTheDocument()
})

it('copies the current selection and pastes it as child topics', async () => {
  const pasteTopics = vi.fn(async () => {})
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  const session = createSessionStub({ pasteTopics, activeTopicId: 'topic_action' })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })

  fireEvent.click(insightNode)
  fireEvent.keyDown(window, { key: 'c', ctrlKey: true })

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledTimes(1)
  })
  expect(screen.getByText(/剪贴板：已复制 关键洞察/)).toBeInTheDocument()

  fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

  await waitFor(() => {
    expect(pasteTopics).toHaveBeenCalledTimes(1)
  })
  expect(pasteTopics).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        text: '关键洞察',
        children: [expect.objectContaining({ text: '洞察子主题' })],
      }),
    ],
    'topic_action',
  )
})

it('pastes topics from the system clipboard after reload-like local reset', async () => {
  const pasteTopics = vi.fn(async () => {})
  const readText = vi.fn(async () => '')
  const clipboardPayload = serializeTopicsForClipboard([
    {
      id: 'topic_clipboard',
      text: '系统剪贴板主题',
      collapsed: false,
      children: [],
    },
  ])
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText,
    },
  })
  const session = createSessionStub({ pasteTopics, activeTopicId: 'topic_action' })

  renderWithApp(<CanvasHost session={session} />)

  readText.mockResolvedValueOnce(clipboardPayload)

  fireEvent.click(screen.getByRole('button', { name: '粘贴为子主题' }))

  await waitFor(() => {
    expect(pasteTopics).toHaveBeenCalledWith(
      [expect.objectContaining({ text: '系统剪贴板主题' })],
      'topic_action',
    )
  })
  expect(screen.getByText(/剪贴板：已复制 系统剪贴板主题/)).toBeInTheDocument()
})

it('falls back to the in-session clipboard when the system clipboard read fails', async () => {
  const pasteTopics = vi.fn(async () => {})
  const writeText = vi.fn(async () => {})
  const readText = vi.fn(async () => {
    throw new DOMException('Document is not focused.', 'NotAllowedError')
  })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText,
      writeText,
    },
  })
  const session = createSessionStub({ pasteTopics, activeTopicId: 'topic_action' })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })

  fireEvent.click(insightNode)
  fireEvent.keyDown(window, { key: 'c', ctrlKey: true })

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledTimes(1)
  })

  fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

  await waitFor(() => {
    expect(pasteTopics).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          text: '关键洞察',
          children: [expect.objectContaining({ text: '洞察子主题' })],
        }),
      ],
      'topic_action',
    )
  })
  expect(screen.getByText(/已回退到当前会话剪贴板/)).toBeInTheDocument()
})
