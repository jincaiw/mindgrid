import { collectVisibleTopicIds } from '../../lib/document/tree'
import type { DocumentSession } from '../document/use-document-session'
import type { SheetSnapshot } from '../../lib/document/types'
import {
  CHART_TYPE_BY_MENU_ACTION,
  type CanvasCommand,
  type MenuActionId,
} from './menu-actions'

/**
 * 原生菜单栏命令的派发层。
 *
 * 之所以从 WorkspaceScreen 里抽出来做成纯函数：菜单有 46 个动作，
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
  toggleGanttMode: () => void
  toggleInspector: () => void
  toggleSidebar: () => void
  startPresentation: () => void
  openSearch: () => void
  resetZoom: () => void
  focusInspectorTopicTab: () => void
  openShortcutsHelp: () => void
  checkForUpdates: () => void
  cycleTheme: () => void
  /** 转发给 CanvasHost（复制/剪切/粘贴/回到中心依赖画布内部状态）。 */
  requestCanvasCommand: (command: CanvasCommand) => void
}

const BOUNDARY_LABEL = '分组'
const SUMMARY_LABEL = '概要'

export function runMenuCommand(id: MenuActionId, ctx: MenuCommandContext): void {
  const { session, activeSheet } = ctx

  // 文件动作要弹系统文件对话框，非 Tauri 运行时直接拒绝并说明原因
  if (id.startsWith('file.') && id !== 'file.new' && !ctx.desktopFileActionsEnabled) {
    ctx.notify('该操作需要文件对话框，仅在桌面端可用')
    return
  }

  switch (id) {
    // —— 文件 ——
    case 'file.new':
      void session.createNewDocument()
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
    case 'file.export-markdown':
      void session.exportMarkdownOutline()
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
      ctx.requestCanvasCommand(id)
      return

    // —— 视图 ——
    case 'view.zen':
      ctx.toggleZenMode()
      return
    case 'view.present':
      ctx.startPresentation()
      return
    case 'view.gantt':
      ctx.toggleGanttMode()
      return
    case 'view.inspector':
    case 'format.panel':
      ctx.toggleInspector()
      return
    case 'view.sidebar':
      ctx.toggleSidebar()
      return
    case 'view.search':
      ctx.openSearch()
      return
    case 'view.recenter':
      ctx.requestCanvasCommand('view.recenter')
      return
    case 'view.collapse': {
      const topicId = resolveTopicId(ctx)
      if (topicId) {
        void session.toggleTopicCollapsed(topicId)
      }
      return
    }
    case 'view.reset-zoom':
      ctx.resetZoom()
      return

    // —— 插入 ——
    case 'insert.child': {
      const topicId = resolveTopicId(ctx)
      if (topicId) {
        void session.createChildTopic(topicId)
      }
      return
    }
    case 'insert.sibling': {
      const topicId = resolveTopicId(ctx)
      if (topicId) {
        void session.createSiblingTopic(topicId, 'after')
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
    // 备注/标签/链接/标记/图片都落在右侧检查器的「样式」子页里编辑，
    // 与工具栏「插入」菜单的处理一致：不另起编辑 UI
    case 'insert.notes':
    case 'insert.labels':
    case 'insert.link':
    case 'insert.marker':
    case 'insert.image':
      if (ctx.selectedTopicIds.length === 1) {
        ctx.focusInspectorTopicTab()
      } else {
        ctx.notify('请先选中一个主题')
      }
      return
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

    // —— 格式：结构（图表类型） ——
    case 'format.chart.mindmap':
    case 'format.chart.logic':
    case 'format.chart.tree':
    case 'format.chart.org':
    case 'format.chart.fishbone':
    case 'format.chart.timeline':
      if (activeSheet) {
        void session.setSheetChartType(activeSheet.id, CHART_TYPE_BY_MENU_ACTION[id])
      }
      return

    // —— 工具 / 帮助 ——
    case 'tools.check-update':
      ctx.checkForUpdates()
      return
    case 'tools.cycle-theme':
      ctx.cycleTheme()
      return
    case 'help.shortcuts':
      ctx.openShortcutsHelp()
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
