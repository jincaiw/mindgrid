import { useMemo, type ReactNode } from 'react'
import { getActiveSheet } from '../../lib/document/sheets'
import { collectVisibleTopicIds } from '../../lib/document/tree'
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

  // 统计信息按当前画布重算（XMind 只显示「主题: 序号/总数」，字数与字符数进悬停）
  const stats = useMemo(() => collectTopicStats(activeSheet?.rootTopic), [activeSheet?.rootTopic])

  /**
   * 「主题: n/N」的 N 用**可见**主题数而非全量主题数：
   * 序号取自可见序列的索引，若分母用全量，折叠状态下会出现「主题: 3/15」但点不到第 15 个
   * 的自相矛盾。分子分母同源才自洽。
   */
  const visibleTopicIds = useMemo(
    () => (activeSheet ? collectVisibleTopicIds(activeSheet.rootTopic) : []),
    [activeSheet],
  )
  const totalCount = visibleTopicIds.length
  const selectedIndex = session.activeTopicId
    ? visibleTopicIds.indexOf(session.activeTopicId)
    : -1

  // XMind 右段：主题: 序号/总数；多选时改为「已选 n/总数」
  const countLabel =
    selectedCount > 1
      ? `已选 ${selectedCount}/${totalCount}`
      : selectedIndex >= 0
        ? `主题: ${selectedIndex + 1}/${totalCount}`
        : `主题: ${totalCount}`

  // 字数、字符数与最近动作都收进悬停提示，信息不丢但不再占右段空间
  const countTitle = [
    `共 ${stats.topicCount} 个主题，${stats.wordCount} 字，${stats.charCount} 个字符`,
    selectedCount > 1 ? `已选中 ${selectedCount} 个主题` : null,
    session.recentAction ? `最近动作：${session.recentAction}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <footer className="status-bar" aria-label="状态栏">
      <div className="status-bar__left">{sheetTabs}</div>

      <div className="status-bar__right">
        <span className="status-bar__stat" title={countTitle}>
          {countLabel}
        </span>

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
