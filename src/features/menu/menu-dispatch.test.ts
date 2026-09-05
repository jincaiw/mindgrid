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
        { id: 'topic_a', text: '规划主题', collapsed: false, children: [] },
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
    openDocument: asyncNoop(),
    saveDocument: asyncNoop(),
    saveDocumentAs: asyncNoop(),
    importMarkdownOutline: asyncNoop(),
    exportMarkdownOutline: asyncNoop(),
    exportPngImage: asyncNoop(),
    exportSvgImage: asyncNoop(),
    exportPdfDocument: asyncNoop(),
    exportRecoveryCopy: asyncNoop(),
    undo: asyncNoop(),
    redo: asyncNoop(),
    toggleTopicCollapsed: asyncNoop(),
    createChildTopic: asyncNoop(),
    createSiblingTopic: asyncNoop(),
    createParentTopic: asyncNoop(),
    createRelationship: asyncNoop(),
    createBoundary: asyncNoop(),
    createSummary: asyncNoop(),
    setSheetChartType: asyncNoop(),
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
    toggleGanttMode: vi.fn(),
    toggleInspector: vi.fn(),
    toggleSidebar: vi.fn(),
    startPresentation: vi.fn(),
    startPitch: vi.fn(),
    openSearch: vi.fn(),
    resetZoom: vi.fn(),
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
      ['file.open', 'openDocument'],
      ['file.save', 'saveDocument'],
      ['file.save-as', 'saveDocumentAs'],
      ['file.import-markdown', 'importMarkdownOutline'],
      ['file.export-markdown', 'exportMarkdownOutline'],
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

  it('blocks file dialogs outside the desktop runtime but still allows new document', () => {
    const { ctx, session, notify } = makeHarness({ desktopFileActionsEnabled: false })

    runMenuCommand('file.save', ctx)
    expect(session.saveDocument).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('该操作需要文件对话框，仅在桌面端可用')

    // 新建文档不弹对话框，浏览器里也要能用
    runMenuCommand('file.new', ctx)
    expect(session.createNewDocument).toHaveBeenCalledTimes(1)
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
    expect(setSelectedTopicIds).toHaveBeenCalledWith(['topic_root', 'topic_a', 'topic_b'])
  })

  it('forwards clipboard commands to the canvas host', () => {
    for (const id of ['edit.copy', 'edit.cut', 'edit.paste'] as const) {
      const { ctx, requestCanvasCommand } = makeHarness()
      runMenuCommand(id, ctx)
      expect(requestCanvasCommand).toHaveBeenCalledWith(id)
    }
  })
})

describe('视图', () => {
  it('maps each view toggle to its own state setter', () => {
    const { ctx, ...calls } = makeHarness()

    runMenuCommand('view.zen', ctx)
    runMenuCommand('view.gantt', ctx)
    runMenuCommand('view.inspector', ctx)
    runMenuCommand('view.sidebar', ctx)
    runMenuCommand('view.search', ctx)
    runMenuCommand('view.reset-zoom', ctx)

    expect(calls.toggleZenMode).toHaveBeenCalledTimes(1)
    expect(calls.toggleGanttMode).toHaveBeenCalledTimes(1)
    expect(calls.toggleInspector).toHaveBeenCalledTimes(1)
    expect(calls.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(calls.openSearch).toHaveBeenCalledTimes(1)
    expect(calls.resetZoom).toHaveBeenCalledTimes(1)
  })

  it('treats the format panel toggle as the inspector toggle', () => {
    const { ctx, toggleInspector } = makeHarness()
    runMenuCommand('format.panel', ctx)
    expect(toggleInspector).toHaveBeenCalledTimes(1)
  })

  it('starts presentation and forwards recenter to the canvas host', () => {
    const { ctx, startPresentation, requestCanvasCommand } = makeHarness()
    runMenuCommand('view.present', ctx)
    runMenuCommand('view.recenter', ctx)
    expect(startPresentation).toHaveBeenCalledTimes(1)
    expect(requestCanvasCommand).toHaveBeenCalledWith('view.recenter')
  })

  it('starts pitch mode independently of presentation (批次 C6：两者并存)', () => {
    const { ctx, startPitch, startPresentation } = makeHarness()
    runMenuCommand('view.pitch', ctx)
    expect(startPitch).toHaveBeenCalledTimes(1)
    expect(startPresentation).not.toHaveBeenCalled()
  })

  it('toggles collapse on the active topic, falling back to the sheet root', () => {
    const { ctx: withActive, session: s1 } = makeHarness({ activeTopicId: 'topic_a' })
    runMenuCommand('view.collapse', withActive)
    expect(s1.toggleTopicCollapsed).toHaveBeenCalledWith('topic_a')

    const { ctx: withFallback, session: s2 } = makeHarness()
    runMenuCommand('view.collapse', withFallback)
    expect(s2.toggleTopicCollapsed).toHaveBeenCalledWith('topic_root')
  })
})

describe('插入', () => {
  it('creates child / sibling / parent on the resolved topic', () => {
    const { ctx, session } = makeHarness({ activeTopicId: 'topic_a' })
    runMenuCommand('insert.child', ctx)
    runMenuCommand('insert.sibling', ctx)
    runMenuCommand('insert.parent', ctx)
    expect(session.createChildTopic).toHaveBeenCalledWith('topic_a')
    expect(session.createSiblingTopic).toHaveBeenCalledWith('topic_a', 'after')
    expect(session.createParentTopic).toHaveBeenCalledWith('topic_a')
  })

  it('focuses the inspector style subpage when exactly one topic is selected', () => {
    for (const id of ['insert.notes', 'insert.labels', 'insert.link', 'insert.marker', 'insert.image'] as const) {
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
})

describe('格式 / 工具 / 帮助', () => {
  it('switches the chart type from the structure submenu', () => {
    const cases: Array<[Parameters<typeof runMenuCommand>[0], string]> = [
      ['format.chart.mindmap', 'mindmap'],
      ['format.chart.logic', 'logic'],
      ['format.chart.tree', 'tree'],
      ['format.chart.org', 'org'],
      ['format.chart.fishbone', 'fishbone'],
      ['format.chart.timeline', 'timeline'],
    ]

    for (const [id, chartType] of cases) {
      const { ctx, session } = makeHarness()
      runMenuCommand(id, ctx)
      expect(session.setSheetChartType).toHaveBeenCalledWith('sheet_1', chartType)
    }
  })

  it('delegates tools and help to the host callbacks', () => {
    const { ctx, checkForUpdates, cycleTheme, openShortcutsHelp } = makeHarness()
    runMenuCommand('tools.check-update', ctx)
    runMenuCommand('tools.cycle-theme', ctx)
    runMenuCommand('help.shortcuts', ctx)
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    expect(cycleTheme).toHaveBeenCalledTimes(1)
    expect(openShortcutsHelp).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is no active sheet', () => {
    const { ctx, session, setSelectedTopicIds } = makeHarness({ activeSheet: null })
    runMenuCommand('edit.select-all', ctx)
    runMenuCommand('format.chart.tree', ctx)
    expect(setSelectedTopicIds).not.toHaveBeenCalled()
    expect(session.setSheetChartType).not.toHaveBeenCalled()
  })
})
