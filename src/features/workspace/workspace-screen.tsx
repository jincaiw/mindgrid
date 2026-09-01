import { useEffect, useState } from 'react'
import { getActiveSheet } from '../../lib/document/sheets'
import { syncSelectionWithActiveTopic } from '../canvas/interaction-state'
import { CanvasHost } from '../canvas/canvas-host'
import type { DocumentSession } from '../document/use-document-session'
import { PresentationView } from '../presentation/presentation-view'
import { ShortcutsHelp } from '../shortcuts/shortcuts-help'
import type { EffectiveTheme, ThemeMode } from '../theme/use-theme'
import { Inspector, type InspectorTab } from './inspector'
import { OutlinerView } from './outliner-view'
import { SheetTabBar } from './sheet-tab-bar'
import { Sidebar } from './sidebar'
import { Toolbar } from './toolbar'

interface WorkspaceScreenProps {
  session: DocumentSession
  onCheckForUpdates?: () => void
  // 画布等深层组件的瞬态通知（ToastRegion 展示）
  onNotify?: (message: string) => void
  // 多选计数上报（AppShell 状态栏显示真实选中数）
  onSelectedTopicCountChange?: (count: number) => void
  // 批次 20：UI 主题切换（system → light → dark → system 循环）
  themeMode?: ThemeMode
  themeEffective?: EffectiveTheme
  onCycleTheme?: () => void
}

export function WorkspaceScreen({
  session,
  onCheckForUpdates,
  onNotify,
  onSelectedTopicCountChange,
  themeMode = 'system',
  themeEffective = 'light',
  onCycleTheme,
}: WorkspaceScreenProps) {
  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(() =>
    session.activeTopicId ? [session.activeTopicId] : activeSheet ? [activeSheet.rootTopic.id] : [],
  )
  const [isPresenting, setIsPresenting] = useState(false)
  const [isZenMode, setIsZenMode] = useState(false)
  // 批次 14：搜索框开关提升到本层，工具栏搜索按钮与 Cmd/Ctrl + F 共用
  const [searchOpen, setSearchOpen] = useState(false)
  // 批次 14：检查器显隐（Cmd/Ctrl + I 或工具栏按钮），默认显示
  const [inspectorVisible, setInspectorVisible] = useState(true)
  // 批次 19：大纲全屏视图（隐藏画布，全宽编辑主题树，Esc 返回）
  const [isOutlinerMode, setIsOutlinerMode] = useState(false)
  // 批次 20：快捷键帮助浮层显隐
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false)
  // 工具栏“插入→备注/标签/链接/标记”：请求 Inspector 切到主题 tab
  const [inspectorTabRequest, setInspectorTabRequest] = useState<{
    tab: InspectorTab
    nonce: number
  } | null>(null)
  const clearMultiSelection = () => {
    setSelectedTopicIds([
      session.activeTopicId ?? activeSheet?.rootTopic.id ?? selectedTopicIds[0] ?? '',
    ].filter(Boolean))
  }
  const focusInspectorTopicTab = () => {
    setInspectorVisible(true)
    setInspectorTabRequest((current) => ({ tab: 'topic', nonce: (current?.nonce ?? 0) + 1 }))
  }

  useEffect(() => {
    if (!activeSheet) {
      setSelectedTopicIds([])
      return
    }

    setSelectedTopicIds((currentSelected) =>
      syncSelectionWithActiveTopic(currentSelected, session.activeTopicId ?? activeSheet.rootTopic.id),
    )
  }, [activeSheet?.id, activeSheet?.rootTopic.id, session.activeTopicId, session.document?.revision])

  // 向 AppShell 上报真实多选计数（状态栏显示）
  useEffect(() => {
    onSelectedTopicCountChange?.(selectedTopicIds.length)
  }, [selectedTopicIds.length, onSelectedTopicCountChange])

  // 快捷键：Cmd/Ctrl + . 切换 ZEN 模式（Esc 退出），Shift + Cmd/Ctrl + P 进入演示模式，
  // Cmd/Ctrl + I 切换检查器显隐（preventDefault 避免浏览器书签栏冲突），
  // Esc 在大纲全屏视图或 ZEN 模式下退出
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        setIsZenMode((v) => !v)
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        // 与工具栏演示按钮同一进入路径；已打开时 setIsPresenting(true) 为幂等，相当于忽略
        e.preventDefault()
        if (session.document) {
          setIsPresenting(true)
        }
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setInspectorVisible((v) => !v)
      } else if (e.key === 'Escape') {
        if (isOutlinerMode) {
          // 大纲视图自身已处理 Esc 退出；此处仅作兜底，避免与画布交互冲突
          setIsOutlinerMode(false)
        } else if (isZenMode) {
          setIsZenMode(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isZenMode, isOutlinerMode, session.document])

  return (
    <div
      className={`workspace-shell${isZenMode ? ' workspace-shell--zen' : ''}${
        isOutlinerMode ? ' workspace-shell--outliner' : ''
      }`}
    >
      <Toolbar
        session={session}
        selectedTopicIds={selectedTopicIds}
        onClearSelection={clearMultiSelection}
        onStartPresentation={() => setIsPresenting(true)}
        onCheckForUpdates={onCheckForUpdates}
        onToggleZenMode={() => setIsZenMode((v) => !v)}
        isZenMode={isZenMode}
        onOpenSearch={() => setSearchOpen(true)}
        inspectorVisible={inspectorVisible}
        onToggleInspector={() => setInspectorVisible((v) => !v)}
        isOutlinerMode={isOutlinerMode}
        onToggleOutliner={() => setIsOutlinerMode((v) => !v)}
        onFocusInspectorTopicTab={focusInspectorTopicTab}
        onNotify={onNotify}
        themeMode={themeMode}
        themeEffective={themeEffective}
        onCycleTheme={onCycleTheme}
        onOpenShortcutsHelp={() => setIsShortcutsHelpOpen(true)}
      />
      {isZenMode ? (
        <button
          className="zen-exit-btn"
          type="button"
          onClick={() => setIsZenMode(false)}
          title="退出专注模式（Esc）"
          aria-label="退出专注模式"
        >
          退出专注
        </button>
      ) : null}
      <div
        className={`workspace-shell__body${
          inspectorVisible && !isOutlinerMode ? '' : ' workspace-shell__body--inspector-hidden'
        }${isOutlinerMode ? ' workspace-shell__body--outliner' : ''}`}
      >
        {isOutlinerMode ? (
          <OutlinerView
            session={session}
            selectedTopicIds={selectedTopicIds}
            onSelectedTopicIdsChange={setSelectedTopicIds}
            onExit={() => setIsOutlinerMode(false)}
          />
        ) : (
          <>
            <Sidebar
              session={session}
              selectedTopicIds={selectedTopicIds}
              onSelectedTopicIdsChange={setSelectedTopicIds}
            />
            <CanvasHost
              session={session}
              selectedTopicIds={selectedTopicIds}
              onSelectedTopicIdsChange={setSelectedTopicIds}
              onNotify={onNotify}
              searchOpen={searchOpen}
              onSearchOpenChange={setSearchOpen}
            />
            {inspectorVisible ? (
              <Inspector
                session={session}
                selectedTopicIds={selectedTopicIds}
                onSelectedTopicIdsChange={setSelectedTopicIds}
                tabRequest={inspectorTabRequest}
              />
            ) : null}
          </>
        )}
      </div>
      {isZenMode ? null : <SheetTabBar session={session} />}
      {isPresenting && session.document ? (
        <PresentationView document={session.document} onExit={() => setIsPresenting(false)} />
      ) : null}
      <ShortcutsHelp open={isShortcutsHelpOpen} onClose={() => setIsShortcutsHelpOpen(false)} />
    </div>
  )
}
