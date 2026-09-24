import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import { CanvasHost } from './canvas-host'
import { computeLayout, resolveLayoutOptions } from './layouts'
import { resolveCanvasSettings } from '../../lib/document/canvas-settings'
import type { DocumentSession } from '../document/use-document-session'
import { serializeTopicsForClipboard } from './topic-system-clipboard'
import type { TopicSnapshot } from '../../lib/document/types'
import {
  ATTACHMENT_ICON_SVG_INNER,
  LINK_ICON_SVG_INNER,
  NOTE_ICON_SVG_INNER,
  VOICE_NOTE_ICON_SVG_INNER,
} from './runtime/rich-content-constants'
import {
  TOPIC_META_ICON_ORDER,
  type TopicMetaIconKind,
} from './runtime/topic-meta-icons'

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
    setTopicEquation: async () => {},
    setTopicVoiceNote: async () => {},
    removeTopicVoiceNote: async () => {},
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

/**
 * ⌘] / ⌘[：缩进 / 减少缩进。
 *
 * 这两条键是**唯一能让缩进被自动化验证的入口**——编辑菜单里的同名项只能在
 * 原生菜单点到，jsdom 与浏览器都驱动不了。目标计算与菜单共用同一个纯函数
 * （lib/document/topic-outline.ts），这里验的是"按键真的接通了那条动作"。
 */
it('indents the topic under its previous sibling with Cmd/Ctrl + ]', () => {
  const moveTopic = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ moveTopic, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  // 夹具：root → [关键洞察, 行动项, 待验证假设]，行动项的上一个同级是「关键洞察」
  fireEvent.click(within(scene).getByRole('button', { name: /行动项/ }))
  fireEvent.keyDown(window, { key: ']', ctrlKey: true })

  expect(moveTopic).toHaveBeenCalledWith('topic_action', 'topic_insight', '缩进')
})

it('outdents to the grandparent right after the former parent with Cmd/Ctrl + [', () => {
  const moveTopic = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ moveTopic, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  fireEvent.click(within(scene).getByRole('button', { name: /洞察子主题/ }))
  fireEvent.keyDown(window, { key: '[', ctrlKey: true })

  // 父「关键洞察」在 root 里排第 0 → 目标下标 1（紧跟其后），不是丢到末尾
  expect(moveTopic).toHaveBeenCalledWith('topic_insight_child', 'topic_root', '减少缩进', 1)
})

it('does nothing on Cmd/Ctrl + ] when there is no previous sibling', () => {
  const moveTopic = vi.fn(async () => {})
  const selectTopic = vi.fn(async () => {})
  const session = createSessionStub({ moveTopic, selectTopic })

  renderWithApp(<CanvasHost session={session} />)

  const scene = screen.getByLabelText('思维导图舞台')
  // 关键洞察已是第一个同级主题：无处可缩，不能静默改树
  fireEvent.click(within(scene).getByRole('button', { name: /关键洞察/ }))
  fireEvent.keyDown(window, { key: ']', ctrlKey: true })

  expect(moveTopic).not.toHaveBeenCalled()
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

it('does not treat Alt + Cmd/Ctrl + 0 as zoom-to-fit', () => {
  const getZoomLabel = () =>
    within(screen.getByLabelText('思维导图舞台')).getByText(/%/, {
      selector: '.editor-card__hint',
    })

  renderWithApp(<CanvasHost session={createSessionStub()} />)
  expect(getZoomLabel()).toHaveTextContent('100%')

  // ⌥⌘0 是「重设样式」（由 workspace-screen 处理）。若画布的缩放分支不排除 Alt，
  // 一次按键会既重设样式又触发「适应画布」——缩放被悄悄改掉。
  fireEvent.keyDown(window, { key: '0', metaKey: true, altKey: true })

  expect(getZoomLabel()).toHaveTextContent('100%')
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

it('marks only the active topic with XMind-style corner handles', () => {
  const session = createSessionStub()
  const { container } = renderWithApp(<CanvasHost session={session} />)

  const activeNode = container.querySelector('.mindmap-node--active')
  expect(activeNode).toBeTruthy()

  // 四个角各一个手柄，且只有活动节点有
  expect(activeNode!.querySelectorAll('.mindmap-node__handle')).toHaveLength(4)
  expect(container.querySelectorAll('.mindmap-node__handle')).toHaveLength(4)
})

it('does not create a floating topic when the free-topic setting is off', async () => {
  const createFloatingTopic = vi.fn(async (_text: string, _ox: number, _oy: number) => {})
  const session = createSessionStub({ createFloatingTopic })
  // 关掉「自由主题」画布设置（document.settings 是文档级自由键值字典）
  // 桩里的 document 类型带可选字段（Partial 便于测试），这里显式收敛回完整文档
  session.document = {
    ...session.document,
    settings: { 'canvas.freeTopic': false },
  } as typeof session.document

  renderWithApp(<CanvasHost session={session} />)

  const section = screen.getByLabelText('思维导图舞台')
  const viewport = section.querySelector('.mindmap-scene') as HTMLElement
  fireEvent.doubleClick(viewport)

  // 开关关闭 → 不创建；此前该开关没有任何消费点，是个"点了没用"的控件
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(createFloatingTopic).not.toHaveBeenCalled()
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



/**
 * 「仅显示该分支」（查看菜单 / ⌘;）。
 *
 * 断言必须包含**同级分支消失了**——只断言"目标分支还在"是测不出错的：
 * 完全不做过滤的实现同样会让前半句通过。
 */
it('renders only the focused branch and its path when focusTopicId is set', () => {
  const session = createSessionStub({})

  const { container } = renderWithApp(
    <CanvasHost session={session} focusTopicId="topic_insight" />,
  )

  // 保留：中心主题（路径）+ 关键洞察（自身）+ 洞察子主题（子树）
  expect(container.querySelector('[data-topic-id="topic_root"]')).not.toBeNull()
  expect(container.querySelector('[data-topic-id="topic_insight"]')).not.toBeNull()
  expect(container.querySelector('[data-topic-id="topic_insight_child"]')).not.toBeNull()

  // 同级分支必须消失
  expect(container.querySelector('[data-topic-id="topic_action"]')).toBeNull()
  expect(container.querySelector('[data-topic-id="topic_hypothesis"]')).toBeNull()
})

it('keeps the whole canvas when there is no focus', () => {
  const session = createSessionStub({})

  const { container } = renderWithApp(<CanvasHost session={session} />)

  for (const id of [
    'topic_root',
    'topic_insight',
    'topic_insight_child',
    'topic_action',
    'topic_hypothesis',
  ]) {
    expect(container.querySelector(`[data-topic-id="${id}"]`)).not.toBeNull()
  }
})

it('counts only the visible topics on Cmd/Ctrl + A while focused', () => {
  const session = createSessionStub({})

  renderWithApp(<CanvasHost session={session} focusTopicId="topic_insight" />)

  fireEvent.keyDown(window, { key: 'a', ctrlKey: true })

  // 未聚焦时是 5 个（见上一条同名测试）；聚焦「关键洞察」后只剩 3 个
  expect(screen.getByText('已选中 3 个主题')).toBeInTheDocument()
})

it('requests branch focus with Cmd/Ctrl + ; and refuses the center topic', () => {
  const onFocusTopicIdChange = vi.fn()
  const onNotify = vi.fn()
  const session = createSessionStub({})

  renderWithApp(
    <CanvasHost session={session} onFocusTopicIdChange={onFocusTopicIdChange} onNotify={onNotify} />,
  )

  // 默认选区是中心主题：只显示它的"分支"就是整幅图，必须拒绝并说明原因
  fireEvent.keyDown(window, { key: ';', ctrlKey: true })

  expect(onFocusTopicIdChange).not.toHaveBeenCalled()
  expect(onNotify).toHaveBeenCalledWith('中心主题不能只显示其分支')
})

it('requests branch focus for the selected topic with Cmd/Ctrl + ;', () => {
  const onFocusTopicIdChange = vi.fn()
  const session = createSessionStub({})

  renderWithApp(<CanvasHost session={session} onFocusTopicIdChange={onFocusTopicIdChange} />)

  const scene = screen.getByLabelText('思维导图舞台')
  fireEvent.click(within(scene).getByRole('button', { name: /关键洞察/ }))
  fireEvent.keyDown(window, { key: ';', ctrlKey: true })

  expect(onFocusTopicIdChange).toHaveBeenCalledWith('topic_insight')
})

/**
 * 浮动主题的拖动 = 摆放位置。
 *
 * 回归点：拖拽落点判定此前只认「分支自由布局 + 一级分支」，
 * 而浮动主题**不在树里**，于是它被拖时要么静默无事发生、要么走结构移动失败。
 * 结果就是菜单里「创建后拖到想放的位置即可」这句话是假的——自由主题创建出来就再也挪不动。
 */
describe('浮动主题拖动即摆放', () => {
  function makeSessionWithFloatingTopic() {
    const moveTopic = vi.fn(async () => {})
    const moveTopicFreely = vi.fn(async () => {})
    const session = createSessionStub({
      moveTopic,
      moveTopicFreely,
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
                  id: 'topic_child',
                  text: '普通分支',
                  collapsed: false,
                  children: [{ id: 'topic_grand', text: '更深一层', collapsed: false, children: [] }],
                },
              ],
            },
            floatingTopics: [
              {
                id: 'float_1',
                text: '自由主题',
                collapsed: false,
                children: [],
                layoutHints: { offsetX: 0, offsetY: 300 },
              },
            ],
          },
        ],
      },
    })
    return { session, moveTopic, moveTopicFreely }
  }

  it('拖动浮动主题写入自由位置（且与分支自由布局开关无关）', () => {
    const { session, moveTopic, moveTopicFreely } = makeSessionWithFloatingTopic()
    renderWithApp(<CanvasHost session={session} />)

    const stage = screen.getByLabelText('思维导图舞台')
    const viewport = stage.querySelector('.mindmap-scene') as HTMLElement
    const floatingNode = document.querySelector('[data-topic-id="float_1"]') as HTMLElement
    expect(floatingNode).not.toBeNull()

    fireEvent.pointerDown(floatingNode, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(viewport, { button: 0, clientX: 180, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(viewport, { button: 0, clientX: 180, clientY: 140, pointerId: 1 })

    // 位移 80/40 世界单位（默认缩放 1），叠加原位置 (0, 300)
    expect(moveTopicFreely).toHaveBeenCalledWith('float_1', 80, 340)
    // 浮动主题不该被当成结构移动
    expect(moveTopic).not.toHaveBeenCalled()
  })

  it('树内普通主题仍然走结构移动，不会被误判成自由摆放', () => {
    const { session, moveTopicFreely } = makeSessionWithFloatingTopic()
    renderWithApp(<CanvasHost session={session} />)

    const stage = screen.getByLabelText('思维导图舞台')
    const viewport = stage.querySelector('.mindmap-scene') as HTMLElement
    const branchNode = document.querySelector('[data-topic-id="topic_child"]') as HTMLElement

    fireEvent.pointerDown(branchNode, { button: 0, clientX: 100, clientY: 100, pointerId: 2 })
    fireEvent.pointerMove(viewport, { button: 0, clientX: 180, clientY: 140, pointerId: 2 })
    fireEvent.pointerUp(viewport, { button: 0, clientX: 180, clientY: 140, pointerId: 2 })

    // 没开分支自由布局、也不是浮动主题 → 不该写自由位置
    expect(moveTopicFreely).not.toHaveBeenCalled()
  })
})

/**
 * 附件指示器（回形针）。
 *
 * 关键在"**只有**附件的主题"：节点那一行富内容图标由一个布尔量决定是否渲染，
 * 新字段忘了并进那个布尔量时，图标会整个消失——而且只在"该主题没有别的富内容"
 * 时才暴露，很容易漏。
 */
describe('主题附件指示器', () => {
  function makeSessionWithAttachment() {
    return createSessionStub({
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
                  id: 'topic_with_attachment',
                  text: '带附件',
                  collapsed: false,
                  children: [],
                  // 刻意**只**给附件：没有标记/备注/链接
                  attachment: { assetId: 'asset_pdf', name: '方案草案.pdf', byteSize: 2048 },
                },
                { id: 'topic_plain', text: '没有附件', collapsed: false, children: [] },
              ],
            },
          },
        ],
      },
    })
  }

  it('只带附件的主题也渲染回形针；没有附件的不渲染', () => {
    renderWithApp(<CanvasHost session={makeSessionWithAttachment()} />)

    const withAttachment = document.querySelector('[data-topic-id="topic_with_attachment"]')
    const plain = document.querySelector('[data-topic-id="topic_plain"]')

    expect(withAttachment?.querySelector('.mindmap-node__attachment-indicator')).not.toBeNull()
    // 提示里要能看出是哪份文件（附件名可能带路径，这里只取末段）
    expect(
      withAttachment?.querySelector('.mindmap-node__attachment-indicator')?.getAttribute('title'),
    ).toBe('附件：方案草案.pdf')

    // 负向对照：没有附件的主题不该出现回形针
    expect(plain?.querySelector('.mindmap-node__attachment-indicator')).toBeNull()
  })
})

/**
 * 节点语音备注图标。
 *
 * 与附件那一组同构：同样受"这一行富内容是否渲染"的聚合布尔量控制，
 * 而且它还是**按钮**（点一下播放），所以额外钉住两点：
 * ① 提示里带时长（用户不点也能看出录了多久）；
 * ② 点击要 `stopPropagation` —— 节点本身也是按钮，不拦会被当成"选中主题"。
 */
describe('主题语音备注指示器', () => {
  function makeSessionWithVoiceNote() {
    return createSessionStub({
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
                  id: 'topic_with_voice',
                  text: '带语音',
                  collapsed: false,
                  children: [],
                  // 刻意**只**给语音备注：没有标记/备注/链接/附件
                  voiceNote: {
                    assetId: 'asset_voice',
                    mimeType: 'audio/webm',
                    byteSize: 8192,
                    durationMs: 3200,
                  },
                },
                { id: 'topic_plain', text: '没有语音', collapsed: false, children: [] },
              ],
            },
          },
        ],
      },
    })
  }

  it('只带语音备注的主题也渲染话筒图标；没有的不渲染', () => {
    renderWithApp(<CanvasHost session={makeSessionWithVoiceNote()} />)

    const withVoice = document.querySelector('[data-topic-id="topic_with_voice"]')
    const plain = document.querySelector('[data-topic-id="topic_plain"]')
    const indicator = withVoice?.querySelector('.mindmap-node__voice-indicator')

    expect(indicator).not.toBeNull()
    // 时长要出现在提示里（3.2 秒 → 0:03）
    expect(indicator?.getAttribute('title')).toBe('语音备注 0:03')
    expect(indicator?.getAttribute('aria-label')).toBe('播放语音备注（0:03）')

    expect(plain?.querySelector('.mindmap-node__voice-indicator')).toBeNull()
  })

  it('图标是按钮（可交互），而不是纯展示元素', () => {
    // 为什么不在这里测"点一下会播放"：jsdom 没有音频实现、也拿不到
    // `readAssetDataUrl` 的稳定桩，点击后的状态会被异步失败复位 ——
    // 断言"点了之后 aria-label 变成停止"会时灵时不灵（**没有鉴别力的测试比没有更糟**）。
    // 播放链路交给真引擎取证：`dev/capture-voice-note.mjs`（假麦克风录取 → 落库 → 播放）。
    renderWithApp(<CanvasHost session={makeSessionWithVoiceNote()} />)

    const indicator = document.querySelector('.mindmap-node__voice-indicator')
    expect(indicator?.tagName).toBe('BUTTON')
    expect(indicator?.getAttribute('type')).toBe('button')
  })
})

/**
 * meta 图标行的**跨端一致性**：屏幕上的顺序与图形必须就是导出用的那套。
 *
 * 这一组是本轮修的真实缺陷的验收：此前屏幕上是"便签纸 + 链条"，
 * 导出里是"黄圆 + 蓝圆"，而附件 / 语音备注在导出里根本不存在。
 */
describe('meta 图标行的顺序与图形', () => {
  const ALL_META_TOPIC_ID = 'topic_all_meta'

  function makeSessionWithAllMeta() {
    return createSessionStub({
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
                  id: ALL_META_TOPIC_ID,
                  text: '全都带上',
                  collapsed: false,
                  children: [],
                  markers: [{ id: 'star' }],
                  notes: '一段备注',
                  attachment: { assetId: 'asset_pdf', name: '方案草案.pdf' },
                  voiceNote: { assetId: 'asset_voice', mimeType: 'audio/webm' },
                  link: { url: 'https://example.com' },
                },
              ],
            },
          },
        ],
      },
    })
  }

  it('DOM 里的图标顺序与 TOPIC_META_ICON_ORDER 一致（与导出端同一个契约）', () => {
    renderWithApp(<CanvasHost session={makeSessionWithAllMeta()} />)

    const meta = document.querySelector(
      `[data-topic-id="${ALL_META_TOPIC_ID}"] .mindmap-node__meta`,
    )
    expect(meta).not.toBeNull()

    // 每一类图标的判定靠它的选择器特征；用「首个命中元素的出现次序」表达顺序
    const ordered = TOPIC_META_ICON_ORDER.map((kind) => ({
      kind,
      order: Array.from(meta!.children).findIndex((child) => child.matches(META_SELECTOR[kind])),
    }))

    for (const item of ordered) {
      expect(item.order, `DOM 里没有找到 ${item.kind} 图标`).toBeGreaterThanOrEqual(0)
    }
    const sorted = [...ordered]
      .sort((a, b) => a.order - b.order)
      .map((item) => item.kind)
    expect(sorted).toEqual([...TOPIC_META_ICON_ORDER])
  })

  it('DOM 画的图形就是导出端用的那段字符串（同一来源，不是"看起来像"）', () => {
    renderWithApp(<CanvasHost session={makeSessionWithAllMeta()} />)

    const node = document.querySelector(`[data-topic-id="${ALL_META_TOPIC_ID}"]`)!
    const cases: Array<[string, string]> = [
      ['.mindmap-node__note-indicator svg', NOTE_ICON_SVG_INNER],
      ['.mindmap-node__attachment-indicator svg', ATTACHMENT_ICON_SVG_INNER],
      ['.mindmap-node__voice-indicator svg', VOICE_NOTE_ICON_SVG_INNER],
      ['.mindmap-node__link-indicator svg', LINK_ICON_SVG_INNER],
    ]

    for (const [selector, expected] of cases) {
      const svg = node.querySelector(selector)
      expect(svg, `${selector} 没渲染出来`).not.toBeNull()
      // 归一化：属性之间的空白由 HTML 序列化决定，这里只比"元素与属性"
      const actual = normalizeSvg(svg!.innerHTML)
      expect(actual, `${selector} 的图形与导出端常量不一致`).toBe(normalizeSvg(expected))
    }
  })
})

/**
 * 归一化 SVG 片段，便于与常量逐字比较。
 *
 * 只抹掉"序列化方式"的差异，不动元素与属性本身：
 *   - 属性之间/标签之间的空白
 *   - HTML 序列化会把自闭合的空元素写成 `</path>`，常量里写的是 `/>`
 */
function normalizeSvg(markup: string): string {
  return markup
    .replace(/\s+/g, ' ')
    .replace(/\s*\/>/g, '/>')
    .replace(/>\s+</g, '><')
    .replace(/>\s*<\/(path|circle|rect|polygon|line)>/g, '/>')
    .trim()
}

/** 每一类 meta 图标在 DOM 里的判定选择器。 */
const META_SELECTOR: Record<TopicMetaIconKind, string> = {
  marker: '.mindmap-node__marker',
  notes: '.mindmap-node__note-indicator',
  attachment: '.mindmap-node__attachment-indicator',
  voiceNote: '.mindmap-node__voice-indicator',
  link: '.mindmap-node__link-indicator',
}

/**
 * 节点贴纸：渲染、拖动提交、以及"没挪动就不写文档"。
 *
 * 位置用 `calc(50% ± Npx)` 表达（相对节点中心），与
 * computeTopicStickerPlacement 的语义一致——PNG/SVG 两端用同一个函数拿绝对坐标。
 */
describe('主题贴纸', () => {
  function makeSessionWithSticker() {
    const setTopicStickers = vi.fn(async () => {})
    const session = createSessionStub({
      setTopicStickers,
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
                  id: 'topic_stickered',
                  text: '带贴纸',
                  collapsed: false,
                  children: [],
                  stickers: [{ id: 's1', stickerId: 'star', offsetX: -14, offsetY: -20 }],
                },
                { id: 'topic_plain', text: '没有贴纸', collapsed: false, children: [] },
              ],
            },
          },
        ],
      },
    })
    return { session, setTopicStickers }
  }

  it('渲染贴纸并按存下来的偏移定位；没有贴纸的主题不渲染', () => {
    renderWithApp(<CanvasHost session={makeSessionWithSticker().session} />)

    const stickered = document.querySelector('[data-topic-id="topic_stickered"]')
    const sticker = stickered?.querySelector('.mindmap-node__sticker') as HTMLElement | null
    expect(sticker).not.toBeNull()
    // 负数写成减法：calc(50% - 14px)
    expect(sticker!.style.left).toBe('calc(50% - 14px)')
    expect(sticker!.style.top).toBe('calc(50% - 20px)')
    // 悬停提示取自素材库的标签，便于识别
    expect(sticker!.getAttribute('title')).toBe('星星')

    const plain = document.querySelector('[data-topic-id="topic_plain"]')
    expect(plain?.querySelector('.mindmap-node__sticker')).toBeNull()
  })

  it('拖动贴纸：松手时整批提交一次（一次拖动 = 一条撤销记录）', () => {
    const { session, setTopicStickers } = makeSessionWithSticker()
    renderWithApp(<CanvasHost session={session} />)

    const sticker = document.querySelector(
      '[data-topic-id="topic_stickered"] .mindmap-node__sticker',
    ) as HTMLElement

    fireEvent.pointerDown(sticker, { button: 0, clientX: 100, clientY: 100, pointerId: 5 })
    fireEvent.pointerMove(sticker, { button: 0, clientX: 140, clientY: 130, pointerId: 5 })
    fireEvent.pointerUp(sticker, { button: 0, clientX: 140, clientY: 130, pointerId: 5 })

    expect(setTopicStickers).toHaveBeenCalledTimes(1)
    const [topicId, next] = setTopicStickers.mock.calls[0] as unknown as [
      string,
      Array<{ id: string; offsetX?: number; offsetY?: number }>,
    ]
    expect(topicId).toBe('topic_stickered')
    expect(next).toHaveLength(1)
    // 默认缩放 1：位移 (40, 30) 直接叠加到原偏移上
    expect(next[0].offsetX).toBeCloseTo(-14 + 40)
    expect(next[0].offsetY).toBeCloseTo(-20 + 30)
  })

  it('按下即松手（没挪动）不写文档', () => {
    const { session, setTopicStickers } = makeSessionWithSticker()
    renderWithApp(<CanvasHost session={session} />)

    const sticker = document.querySelector(
      '[data-topic-id="topic_stickered"] .mindmap-node__sticker',
    ) as HTMLElement

    fireEvent.pointerDown(sticker, { button: 0, clientX: 100, clientY: 100, pointerId: 6 })
    fireEvent.pointerUp(sticker, { button: 0, clientX: 100, clientY: 100, pointerId: 6 })

    // 否则每次点一下贴纸都会往撤销栈里塞一条空记录
    expect(setTopicStickers).not.toHaveBeenCalled()
  })
})

/**
 * 主题标注（callout）。
 *
 * 与贴纸同属"节点上的装饰对象"，所以照同一套规则验证：
 * 有内容才渲染、拖动松手才提交一次、没挪动就不写文档（否则点一下就多一条撤销记录）。
 */
describe('主题标注', () => {
  function makeSessionWithCallout() {
    const setTopicCallout = vi.fn(async () => {})
    const session = createSessionStub({
      setTopicCallout,
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
                  id: 'topic_called',
                  text: '带标注',
                  collapsed: false,
                  children: [],
                  callout: { text: '这是一段较长的说明文本，用来验证换行之后框会变高。', offsetX: 260, offsetY: -30 },
                },
                { id: 'topic_plain', text: '没有标注', collapsed: false, children: [] },
              ],
            },
          },
        ],
      },
    })
    return { session, setTopicCallout }
  }

  it('渲染标注框与文本行；没有标注的主题不渲染', () => {
    renderWithApp(<CanvasHost session={makeSessionWithCallout().session} />)

    const called = document.querySelector('[data-topic-id="topic_called"]')
    const callout = called?.querySelector('.mindmap-node__callout') as HTMLElement | null
    expect(callout).not.toBeNull()
    // 文本按 wrapText 切行后逐行渲染（不用 CSS 换行，避免与导出端行数不一致）
    expect(callout!.querySelectorAll('.mindmap-node__callout-line').length).toBeGreaterThan(0)
    // 存下来的偏移直接决定位置
    expect(callout!.style.left).toBe('calc(50% + 260px)')
    expect(callout!.style.top).toBe('calc(50% - 30px)')

    const plain = document.querySelector('[data-topic-id="topic_plain"]')
    expect(plain?.querySelector('.mindmap-node__callout')).toBeNull()
  })

  it('拖动标注：松手时提交一次（一次拖动 = 一条撤销记录）', () => {
    const { session, setTopicCallout } = makeSessionWithCallout()
    renderWithApp(<CanvasHost session={session} />)

    const callout = document.querySelector(
      '[data-topic-id="topic_called"] .mindmap-node__callout',
    ) as HTMLElement

    fireEvent.pointerDown(callout, { button: 0, clientX: 200, clientY: 200, pointerId: 9 })
    fireEvent.pointerMove(callout, { button: 0, clientX: 240, clientY: 170, pointerId: 9 })
    fireEvent.pointerUp(callout, { button: 0, clientX: 240, clientY: 170, pointerId: 9 })

    expect(setTopicCallout).toHaveBeenCalledTimes(1)
    const [topicId, next] = setTopicCallout.mock.calls[0] as unknown as [
      string,
      { text: string; offsetX?: number; offsetY?: number },
    ]
    expect(topicId).toBe('topic_called')
    // 位移 (40, -30) 叠加到原偏移 (260, -30) 上
    expect(next.offsetX).toBeCloseTo(300)
    expect(next.offsetY).toBeCloseTo(-60)
    // 文本不能被拖动弄丢
    expect(next.text.length).toBeGreaterThan(0)
  })

  it('按下即松手（没挪动）不写文档', () => {
    const { session, setTopicCallout } = makeSessionWithCallout()
    renderWithApp(<CanvasHost session={session} />)

    const callout = document.querySelector(
      '[data-topic-id="topic_called"] .mindmap-node__callout',
    ) as HTMLElement

    fireEvent.pointerDown(callout, { button: 0, clientX: 200, clientY: 200, pointerId: 10 })
    fireEvent.pointerUp(callout, { button: 0, clientX: 200, clientY: 200, pointerId: 10 })

    expect(setTopicCallout).not.toHaveBeenCalled()
  })
})

/**
 * 画布级插画：拖动（捕获阶段命中）与提交语义。
 *
 * 插画没有 DOM 元素（画在 Canvas 2D 层），所以命中只能靠几何：
 * 这里用与画布**同一个** computeLayout 算出布局偏移，把插画摆在
 * 视口 (100,100) 处，再用指针事件走完整条链路。
 */
describe('画布级插画', () => {
  const rootTopic: TopicSnapshot = {
    id: 'topic_root',
    text: '中心主题',
    collapsed: false,
    children: [{ id: 'topic_child', text: '分支', collapsed: false, children: [] }],
  }

  function makeSessionWithIllustration() {
    const setSheetIllustrations = vi.fn(async () => {})
    const session = createSessionStub({
      setSheetIllustrations,
      document: {
        schemaVersion: '1.0.0',
        documentId: 'doc_1',
        revision: 1,
        activeSheetId: 'sheet_1',
        sheets: [
          {
            id: 'sheet_1',
            title: '主画布',
            rootTopic,
            illustrations: [
              { id: 'ill_1', illustrationId: 'rocket', x: -layoutOffset().x + 100, y: -layoutOffset().y + 100, size: 120 },
            ],
          },
        ],
      },
    })
    return { session, setSheetIllustrations }
  }

  /** 画布内部用的布局偏移：测试据此把插画摆到指定视口坐标上。 */
  function layoutOffset() {
    const layout = computeLayout(
      rootTopic,
      undefined,
      undefined,
      resolveLayoutOptions(resolveCanvasSettings(undefined), undefined),
    )
    return { x: layout.offsetX, y: layout.offsetY }
  }

  it('拖动后按整表替换提交一次，坐标带上位移', () => {
    const { session, setSheetIllustrations } = makeSessionWithIllustration()
    renderWithApp(<CanvasHost session={session} />)

    const viewport = document.querySelector('.mindmap-scene') as HTMLElement
    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100, pointerId: 11 })
    fireEvent.pointerMove(viewport, { button: 0, clientX: 180, clientY: 140, pointerId: 11 })
    fireEvent.pointerUp(viewport, { button: 0, clientX: 180, clientY: 140, pointerId: 11 })

    // 一次拖动 = 一条撤销记录：只提交一次
    expect(setSheetIllustrations).toHaveBeenCalledTimes(1)
    const [sheetId, next] = setSheetIllustrations.mock.calls[0] as unknown as [
      string,
      { id: string; x: number; y: number }[],
    ]
    expect(sheetId).toBe('sheet_1')
    expect(next).toHaveLength(1)
    // 位移 80/40 世界单位（默认缩放 1）
    expect(next[0].x).toBeCloseTo(-layoutOffset().x + 100 + 80, 6)
    expect(next[0].y).toBeCloseTo(-layoutOffset().y + 100 + 40, 6)
  })

  it('没挪动就不写文档（否则点一下也会塞一条空撤销记录）', () => {
    const { session, setSheetIllustrations } = makeSessionWithIllustration()
    renderWithApp(<CanvasHost session={session} />)

    const viewport = document.querySelector('.mindmap-scene') as HTMLElement
    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100, pointerId: 12 })
    fireEvent.pointerUp(viewport, { button: 0, clientX: 100, clientY: 100, pointerId: 12 })

    expect(setSheetIllustrations).not.toHaveBeenCalled()
  })

  it('在插画之外按下不会走插画的拖拽（不该误伤空白处拖拽）', () => {
    const { session, setSheetIllustrations } = makeSessionWithIllustration()
    renderWithApp(<CanvasHost session={session} />)

    const viewport = document.querySelector('.mindmap-scene') as HTMLElement
    fireEvent.pointerDown(viewport, { button: 0, clientX: 600, clientY: 500, pointerId: 13 })
    fireEvent.pointerMove(viewport, { button: 0, clientX: 700, clientY: 560, pointerId: 13 })
    fireEvent.pointerUp(viewport, { button: 0, clientX: 700, clientY: 560, pointerId: 13 })

    expect(setSheetIllustrations).not.toHaveBeenCalled()
  })
})
