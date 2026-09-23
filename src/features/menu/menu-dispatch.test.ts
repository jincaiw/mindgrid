import { vi } from 'vitest'
import type { DocumentSession } from '../document/use-document-session'
import type { SheetSnapshot } from '../../lib/document/types'
import { FOCUS_BRANCH_UNAVAILABLE_MESSAGE } from '../../lib/document/focus'
import { computeLayout } from '../canvas/layouts'
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
    createSheetFromTopic: asyncNoop(),
    openDocument: asyncNoop(),
    clearRecentFiles: asyncNoop(),
    saveDocument: asyncNoop(),
    saveDocumentAs: asyncNoop(),
    importMarkdownOutline: asyncNoop(),
    importOpmlOutline: asyncNoop(),
    importDocxOutline: asyncNoop(),
    exportMarkdownOutline: asyncNoop(),
    exportOpmlOutline: asyncNoop(),
    exportPngImage: asyncNoop(),
    exportSelectedTopicsPng: async () => {},
    renderPrintImage: async () => null,
    exportSvgImage: asyncNoop(),
    exportPdfDocument: asyncNoop(),
    exportRecoveryCopy: asyncNoop(),
    undo: asyncNoop(),
    redo: asyncNoop(),
    toggleTopicCollapsed: asyncNoop(),
    setTopicsCollapsed: asyncNoop(),
    deleteTopic: asyncNoop(),
    deleteTopics: asyncNoop(),
    deleteTopicOnly: asyncNoop(),
    setTopicStyleRef: asyncNoop(),
    setTopicStyleOverrides: asyncNoop(),
    createChildTopic: asyncNoop(),
    createFloatingTopic: asyncNoop(),
    // 缩进 / 减少缩进走的就是这两个（本轮给 moveTopic 加了插入位置参数）
    moveTopic: asyncNoop(),
    moveTopics: asyncNoop(),
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
  /** 聚焦可见集；缺省视为「未聚焦」（null）。 */
  focusVisibleTopicIds?: ReadonlySet<string> | null
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
    setFocusTopicId: vi.fn(),
    startPresentation: vi.fn(),
    startPitch: vi.fn(),
    openSearch: vi.fn(),
    focusInspectorTopicTab: vi.fn(),
    focusInspectorCanvasTab: vi.fn(),
    openShortcutsHelp: vi.fn(),
    checkForUpdates: vi.fn(),
    cycleTheme: vi.fn(),
    printDocument: vi.fn(),
    exportSelectedTopicsPng: vi.fn(),
    setTopicsPosition: vi.fn(),
    requestCanvasCommand: vi.fn(),
    focusVisibleTopicIds: options.focusVisibleTopicIds ?? null,
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

  it('routes the print action to the print controller', () => {
    const { ctx, printDocument, notify } = makeHarness()

    runMenuCommand('file.print', ctx)

    expect(printDocument).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
  })

  it('拒绝在非桌面端打印（打印面板由 Rust 侧打开）', () => {
    const { ctx, printDocument, notify } = makeHarness({ desktopFileActionsEnabled: false })

    runMenuCommand('file.print', ctx)

    // 用的是打印专属文案：说"需要文件对话框"会指向一个根本不存在的对话框
    expect(printDocument).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('打印需要系统打印面板，仅在桌面端可用')
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
      'insert.attachment',
      'insert.sticker',
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

  it('导出选中主题：把选区交给导出命令', () => {
    const { ctx, exportSelectedTopicsPng, notify } = makeHarness({
      selectedTopicIds: ['topic_a', 'topic_b'],
    })

    runMenuCommand('tools.map-shot', ctx)

    expect(notify).not.toHaveBeenCalled()
    expect(exportSelectedTopicsPng).toHaveBeenCalledTimes(1)
    expect(exportSelectedTopicsPng).toHaveBeenCalledWith(['topic_a', 'topic_b'])
  })

  it('没有选中时不导出，只提示（否则会静默导出一张整图或空图）', () => {
    const { ctx, exportSelectedTopicsPng, notify } = makeHarness({ selectedTopicIds: [] })

    runMenuCommand('tools.map-shot', ctx)

    expect(exportSelectedTopicsPng).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('请先选中要导出的主题（导出会连同各自的子主题一起）')
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

describe('查看 → 仅显示该分支 / 显示全部主题', () => {
  it('聚焦选中主题', () => {
    const { ctx, setFocusTopicId, notify } = makeHarness({ selectedTopicIds: ['topic_a'] })

    runMenuCommand('view.focus-branch', ctx)

    expect(setFocusTopicId).toHaveBeenCalledWith('topic_a')
    expect(notify).not.toHaveBeenCalled()
  })

  it('中心主题不能作为聚焦目标，改为给出提示且不改变状态', () => {
    // 只显示中心主题的"分支"就是整幅图本身，是一次空操作。
    // 若放行，提示条会亮起、画布却毫无变化——"聚焦中"这个说法就和画布对不上了。
    const { ctx, setFocusTopicId, notify } = makeHarness({ selectedTopicIds: ['topic_root'] })

    runMenuCommand('view.focus-branch', ctx)

    expect(setFocusTopicId).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(FOCUS_BRANCH_UNAVAILABLE_MESSAGE)
  })

  it('退出聚焦是幂等的：没有聚焦时点它也不报错', () => {
    const { ctx, setFocusTopicId, notify } = makeHarness()

    runMenuCommand('view.focus-exit', ctx)

    expect(setFocusTopicId).toHaveBeenCalledWith(null)
    expect(notify).not.toHaveBeenCalled()
  })

  it('全选在聚焦时只圈住可见主题', () => {
    // 少了这层收敛，聚焦时按 ⌘A 会把隐藏分支一起选进来，
    // 接一个 Delete 就删掉了屏幕上看不见的整条分支。
    const { ctx, setSelectedTopicIds } = makeHarness({
      focusVisibleTopicIds: new Set(['topic_root', 'topic_a', 'topic_a1']),
    })

    runMenuCommand('edit.select-all', ctx)

    expect(setSelectedTopicIds).toHaveBeenCalledWith(['topic_root', 'topic_a', 'topic_a1'])
    // 负向对照：topic_b 不在可见集里，不能被选进来
    expect((setSelectedTopicIds as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toContain(
      'topic_b',
    )
  })
})

describe('缩进 / 减少缩进', () => {
  it('缩进 = 挂到上一个同级主题下面（追加，不给位置）', () => {
    // 夹具：root → [topic_a(含 topic_a1), topic_b]；topic_b 是第 2 个
    const { ctx, session } = makeHarness({ activeTopicId: 'topic_b' })

    runMenuCommand('edit.indent', ctx)

    expect(session.moveTopic).toHaveBeenCalledWith('topic_b', 'topic_a', '缩进')
  })

  it('已是第一个同级主题时缩进给出提示且不移动', () => {
    const { ctx, session, notify } = makeHarness({ activeTopicId: 'topic_a' })

    runMenuCommand('edit.indent', ctx)

    expect(notify).toHaveBeenCalled()
    expect(session.moveTopic).not.toHaveBeenCalled()
  })

  it('减少缩进 = 挂到祖父下、位置落在原父主题之后', () => {
    // topic_a1 的父是 topic_a，topic_a 在 root 里排第 0 → 目标下标 1
    const { ctx, session } = makeHarness({ activeTopicId: 'topic_a1' })

    runMenuCommand('edit.outdent', ctx)

    expect(session.moveTopic).toHaveBeenCalledWith('topic_a1', 'topic_root', '减少缩进', 1)
  })

  it('父主题已是中心主题时减少缩进给出提示且不移动', () => {
    const { ctx, session, notify } = makeHarness({ activeTopicId: 'topic_a' })

    runMenuCommand('edit.outdent', ctx)

    expect(notify).toHaveBeenCalled()
    expect(session.moveTopic).not.toHaveBeenCalled()
  })

  it('缩进与减少缩进互为反向：缩进后位置回到原处', () => {
    // 夹具是静态的，替身不会真的改树，所以"反向"要用**缩进后**的树再跑一次减少缩进。
    // 缩进后 topic_b 成了 topic_a 的子主题；减少缩进要把它放回 root 下、topic_a 之后（下标 1）。
    const nested = makeSheet()
    const topicA = nested.rootTopic.children[0]
    const [topicB] = nested.rootTopic.children.splice(1, 1)
    topicA.children.push(topicB)

    const { ctx, session } = makeHarness({
      activeTopicId: 'topic_b',
      activeSheet: nested,
    })

    runMenuCommand('edit.outdent', ctx)

    // 原父 topic_a 在 root 里排第 0 → 插到 1，即缩进前它所在的位置
    expect(session.moveTopic).toHaveBeenCalledWith('topic_b', 'topic_root', '减少缩进', 1)
  })
})

describe('插入 → 自由主题', () => {
  it('创建在整幅图下方的空白处（用真实布局算，不猜）', () => {
    const sheet = makeSheet()
    const { ctx, session } = makeHarness({ activeTopicId: 'topic_a', activeSheet: sheet })

    runMenuCommand('insert.free-topic', ctx)

    const layout = computeLayout(sheet.rootTopic, sheet.chartType)
    const bottom = layout.nodes.reduce(
      (max, node) => Math.max(max, node.y + node.height / 2),
      0,
    )
    expect(session.createFloatingTopic).toHaveBeenCalledWith(
      '新建浮动主题',
      0,
      bottom + 80,
    )
  })

  it('默认文案与画布双击创建一致', () => {
    const { ctx, session } = makeHarness({ activeTopicId: 'topic_a' })
    runMenuCommand('insert.free-topic', ctx)

    expect(session.createFloatingTopic).toHaveBeenCalledWith(
      '新建浮动主题',
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('没有活动画布时不创建', () => {
    const { ctx, session } = makeHarness({ activeSheet: null })
    runMenuCommand('insert.free-topic', ctx)

    expect(session.createFloatingTopic).not.toHaveBeenCalled()
  })
})

describe('删除单个主题', () => {
  it('单选时删当前主题', () => {
    const { ctx, session } = makeHarness({ activeTopicId: 'topic_a' })

    runMenuCommand('edit.delete-topic-only', ctx)

    expect(session.deleteTopicOnly).toHaveBeenCalledWith(['topic_a'])
  })

  it('多选时整体删（一次命令，与「删除主题」的多选行为一致）', () => {
    const { ctx, session } = makeHarness({
      activeTopicId: 'topic_a',
      selectedTopicIds: ['topic_a', 'topic_b'],
    })

    runMenuCommand('edit.delete-topic-only', ctx)

    expect(session.deleteTopicOnly).toHaveBeenCalledWith(['topic_a', 'topic_b'])
  })

  it('回退到中心主题时给提示且不调用（中心主题不可删）', () => {
    // resolveTopicId 的最后一级回退是中心主题；这一层要自己挡掉，
    // 不能把"中心主题不能删除"当错误弹出来
    const { ctx, session, notify } = makeHarness({ activeTopicId: null })

    runMenuCommand('edit.delete-topic-only', ctx)

    expect(session.deleteTopicOnly).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalled()
  })

  it('多选里含中心主题时只删其余主题', () => {
    const { ctx, session } = makeHarness({
      activeTopicId: null,
      selectedTopicIds: ['topic_root', 'topic_b'],
    })

    runMenuCommand('edit.delete-topic-only', ctx)

    expect(session.deleteTopicOnly).toHaveBeenCalledWith(['topic_b'])
  })
})

describe('文件 → 最近打开 → 清除菜单', () => {
  it('清空最近列表', () => {
    const { ctx, session } = makeHarness()

    runMenuCommand('file.recent-clear', ctx)

    expect(session.clearRecentFiles).toHaveBeenCalledTimes(1)
  })
})

describe('插入 → 从主题新建画布', () => {
  it('把选中主题交给会话，标题取主题文本', () => {
    // 夹具：root → [topic_a「规划主题」(→「子规划」), topic_b「复盘主题」]
    const { ctx, session } = makeHarness({ activeTopicId: 'topic_b' })

    runMenuCommand('insert.new-sheet-from-topic', ctx)

    expect(session.createSheetFromTopic).toHaveBeenCalledWith('topic_b', '复盘主题')
  })

  it('中心主题不能变成新画布：给提示且不调用', () => {
    const { ctx, session, notify } = makeHarness({ activeTopicId: 'topic_root' })

    runMenuCommand('insert.new-sheet-from-topic', ctx)

    expect(session.createSheetFromTopic).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalled()
  })
})

/**
 * 编辑 → 自由主题对齐。
 *
 * 这里只钉**接线与语义**（调没调批量接口、标签对不对、无关轴有没有被误改、
 * 数量不够时给不给提示）；八种模式的几何算法在 lib/document/topic-align.test.ts 里逐条测过。
 */
type AlignPosition = { topicId: string; offsetX: number; offsetY: number }

/** 取出批量位置的调用参数：vi.fn() 的参数类型是 unknown，这里集中断言一次。 */
function alignedCall(mock: { mock: { calls: unknown[][] } }): [AlignPosition[], string] {
  const call = mock.mock.calls.at(-1)
  expect(call).toBeDefined()
  return call as unknown as [AlignPosition[], string]
}

describe('编辑 → 自由主题对齐', () => {
  function makeSheetWithFloatingTopics(): SheetSnapshot {
    return {
      id: 'sheet_1',
      title: '主画布',
      rootTopic: {
        id: 'topic_root',
        text: '中心主题',
        collapsed: false,
        children: [
          { id: 'topic_a', text: '分支一', collapsed: false, children: [] },
          { id: 'topic_b', text: '分支二', collapsed: false, children: [] },
        ],
      },
      floatingTopics: [
        {
          id: 'float_1',
          text: '自由一',
          collapsed: false,
          children: [],
          layoutHints: { offsetX: 0, offsetY: 300 },
        },
        {
          id: 'float_2',
          text: '自由二',
          collapsed: false,
          children: [],
          layoutHints: { offsetX: 200, offsetY: 360 },
        },
        {
          id: 'float_3',
          text: '自由三',
          collapsed: false,
          children: [],
          layoutHints: { offsetX: 600, offsetY: 420 },
        },
      ],
    }
  }

  it('水平居中：两个自由主题的中心被摆到同一竖线上，纵向坐标不动', () => {
    const { ctx, setTopicsPosition, notify } = makeHarness({
      activeSheet: makeSheetWithFloatingTopics(),
      selectedTopicIds: ['float_1', 'float_2'],
    })

    runMenuCommand('edit.align-center-h', ctx)

    expect(notify).not.toHaveBeenCalled()
    expect(setTopicsPosition).toHaveBeenCalledTimes(1)
    const [positions, label] = alignedCall(setTopicsPosition)
    expect(label).toBe('水平居中')
    const byId = new Map(positions.map((p) => [p.topicId, p]))
    expect([...byId.keys()].sort()).toEqual(['float_1', 'float_2'])
    // 水平居中的定义就是"中心对齐到同一 X"
    expect(byId.get('float_1')!.offsetX).toBeCloseTo(byId.get('float_2')!.offsetX)
    // 纵向不该被顺手改掉
    expect(byId.get('float_1')!.offsetY).toBe(300)
    expect(byId.get('float_2')!.offsetY).toBe(360)
  })

  it('水平分布：三个自由主题的两端不动，中间那个落在两者之间', () => {
    const { ctx, setTopicsPosition } = makeHarness({
      activeSheet: makeSheetWithFloatingTopics(),
      selectedTopicIds: ['float_1', 'float_2', 'float_3'],
    })

    runMenuCommand('edit.align-distribute-h', ctx)

    const [positions, label] = alignedCall(setTopicsPosition)
    expect(label).toBe('水平分布')
    const byId = new Map(positions.map((p) => [p.topicId, p]))
    // 两端固定：按 X 排序后首尾的 X 不变
    expect(byId.get('float_1')!.offsetX).toBeCloseTo(0)
    expect(byId.get('float_3')!.offsetX).toBeCloseTo(600)
    const middle = byId.get('float_2')!.offsetX
    expect(middle).toBeGreaterThan(0)
    expect(middle).toBeLessThan(600)
  })

  it('只选中不可自由摆放的主题时给出提示，不写任何位置', () => {
    // 两个一级分支都存在、也都在布局里，但「分支自由布局」没开 → 不可自由摆放。
    // 刻意选两个**真实存在**的主题：只选一个的话，即使漏掉过滤也会因"数量不足"而通过，
    // 那条断言就没有鉴别力了（踩过）。
    const { ctx, setTopicsPosition, notify } = makeHarness({
      activeSheet: makeSheetWithFloatingTopics(),
      selectedTopicIds: ['topic_a', 'topic_b'],
    })

    runMenuCommand('edit.align-left', ctx)

    expect(setTopicsPosition).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(
      '请先选中至少 2 个可自由摆放的主题（自由主题，或开启「分支自由布局」后的一级分支）',
    )
  })

  it('分布的门槛是三个，两个时给出对应提示', () => {
    const { ctx, setTopicsPosition, notify } = makeHarness({
      activeSheet: makeSheetWithFloatingTopics(),
      selectedTopicIds: ['float_1', 'float_2'],
    })

    runMenuCommand('edit.align-distribute-v', ctx)

    expect(setTopicsPosition).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(
      '请先选中至少 3 个可自由摆放的主题（自由主题，或开启「分支自由布局」后的一级分支）',
    )
  })

  it('八个 id 都走同一条实现（标签取自算法模块，不另写一份文案）', () => {
    const expectations: Array<[Parameters<typeof runMenuCommand>[0], string]> = [
      ['edit.align-left', '左对齐'],
      ['edit.align-center-h', '水平居中'],
      ['edit.align-right', '右对齐'],
      ['edit.align-top', '顶端对齐'],
      ['edit.align-middle-v', '垂直居中'],
      ['edit.align-bottom', '底端对齐'],
      ['edit.align-distribute-h', '水平分布'],
      ['edit.align-distribute-v', '垂直分布'],
    ]

    for (const [id, label] of expectations) {
      const { ctx, setTopicsPosition } = makeHarness({
        activeSheet: makeSheetWithFloatingTopics(),
        selectedTopicIds: ['float_1', 'float_2', 'float_3'],
      })
      runMenuCommand(id, ctx)
      expect(setTopicsPosition).toHaveBeenCalledTimes(1)
      expect(alignedCall(setTopicsPosition)[1]).toBe(label)
    }
  })
})
