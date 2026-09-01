import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentSession } from '../document/use-document-session'
import { hasTauriRuntime } from '../../lib/ipc/transport'
import { getActiveSheet } from '../../lib/document/sheets'
import { normalizeTopicIdsForBatch } from '../../lib/document/tree'
import { DEFAULT_THEME_ID, listThemes } from '../../lib/document/themes'
import type { ChartType } from '../../lib/document/types'
import { getDeletableTopicIds } from '../canvas/interaction-state'
import { TemplatePicker } from './template-picker'
import {
  ChevronDownIcon,
  DownloadIcon,
  FilePlusIcon,
  FolderOpenIcon,
  InsertIcon,
  LayoutIcon,
  PanelRightIcon,
  PlayIcon,
  RedoIcon,
  RefreshIcon,
  SaveAsIcon,
  SaveIcon,
  SearchIcon,
  ShareIcon,
  SiblingTopicIcon,
  StructureIcon,
  SubTopicIcon,
  ThemeIcon,
  TrashIcon,
  UndoIcon,
} from './icons'

interface ToolbarProps {
  session: DocumentSession
  selectedTopicIds?: string[]
  onClearSelection?: () => void
  onStartPresentation?: () => void
  onCheckForUpdates?: () => void
  onToggleZenMode?: () => void
  isZenMode?: boolean
  /** 打开画布搜索（与 Cmd/Ctrl + F 同一行为） */
  onOpenSearch?: () => void
  /** 检查器显隐（与 Cmd/Ctrl + I 同一行为） */
  inspectorVisible?: boolean
  onToggleInspector?: () => void
  /** 大纲全屏视图显隐（批次 19）：隐藏画布，全宽编辑主题树 */
  isOutlinerMode?: boolean
  onToggleOutliner?: () => void
  /** 插入 备注/标签/链接/标记：确保 Inspector 可见并切到“主题”tab */
  onFocusInspectorTopicTab?: () => void
  /** 瞬态通知（如插入条件不满足时的引导提示） */
  onNotify?: (message: string) => void
}

/** 图表类型选项，value 与 ChartType 序列化形式一致（文案与侧栏保持一致）。 */
const CHART_TYPE_OPTIONS: ReadonlyArray<{ value: ChartType; label: string }> = [
  { value: 'mindmap', label: '思维导图（Mind Map）' },
  { value: 'logic', label: '逻辑图（Logic）' },
  { value: 'tree', label: '树状图（Tree）' },
  { value: 'org', label: '组织结构图（Org）' },
  { value: 'fishbone', label: '鱼骨图（Fishbone）' },
  { value: 'timeline', label: '时间线（Timeline）' },
]

function formatClockTime(timestampMs: number, withSeconds = false) {
  return new Date(timestampMs).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  })
}

function formatFileLabel(session: DocumentSession) {
  if (!session.filePath) {
    return session.hasUnsavedChanges ? '未命名文档 *' : '未命名文档'
  }

  const pathSegments = session.filePath.split(/[\\/]/)
  const fileName = pathSegments[pathSegments.length - 1] || session.filePath

  return session.hasUnsavedChanges ? `${fileName} *` : fileName
}

/** 格式化保存状态提示（含恢复区时间）。 */
function formatSaveHint(session: DocumentSession): string {
  if (session.lastSavedAtMs) {
    const parts = [`保存 ${formatClockTime(session.lastSavedAtMs, true)}`]
    if (session.lastAutosavedAtMs) {
      parts.push(`恢复区 ${formatClockTime(session.lastAutosavedAtMs, true)}`)
    }
    return parts.join(' · ')
  }
  return session.filePath ? '尚未保存' : '尚未保存到文件'
}

/** 图标按钮：方形 32×32，hover 浅灰背景，disabled 半透明。 */
function IconButton({
  onClick,
  disabled,
  title,
  ariaLabel,
  children,
  variant = 'default',
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  ariaLabel: string
  children: React.ReactNode
  variant?: 'default' | 'primary' | 'ghost'
}) {
  return (
    <button
      className={`toolbar__icon-btn${variant === 'primary' ? ' toolbar__icon-btn--primary' : ''}${variant === 'ghost' ? ' toolbar__icon-btn--ghost' : ''}`}
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}

/** 分组分隔符：1px 竖线。 */
function ToolbarDivider() {
  return <span className="toolbar__divider" aria-hidden="true" />
}

interface ToolbarMenuItem {
  key: string
  label: string
  /** 提供时渲染为 menuitemradio 并携带选中态（结构/主题切换） */
  checked?: boolean
  action: () => void
}

/** 通用下拉菜单：触发按钮（图标/文本 + ▾）+ 菜单项列表，点击外部关闭。 */
function ToolbarMenu({
  label,
  disabled,
  items,
  children,
}: {
  label: string
  disabled?: boolean
  items: ToolbarMenuItem[]
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  return (
    <div className="toolbar__menu" ref={ref}>
      <button
        className="toolbar__icon-btn"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {children}
        <ChevronDownIcon size={12} />
      </button>
      {open ? (
        <ul className="toolbar__menu-list" role="menu" aria-label={label}>
          {items.map((item) => (
            <li key={item.key}>
              <button
                className="toolbar__menu-item"
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                onClick={() => {
                  item.action()
                  setOpen(false)
                }}
              >
                {item.checked ? '✓ ' : ''}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** 导出下拉菜单。 */
function ExportMenu({ session }: { session: DocumentSession }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const disabled = !hasTauriRuntime() || !session.summary

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const items = [
    { label: 'Markdown 大纲', action: () => void session.exportMarkdownOutline() },
    { label: 'OPML 大纲', action: () => void session.exportOpmlOutline() },
    { label: 'PNG 高清图片', action: () => void session.exportPngImage() },
    { label: 'SVG 矢量图', action: () => void session.exportSvgImage() },
    { label: '恢复副本', action: () => void session.exportRecoveryCopy() },
  ]

  return (
    <div className="toolbar__menu" ref={ref}>
      <button
        className="toolbar__icon-btn"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="导出"
        aria-label="导出"
        aria-expanded={open}
      >
        <ShareIcon />
        <ChevronDownIcon size={12} />
      </button>
      {open ? (
        <ul className="toolbar__menu-list" role="menu">
          {items.map((item) => (
            <li key={item.label}>
              <button
                className="toolbar__menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  item.action()
                  setOpen(false)
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** 导入下拉菜单。 */
function ImportMenu({ session }: { session: DocumentSession }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const disabled = !hasTauriRuntime() || !session.summary

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const items = [
    { label: '从 Markdown 导入', action: () => void session.importMarkdownOutline() },
    { label: '从 OPML 导入', action: () => void session.importOpmlOutline() },
  ]

  return (
    <div className="toolbar__menu" ref={ref}>
      <button
        className="toolbar__icon-btn"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="导入"
        aria-label="导入"
        aria-expanded={open}
      >
        <DownloadIcon />
        <ChevronDownIcon size={12} />
      </button>
      {open ? (
        <ul className="toolbar__menu-list" role="menu">
          {items.map((item) => (
            <li key={item.label}>
              <button
                className="toolbar__menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  item.action()
                  setOpen(false)
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function Toolbar({
  session,
  selectedTopicIds = [],
  onClearSelection,
  onStartPresentation,
  onCheckForUpdates,
  onToggleZenMode,
  isZenMode = false,
  onOpenSearch,
  inspectorVisible = true,
  onToggleInspector,
  isOutlinerMode = false,
  onToggleOutliner,
  onFocusInspectorTopicTab,
  onNotify,
}: ToolbarProps) {
  const desktopFileActionsEnabled = hasTauriRuntime()
  const hasMultipleSelectedTopics = selectedTopicIds.length > 1
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)
  const savedHint = formatSaveHint(session)

  // —— 中区：节点操作 / 插入 / 结构 / 主题的派生状态 ——
  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const rootTopicId = activeSheet?.rootTopic.id ?? null
  // 与画布快捷键/右键菜单一致：无 active 主题时回落到根节点
  const topicActionTargetId = session.activeTopicId ?? rootTopicId
  const deletableTopicIds = rootTopicId
    ? getDeletableTopicIds(selectedTopicIds, rootTopicId)
    : []
  const normalizedSelectedTopicIds = useMemo(
    () => (activeSheet ? normalizeTopicIdsForBatch(activeSheet.rootTopic, selectedTopicIds) : []),
    [activeSheet, selectedTopicIds],
  )
  const themes = useMemo(() => listThemes(), [])
  const currentThemeId = session.document?.theme?.id ?? DEFAULT_THEME_ID
  const currentThemeName = themes.find((theme) => theme.id === currentThemeId)?.name ?? '主题'
  const currentChartType = activeSheet?.chartType ?? 'mindmap'
  const currentChartTypeLabel =
    CHART_TYPE_OPTIONS.find((option) => option.value === currentChartType)?.label.split('（')[0] ??
    '结构'

  const handleCreateChildTopic = () => {
    if (topicActionTargetId) {
      void session.createChildTopic(topicActionTargetId)
    }
  }

  const handleCreateSiblingTopic = () => {
    if (topicActionTargetId) {
      void session.createSiblingTopic(topicActionTargetId)
    }
  }

  // 删除：与画布 Delete/Backspace 快捷键一致，单个走 deleteTopic，多个走批量 deleteTopics
  const handleDeleteTopics = () => {
    if (deletableTopicIds.length === 1) {
      void session.deleteTopic(deletableTopicIds[0])
    } else if (deletableTopicIds.length > 1) {
      void session.deleteTopics(deletableTopicIds, `删除 ${deletableTopicIds.length} 个主题`)
    }
  }

  // 备注/标签/链接/标记：聚焦 Inspector“主题”tab 编辑，不新增编辑 UI（批次 16 再做 marker 选择器）
  const handleInsertRichContent = () => {
    if (selectedTopicIds.length !== 1) {
      onNotify?.('请先选中一个主题')
      return
    }
    onFocusInspectorTopicTab?.()
  }

  const insertMenuItems: ToolbarMenuItem[] = [
    {
      key: 'relationship',
      label: '关系线',
      action: () => {
        if (selectedTopicIds.length === 2) {
          void session.createRelationship(selectedTopicIds[0], selectedTopicIds[1], null)
        } else {
          onNotify?.('请先选中两个主题')
        }
      },
    },
    {
      key: 'boundary',
      label: '边界',
      action: () => {
        if (activeSheet && normalizedSelectedTopicIds.length >= 2) {
          void session.createBoundary(activeSheet.id, normalizedSelectedTopicIds, null)
        } else {
          onNotify?.('请先框选至少两个主题')
        }
      },
    },
    {
      key: 'summary',
      label: '概要',
      action: () => {
        if (activeSheet && normalizedSelectedTopicIds.length >= 2) {
          void session.createSummary(activeSheet.id, normalizedSelectedTopicIds, '概要')
        } else {
          onNotify?.('请先框选至少两个主题')
        }
      },
    },
    { key: 'note', label: '备注', action: handleInsertRichContent },
    { key: 'label', label: '标签', action: handleInsertRichContent },
    { key: 'link', label: '链接', action: handleInsertRichContent },
    { key: 'marker', label: '标记', action: handleInsertRichContent },
  ]

  const structureMenuItems: ToolbarMenuItem[] = CHART_TYPE_OPTIONS.map((option) => ({
    key: option.value,
    label: option.label,
    checked: option.value === currentChartType,
    action: () => {
      if (activeSheet) {
        void session.setSheetChartType(activeSheet.id, option.value)
      }
    },
  }))

  const themeMenuItems: ToolbarMenuItem[] = themes.map((theme) => ({
    key: theme.id,
    label: theme.name,
    checked: theme.id === currentThemeId,
    action: () => void session.setDocumentTheme(theme.id),
  }))

  return (
    <header className="toolbar" aria-label="主工具栏">
      <div className="toolbar__left">
        <h1 className="toolbar__filename" title={session.filePath || '未命名文档'}>
          {formatFileLabel(session)}
        </h1>
        <span className="toolbar__save-hint">{savedHint}</span>
        {hasMultipleSelectedTopics ? (
          <div className="toolbar__selection" role="status" aria-live="polite">
            <span className="toolbar__selection-label">多选中</span>
            <span className="toolbar__selection-badge">{selectedTopicIds.length}</span>
            <span className="toolbar__selection-hint">
              已选中 {selectedTopicIds.length} 个主题，按 `Esc` 可回到单选
            </span>
            <button
              className="toolbar__selection-action"
              type="button"
              onClick={onClearSelection}
            >
              清空多选
            </button>
          </div>
        ) : null}

        <IconButton
          onClick={() => void session.createNewDocument()}
          title="新建文档（Cmd/Ctrl + N）"
          ariaLabel="新建文档"
          variant="primary"
        >
          <FilePlusIcon />
        </IconButton>

        <ToolbarDivider />

        <IconButton
          onClick={() => void session.openDocument()}
          disabled={!desktopFileActionsEnabled}
          title="打开文档（Cmd/Ctrl + O）"
          ariaLabel="打开文档"
        >
          <FolderOpenIcon />
        </IconButton>
        <IconButton
          onClick={() => void session.saveDocument()}
          disabled={!desktopFileActionsEnabled || !session.summary}
          title="保存文档（Cmd/Ctrl + S）"
          ariaLabel="保存文档"
        >
          <SaveIcon />
        </IconButton>
        <IconButton
          onClick={() => void session.saveDocumentAs()}
          disabled={!desktopFileActionsEnabled || !session.summary}
          title="另存为（Shift + Cmd/Ctrl + S）"
          ariaLabel="另存为"
        >
          <SaveAsIcon />
        </IconButton>

        <ToolbarDivider />

        <IconButton
          onClick={() => void session.undo()}
          disabled={!session.canUndo}
          title={session.nextUndoAction ?? '撤销'}
          ariaLabel={session.nextUndoAction ? `撤销 ${session.nextUndoAction}` : '撤销'}
        >
          <UndoIcon />
        </IconButton>
        <IconButton
          onClick={() => void session.redo()}
          disabled={!session.canRedo}
          title={session.nextRedoAction ?? '重做'}
          ariaLabel={session.nextRedoAction ? `重做 ${session.nextRedoAction}` : '重做'}
        >
          <RedoIcon />
        </IconButton>

        <ToolbarDivider />

        <ImportMenu session={session} />
        <ExportMenu session={session} />

        <ToolbarDivider />

        <IconButton
          onClick={() => setIsTemplatePickerOpen(true)}
          title="从模板新建文档"
          ariaLabel="从模板新建"
        >
          <LayoutIcon />
        </IconButton>
      </div>

      <div className="toolbar__center">
        <IconButton
          onClick={handleCreateChildTopic}
          disabled={!topicActionTargetId}
          title="新建子主题（Tab）"
          ariaLabel="新建子主题"
        >
          <SubTopicIcon />
        </IconButton>
        <IconButton
          onClick={handleCreateSiblingTopic}
          disabled={!topicActionTargetId || topicActionTargetId === rootTopicId}
          title="新建同级主题（Enter）"
          ariaLabel="新建同级主题"
        >
          <SiblingTopicIcon />
        </IconButton>
        <IconButton
          onClick={handleDeleteTopics}
          disabled={deletableTopicIds.length === 0}
          title="删除主题（Delete）"
          ariaLabel="删除主题"
        >
          <TrashIcon />
        </IconButton>

        <ToolbarDivider />

        <ToolbarMenu label="插入" disabled={!session.document} items={insertMenuItems}>
          <InsertIcon />
        </ToolbarMenu>

        <ToolbarDivider />

        <ToolbarMenu label="结构" disabled={!activeSheet} items={structureMenuItems}>
          <StructureIcon />
          <span className="toolbar__btn-label">{currentChartTypeLabel}</span>
        </ToolbarMenu>
        <ToolbarMenu label="主题" disabled={!session.document} items={themeMenuItems}>
          <ThemeIcon />
          <span className="toolbar__btn-label">{currentThemeName}</span>
        </ToolbarMenu>
      </div>

      <div className="toolbar__right">
        <IconButton
          onClick={() => onOpenSearch?.()}
          disabled={!session.document}
          title="搜索（Cmd/Ctrl + F）"
          ariaLabel="搜索"
        >
          <SearchIcon />
        </IconButton>
        {onToggleInspector ? (
          <button
            className="toolbar__icon-btn toolbar__icon-btn--ghost"
            type="button"
            onClick={onToggleInspector}
            title="检查器（Cmd/Ctrl + I）"
            aria-label="检查器"
            aria-pressed={inspectorVisible}
          >
            <PanelRightIcon />
          </button>
        ) : null}
        {onToggleOutliner ? (
          <button
            className="toolbar__icon-btn toolbar__icon-btn--ghost"
            type="button"
            onClick={onToggleOutliner}
            title={isOutlinerMode ? '返回画布（Esc）' : '大纲全屏视图'}
            aria-label={isOutlinerMode ? '返回画布' : '大纲视图'}
            aria-pressed={isOutlinerMode}
          >
            <LayoutIcon />
          </button>
        ) : null}
        {onToggleZenMode ? (
          <button
            className="toolbar__icon-btn toolbar__icon-btn--ghost"
            type="button"
            onClick={onToggleZenMode}
            title={isZenMode ? '退出专注模式（Esc）' : '进入专注模式（Cmd/Ctrl + .）'}
            aria-label={isZenMode ? '退出专注模式' : '进入专注模式'}
            aria-pressed={isZenMode}
          >
            {isZenMode ? <span className="toolbar__zen-exit">退出</span> : <span className="toolbar__zen-label">专注</span>}
          </button>
        ) : null}
        <button
          className={`toolbar__icon-btn${isZenMode ? '' : ' toolbar__icon-btn--primary'}`}
          type="button"
          disabled={!session.document}
          onClick={onStartPresentation}
          title="进入演示模式（Shift + Cmd/Ctrl + P）"
          aria-label="演示模式"
        >
          <PlayIcon size={14} />
          <span className="toolbar__btn-label">演示</span>
        </button>
        {onCheckForUpdates ? (
          <IconButton
            onClick={onCheckForUpdates}
            title="检查更新"
            ariaLabel="检查更新"
            variant="ghost"
          >
            <RefreshIcon />
          </IconButton>
        ) : null}
      </div>

      {isTemplatePickerOpen ? (
        <TemplatePicker
          session={session}
          onClose={() => setIsTemplatePickerOpen(false)}
        />
      ) : null}
    </header>
  )
}
