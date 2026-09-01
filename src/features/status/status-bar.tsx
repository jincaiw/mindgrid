import { getActiveSheet } from '../../lib/document/sheets'
import type { SessionStatus } from '../../lib/document/types'
import type { DocumentSession } from '../document/use-document-session'

interface StatusBarProps {
  session: DocumentSession
  /** 真实多选计数（WorkspaceScreen 上报）；缺省回退为 activeTopicId 推导的 0/1 */
  selectedTopicCount?: number
}

const STATUS_LABELS: Record<SessionStatus, string> = {
  idle: '空闲',
  loading: '加载中',
  ready: '就绪',
  error: '错误',
}

function formatDocumentName(session: DocumentSession) {
  const fileName = session.filePath?.split(/[\\/]/).filter(Boolean).pop()
  const baseName = fileName ?? '未命名'

  return session.hasUnsavedChanges ? `${baseName}（未保存）` : baseName
}

export function StatusBar({ session, selectedTopicCount }: StatusBarProps) {
  const activeSheetTitle = session.document ? getActiveSheet(session.document).title : '-'
  const selectedCount = selectedTopicCount ?? (session.activeTopicId ? 1 : 0)

  return (
    <footer className="status-bar" aria-label="状态栏">
      <div className="status-bar__group">
        <span>状态：{STATUS_LABELS[session.status]}</span>
        <span>文档：{formatDocumentName(session)}</span>
        <span>画布：{activeSheetTitle}</span>
      </div>
      <div className="status-bar__group">
        <span>选中：{selectedCount} 个主题</span>
        <span>最近动作：{session.recentAction}</span>
      </div>
    </footer>
  )
}
