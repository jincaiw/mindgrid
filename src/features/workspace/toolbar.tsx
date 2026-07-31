import { useEffect, useRef, useState } from 'react'
import type { DocumentSession } from '../document/use-document-session'
import { hasTauriRuntime } from '../../lib/ipc/transport'
import { TemplatePicker } from './template-picker'
import {
  ChevronDownIcon,
  DownloadIcon,
  FilePlusIcon,
  FolderOpenIcon,
  LayoutIcon,
  PlayIcon,
  RedoIcon,
  RefreshIcon,
  SaveAsIcon,
  SaveIcon,
  ShareIcon,
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
}

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
}: ToolbarProps) {
  const desktopFileActionsEnabled = hasTauriRuntime()
  const hasMultipleSelectedTopics = selectedTopicIds.length > 1
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)
  const savedHint = formatSaveHint(session)

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
      </div>

      <div className="toolbar__center">
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

      <div className="toolbar__right">
        {onToggleZenMode ? (
          <button
            className="toolbar__icon-btn toolbar__icon-btn--ghost"
            type="button"
            onClick={onToggleZenMode}
            title={isZenMode ? '退出专注模式' : '进入专注模式'}
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
