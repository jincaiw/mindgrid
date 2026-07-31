import { useState } from 'react'
import type { DocumentSession } from '../document/use-document-session'
import { hasTauriRuntime } from '../../lib/ipc/transport'
import { TemplatePicker } from './template-picker'

interface ToolbarProps {
  session: DocumentSession
  selectedTopicIds?: string[]
  onClearSelection?: () => void
  onStartPresentation?: () => void
  onCheckForUpdates?: () => void
}

function formatClockTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatPersistenceLabel(session: DocumentSession) {
  const savedLabel = session.lastSavedAtMs
    ? `保存 ${formatClockTime(session.lastSavedAtMs)}`
    : session.filePath
      ? '保存时间未建立'
      : '尚未保存到文件'

  const recoveryLabel = session.lastAutosavedAtMs
    ? `恢复区 ${formatClockTime(session.lastAutosavedAtMs)}`
    : '恢复区时间未建立'

  return `${savedLabel} · ${recoveryLabel}`
}

function formatFileLabel(session: DocumentSession) {
  if (!session.filePath) {
    return session.hasUnsavedChanges ? '未命名文档（有未保存更改）' : '未命名文档'
  }

  const pathSegments = session.filePath.split(/[\\/]/)
  const fileName = pathSegments[pathSegments.length - 1] || session.filePath

  return session.hasUnsavedChanges ? `${fileName}（未保存）` : fileName
}

export function Toolbar({ session, selectedTopicIds = [], onClearSelection, onStartPresentation, onCheckForUpdates }: ToolbarProps) {
  const desktopFileActionsEnabled = hasTauriRuntime()
  const hasMultipleSelectedTopics = selectedTopicIds.length > 1
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)

  return (
    <header className="toolbar" aria-label="主工具栏">
      <div className="toolbar__group">
        <div>
          <p className="toolbar__eyebrow">MindGrid</p>
          <h1 className="toolbar__title">专业桌面思维导图</h1>
          <p className="toolbar__eyebrow">{formatFileLabel(session)}</p>
          <p className="toolbar__eyebrow">{formatPersistenceLabel(session)}</p>
          {hasMultipleSelectedTopics ? (
            <div className="toolbar__selection" role="status" aria-live="polite">
              <span className="toolbar__selection-badge">多选中</span>
              <span>已选中 {selectedTopicIds.length} 个主题，按 `Esc` 可回到单选</span>
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
      </div>

      <div className="toolbar__group toolbar__group--actions">
        <button
          className="toolbar__button"
          type="button"
          disabled={!desktopFileActionsEnabled}
          onClick={() => void session.openDocument()}
          aria-keyshortcuts="Meta+O Control+O"
          title="打开文档（Cmd/Ctrl + O）"
        >
          打开
        </button>
        <button
          className="toolbar__button"
          type="button"
          disabled={!desktopFileActionsEnabled || !session.summary}
          onClick={() => void session.saveDocument()}
          aria-keyshortcuts="Meta+S Control+S"
          title="保存文档（Cmd/Ctrl + S）"
        >
          保存
        </button>
        <button
          className="toolbar__button"
          type="button"
          disabled={!desktopFileActionsEnabled || !session.summary}
          onClick={() => void session.saveDocumentAs()}
          aria-keyshortcuts="Shift+Meta+S Shift+Control+S"
          title="另存为（Shift + Cmd/Ctrl + S）"
        >
          另存为
        </button>
        <button
          className="toolbar__button"
          type="button"
          disabled={!desktopFileActionsEnabled || !session.summary}
          onClick={() => void session.exportMarkdownOutline()}
          title="导出 Markdown 大纲"
        >
          导出 Markdown
        </button>
        <button
          className="toolbar__button"
          type="button"
          disabled={!desktopFileActionsEnabled || !session.summary}
          onClick={() => void session.importMarkdownOutline()}
          title="从 Markdown 文件导入大纲"
        >
          导入 Markdown
        </button>
        <button
          className="toolbar__button"
          type="button"
          disabled={!desktopFileActionsEnabled || !session.summary}
          onClick={() => void session.exportOpmlOutline()}
          title="导出 OPML 大纲"
        >
          导出 OPML
        </button>
        <button
          className="toolbar__button"
          type="button"
          disabled={!desktopFileActionsEnabled || !session.summary}
          onClick={() => void session.importOpmlOutline()}
          title="从 OPML 文件导入大纲"
        >
          导入 OPML
        </button>
        <button
          className="toolbar__button"
          type="button"
          disabled={!desktopFileActionsEnabled || !session.summary}
          onClick={() => void session.exportPngImage()}
          title="导出 PNG 高清图片"
        >
          导出 PNG
        </button>
        <button
          className="toolbar__button"
          type="button"
          disabled={!desktopFileActionsEnabled || !session.summary}
          onClick={() => void session.exportSvgImage()}
          title="导出 SVG 矢量图"
        >
          导出 SVG
        </button>
        <button
          className="toolbar__button"
          type="button"
          disabled={!desktopFileActionsEnabled || !session.summary}
          onClick={() => void session.exportRecoveryCopy()}
        >
          导出恢复副本
        </button>
        <button
          className="toolbar__button"
          type="button"
          disabled={!session.canUndo}
          onClick={() => void session.undo()}
          aria-label={session.nextUndoAction ? `撤销 ${session.nextUndoAction}` : '撤销'}
          title={session.nextUndoAction ?? '当前没有可撤销的操作'}
        >
          撤销
        </button>
        <button
          className="toolbar__button"
          type="button"
          disabled={!session.canRedo}
          onClick={() => void session.redo()}
          aria-label={session.nextRedoAction ? `重做 ${session.nextRedoAction}` : '重做'}
          title={session.nextRedoAction ?? '当前没有可重做的操作'}
        >
          重做
        </button>
        <button
          className="toolbar__button toolbar__button--primary"
          type="button"
          onClick={() => void session.createNewDocument()}
          aria-keyshortcuts="Meta+N Control+N"
          title="新建文档（Cmd/Ctrl + N）"
        >
          新建文档
        </button>
        <button
          className="toolbar__button"
          type="button"
          onClick={() => setIsTemplatePickerOpen(true)}
          title="从模板新建文档"
        >
          从模板新建
        </button>
        <button
          className="toolbar__button toolbar__button--primary"
          type="button"
          disabled={!session.document}
          onClick={onStartPresentation}
          aria-keyshortcuts="Shift+Meta+P Shift+Control+P"
          title="进入演示模式（Shift + Cmd/Ctrl + P）"
        >
          演示
        </button>
        {onCheckForUpdates ? (
          <button
            className="toolbar__button toolbar__button--ghost"
            type="button"
            onClick={onCheckForUpdates}
            title="检查应用更新"
          >
            检查更新
          </button>
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
