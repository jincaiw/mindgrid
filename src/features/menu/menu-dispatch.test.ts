import { vi } from 'vitest'
import type { DocumentSession } from '../document/use-document-session'
import type { SheetSnapshot } from '../../lib/document/types'
import { runMenuCommand, type MenuCommandContext } from './menu-dispatch'

function makeSheet(): SheetSnapshot {
  return {
    id: 'sheet_1',
    title: '主画布',
    rootTopic: {
      id: 'topic_root',
      text: '中心主题',
      collapsed: false,
      children: [
        {
          id: 'topic_a',
          text: '规划主题',
          collapsed: false,
          children: [{ id: 'topic_a1', text: '子规划', collapsed: false, children: [] }],
        },
        { id: 'topic_b', text: '复盘主题', collapsed: false, children: [] },
      ],
    },
  }
}

/** 只把被测分支会用到的方法做成 spy，其余给空实现（DocumentSession 全量约 60 个方法）。 */
function makeSession(overrides: Partial<DocumentSession> = {}): DocumentSession {
  // 每个方法都必须是 spy：默认实现若只是普通 async 函数，
  // toHaveBeenCalledWith 会直接报 "[AsyncFunction] is not a spy"。
  const asyncNoop = () => vi.fn(async () => {})

  return {
    createNewDocument: asyncNoop(),
    createSheet: asyncNoop(),
    openDocument: asyncNoop(),
    saveDocument: asyncNoop(),
    saveDocumentAs: asyncNoop(),
    importMarkdownOutline: asyncNoop(),
    importOpmlOutline: asyncNoop(),
    importDocxOutline: asyncNoop(),
    exportMarkdownOutline: asyncNoop(),
    exportOpmlOutline: asyncNoop(),
    exportPngImage: asyncNoop(),
    exportSvgImage: asyncNoop(),
    exportPdfDocument: asyncNoop(),
    exportRecoveryCopy: asyncNoop(),
    undo: asyncNoop(),
    redo: asyncNoop(),
    toggleTopicCollapsed: asyncNoop(),
    setTopicsCollapsed: asyncNoop(),
    deleteTopic: asyncNoop(),
    deleteTopics: asyncNoop(),
    setTopicStyleRef: asyncNoop(),
    setTopicStyleOverrides: asyncNoop(),
    createChildTopic: asyncNoop(),
    createSiblingTopic: asyncNoop(),
    createParentTopic: asyncNoop(),
    createRelationship: asyncNoop(),
    createBoundary: asyncNoop(),
    createSummary: asyncNoop(),
    ...overrides,
  } as unknown as DocumentSession
}

interface HarnessOptions {
  selectedTopicIds?: string[]
  activeTopicId?: string | null
  desktopFileActionsEnabled?: boolean
  activeSheet?: SheetSnapshot | null
  session?: Partial<DocumentSession>
}

function makeHarness(options: HarnessOptions = {}) {
  const session = makeSession(options.session)
  const calls = {
    notify: vi.fn(),
    setSelectedTopicIds: vi.fn(),
    toggleZenMode: vi.fn(),
    setOutlineMode: vi.fn(),
    toggleGanttMode: vi.fn(),
    toggleInspector: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleToolbar: vi.fn(),
    toggleTabBar: vi.fn(),
    startPresentation: vi.fn(),
    startPitch: vi.fn(),
    openSearch: vi.fn(),
    focusInspectorTopicTab: vi.fn(),
    openShortcutsHelp: vi.fn(),
    checkForUpdates: vi.fn(),
    cycleTheme: vi.fn(),
    requestCanvasCommand: vi.fn(),
  }

  const ctx: MenuCommandContext = {
    session,
    activeSheet: options.activeSheet === undefined ? makeSheet() : options.activeSheet,
    selectedTopicIds: options.selectedTopicIds ?? [],
    desktopFileActionsEnabled: options.desktopFileActionsEnabled ?? true,
    ...calls,
  }

  // activeTopicId 走 session（resolveTopicId 从 session 读），这里补成 spy 可写
  Object.defineProperty(session, 'activeTopicId', {
    configurable: true,
    value: options.activeTopicId ?? null,
  })

  return { ctx, session, ...calls }
}

describe('文件', () => {
  it('routes each file action to the matching session method', () => {
    const cases: Array<[Parameters<typeof runMenuCommand>[0], keyof DocumentSession]> = [
      ['file.new', 'createNewDocument'],
      ['file.new-sheet', 'createSheet'],
      ['file.open', 'openDocument'],
      ['file.save', 'saveDocument'],
      ['file.save-as', 'saveDocumentAs'],
      ['file.import-markdown', 'importMarkdownOutline'],
      ['file.import-opml', 'importOpmlOutline'],
      ['file.import-docx', 'importDocxOutline'],
      ['file.export-markdown', 'exportMarkdownOutline'],
      ['file.export-opml', 'exportOpmlOutline'],
      ['file.export-png', 'exportPngImage'],
      ['file.export-svg', 'exportSvgImage'],
      ['file.export-pdf', 'exportPdfDocument'],
      ['file.export-recovery', 'exportRecoveryCopy'],
    ]

    for (const [id, method] of cases) {
      const { ctx, session, notify } = makeHarness()
      runMenuCommand(id, ctx)
      expect(session[method]).toHaveBeenCalledTimes(1)
      expect(notify).not.toHaveBeenCalled()
    }
  })

  it('blocks file dialogs outside the desktop runtime but still allows in-memory actions', () => {
    const { ctx, session, notify } = makeHarness({ desktopFileActionsEnabled: false })

    runMenuCommand('file.save', ctx)
    expect(session.saveDocument).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('该操作需要文件对话框，仅在桌面端可用')

    // 新建文档与新建画布不弹对话框，浏览器里也要能用
    runMenuCommand('file.new', ctx)
    runMenuCommand('file.new-sheet', ctx)
    expect(session.createNewDocument).toHaveBeenCalledTimes(1)
    expect(session.createSheet).toHaveBeenCalledTimes(1)
  })
})

describe('编辑', () => {
  it('forwards undo and redo to the session', () => {
    const { ctx, session } = makeHarness()
    runMenuCommand('edit.undo', ctx)
    runMenuCommand('edit.redo', ctx)
    expect(session.undo).toHaveBeenCalledTimes(1)
    expect(session.redo).toHaveBeenCalledTimes(1)
  })

  it('selects every visible topic on select-all', () => {
    const { ctx, setSelectedTopicIds } = makeHarness()
    runMenuCommand('edit.select-all', ctx)
    expect(setSelectedTopicIds).toHaveBeenCalledWith([
      'topic_root',
      'topic_a',
      'topic_a1',
      'topic_b',
    ])
  })

  it('forwards clipboard, duplication and style commands to the canvas host', () => {
    const forwarded = [
      'edit.copy',
      'edit.cut',
      'edit.paste',
      'edit.duplicate',
      'edit.copy-style',
      'edit.paste-style',
      'edit.go-to-center',
    ] as const

    for (const id of forwarded) {
      const { ctx, requestCanvasCommand } = makeHarness()
      runMenuCommand(id, ctx)
      expect(requestCanvasCommand).toHaveBeenCalledWith(id)
    }
  })

  it('deletes a single topic, or the whole multi-selection at once', () => {
    const { ctx: single, session: s1 } = makeHarness({ activeTopicId: 'topic_a' })
    runMenuCommand('edit.delete-topic', single)
    expect(s1.deleteTopic).toHaveBeenCalledWith('topic_a')
    expect(s1.deleteTopics).not.toHaveBeenCalled()

    const { ctx: multi, session: s2 } = makeHarness({
      selectedTopicIds: ['topic_a', 'topic_b'],
    })
    runMenuCommand('edit.delete-topic', multi)
    expect(s2.deleteTopics).toHaveBeenCalledWith(['topic_a', 'topic_b'])
    expect(s2.deleteTopic).not.toHaveBeenCalled()
  })

  it('resets style by clearing both the style reference and the overrides', async () => {
    const { ctx, session } = makeHarness({ activeTopicId: 'topic_a' })
    runMenuCommand('edit.reset-style', ctx)
    // 两次写入是异步串行，等一轮微任务再断言
    await Promise.resolve()
    await Promise.resolve()
    expect(session.setTopicStyleRef).toHaveBeenCalledWith('topic_a', null)
    expect(session.setTopicStyleOverrides).toHaveBeenCalledWith('topic_a', null)
  })

  it('expands only the selected topic for expand-subtopics', () => {
    const { ctx, session } = makeHarness({ activeTopicId: 'topic_a' })
    runMenuCommand('edit.expand-subtopics', ctx)
    expect(session.setTopicsCollapsed).toHaveBeenCalledWith(['topic_a'], false)
  })

  it('expands the whole subtree for expand-all', () => {
    const { ctx, session } = makeHarness({ activeTopicId: 'topic_a' })
    runMenuCommand('edit.expand-all', ctx)
    expect(session.setTopicsCollapsed).toHaveBeenCalledWith(['topic_a', 'topic_a1'], false)
  })

  it('opens search from find', () => {
    const { ctx, openSearch } = makeHarness()
    runMenuCommand('edit.find', ctx)
    expect(openSearch).toHaveBeenCalledTimes(1)
  })

  it('toggles collapse on the active topic, falling back to the sheet root', () => {
    const { ctx: withActive, session: s1 } = makeHarness({ activeTopicId: 'topic_a' })
    runMenuCommand('edit.collapse', withActive)
    expect(s1.toggleTopicCollapsed).toHaveBeenCalledWith('topic_a')

    const { ctx: withFallback, session: s2 } = makeHarness()
    runMenuCommand('edit.collapse', withFallback)
    expect(s2.toggleTopicCollapsed).toHaveBeenCalledWith('topic_root')
  })
})

describe('插入', () => {
  it('creates child / sibling-after / sibling-before / parent on the resolved topic', () => {
    const { ctx, session } = makeHarness({ activeTopicId: 'topic_a' })
    runMenuCommand('insert.child', ctx)
    runMenuCommand('insert.sibling-after', ctx)
    runMenuCommand('insert.sibling-before', ctx)
    runMenuCommand('insert.parent', ctx)
    expect(session.createChildTopic).toHaveBeenCalledWith('topic_a')
    expect(session.createSiblingTopic).toHaveBeenCalledWith('topic_a', 'after')
    expect(session.createSiblingTopic).toHaveBeenCalledWith('topic_a', 'before')
    expect(session.createParentTopic).toHaveBeenCalledWith('topic_a')
  })

  it('focuses the inspector style subpage when exactly one topic is selected', () => {
    const richContent = [
      'insert.notes',
      'insert.labels',
      'insert.task',
      'insert.link',
      'insert.marker',
      'insert.image',
    ] as const

    for (const id of richContent) {
      const { ctx, focusInspectorTopicTab, notify } = makeHarness({
        selectedTopicIds: ['topic_a'],
      })
      runMenuCommand(id, ctx)
      expect(focusInspectorTopicTab).toHaveBeenCalledTimes(1)
      expect(notify).not.toHaveBeenCalled()
    }
  })

  it('asks for a single topic before editing rich content', () => {
    const { ctx, focusInspectorTopicTab, notify } = makeHarness({ selectedTopicIds: [] })
    runMenuCommand('insert.notes', ctx)
    expect(focusInspectorTopicTab).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('请先选中一个主题')
  })

  it('creates a relationship from a two-topic selection', () => {
    const { ctx, session } = makeHarness({ selectedTopicIds: ['topic_a', 'topic_b'] })
    runMenuCommand('insert.relationship', ctx)
    expect(session.createRelationship).toHaveBeenCalledWith('topic_a', 'topic_b', null)
  })

  it('asks for two topics before creating a relationship', () => {
    const { ctx, session, notify } = makeHarness({ selectedTopicIds: ['topic_a'] })
    runMenuCommand('insert.relationship', ctx)
    expect(session.createRelationship).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('请先选中两个主题')
  })

  it('creates boundary and summary from a multi-selection in document order', () => {
    const { ctx: bctx, session: bs } = makeHarness({
      selectedTopicIds: ['topic_b', 'topic_a'],
    })
    runMenuCommand('insert.boundary', bctx)
    expect(bs.createBoundary).toHaveBeenCalledWith('sheet_1', ['topic_a', 'topic_b'], '分组')

    const { ctx: sctx, session: ss } = makeHarness({
      selectedTopicIds: ['topic_a', 'topic_b'],
    })
    runMenuCommand('insert.summary', sctx)
    expect(ss.createSummary).toHaveBeenCalledWith('sheet_1', ['topic_a', 'topic_b'], '概要')
  })

  it('asks for two topics before creating a boundary', () => {
    const { ctx, session, notify } = makeHarness({ selectedTopicIds: ['topic_a'] })
    runMenuCommand('insert.boundary', ctx)
    expect(session.createBoundary).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('请先选中至少 2 个主题')
  })

  it('creates a new sheet from the insert menu', () => {
    const { ctx, session } = makeHarness()
    runMenuCommand('insert.new-sheet', ctx)
    expect(session.createSheet).toHaveBeenCalledTimes(1)
  })
})

describe('工具', () => {
  it('delegates tools to the host callbacks', () => {
    const { ctx, checkForUpdates, cycleTheme, openShortcutsHelp } = makeHarness()
    runMenuCommand('tools.check-update', ctx)
    runMenuCommand('tools.cycle-theme', ctx)
    runMenuCommand('tools.shortcuts', ctx)
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    expect(cycleTheme).toHaveBeenCalledTimes(1)
    expect(openShortcutsHelp).toHaveBeenCalledTimes(1)
  })
})

describe('查看', () => {
  it('sets the view mode explicitly instead of toggling it', () => {
    // 单选项用「置位」而非「取反」：若用 toggle，从快捷键进入大纲后再点「大纲」
    // 会把它关掉，与菜单上仍然勾着的状态自相矛盾。
    const { ctx: mindmap, setOutlineMode: setMindmap } = makeHarness()
    runMenuCommand('view.mode-mindmap', mindmap)
    expect(setMindmap).toHaveBeenCalledWith(false)

    const { ctx: outline, setOutlineMode: setOutline } = makeHarness()
    runMenuCommand('view.mode-outline', outline)
    expect(setOutline).toHaveBeenCalledWith(true)
  })

  it('forwards zoom commands to the canvas host', () => {
    for (const id of [
      'view.zoom-in',
      'view.zoom-out',
      'view.zoom-actual',
      'view.zoom-fit',
    ] as const) {
      const { ctx, requestCanvasCommand } = makeHarness()
      runMenuCommand(id, ctx)
      expect(requestCanvasCommand).toHaveBeenCalledWith(id)
    }
  })

  it('maps each panel visibility toggle to its own setter', () => {
    const { ctx, ...calls } = makeHarness()

    runMenuCommand('view.zen', ctx)
    runMenuCommand('view.gantt', ctx)
    runMenuCommand('view.inspector', ctx)
    runMenuCommand('view.sidebar', ctx)
    runMenuCommand('view.toolbar', ctx)
    runMenuCommand('view.tab-bar', ctx)

    expect(calls.toggleZenMode).toHaveBeenCalledTimes(1)
    expect(calls.toggleGanttMode).toHaveBeenCalledTimes(1)
    expect(calls.toggleInspector).toHaveBeenCalledTimes(1)
    expect(calls.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(calls.toggleToolbar).toHaveBeenCalledTimes(1)
    expect(calls.toggleTabBar).toHaveBeenCalledTimes(1)
  })

  it('starts presentation and pitch independently (批次 C6：两者并存)', () => {
    const { ctx, startPitch, startPresentation } = makeHarness()
    runMenuCommand('view.pitch', ctx)
    expect(startPitch).toHaveBeenCalledTimes(1)
    expect(startPresentation).not.toHaveBeenCalled()

    runMenuCommand('view.present', ctx)
    expect(startPresentation).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is no active sheet', () => {
    const { ctx, setSelectedTopicIds, session } = makeHarness({ activeSheet: null })
    runMenuCommand('edit.select-all', ctx)
    runMenuCommand('edit.expand-all', ctx)
    expect(setSelectedTopicIds).not.toHaveBeenCalled()
    expect(session.setTopicsCollapsed).not.toHaveBeenCalled()
  })
})
