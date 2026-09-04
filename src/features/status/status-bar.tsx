import { useMemo, type ReactNode } from 'react'
import { getActiveSheet } from '../../lib/document/sheets'
import type { DocumentSession } from '../document/use-document-session'
import { collectTopicStats } from './topic-stats'

interface StatusBarProps {
  session: DocumentSession
  /** 真实多选计数（WorkspaceScreen 上报）；缺省回退为 activeTopicId 推导的 0/1 */
  selectedTopicCount?: number
  /** 当前画布缩放比例（1 = 100%），由 WorkspaceScreen 提升的相机状态提供 */
  zoom?: number
  /** 点击缩放比例复位到 100% */
  onResetZoom?: () => void
  isOutlinerMode?: boolean
  onToggleOutliner?: () => void
  /**
   * 左侧插槽：XMind 把画布分页标签放在状态条左侧，故由调用方传入 SheetTabBar。
   * 用插槽而非直接 import，避免 status → workspace 的跨特性依赖
   * （workspace-screen 会 import 本组件，反向 import 即成环）。
   */
  sheetTabs?: ReactNode
}

export function StatusBar({
  session,
  selectedTopicCount,
  zoom,
  onResetZoom,
  isOutlinerMode = false,
  onToggleOutliner,
  sheetTabs,
}: StatusBarProps) {
  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const selectedCount = selectedTopicCount ?? (session.activeTopicId ? 1 : 0)

  // 统计信息按当前画布重算：XMind 状态条右段为「主题个数 / 字数 / 字符数」
  const stats = useMemo(() => collectTopicStats(activeSheet?.rootTopic), [activeSheet?.rootTopic])

  return (
    <footer className="status-bar" aria-label="状态栏">
      <div className="status-bar__left">{sheetTabs}</div>

      <div className="status-bar__right">
        {session.recentAction ? (
          <span className="status-bar__action" title={session.recentAction}>
            {session.recentAction}
          </span>
        ) : null}

        <span
          className="status-bar__stat"
          title={`当前画布共 ${stats.topicCount} 个主题，${stats.wordCount} 字，${stats.charCount} 个字符`}
        >
          {`${stats.topicCount} 个主题 · ${stats.wordCount} 字`}
        </span>

        <span className="status-bar__stat">{`选中 ${selectedCount}`}</span>

        {onResetZoom ? (
          <button
            type="button"
            className="status-bar__button"
            onClick={onResetZoom}
            title="点击复位到 100%"
          >
            {Math.round((zoom ?? 1) * 100)}%
          </button>
        ) : null}

        {onToggleOutliner ? (
          <button
            type="button"
            className="status-bar__button"
            aria-pressed={isOutlinerMode}
            onClick={onToggleOutliner}
            title="切换大纲模式"
          >
            大纲
          </button>
        ) : null}
      </div>
    </footer>
  )
}
