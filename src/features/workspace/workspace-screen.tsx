import { useCallback, useEffect, useState } from 'react'
import { getActiveSheet } from '../../lib/document/sheets'
import { hasTauriRuntime } from '../../lib/ipc/transport'
import type { CameraState } from '../canvas/camera'
import type { CanvasCommand } from '../menu/menu-actions'
import type { MenuActionId } from '../menu/menu-actions'
import { runMenuCommand } from '../menu/menu-dispatch'
import { useNativeMenuActions } from '../menu/use-native-menu-actions'
import { syncSelectionWithActiveTopic } from '../canvas/interaction-state'
import { CanvasHost } from '../canvas/canvas-host'
import { GanttView } from '../gantt/gantt-view'
import type { DocumentSession } from '../document/use-document-session'
import { PresentationView } from '../presentation/presentation-view'
import { ShortcutsHelp } from '../shortcuts/shortcuts-help'
import { StatusBar } from '../status/status-bar'
import type { EffectiveTheme, ThemeMode } from '../theme/use-theme'
import { Inspector, type InspectorTab } from './inspector'
import { OutlinerView } from './outliner-view'
import { SheetTabBar } from './sheet-tab-bar'
import { NavPanel } from './nav-panel'
import { Toolbar } from './toolbar'

interface WorkspaceScreenProps {
  session: DocumentSession
  onCheckForUpdates?: () => void
  // 画布等深层组件的瞬态通知（ToastRegion 展示）
  onNotify?: (message: string) => void
  // 批次 20：UI 主题切换（system → light → dark → system 循环）
  themeMode?: ThemeMode
  themeEffective?: EffectiveTheme
  onCycleTheme?: () => void
}

export function WorkspaceScreen({
  session,
  onCheckForUpdates,
  onNotify,
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
  // 批次 26：侧栏折叠（工具栏按钮 + Cmd/Ctrl + B），默认展开，sessionStorage 记忆
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem('mindgrid.sidebar-visible') !== '0'
    } catch {
      return true
    }
  })
  // 批次 19：大纲全屏视图（隐藏画布，全宽编辑主题树，Esc 返回）
  const [isOutlinerMode, setIsOutlinerMode] = useState(false)
  // 批次 23：甘特图全屏视图（汇总全文档任务时间轴，Esc 返回）
  const [isGanttMode, setIsGanttMode] = useState(false)
  // 批次 20：快捷键帮助浮层显隐
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false)
  // 工具栏“插入→备注/标签/链接/标记”：请求 Inspector 切到样式子页
  const [inspectorTabRequest, setInspectorTabRequest] = useState<{
    tab: InspectorTab
    nonce: number
  } | null>(null)
  const clearMultiSelection = () => {
    setSelectedTopicIds([
      session.activeTopicId ?? activeSheet?.rootTopic.id ?? selectedTopicIds[0] ?? '',
    ].filter(Boolean))
  }
  // 必须保持引用稳定：菜单派发的 useCallback 依赖它，
  // 若每次渲染都是新引用，handleMenuAction 会跟着每渲染重建一次。
  const focusInspectorTopicTab = useCallback(() => {
    setInspectorVisible(true)
    setInspectorTabRequest((current) => ({ tab: 'style', nonce: (current?.nonce ?? 0) + 1 }))
  }, [])

  useEffect(() => {
    if (!activeSheet) {
      setSelectedTopicIds([])
      return
    }

    setSelectedTopicIds((currentSelected) =>
      syncSelectionWithActiveTopic(currentSelected, session.activeTopicId ?? activeSheet.rootTopic.id),
    )
  }, [activeSheet?.id, activeSheet?.rootTopic.id, session.activeTopicId, session.document?.revision])

  // 状态栏右段需显示缩放比例（对标 XMind 状态条），故把缩放提升到本层。
  // 只存 zoom 数值而非整个相机对象：平移时 x/y 每帧都变，若整棵子树跟着重渲染会明显掉帧；
  // 且用「相同值返回原值」的 updater 显式让 React 跳过无变化更新。
  const [zoom, setZoom] = useState<number | null>(null)
  const [zoomRequest, setZoomRequest] = useState<{ zoom: number; nonce: number } | null>(null)

  const handleCameraChange = useCallback((camera: CameraState) => {
    setZoom((current) => (current === camera.zoom ? current : camera.zoom))
  }, [])

  const handleResetZoom = useCallback(() => {
    setZoomRequest((current) => ({ zoom: 1, nonce: (current?.nonce ?? 0) + 1 }))
  }, [])

  // 浏览器环境下没有原生菜单栏，文件动作也不可用（与 AppShell 的快捷键同款约束）。
  // 菜单栏命令在浏览器里不会被触发，但这些动作也可能由其它入口走到，故统一拦一层。
  const desktopFileActionsEnabled = hasTauriRuntime()

  // 原生菜单栏命令（对标批次 A5）：复制/剪切/粘贴与回到中心依赖画布内部状态，
  // 用 nonce 单向请求转发；其余动作本层直接执行。
  const [canvasCommand, setCanvasCommand] = useState<{
    command: CanvasCommand
    nonce: number
  } | null>(null)

  const handleMenuAction = useCallback(
    (id: MenuActionId) => {
      runMenuCommand(id, {
        session,
        activeSheet,
        selectedTopicIds,
        desktopFileActionsEnabled,
        notify: (message) => onNotify?.(message),
        setSelectedTopicIds,
        toggleZenMode: () => setIsZenMode((v) => !v),
        toggleGanttMode: () => setIsGanttMode((v) => !v),
        toggleInspector: () => setInspectorVisible((v) => !v),
        toggleSidebar: () => setSidebarVisible((v) => !v),
        startPresentation: () => setIsPresenting(true),
        openSearch: () => setSearchOpen(true),
        resetZoom: handleResetZoom,
        focusInspectorTopicTab,
        openShortcutsHelp: () => setIsShortcutsHelpOpen(true),
        checkForUpdates: () => onCheckForUpdates?.(),
        cycleTheme: () => onCycleTheme?.(),
        requestCanvasCommand: (command) =>
          setCanvasCommand((current) => ({ command, nonce: (current?.nonce ?? 0) + 1 })),
      })
    },
    [
      activeSheet,
      desktopFileActionsEnabled,
      focusInspectorTopicTab,
      handleResetZoom,
      onCheckForUpdates,
      onCycleTheme,
      onNotify,
      selectedTopicIds,
      session,
    ],
  )

  useNativeMenuActions(handleMenuAction)

  // 批次 26：侧栏显隐状态记忆
  useEffect(() => {
    try {
      window.sessionStorage.setItem('mindgrid.sidebar-visible', sidebarVisible ? '1' : '0')
    } catch {
      // 存储不可用（如隐私模式）时静默忽略
    }
  }, [sidebarVisible])

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
        } else if (isGanttMode) {
          setIsGanttMode(false)
        } else if (isZenMode) {
          setIsZenMode(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isZenMode, isOutlinerMode, isGanttMode, session.document])

  return (
    <div
      className={`workspace-shell${isZenMode ? ' workspace-shell--zen' : ''}${
        isOutlinerMode ? ' workspace-shell--outliner' : ''
      }${isGanttMode ? ' workspace-shell--gantt' : ''}`}
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
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible((v) => !v)}
        isOutlinerMode={isOutlinerMode}
        onToggleOutliner={() => setIsOutlinerMode((v) => !v)}
        isGanttMode={isGanttMode}
        onToggleGantt={() => setIsGanttMode((v) => !v)}
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
          inspectorVisible && !isOutlinerMode && !isGanttMode
            ? ''
            : ' workspace-shell__body--inspector-hidden'
        }${
          sidebarVisible && !isOutlinerMode && !isGanttMode
            ? ''
            : ' workspace-shell__body--sidebar-hidden'
        }${isOutlinerMode ? ' workspace-shell__body--outliner' : ''}${
          isGanttMode ? ' workspace-shell__body--outliner' : ''
        }`}
      >
        {isOutlinerMode ? (
          <OutlinerView
            session={session}
            selectedTopicIds={selectedTopicIds}
            onSelectedTopicIdsChange={setSelectedTopicIds}
            onExit={() => setIsOutlinerMode(false)}
          />
        ) : isGanttMode ? (
          <GanttView
            session={session}
            selectedTopicIds={selectedTopicIds}
            onSelectedTopicIdsChange={setSelectedTopicIds}
            onExit={() => setIsGanttMode(false)}
          />
        ) : (
          <>
            {sidebarVisible ? (
              <NavPanel
                session={session}
                selectedTopicIds={selectedTopicIds}
                onSelectedTopicIdsChange={setSelectedTopicIds}
              />
            ) : null}
            <div className="canvas-column">
              <CanvasHost
                session={session}
                selectedTopicIds={selectedTopicIds}
                onSelectedTopicIdsChange={setSelectedTopicIds}
                onNotify={onNotify}
                searchOpen={searchOpen}
                onSearchOpenChange={setSearchOpen}
                showGrid={session.document?.settings?.['canvas.showGrid'] === true}
                onCameraChange={handleCameraChange}
                zoomRequest={zoomRequest}
                canvasCommand={canvasCommand}
              />
            </div>
            {inspectorVisible ? (
              <Inspector
                session={session}
                selectedTopicIds={selectedTopicIds}
                onSelectedTopicIdsChange={setSelectedTopicIds}
                tabRequest={inspectorTabRequest}
                onStartPresentation={() => setIsPresenting(true)}
              />
            ) : null}
          </>
        )}
      </div>
      {/* XMind 式底部状态条：左侧画布分页标签，右侧统计信息 / 缩放比例 / 大纲切换。
          收进 workspace-shell 内，ZEN 模式才能用 `.workspace-shell--zen .status-bar` 整条隐藏。 */}
      <StatusBar
        session={session}
        selectedTopicCount={selectedTopicIds.length}
        zoom={zoom ?? undefined}
        onResetZoom={handleResetZoom}
        isOutlinerMode={isOutlinerMode}
        onToggleOutliner={() => setIsOutlinerMode((v) => !v)}
        sheetTabs={<SheetTabBar session={session} />}
      />
      {isPresenting && session.document ? (
        <PresentationView document={session.document} onExit={() => setIsPresenting(false)} />
      ) : null}
      <ShortcutsHelp open={isShortcutsHelpOpen} onClose={() => setIsShortcutsHelpOpen(false)} />
    </div>
  )
}
