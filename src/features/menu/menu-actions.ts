/**
 * 原生菜单栏 → 前端命令的契约层（对标批次 A5）。
 *
 * Rust 侧（`src-tauri/src/app/menu.rs`）只负责「画菜单 + 转发 id」，
 * 业务一律在前端执行，与工具栏、快捷键走同一条命令路径。
 *
 * id 命名即 Rust 侧 `MenuItem::with_id` 的第一个参数，两侧必须一致。
 * 改任一侧都要同步另一侧，否则菜单项点击后静默失效。
 */

export const MENU_ACTION_EVENT = 'mindgrid://menu-action'

export type MenuActionId =
  // 文件
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.save-as'
  | 'file.import-markdown'
  | 'file.export-markdown'
  | 'file.export-png'
  | 'file.export-svg'
  | 'file.export-pdf'
  | 'file.export-recovery'
  // 编辑
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.cut'
  | 'edit.copy'
  | 'edit.paste'
  | 'edit.select-all'
  // 视图
  | 'view.zen'
  | 'view.present'
  | 'view.gantt'
  | 'view.inspector'
  | 'view.sidebar'
  | 'view.search'
  | 'view.recenter'
  | 'view.collapse'
  | 'view.reset-zoom'
  // 插入
  | 'insert.child'
  | 'insert.sibling'
  | 'insert.parent'
  | 'insert.notes'
  | 'insert.labels'
  | 'insert.link'
  | 'insert.marker'
  | 'insert.image'
  | 'insert.relationship'
  | 'insert.boundary'
  | 'insert.summary'
  // 格式
  | 'format.panel'
  | 'format.chart.mindmap'
  | 'format.chart.logic'
  | 'format.chart.tree'
  | 'format.chart.org'
  | 'format.chart.fishbone'
  | 'format.chart.timeline'
  // 工具 / 帮助
  | 'tools.check-update'
  | 'tools.cycle-theme'
  | 'help.shortcuts'

/** 全部 id 的清单，用于运行时校验与测试（防止两侧漂移）。 */
export const MENU_ACTION_IDS: readonly MenuActionId[] = [
  'file.new',
  'file.open',
  'file.save',
  'file.save-as',
  'file.import-markdown',
  'file.export-markdown',
  'file.export-png',
  'file.export-svg',
  'file.export-pdf',
  'file.export-recovery',
  'edit.undo',
  'edit.redo',
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.select-all',
  'view.zen',
  'view.present',
  'view.gantt',
  'view.inspector',
  'view.sidebar',
  'view.search',
  'view.recenter',
  'view.collapse',
  'view.reset-zoom',
  'insert.child',
  'insert.sibling',
  'insert.parent',
  'insert.notes',
  'insert.labels',
  'insert.link',
  'insert.marker',
  'insert.image',
  'insert.relationship',
  'insert.boundary',
  'insert.summary',
  'format.panel',
  'format.chart.mindmap',
  'format.chart.logic',
  'format.chart.tree',
  'format.chart.org',
  'format.chart.fishbone',
  'format.chart.timeline',
  'tools.check-update',
  'tools.cycle-theme',
  'help.shortcuts',
]

export function isMenuActionId(value: unknown): value is MenuActionId {
  return typeof value === 'string' && (MENU_ACTION_IDS as readonly string[]).includes(value)
}

/**
 * 「格式」菜单的结构（图表类型）子项 → ChartType。
 * 与侧栏「画布管理」里的图表类型下拉同源。
 */
export const CHART_TYPE_BY_MENU_ACTION: Readonly<
  Record<string, 'mindmap' | 'logic' | 'tree' | 'org' | 'fishbone' | 'timeline'>
> = {
  'format.chart.mindmap': 'mindmap',
  'format.chart.logic': 'logic',
  'format.chart.tree': 'tree',
  'format.chart.org': 'org',
  'format.chart.fishbone': 'fishbone',
  'format.chart.timeline': 'timeline',
}

/**
 * 需要转发给 CanvasHost 的命令：这些动作依赖画布内部状态
 * （主题剪贴板、相机），外层无法直接驱动。
 */
export type CanvasCommand = 'edit.copy' | 'edit.cut' | 'edit.paste' | 'view.recenter'

export function toCanvasCommand(id: MenuActionId): CanvasCommand | null {
  return id === 'edit.copy' ||
    id === 'edit.cut' ||
    id === 'edit.paste' ||
    id === 'view.recenter'
    ? id
    : null
}
