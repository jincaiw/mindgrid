import { resolveIndentTarget, resolveOutdentTarget } from '../../lib/document/topic-outline'
import {
  computeTopicAlignment,
  TOPIC_ALIGN_LABELS,
  type TopicAlignBox,
  type TopicAlignMode,
} from '../../lib/document/topic-align'
import { isFreelyPositionableTopic } from '../../lib/document/free-topics'
import { resolveCanvasSettings } from '../../lib/document/canvas-settings'
import {
  FOCUS_BRANCH_UNAVAILABLE_MESSAGE,
  resolveBranchFocusTarget,
} from '../../lib/document/focus'
import {
  collectSubtreeTopicIds,
  collectVisibleTopicIds,
  findTopicById,
} from '../../lib/document/tree'
import type { DocumentSession } from '../document/use-document-session'
import type { SheetSnapshot } from '../../lib/document/types'
import { computeLayout, resolveLayoutOptions } from '../canvas/layouts'
import type { CanvasCommand, MenuActionId } from './menu-actions'

/**
 * 原生菜单栏命令的派发层。
 *
 * 之所以从 WorkspaceScreen 里抽出来做成纯函数：菜单有 60 个动作，
 * 若散在组件的 useCallback 里，只能靠起原生应用点菜单来验，
 * 一次回归都发现不了。抽出来后可以直接构造 context 单测每条分支。
 *
 * 所有分支都调用**与工具栏、快捷键相同的**目标（多数直接是 session 方法），
 * 不另起一套实现——这是「菜单项触发与工具栏/快捷键同一命令路径」的落点。
 */
export interface MenuCommandContext {
  session: DocumentSession
  activeSheet: SheetSnapshot | null
  selectedTopicIds: string[]
  /** 文件对话框依赖 Tauri 运行时，浏览器环境不可用。 */
  desktopFileActionsEnabled: boolean
  notify: (message: string) => void
  /** 替换当前多选（Cmd/Ctrl + A 全选）。 */
  setSelectedTopicIds: (topicIds: string[]) => void
  toggleZenMode: () => void
  /** 大纲视图是「思维导图 / 大纲」单选项的一侧，需要显式置位而非取反。 */
  setOutlineMode: (enabled: boolean) => void
  toggleGanttMode: () => void
  toggleInspector: () => void
  toggleSidebar: () => void
  toggleToolbar: () => void
  toggleTabBar: () => void
  /**
   * 「仅显示该分支」：进入/切换聚焦到给定主题；`null` 表示退出聚焦。
   *
   * 聚焦状态由 WorkspaceScreen 持有（状态栏提示、菜单可用性、画布都要读），
   * 本层只负责算目标与挡掉不能聚焦的情形。
   */
  setFocusTopicId: (topicId: string | null) => void
  /**
   * 批量写入自由位置（编辑 → 自由主题对齐）。
   *
   * 走批量而不是逐个 `moveTopicFreely`：整批一条撤销记录，
   * 否则"对齐三个主题"要按三次 ⌘Z 才回得去。
   */
  setTopicsPosition: (
    positions: Array<{ topicId: string; offsetX: number; offsetY: number }>,
    actionLabel: string,
  ) => void
  /**
   * 把选中的主题（含子树）导出为一张 PNG。
   *
   * 与「导出 PNG 图片」只差可见集：这条只画选中的那部分。
   * 裁剪复用画布「仅显示该分支」的同一套函数，所以连线/外框/概要在导出里也会一并裁掉。
   */
  exportSelectedTopicsPng: (topicIds: readonly string[]) => void
  /**
   * 当前「仅显示该分支」的可见主题集（`null` = 未聚焦）。
   *
   * 范围性动作（「全选」）必须尊重它：聚焦时按 ⌘A 若把隐藏分支也圈进来，
   * 接一个 Delete 就会删掉屏幕上看不见的整条分支。
   */
  focusVisibleTopicIds: ReadonlySet<string> | null
  startPresentation: () => void
  /** 提案简报（批次 C6）：与演示并存，按一级分支分幕 */
  startPitch: () => void
  openSearch: () => void
  focusInspectorTopicTab: () => void
  /** 打开检查器并切到「画布」子页（画布级设置的入口）。 */
  focusInspectorCanvasTab: () => void
  openShortcutsHelp: () => void
  checkForUpdates: () => void
  cycleTheme: () => void
  /** 文件 → 打印：渲染整幅导图并打开系统打印面板。 */
  printDocument: () => void
  /** 转发给 CanvasHost（剪贴板、样式剪贴板、相机依赖画布内部状态）。 */
  requestCanvasCommand: (command: CanvasCommand) => void
}

const BOUNDARY_LABEL = '分组'
const SUMMARY_LABEL = '概要'

/**
 * 需要弹系统文件对话框的动作。
 * 其余 file.*（新建文档、新建标签页）是纯内存操作，浏览器环境也可用。
 */
const FILE_DIALOG_ACTIONS: readonly string[] = [
  'file.open',
  'file.save',
  'file.save-as',
  'file.import-markdown',
  'file.import-opml',
  'file.import-docx',
  'file.export-markdown',
  'file.export-opml',
  'file.export-png',
  'file.export-svg',
  'file.export-pdf',
  'file.export-recovery',
  // 合并文件要选一个 .mgd：同样只有桌面端读得到文件
  'tools.merge-document',
]

export function runMenuCommand(id: MenuActionId, ctx: MenuCommandContext): void {
  const { session, activeSheet } = ctx

  // 文件动作要弹系统文件对话框，非 Tauri 运行时直接拒绝并说明原因
  if (FILE_DIALOG_ACTIONS.includes(id) && !ctx.desktopFileActionsEnabled) {
    ctx.notify('该操作需要文件对话框，仅在桌面端可用')
    return
  }

  // 打印不弹文件对话框，但要原生打印面板（面板由 Rust 侧打开），故单独挡一层
  if (id === 'file.print' && !ctx.desktopFileActionsEnabled) {
    ctx.notify('打印需要系统打印面板，仅在桌面端可用')
    return
  }

  switch (id) {
    // 工具 → 合并文件：把另一个 .mgd 的每张画布追加进来。
    // 摘要里报清"合并了什么"——只说"合并完成"的话，用户分不清
    // "对方是空文件"与"命令没生效"。
    case 'tools.merge-document': {
      void session.mergeDocument().then((report) => {
        if (!report) {
          return
        }
        const parts = [`${report.sheets} 张画布`, `${report.topics} 个主题`]
        if (report.assets > 0) {
          parts.push(`导入 ${report.assets} 个资源`)
        }
        if (report.missingAssets > 0) {
          parts.push(`⚠️ ${report.missingAssets} 个资源在源文件里已缺失`)
        }
        ctx.notify(
          `已合并「${report.fileName}」：${parts.join(' / ')}（⌘Z 可整次撤销）`,
        )
      })
      return
    }

    // —— 文件 ——
    case 'file.new':
      void session.createNewDocument()
      return
    case 'file.new-sheet':
      void session.createSheet()
      return
    case 'file.open':
      void session.openDocument()
      return
    // 「最近打开」的具体项是动态 id（file.recent.N），不在这里——见 useNativeMenuActions。
    case 'file.recent-clear':
      void session.clearRecentFiles()
      return
    case 'file.save':
      void session.saveDocument()
      return
    case 'file.save-as':
      void session.saveDocumentAs()
      return
    case 'file.import-markdown':
      void session.importMarkdownOutline()
      return
    case 'file.import-opml':
      void session.importOpmlOutline()
      return
    case 'file.import-docx':
      void session.importDocxOutline()
      return
    case 'file.export-markdown':
      void session.exportMarkdownOutline()
      return
    case 'file.export-opml':
      void session.exportOpmlOutline()
      return
    case 'file.export-png':
      void session.exportPngImage()
      return
    case 'file.export-svg':
      void session.exportSvgImage()
      return
    case 'file.export-pdf':
      void session.exportPdfDocument()
      return
    case 'file.export-recovery':
      void session.exportRecoveryCopy()
      return
    // 打印：渲染 → 放进打印页 → 打开系统面板，顺序由 print-controller 钉住
    case 'file.print':
      ctx.printDocument()
      return

    // —— 编辑 ——
    case 'edit.undo':
      void session.undo()
      return
    case 'edit.redo':
      void session.redo()
      return
    case 'edit.select-all': {
      if (activeSheet) {
        const visible = collectVisibleTopicIds(activeSheet.rootTopic)
        const focusVisible = ctx.focusVisibleTopicIds
        ctx.setSelectedTopicIds(
          focusVisible ? visible.filter((topicId) => focusVisible.has(topicId)) : visible,
        )
      }
      return
    }
    case 'edit.copy':
    case 'edit.cut':
    case 'edit.paste':
    case 'edit.duplicate':
    case 'edit.copy-style':
    case 'edit.paste-style':
    case 'edit.go-to-center':
      ctx.requestCanvasCommand(id)
      return
    case 'edit.delete-topic': {
      // 多选时整体删除（与画布 Delete 键行为一致），单选走单主题删除
      if (ctx.selectedTopicIds.length > 1) {
        void session.deleteTopics(ctx.selectedTopicIds)
        return
      }
      const topicId = resolveTopicId(ctx)
      if (topicId) {
        void session.deleteTopic(topicId)
      }
      return
    }
    // 删除单个主题 = 只摘掉该主题本身，**子主题上提到它的位置**（XMind 的 ⌥⌫）。
    // 多选时整体处理（一次命令、一条撤销记录），与「删除主题」的多选行为一致。
    case 'edit.delete-topic-only': {
      const fallbackId = resolveTopicId(ctx)
      const topicIds =
        ctx.selectedTopicIds.length > 0 ? ctx.selectedTopicIds : fallbackId ? [fallbackId] : []
      // resolveTopicId 的最后一级回退是**中心主题**，它不可删。
      // 这一层要自己挡掉：否则会把"中心主题不能删除"当错误弹出来，
      // 而正确表现是给一句提示、什么都不做。
      const deletable = topicIds.filter((id) => id !== ctx.activeSheet?.rootTopic.id)
      if (deletable.length === 0) {
        ctx.notify('中心主题不能删除')
        return
      }
      void session.deleteTopicOnly(deletable)
      return
    }
    // —— 缩进 / 减少缩进（对齐 XMind 编辑菜单）——
    // 缩进 = 成为**上一个同级主题**的最后一个子主题（XMind/大纲工具的通行语义）。
    // 没有上一个同级主题（自己是第一个）时无处可缩，给一句提示而不是静默失败。
    case 'edit.indent': {
      const topicId = resolveTopicId(ctx)
      if (!topicId || !activeSheet) {
        return
      }
      // 目标计算与画布 ⌘] 共用同一个纯函数（见 lib/document/topic-outline.ts）
      const target = resolveIndentTarget(activeSheet.rootTopic, topicId)
      if (!target) {
        ctx.notify('已是第一个同级主题，无法缩进')
        return
      }
      void session.moveTopic(topicId, target.parentId, '缩进')
      return
    }
    // 减少缩进 = 挂到**祖父主题**之下，位置落在**原父主题之后**。
    // 位置必须显式指定：默认的「追加到末尾」会让主题在多兄弟场景里跳到最后一位，
    // 与 XMind 的表现不符（这也是本轮给 moveTopic 加 targetIndex 的原因）。
    case 'edit.outdent': {
      const topicId = resolveTopicId(ctx)
      if (!topicId || !activeSheet) {
        return
      }
      const target = resolveOutdentTarget(activeSheet.rootTopic, topicId)
      if (!target) {
        ctx.notify('父主题已是中心主题，无法减少缩进')
        return
      }
      void session.moveTopic(topicId, target.parentId, '减少缩进', target.index)
      return
    }
    // 重设样式 = 清掉 styleRef 与 styleOverrides，回到文档主题的样子。
    // 两次写入会产生两条撤销记录，与画布 Alt+Cmd+C/V 的既有行为一致。
    case 'edit.reset-style': {
      const topicId = resolveTopicId(ctx)
      if (!topicId) {
        return
      }
      void (async () => {
        await session.setTopicStyleRef(topicId, null)
        await session.setTopicStyleOverrides(topicId, null)
      })()
      return
    }
    // 展开子主题只放开当前这一层；展开所有子分支递归到整棵子树。
    // 用 collectSubtreeTopicIds 而非 collectVisibleTopicIds —— 后者遇折叠即停，
    // 被折叠的分支会永远展开不了。
    case 'edit.expand-subtopics':
    case 'edit.expand-all': {
      const topicId = resolveTopicId(ctx)
      if (!topicId || !activeSheet) {
        return
      }
      const topic = findTopicById(activeSheet.rootTopic, topicId)
      if (!topic) {
        return
      }
      const targets =
        id === 'edit.expand-all' ? collectSubtreeTopicIds(topic) : [topic.id]
      void session.setTopicsCollapsed(targets, false)
      return
    }
    case 'edit.collapse': {
      const topicId = resolveTopicId(ctx)
      if (topicId) {
        void session.toggleTopicCollapsed(topicId)
      }
      return
    }
    // —— 自由主题对齐（八个子项共用一段实现，算法在 lib/document/topic-align.ts）——
    case 'edit.align-left':
    case 'edit.align-center-h':
    case 'edit.align-right':
    case 'edit.align-top':
    case 'edit.align-middle-v':
    case 'edit.align-bottom':
    case 'edit.align-distribute-h':
    case 'edit.align-distribute-v':
      alignSelectedTopics(id, ctx)
      return
    case 'edit.find':
      ctx.openSearch()
      return

    // —— 插入 ——
    case 'insert.child': {
      const topicId = resolveTopicId(ctx)
      if (topicId) {
        void session.createChildTopic(topicId)
      }
      return
    }
    case 'insert.sibling-after': {
      const topicId = resolveTopicId(ctx)
      if (topicId) {
        void session.createSiblingTopic(topicId, 'after')
      }
      return
    }
    case 'insert.sibling-before': {
      const topicId = resolveTopicId(ctx)
      if (topicId) {
        void session.createSiblingTopic(topicId, 'before')
      }
      return
    }
    case 'insert.parent': {
      const topicId = resolveTopicId(ctx)
      if (topicId) {
        void session.createParentTopic(topicId)
      }
      return
    }
    // 笔记/标签/任务/链接/标记/图片都落在右侧检查器的「样式」子页里编辑，
    // 与工具栏「插入」菜单的处理一致：不另起编辑 UI
    case 'insert.notes':
    case 'insert.labels':
    case 'insert.task':
    case 'insert.link':
    // 附件同样落在右侧面板的「附件」小节里编辑（与其它插入项同一约定：
    // 系统文件对话框只在该面板里弹，不把对话框逻辑散到派发层）
    case 'insert.attachment':
    // 贴纸在右侧面板的「贴纸」小节里选（点一下就贴到选中主题上）
    case 'insert.sticker':
    // 标注在右侧面板的「标注」小节里开关与编辑（画布上直接可见的说明框）
    case 'insert.callout':
    case 'insert.marker':
    case 'insert.image':
      if (ctx.selectedTopicIds.length === 1) {
        ctx.focusInspectorTopicTab()
      } else {
        ctx.notify('请先选中一个主题')
      }
      return
    // 自由主题：XMind 放在视口中心，但菜单项拿不到视口/相机。
    // 改为放在**整幅图下方**的空白处——用真实布局的包围盒算，不猜，
    // 保证一定可见（创建后拖到想放的位置即可）。
    case 'insert.free-topic': {
      if (!activeSheet) {
        return
      }
      const layout = computeLayout(activeSheet.rootTopic, activeSheet.chartType)
      const bottom = layout.nodes.reduce(
        (max, node) => Math.max(max, node.y + node.height / 2),
        0,
      )
      // 文案与画布双击创建保持一致，避免两处默认名不同
      void session.createFloatingTopic('新建浮动主题', 0, bottom + 80)
      return
    }
    // 插画：**画布级**对象（不依附主题），所以入口在检查器的「画布」子页，
    // 而不是像贴纸/标注那样放在「样式」子页——那一页整页都是"选中主题"的属性。
    case 'insert.illustration':
      ctx.focusInspectorCanvasTab()
      return
    // 从主题新建画布：该主题的整棵子树成为新画布的根。
    // 画布标题取主题文本（Rust 侧为空时回落「新画布」）。
    case 'insert.new-sheet-from-topic': {
      const topicId = resolveTopicId(ctx)
      if (!topicId || !activeSheet) {
        return
      }
      if (topicId === activeSheet.rootTopic.id) {
        ctx.notify('中心主题不能变成新画布')
        return
      }
      const topic = findTopicById(activeSheet.rootTopic, topicId)
      void session.createSheetFromTopic(topicId, topic?.text)
      return
    }
    case 'insert.relationship':
      if (ctx.selectedTopicIds.length === 2) {
        void session.createRelationship(ctx.selectedTopicIds[0], ctx.selectedTopicIds[1], null)
      } else {
        ctx.notify('请先选中两个主题')
      }
      return
    case 'insert.boundary':
    case 'insert.summary': {
      if (!activeSheet) {
        return
      }

      const selected = new Set(ctx.selectedTopicIds)
      const targets = collectVisibleTopicIds(activeSheet.rootTopic).filter((topicId) =>
        selected.has(topicId),
      )

      if (targets.length >= 2) {
        if (id === 'insert.boundary') {
          void session.createBoundary(activeSheet.id, targets, BOUNDARY_LABEL)
        } else {
          void session.createSummary(activeSheet.id, targets, SUMMARY_LABEL)
        }
        return
      }

      ctx.notify('请先选中至少 2 个主题')
      return
    }
    case 'insert.new-sheet':
      void session.createSheet()
      return

    // —— 工具 ——
    case 'tools.map-shot':
      if (ctx.selectedTopicIds.length === 0) {
        ctx.notify('请先选中要导出的主题（导出会连同各自的子主题一起）')
        return
      }
      ctx.exportSelectedTopicsPng(ctx.selectedTopicIds)
      return
    case 'tools.check-update':
      ctx.checkForUpdates()
      return
    case 'tools.shortcuts':
      ctx.openShortcutsHelp()
      return
    case 'tools.cycle-theme':
      ctx.cycleTheme()
      return

    // —— 查看 ——
    // 思维导图 / 大纲是互斥单选项，故用显式置位而非取反：
    // 若用 toggle，从别处（快捷键）进入大纲后点「大纲」会把它关掉，与勾选态矛盾。
    case 'view.mode-mindmap':
      ctx.setOutlineMode(false)
      return
    case 'view.mode-outline':
      ctx.setOutlineMode(true)
      return
    case 'view.gantt':
      ctx.toggleGanttMode()
      return
    case 'view.zoom-in':
    case 'view.zoom-out':
    case 'view.zoom-actual':
    case 'view.zoom-fit':
      ctx.requestCanvasCommand(id)
      return
    // 「仅显示该分支」：只留从中心主题到该主题的路径 + 该主题的整棵子树。
    // 目标解析与快捷键共用 resolveBranchFocusTarget，两条入口的判定完全一致；
    // 中心主题不能作为目标（只显示它的"分支"就是整幅图，语义上是空操作）。
    case 'view.focus-branch': {
      if (!activeSheet) {
        return
      }
      const target = resolveBranchFocusTarget(activeSheet.rootTopic, resolveTopicId(ctx))
      if (!target) {
        ctx.notify(FOCUS_BRANCH_UNAVAILABLE_MESSAGE)
        return
      }
      ctx.setFocusTopicId(target)
      return
    }
    // 退出聚焦：幂等，没在聚焦时点它没有任何副作用。
    case 'view.focus-exit':
      ctx.setFocusTopicId(null)
      return
    case 'view.zen':
      ctx.toggleZenMode()
      return
    case 'view.present':
      ctx.startPresentation()
      return
    case 'view.pitch':
      ctx.startPitch()
      return
    case 'view.sidebar':
      ctx.toggleSidebar()
      return
    case 'view.inspector':
      ctx.toggleInspector()
      return
    case 'view.toolbar':
      ctx.toggleToolbar()
      return
    case 'view.tab-bar':
      ctx.toggleTabBar()
      return
  }
}

/** 八个对齐菜单项 id → 算法模式。 */
const ALIGN_MODE_BY_MENU_ID: Readonly<Record<string, TopicAlignMode>> = {
  'edit.align-left': 'left',
  'edit.align-center-h': 'center-h',
  'edit.align-right': 'right',
  'edit.align-top': 'top',
  'edit.align-middle-v': 'middle-v',
  'edit.align-bottom': 'bottom',
  'edit.align-distribute-h': 'distribute-h',
  'edit.align-distribute-v': 'distribute-v',
}

/**
 * 对齐 / 分布选中的自由主题。
 *
 * 框必须来自**真实布局**（而不是主题自己存的 layoutHints）：开启「分支自由布局」时，
 * 被摆过的分支还可能因「主题层叠」被推开，存的坐标与屏幕上的位置并不总是相等。
 * 布局选项同样走 `resolveLayoutOptions`，与画布渲染同一来源。
 */
function alignSelectedTopics(id: MenuActionId, ctx: MenuCommandContext): void {
  const mode = ALIGN_MODE_BY_MENU_ID[id]
  const sheet = ctx.activeSheet
  if (!mode || !sheet) {
    return
  }

  const canvasSettings = resolveCanvasSettings(ctx.session.document?.settings)
  const floatingTopics = sheet.floatingTopics ?? []
  const layout = computeLayout(
    sheet.rootTopic,
    sheet.chartType,
    floatingTopics,
    resolveLayoutOptions(canvasSettings, sheet.layoutConfig?.direction),
  )
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]))
  const floatingIds = new Set(floatingTopics.map((topic) => topic.id))
  const firstLevelBranchIds = new Set(sheet.rootTopic.children.map((child) => child.id))

  const boxes: TopicAlignBox[] = []
  for (const topicId of ctx.selectedTopicIds) {
    // 只有能自由摆放的主题参与：更深层的主题写 layoutHints 也不会被布局消费，
    // 放进去只会让"对齐了但没反应"
    if (
      !isFreelyPositionableTopic({
        isFloatingTopic: floatingIds.has(topicId),
        isFirstLevelBranch: firstLevelBranchIds.has(topicId),
        freeBranchLayout: canvasSettings.freeBranchLayout,
      })
    ) {
      continue
    }
    const node = nodeById.get(topicId)
    if (!node) {
      continue
    }
    boxes.push({
      topicId,
      centerX: node.x,
      centerY: node.y,
      width: node.width,
      height: node.height,
    })
  }

  const result = computeTopicAlignment(boxes, mode)
  if (!result.ok) {
    ctx.notify(
      `请先选中至少 ${result.required} 个可自由摆放的主题（自由主题，或开启「分支自由布局」后的一级分支）`,
    )
    return
  }

  ctx.setTopicsPosition(result.positions, TOPIC_ALIGN_LABELS[mode])
}

/** 目标主题：本地多选优先，回退到会话 activeTopicId，最后回退到根主题。 */
function resolveTopicId(ctx: MenuCommandContext): string | null {
  return (
    ctx.session.activeTopicId ??
    ctx.selectedTopicIds[0] ??
    ctx.activeSheet?.rootTopic.id ??
    null
  )
}
