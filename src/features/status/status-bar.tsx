import { getActiveSheet } from '../../lib/document/sheets'
import type { DocumentSession } from '../document/use-document-session'

interface StatusBarProps {
  session: DocumentSession
}

const RECENT_AUTOSAVE_HINT_WINDOW_MS = 2 * 60 * 1000

function formatAutosaveState(session: DocumentSession) {
  if (!session.lastAutosavedAtMs) {
    return '未建立恢复快照'
  }

  return session.recoveredFromAutosave ? '已从恢复快照恢复' : '恢复快照已就绪'
}

function formatDocumentState(session: DocumentSession) {
  if (!session.filePath) {
    return session.hasUnsavedChanges ? '未命名（有未保存更改）' : '未命名'
  }

  return session.hasUnsavedChanges ? '已关联文件（有未保存更改）' : '已关联文件'
}

function formatHistoryState(session: DocumentSession) {
  const undoLabel = session.nextUndoAction ? `可撤销 ${session.nextUndoAction}` : '撤销栈为空'
  const redoLabel = session.nextRedoAction ? `可重做 ${session.nextRedoAction}` : '重做栈为空'

  return `${undoLabel} / ${redoLabel}`
}

function formatEmptyRecordState(session: DocumentSession) {
  if (session.recoveredFromAutosave) {
    return {
      badge: '恢复起点',
      detail: '已从恢复快照回到当前文档，新的整理会从这里开始。',
    }
  }

  if (session.recentAction === '已保存文档' || session.recentAction === '已另存文档') {
    return {
      badge: '已保存',
      detail: '当前整理已经落盘，下一段结构操作会从空白记录重新开始。',
    }
  }

  if (
    session.lastAutosavedAtMs &&
    Date.now() - session.lastAutosavedAtMs <= RECENT_AUTOSAVE_HINT_WINDOW_MS &&
    (!session.lastSavedAtMs || session.lastAutosavedAtMs > session.lastSavedAtMs)
  ) {
    return {
      badge: '恢复区已更新',
      detail: '最近的结构变更已经写入恢复快照，异常退出后也能从这里继续。',
    }
  }

  return {
    badge: '空闲',
    detail: '暂无结构操作。',
  }
}

export function StatusBar({ session }: StatusBarProps) {
  const activeSheetTitle = session.document ? getActiveSheet(session.document).title : '-'
  const recentActions = session.recentActions.slice(0, 3)
  const emptyRecordState = formatEmptyRecordState(session)

  return (
    <footer className="status-bar" aria-label="状态栏">
      <span>状态：{session.status}</span>
      <span>最近动作：{session.recentAction}</span>
      <span>文档：{formatDocumentState(session)}</span>
      <span>画布：{activeSheetTitle}</span>
      <span>修复：{session.repairReport ? '已生成修复摘要' : '无'}</span>
      <span>当前选中：{session.activeTopicId ?? '-'}</span>
      <span>恢复：{formatAutosaveState(session)}</span>
      <span>历史：{formatHistoryState(session)}</span>
      <span className="status-bar__record">
        记录：
        <span className="status-bar__record-list">
          {recentActions.length === 0 ? (
            <span className="status-bar__record-item status-bar__record-item--empty">
              <span className="status-bar__record-badge">{emptyRecordState.badge}</span>
              <span>{emptyRecordState.detail}</span>
            </span>
          ) : (
            recentActions.map((action) => (
              <span
                key={`${action.label}-${action.scope ?? 'none'}-${action.detail}`}
                className="status-bar__record-item"
                title={`已${action.detail}`}
              >
                <span className="status-bar__record-badge">{action.label}</span>
                {action.scope ? <span className="status-bar__record-scope">{action.scope}</span> : null}
                <span>{action.detail}</span>
                {action.count > 1 ? (
                  <span className="status-bar__record-count">×{action.count}</span>
                ) : null}
              </span>
            ))
          )}
        </span>
      </span>
    </footer>
  )
}
