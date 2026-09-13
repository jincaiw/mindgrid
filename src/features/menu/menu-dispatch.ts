import {
  collectSubtreeTopicIds,
  collectVisibleTopicIds,
  findParentTopicByChildId,
  findTopicById,
} from '../../lib/document/tree'
import type { DocumentSession } from '../document/use-document-session'
import type { SheetSnapshot } from '../../lib/document/types'
import { computeLayout } from '../canvas/layouts'
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
  startPresentation: () => void
  /** 提案简报（批次 C6）：与演示并存，按一级分支分幕 */
  startPitch: () => void
  openSearch: () => void
  focusInspectorTopicTab: () => void
  openShortcutsHelp: () => void
  checkForUpdates: () => void
  cycleTheme: () => void
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
]

export function runMenuCommand(id: MenuActionId, ctx: MenuCommandContext): void {
  const { session, activeSheet } = ctx

  // 文件动作要弹系统文件对话框，非 Tauri 运行时直接拒绝并说明原因
  if (FILE_DIALOG_ACTIONS.includes(id) && !ctx.desktopFileActionsEnabled) {
    ctx.notify('该操作需要文件对话框，仅在桌面端可用')
    return
  }

  switch (id) {
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

    // —— 编辑 ——
    case 'edit.undo':
      void session.undo()
      return
    case 'edit.redo':
      void session.redo()
      return
    case 'edit.select-all':
      if (activeSheet) {
        ctx.setSelectedTopicIds(collectVisibleTopicIds(activeSheet.rootTopic))
      }
      return
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
      const match = findParentTopicByChildId(activeSheet.rootTopic, topicId)
      if (!match) {
        return
      }
      if (match.index === 0) {
        ctx.notify('已是第一个同级主题，无法缩进')
        return
      }
      const previousSibling = match.parent.children[match.index - 1]
      void session.moveTopic(topicId, previousSibling.id, '缩进')
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
      const parentMatch = findParentTopicByChildId(activeSheet.rootTopic, topicId)
      if (!parentMatch) {
        return
      }
      const grandMatch = findParentTopicByChildId(activeSheet.rootTopic, parentMatch.parent.id)
      if (!grandMatch) {
        ctx.notify('父主题已是中心主题，无法减少缩进')
        return
      }
      void session.moveTopic(
        topicId,
        grandMatch.parent.id,
        '减少缩进',
        grandMatch.index + 1,
      )
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

/** 目标主题：本地多选优先，回退到会话 activeTopicId，最后回退到根主题。 */
function resolveTopicId(ctx: MenuCommandContext): string | null {
  return (
    ctx.session.activeTopicId ??
    ctx.selectedTopicIds[0] ??
    ctx.activeSheet?.rootTopic.id ??
    null
  )
}
