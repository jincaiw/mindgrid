import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentSession } from '../document/use-document-session'
import { getActiveSheet } from '../../lib/document/sheets'
import { normalizeTopicIdsForBatch } from '../../lib/document/tree'
import {
  ChevronDownIcon,
  GroupIcon,
  InsertIcon,
  KeyboardIcon,
  MarkerIcon,
  MaximizeIcon,
  MonitorIcon,
  MoonIcon,
  PanelRightIcon,
  PlayIcon,
  RelationshipIcon,
  SiblingTopicIcon,
  SubTopicIcon,
  SummaryIcon,
  SunIcon,
} from './icons'
import type { EffectiveTheme, ThemeMode } from '../theme/use-theme'

interface ToolbarProps {
  session: DocumentSession
  selectedTopicIds?: string[]
  onClearSelection?: () => void
  onStartPresentation?: () => void
  onToggleZenMode?: () => void
  isZenMode?: boolean
  /** 格式面板显隐（与 Cmd/Ctrl + I 同一行为） */
  inspectorVisible?: boolean
  onToggleInspector?: () => void
  /** 插入 备注/标签/链接/标记：确保 Inspector 可见并切到“主题”tab */
  onFocusInspectorTopicTab?: () => void
  /** 瞬态通知（如插入条件不满足时的引导提示） */
  onNotify?: (message: string) => void
  /** 批次 20：UI 主题模式（system → light → dark 循环） */
  themeMode?: ThemeMode
  /** 批次 20：当前实际生效的主题（用于图标显示） */
  themeEffective?: EffectiveTheme
  /** 批次 20：切换主题模式 */
  onCycleTheme?: () => void
  /** 批次 20：打开快捷键帮助浮层 */
  onOpenShortcutsHelp?: () => void
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

/** 外框与概要的默认标签（与画布右键菜单、检查器保持一致）。 */
const BOUNDARY_LABEL = '分组'
const SUMMARY_LABEL = '概要'

/** 分组分隔符：1px 竖线。 */
/**
 * 工具栏的**组间距**。XMind 的工具栏没有竖分隔线，组与组之间靠更大的空白分开，
 * 所以这里渲染的是纯占位（不是一条线）。原来叫 ToolbarDivider 并画一条竖线，
 * 与基准不符，且删掉样式后会变成无样式的残留元素。
 */
function ToolbarGroupGap() {
  return <span className="toolbar__group-gap" aria-hidden="true" />
}

/**
 * XMind 式竖排动作按钮：图标在上、小字在下。
 *
 * 与 IconButton（纯图标、靠 tooltip 说明）区分开——XMind 工具栏的主操作
 * 都是带文字的，这样不悬停也能看懂。工具栏中段与右段全部用它。
 */
function ToolbarAction({
  onClick,
  disabled = false,
  pressed,
  title,
  label,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  /** 提供时渲染 aria-pressed 切换态（ZEN、格式面板这类开关） */
  pressed?: boolean
  title: string
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      className="toolbar__action"
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={label}
      aria-pressed={pressed}
    >
      {children}
      <span className="toolbar__action-label">{label}</span>
    </button>
  )
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
export function Toolbar({
  session,
  selectedTopicIds = [],
  onClearSelection,
  onStartPresentation,
  onToggleZenMode,
  isZenMode = false,
  inspectorVisible = true,
  onToggleInspector,
  onFocusInspectorTopicTab,
  onNotify,
  themeMode = 'system',
  themeEffective = 'light',
  onCycleTheme,
  onOpenShortcutsHelp,
}: ToolbarProps) {
  const hasMultipleSelectedTopics = selectedTopicIds.length > 1
  const savedHint = formatSaveHint(session)

  // —— 中区：节点操作 / 插入 的派生状态 ——
  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const rootTopicId = activeSheet?.rootTopic.id ?? null
  // 与画布快捷键/右键菜单一致：无 active 主题时回落到根节点
  const topicActionTargetId = session.activeTopicId ?? rootTopicId
  const normalizedSelectedTopicIds = useMemo(
    () => (activeSheet ? normalizeTopicIdsForBatch(activeSheet.rootTopic, selectedTopicIds) : []),
    [activeSheet, selectedTopicIds],
  )
  /** 联系要正好两个主题；外框与概要要至少两个。 */
  const canGroupSelection = Boolean(activeSheet) && normalizedSelectedTopicIds.length >= 2

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

  const handleCreateRelationship = () => {
    if (selectedTopicIds.length === 2) {
      void session.createRelationship(selectedTopicIds[0], selectedTopicIds[1], null)
    } else {
      onNotify?.('请先选中两个主题')
    }
  }

  const handleCreateBoundary = () => {
    if (activeSheet && normalizedSelectedTopicIds.length >= 2) {
      void session.createBoundary(activeSheet.id, normalizedSelectedTopicIds, BOUNDARY_LABEL)
    } else {
      onNotify?.('请先选中至少两个主题')
    }
  }

  const handleCreateSummary = () => {
    if (activeSheet && normalizedSelectedTopicIds.length >= 2) {
      void session.createSummary(activeSheet.id, normalizedSelectedTopicIds, SUMMARY_LABEL)
    } else {
      onNotify?.('请先选中至少两个主题')
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

  // 插入弹层按 XMind 的顺序排：笔记 / 标签 / 任务 / 链接 / 标记。
  // 联系、外框、概要 在工具栏已有独立按钮，这里保留一份便于未框选时用菜单引导。
  const insertMenuItems: ToolbarMenuItem[] = [
    { key: 'note', label: '笔记', action: handleInsertRichContent },
    { key: 'label', label: '标签', action: handleInsertRichContent },
    { key: 'task', label: '任务', action: handleInsertRichContent },
    { key: 'link', label: '链接', action: handleInsertRichContent },
    { key: 'marker', label: '标记', action: handleInsertRichContent },
    { key: 'relationship', label: '联系', action: handleCreateRelationship },
    { key: 'boundary', label: '外框', action: handleCreateBoundary },
    { key: 'summary', label: '概要', action: handleCreateSummary },
  ]

  return (
    <header className="toolbar" aria-label="主工具栏" data-tauri-drag-region>
      <div className="toolbar__left">
        <h1
          className="toolbar__filename"
          title={session.filePath || '未命名文档'}
          data-tauri-drag-region
        >
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

        {/*
          XMind 工具栏左段只有文档标题与编辑状态，文件操作一律收进菜单与快捷键
          （新建⌘N / 打开⌘O / 保存⌘S / 另存为⇧⌘S / 撤销⌘Z / 重做⇧⌘Z）。
          这里只留标题、保存状态与多选提示，不再塞图标按钮。
        */}
      </div>

      {/*
        中段对标 XMind：图标在上、小字在下竖排，顺序为
        主题 / 子主题 / 联系 / 概要 / 外框 / 标记 / 插入。
        结构与配色下拉已移到右栏「画布」子页的骨架卡片与配色方案（XMind 同样如此）；
        删除按钮 XMind 也没有，由右键菜单与 Delete 键承担。
      */}
      <div className="toolbar__center">
        <ToolbarAction
          onClick={handleCreateSiblingTopic}
          disabled={!topicActionTargetId || topicActionTargetId === rootTopicId}
          title="主题：在选中主题之后插入同级（Enter）"
          label="主题"
        >
          <SiblingTopicIcon />
        </ToolbarAction>
        <ToolbarAction
          onClick={handleCreateChildTopic}
          disabled={!topicActionTargetId}
          title="子主题（Tab）"
          label="子主题"
        >
          <SubTopicIcon />
        </ToolbarAction>
        <ToolbarAction
          onClick={handleCreateRelationship}
          disabled={selectedTopicIds.length !== 2}
          title="联系：先选中两个主题"
          label="联系"
        >
          <RelationshipIcon />
        </ToolbarAction>
        <ToolbarAction
          onClick={handleCreateSummary}
          disabled={!canGroupSelection}
          title="概要：先选中至少两个主题"
          label="概要"
        >
          <SummaryIcon />
        </ToolbarAction>
        <ToolbarAction
          onClick={handleCreateBoundary}
          disabled={!canGroupSelection}
          title="外框：先选中至少两个主题"
          label="外框"
        >
          <GroupIcon />
        </ToolbarAction>
        <ToolbarAction
          onClick={handleInsertRichContent}
          disabled={selectedTopicIds.length !== 1}
          title="标记"
          label="标记"
        >
          <MarkerIcon />
        </ToolbarAction>

        <ToolbarGroupGap />

        <ToolbarMenu label="插入" disabled={!session.document} items={insertMenuItems}>
          <InsertIcon />
          <span className="toolbar__action-label">插入</span>
        </ToolbarMenu>
      </div>

      {/* 右段对标 XMind：ZEN / 演说 / 格式（图标+小字）。
          搜索⌘F、侧栏⌘B、大纲、甘特、检查更新、快捷键一律收进原生菜单与状态条。 */}
      <div className="toolbar__right">
        {onToggleZenMode ? (
          <ToolbarAction
            onClick={onToggleZenMode}
            pressed={isZenMode}
            title={isZenMode ? '退出 ZEN 模式（Esc）' : '进入 ZEN 模式（Cmd/Ctrl + .）'}
            label="ZEN"
          >
            <MaximizeIcon />
          </ToolbarAction>
        ) : null}
        <ToolbarAction
          onClick={() => onStartPresentation?.()}
          disabled={!session.document}
          title="演说模式（Shift + Cmd/Ctrl + P）"
          label="演说"
        >
          <PlayIcon />
        </ToolbarAction>
        {onToggleInspector ? (
          <ToolbarAction
            onClick={onToggleInspector}
            pressed={inspectorVisible}
            title="格式面板（Cmd/Ctrl + I）"
            label="格式"
          >
            <PanelRightIcon />
          </ToolbarAction>
        ) : null}

        <ToolbarGroupGap />

        {onOpenShortcutsHelp ? (
          <button
            className="toolbar__icon-btn toolbar__icon-btn--ghost"
            type="button"
            onClick={onOpenShortcutsHelp}
            title="键盘快捷键"
            aria-label="键盘快捷键"
          >
            <KeyboardIcon />
          </button>
        ) : null}
        {onCycleTheme ? (
          <button
            className="toolbar__icon-btn toolbar__icon-btn--ghost"
            type="button"
            onClick={onCycleTheme}
            title={formatThemeTooltip(themeMode, themeEffective)}
            aria-label={formatThemeAriaLabel(themeMode, themeEffective)}
            aria-pressed={themeMode !== 'system'}
          >
            {renderThemeIcon(themeMode, themeEffective)}
          </button>
        ) : null}
      </div>

    </header>
  )
}

/**
 * 主题切换按钮的 tooltip：当前模式 + 点击后的下一模式。
 * 循环：system → light → dark → system
 */
function formatThemeTooltip(mode: ThemeMode, effective: EffectiveTheme): string {
  const currentLabel = mode === 'system' ? `跟随系统（${effective === 'dark' ? '暗色' : '浅色'}）` : mode === 'light' ? '浅色' : '暗色'
  const nextLabel = mode === 'system' ? '浅色' : mode === 'light' ? '暗色' : '跟随系统'
  return `主题：${currentLabel}（点击切换到 ${nextLabel}）`
}

/** 主题切换按钮的无障碍标签（与 tooltip 文案一致）。 */
function formatThemeAriaLabel(mode: ThemeMode, effective: EffectiveTheme): string {
  return formatThemeTooltip(mode, effective)
}

/**
 * 渲染主题切换按钮图标：按当前模式选择对应图标。
 * - system：MonitorIcon（表示跟随系统）
 * - light：SunIcon
 * - dark：MoonIcon
 */
function renderThemeIcon(mode: ThemeMode, _effective: EffectiveTheme) {
  if (mode === 'system') return <MonitorIcon />
  if (mode === 'light') return <SunIcon />
  return <MoonIcon />
}
