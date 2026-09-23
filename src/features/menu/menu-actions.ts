/**
 * 原生菜单栏 → 前端命令的契约层（对标批次 A5，批次 D2 重排）。
 *
 * Rust 侧（`src-tauri/src/app/menu.rs`）只负责「画菜单 + 转发 id」，
 * 业务一律在前端执行，与工具栏、快捷键走同一条命令路径。
 *
 * id 命名即 Rust 侧 `MenuItem::with_id` / `CheckMenuItem::with_id` 的第一个参数，
 * 两侧必须一致。改任一侧都要同步另一侧，否则菜单项点击后静默失效。
 *
 * 顶层顺序对标 XMind：文件 / 编辑 / 插入 / 工具 / 查看 / 窗口 / 帮助。
 * 注意「查看」在「工具」之后——这与 XMind 一致，不要按字母直觉重排。
 */

export const MENU_ACTION_EVENT = 'mindgrid://menu-action'

export type MenuActionId =
  // 文件
  | 'file.new'
  | 'file.new-sheet'
  | 'file.recent-clear'
  | 'file.open'
  | 'file.save'
  | 'file.save-as'
  | 'file.import-markdown'
  | 'file.import-opml'
  | 'file.import-docx'
  | 'file.export-markdown'
  | 'file.export-opml'
  | 'file.export-png'
  | 'file.export-svg'
  | 'file.export-pdf'
  | 'file.export-recovery'
  | 'file.print'
  // 编辑
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.cut'
  | 'edit.copy'
  | 'edit.paste'
  | 'edit.duplicate'
  | 'edit.delete-topic'
  | 'edit.delete-topic-only'
  | 'edit.copy-style'
  | 'edit.paste-style'
  | 'edit.reset-style'
  | 'edit.go-to-center'
  | 'edit.select-all'
  | 'edit.expand-subtopics'
  | 'edit.expand-all'
  | 'edit.collapse'
  | 'edit.indent'
  | 'edit.outdent'
  | 'edit.align-left'
  | 'edit.align-center-h'
  | 'edit.align-right'
  | 'edit.align-top'
  | 'edit.align-middle-v'
  | 'edit.align-bottom'
  | 'edit.align-distribute-h'
  | 'edit.align-distribute-v'
  | 'edit.find'
  // 插入
  | 'insert.child'
  | 'insert.sibling-after'
  | 'insert.sibling-before'
  | 'insert.parent'
  | 'insert.free-topic'
  | 'insert.relationship'
  | 'insert.summary'
  | 'insert.boundary'
  | 'insert.notes'
  | 'insert.labels'
  | 'insert.task'
  | 'insert.link'
  | 'insert.attachment'
  | 'insert.sticker'
  | 'insert.illustration'
  | 'insert.callout'
  | 'insert.marker'
  | 'insert.image'
  | 'insert.new-sheet'
  | 'insert.new-sheet-from-topic'
  // 工具
  | 'tools.map-shot'
  | 'tools.merge-document'
  | 'tools.create-custom-style'
  | 'tools.check-update'
  | 'tools.shortcuts'
  | 'tools.cycle-theme'
  // 查看
  | 'view.mode-mindmap'
  | 'view.mode-outline'
  | 'view.gantt'
  | 'view.zoom-in'
  | 'view.zoom-out'
  | 'view.zoom-actual'
  | 'view.zoom-fit'
  | 'view.focus-branch'
  | 'view.focus-exit'
  | 'view.zen'
  | 'view.present'
  | 'view.pitch'
  | 'view.sidebar'
  | 'view.inspector'
  | 'view.toolbar'
  | 'view.tab-bar'

/** 全部 id 的清单，用于运行时校验与测试（防止两侧漂移）。 */
export const MENU_ACTION_IDS: readonly MenuActionId[] = [
  // 文件
  'file.new',
  'file.new-sheet',
  'file.recent-clear',
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
  'file.print',
  // 编辑
  'edit.undo',
  'edit.redo',
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.duplicate',
  'edit.delete-topic',
  'edit.delete-topic-only',
  'edit.copy-style',
  'edit.paste-style',
  'edit.reset-style',
  'edit.go-to-center',
  'edit.select-all',
  'edit.expand-subtopics',
  'edit.expand-all',
  'edit.collapse',
  'edit.indent',
  'edit.outdent',
  'edit.align-left',
  'edit.align-center-h',
  'edit.align-right',
  'edit.align-top',
  'edit.align-middle-v',
  'edit.align-bottom',
  'edit.align-distribute-h',
  'edit.align-distribute-v',
  'edit.find',
  // 插入
  'insert.child',
  'insert.sibling-after',
  'insert.sibling-before',
  'insert.parent',
  'insert.free-topic',
  'insert.relationship',
  'insert.summary',
  'insert.boundary',
  'insert.notes',
  'insert.labels',
  'insert.task',
  'insert.link',
  'insert.attachment',
  'insert.sticker',
  'insert.illustration',
  'insert.callout',
  'insert.marker',
  'insert.image',
  'insert.new-sheet',
  'insert.new-sheet-from-topic',
  // 工具
  'tools.map-shot',
  'tools.merge-document',
  'tools.create-custom-style',
  'tools.check-update',
  'tools.shortcuts',
  'tools.cycle-theme',
  // 查看
  'view.mode-mindmap',
  'view.mode-outline',
  'view.gantt',
  'view.zoom-in',
  'view.zoom-out',
  'view.zoom-actual',
  'view.zoom-fit',
  'view.focus-branch',
  'view.focus-exit',
  'view.zen',
  'view.present',
  'view.pitch',
  'view.sidebar',
  'view.inspector',
  'view.toolbar',
  'view.tab-bar',
]

/**
 * 可勾选项（Rust 侧用 CheckMenuItem 注册）。
 *
 * 这些项的状态可能从菜单以外的地方改变（快捷键、工具栏按钮、状态条按钮），
 * 故前端在状态变化后要调用 `set_menu_item_checked` 回写，否则勾会停在旧值。
 */
export const MENU_CHECK_ITEM_IDS: readonly MenuActionId[] = [
  'view.mode-mindmap',
  'view.mode-outline',
  'view.gantt',
  'view.sidebar',
  'view.inspector',
  'view.toolbar',
  'view.tab-bar',
]

/** 思维导图 / 大纲是互斥单选项，勾一个必须取消另一个。 */
export const VIEW_MODE_RADIO_IDS = {
  mindmap: 'view.mode-mindmap',
  outline: 'view.mode-outline',
} as const satisfies Record<string, MenuActionId>

/**
 * 「最近打开」的菜单项 id 形如 `file.recent.3`——**下标是动态的**，无法静态枚举。
 *
 * 因此它不在 `MENU_ACTION_IDS` 里（那个集合要与 Rust 侧的字面量 id 一一对应），
 * 由本函数单独识别；路径不经过前端——点击后只把下标交给 Rust，由 Rust 解析路径。
 */
const RECENT_FILE_ID_PATTERN = /^file\.recent\.(\d+)$/

/** 从菜单 id 解析「最近打开」的下标；不是这一类则返回 null。 */
export function recentFileMenuActionIndex(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null
  }
  const matched = RECENT_FILE_ID_PATTERN.exec(value)
  if (!matched) {
    return null
  }
  const index = Number.parseInt(matched[1], 10)
  return Number.isSafeInteger(index) && index >= 0 ? index : null
}

export function isMenuActionId(value: unknown): value is MenuActionId {
  return typeof value === 'string' && (MENU_ACTION_IDS as readonly string[]).includes(value)
}

/**
 * 相对缩放命令（菜单「放大 / 缩小 / 实际大小 / 适应画布」）。
 *
 * 与 `zoomRequest`（绝对缩放值）分开的原因：放大缩小要基于**当前**缩放，
 * 而当前缩放只存在于相机内部；外层持有的 zoom 是上一帧相机上报的快照，
 * 连续点击时可能已经过期。
 */
export type ZoomCommand = 'in' | 'out' | 'actual' | 'fit'

/** 菜单 id → 缩放命令。 */
export const ZOOM_COMMAND_BY_MENU_ACTION: Readonly<Record<string, ZoomCommand>> = {
  'view.zoom-in': 'in',
  'view.zoom-out': 'out',
  'view.zoom-actual': 'actual',
  'view.zoom-fit': 'fit',
}

/**
 * 需要转发给 CanvasHost 的命令：这些动作依赖画布内部状态
 * （主题剪贴板、样式剪贴板、相机），外层无法直接驱动。
 */
export type CanvasCommand =
  | 'edit.copy'
  | 'edit.cut'
  | 'edit.paste'
  | 'edit.duplicate'
  | 'edit.copy-style'
  | 'edit.paste-style'
  | 'edit.go-to-center'
  | 'view.zoom-in'
  | 'view.zoom-out'
  | 'view.zoom-actual'
  | 'view.zoom-fit'

const CANVAS_COMMANDS: readonly string[] = [
  'edit.copy',
  'edit.cut',
  'edit.paste',
  'edit.duplicate',
  'edit.copy-style',
  'edit.paste-style',
  'edit.go-to-center',
  'view.zoom-in',
  'view.zoom-out',
  'view.zoom-actual',
  'view.zoom-fit',
]

export function toCanvasCommand(id: MenuActionId): CanvasCommand | null {
  return CANVAS_COMMANDS.includes(id) ? (id as CanvasCommand) : null
}
