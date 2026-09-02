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

it('commits inline edit with plain Enter (no modifier required)', async () => {
  const renameTopic = vi.fn(async () => {})
  const session = createSessionStub({ renameTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })

  fireEvent.doubleClick(insightNode)

  const inlineEditor = within(scene).getByRole('textbox', { name: '内联编辑主题' })
  fireEvent.change(inlineEditor, { target: { value: '新名称' } })
  // 无修饰键 Enter 即可提交（对齐 XMind）
  fireEvent.keyDown(inlineEditor, { key: 'Enter' })

  await waitFor(() => {
    expect(renameTopic).toHaveBeenCalledWith('topic_insight', '新名称')
  })
})

it('does not commit inline edit on Shift+Enter (inserts newline instead)', async () => {
  const renameTopic = vi.fn(async () => {})
  const session = createSessionStub({ renameTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })

  fireEvent.doubleClick(insightNode)

  const inlineEditor = within(scene).getByRole('textbox', { name: '内联编辑主题' })
  fireEvent.change(inlineEditor, { target: { value: '第一行' } })
  fireEvent.keyDown(inlineEditor, { key: 'Enter', shiftKey: true })

  // Shift+Enter 不应触发提交
  expect(renameTopic).not.toHaveBeenCalled()
})

it('toggles topic collapse with Cmd/Ctrl + slash', () => {
  const toggleTopicCollapsed = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ toggleTopicCollapsed, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })
  fireEvent.click(insightNode)

  // topic_insight 有子主题，可以用 Cmd+/ 折叠
  fireEvent.keyDown(window, { key: '/', ctrlKey: true })

  expect(toggleTopicCollapsed).toHaveBeenCalledWith('topic_insight')
})

it('reorders sibling with Alt + ArrowDown', () => {
  const moveTopicInParent = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ moveTopicInParent, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })
  fireEvent.click(insightNode)

  fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true })

  expect(moveTopicInParent).toHaveBeenCalledWith('topic_insight', 'down')
})

it('reorders sibling with Alt + ArrowUp', () => {
  const moveTopicInParent = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ moveTopicInParent, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const actionNode = within(scene).getByRole('button', { name: /行动项/ })
  fireEvent.click(actionNode)

  fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true })

  expect(moveTopicInParent).toHaveBeenCalledWith('topic_action', 'up')
})

it('inserts a parent topic with Cmd/Ctrl + Enter', () => {
  const createParentTopic = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ createParentTopic, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })
  fireEvent.click(insightNode)

  fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })

  expect(createParentTopic).toHaveBeenCalledWith('topic_insight')
})

it('inserts a sibling before with Shift + Enter', () => {
  const createSiblingTopic = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ createSiblingTopic, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })
  fireEvent.click(insightNode)

  fireEvent.keyDown(window, { key: 'Enter', shiftKey: true })

  expect(createSiblingTopic).toHaveBeenCalledWith('topic_insight', 'before')
})

it('inserts a sibling after with plain Enter', () => {
  const createSiblingTopic = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ createSiblingTopic, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })
  fireEvent.click(insightNode)

  fireEvent.keyDown(window, { key: 'Enter' })

  expect(createSiblingTopic).toHaveBeenCalledWith('topic_insight', 'after')
})

it('initiates box selection on plain left-drag (no Shift required, XMind-style)', () => {
  const session = createSessionStub()
  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const viewport = scene.querySelector('.mindmap-scene') as HTMLElement

  // 空白处左键拖拽（无 Shift）应启动框选，对齐 XMind
  fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(viewport, { button: 0, clientX: 150, clientY: 150 })

  expect(viewport.querySelector('.mindmap-selection-box')).not.toBeNull()

  fireEvent.pointerUp(viewport, { button: 0, clientX: 150, clientY: 150 })
})

it('uses middle-button drag for panning instead of box selection', () => {
  const session = createSessionStub()
  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const viewport = scene.querySelector('.mindmap-scene') as HTMLElement

  // 中键拖拽 = 平移，不应出现框选元素
  fireEvent.pointerDown(viewport, { button: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(viewport, { button: 1, clientX: 150, clientY: 150 })

  expect(viewport.querySelector('.mindmap-selection-box')).toBeNull()

  fireEvent.pointerUp(viewport, { button: 1, clientX: 150, clientY: 150 })
})

it('treats Space + left-drag as panning and suppresses fold-toggle on Space keyup', () => {
  const toggleTopicCollapsed = vi.fn(async () => {})
  const session = createSessionStub({ toggleTopicCollapsed })
  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const viewport = scene.querySelector('.mindmap-scene') as HTMLElement

  fireEvent.keyDown(window, { key: ' ' })
  fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(viewport, { button: 0, clientX: 150, clientY: 150 })

  // Space + 拖拽 = 平移，不出现框选
  expect(viewport.querySelector('.mindmap-selection-box')).toBeNull()

  fireEvent.pointerUp(viewport, { button: 0, clientX: 150, clientY: 150 })
  fireEvent.keyUp(window, { key: ' ' })

  // 拖拽发生，视为平移，不触发折叠切换
  expect(toggleTopicCollapsed).not.toHaveBeenCalled()
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

  // Space 折叠切换延迟到 keyup：按下未拖拽、松开时触发（兼容旧行为）
  fireEvent.keyDown(window, { key: ' ' })
  expect(toggleTopicCollapsed).not.toHaveBeenCalled()
  fireEvent.keyUp(window, { key: ' ' })

  expect(toggleTopicCollapsed).toHaveBeenCalledWith('topic_root')
})

it('positions the root collapse toggle at the bottom edge (XMind-style, center side)', () => {
  const session = createSessionStub()
  renderWithApp(<CanvasHost session={session} />)

  const rootNode = document.querySelector('[data-topic-id="topic_root"]') as HTMLElement
  expect(rootNode).not.toBeNull()
  // 根节点是 center side 且有子节点，应渲染折叠 toggle；DOM 顺序中首个 toggle 属于根
  const toggle = document.querySelector('.mindmap-node__toggle') as HTMLElement
  expect(toggle).not.toBeNull()

  // XMind 式：center side 的 toggle 位于节点下缘（top > root.top），
  // 取代旧的右上方（top < root.top）
  const rootTop = parseFloat(rootNode.style.top)
  const toggleTop = parseFloat(toggle.style.top)
  expect(Number.isFinite(rootTop)).toBe(true)
  expect(Number.isFinite(toggleTop)).toBe(true)
  expect(toggleTop).toBeGreaterThan(rootTop)
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
  // 剪贴板状态横条已移除，不再常驻展示"已复制"状态
  expect(screen.queryByText(/剪贴板：/)).not.toBeInTheDocument()

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

  fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

  await waitFor(() => {
    expect(pasteTopics).toHaveBeenCalledWith(
      [expect.objectContaining({ text: '系统剪贴板主题' })],
      'topic_action',
    )
  })
  // 剪贴板状态横条已移除，不再常驻展示粘贴来源
  expect(screen.queryByText(/剪贴板：/)).not.toBeInTheDocument()
})

it('falls back to the in-session clipboard when the system clipboard read fails', async () => {
  const pasteTopics = vi.fn(async () => {})
  const onNotify = vi.fn()
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

  renderWithApp(<CanvasHost session={session} onNotify={onNotify} />)

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
  // 系统剪贴板不可读的异常态改走 Toast 通知
  expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('已回退到当前会话剪贴板'))
})

it('opens a node context menu on right-click and deletes via the menu', () => {
  const deleteTopics = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ deleteTopics, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const insightNode = within(scene).getByRole('button', { name: /关键洞察/ })

  fireEvent.contextMenu(insightNode)

  const menu = screen.getByRole('menu')
  // 节点右键菜单包含 XMind 标配项
  expect(within(menu).getByRole('menuitem', { name: /编辑文本/ })).toBeInTheDocument()
  expect(within(menu).getByRole('menuitem', { name: /新建子主题/ })).toBeInTheDocument()
  expect(within(menu).getByRole('menuitem', { name: /删除/ })).toBeInTheDocument()

  // 点击删除触发 deleteTopics
  fireEvent.click(within(menu).getByRole('menuitem', { name: /删除/ }))

  expect(deleteTopics).toHaveBeenCalledWith(['topic_insight'], expect.any(String))
  // 点击后菜单关闭
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('disables create-sibling and delete for the root node context menu', () => {
  const session = createSessionStub({})

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const rootNode = within(scene).getByRole('button', { name: /中心主题/ })

  fireEvent.contextMenu(rootNode)

  const menu = screen.getByRole('menu')
  expect(within(menu).getByRole('menuitem', { name: /新建同级/ })).toBeDisabled()
  expect(within(menu).getByRole('menuitem', { name: /删除/ })).toBeDisabled()
})

it('opens a canvas context menu on background right-click with view actions', () => {
  const session = createSessionStub({})

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  const viewport = scene.querySelector('.mindmap-scene') as HTMLElement

  fireEvent.contextMenu(viewport)

  const menu = screen.getByRole('menu')
  expect(within(menu).getByRole('menuitem', { name: /适配视图/ })).toBeInTheDocument()
  expect(within(menu).getByRole('menuitem', { name: /100%/ })).toBeInTheDocument()
  expect(within(menu).getByRole('menuitem', { name: /放大/ })).toBeInTheDocument()
})

it('enters inline editing with the F2 key', () => {
  const renameTopic = vi.fn(async () => {})
  const session = createSessionStub({ renameTopic })

  renderWithApp(<CanvasHost session={session} />)

  fireEvent.keyDown(window, { key: 'F2' })

  expect(screen.getByRole('textbox', { name: '内联编辑主题' })).toBeInTheDocument()
})

it('selects all visible topics with Cmd/Ctrl + A', () => {
  const session = createSessionStub({})

  renderWithApp(<CanvasHost session={session} />)

  fireEvent.keyDown(window, { key: 'a', ctrlKey: true })

  // 默认文档：中心主题 + 关键洞察(+洞察子主题) + 行动项 + 待验证假设 = 5 个可见主题
  expect(screen.getByText('已选中 5 个主题')).toBeInTheDocument()
})

it('navigates focus to a right-side child with the ArrowRight key', () => {
  const selectTopic = vi.fn(async (_topicId: string) => {})
  const session = createSessionStub({ selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  fireEvent.keyDown(window, { key: 'ArrowRight' })

  // 从中心主题向右，应选中右侧某个子主题（关键洞察 / 行动项 / 待验证假设）
  expect(selectTopic).toHaveBeenCalled()
  const calledId = selectTopic.mock.calls[0][0]
  expect([
    'topic_insight',
    'topic_action',
    'topic_hypothesis',
  ]).toContain(calledId)
})

it('zooms in with Cmd/Ctrl + =', () => {
  const getZoomLabel = () =>
    within(screen.getByLabelText('思维导图舞台')).getByText(/%/, {
      selector: '.editor-card__hint',
    })

  renderWithApp(<CanvasHost session={createSessionStub()} />)

  fireEvent.keyDown(window, { key: '=', ctrlKey: true })

  expect(getZoomLabel()).toHaveTextContent('115%')
})

it('renders only the scene without debug scaffolding', () => {
  renderWithApp(<CanvasHost session={createSessionStub()} />)

  expect(screen.getByLabelText('思维导图舞台')).toBeInTheDocument()
  // hero 操作条、重复大纲卡、Inline Editor 卡与统计卡均已移除
  expect(screen.queryByRole('button', { name: '新建子主题' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '粘贴为子主题' })).not.toBeInTheDocument()
  expect(screen.queryByText('主题树')).not.toBeInTheDocument()
  expect(screen.queryByText('Inline Editor')).not.toBeInTheDocument()
  expect(screen.queryByText('文档 ID')).not.toBeInTheDocument()
  expect(screen.queryByText('修订号')).not.toBeInTheDocument()
})

it('creates a floating topic on double-click of blank canvas (XMind-style)', async () => {
  const createFloatingTopic = vi.fn(async (_text: string, _ox: number, _oy: number) => {})
  const session = createSessionStub({ createFloatingTopic })

  renderWithApp(<CanvasHost session={session} />)

  const section = screen.getByLabelText('思维导图舞台')
  // viewport div 是接收 onDoubleClick 的元素
  const viewport = section.querySelector('.mindmap-scene') as HTMLElement
  expect(viewport).toBeTruthy()

  // 双击画布空白处（viewport div 自身，非节点按钮）
  fireEvent.doubleClick(viewport)

  await waitFor(() => {
    expect(createFloatingTopic).toHaveBeenCalledTimes(1)
    const [text, , offsetY] = createFloatingTopic.mock.calls[0]
    expect(text).toBe('新建浮动主题')
    expect(offsetY).toBeTypeOf('number')
  })
})


