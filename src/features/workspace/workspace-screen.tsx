import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getActiveSheet } from '../../lib/document/sheets'
import {
  PITCH_SETTINGS_KEYS,
  resolvePitchSettings,
} from '../../lib/document/pitch-settings'
import {
  buildDocumentTopicSearchIndex,
  searchTopics,
  type TopicSearchEntry,
} from '../canvas/topic-search'
import { planReplaceAll, planReplaceOne, summarizePlan } from '../search/replace'
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
import { PitchView } from '../presentation/pitch-view'
import type {
  PitchAspectRatio,
  PitchThemeStyle,
} from '../presentation/pitch-controller'
import { PresentationView } from '../presentation/presentation-view'
import { ShortcutsHelp } from '../shortcuts/shortcuts-help'
import { StatusBar } from '../status/status-bar'
import type { EffectiveTheme, ThemeMode } from '../theme/use-theme'
import { Inspector, type InspectorTab } from './inspector'
import { OutlinerView } from './outliner-view'
import { SheetTabBar } from './sheet-tab-bar'
import { useDocumentWindowTitle } from './use-document-window-title'
import { NavPanel } from './nav-panel'
import { Toolbar } from './toolbar'

/** 文档未加载时 searchResults 复用同一个空数组，避免每次渲染产生新引用触发下游 effect */
const EMPTY_SEARCH_RESULTS: readonly TopicSearchEntry[] = []

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
  useDocumentWindowTitle(session)
  // macOS 统一标题栏下，红绿灯会压在我们自己的工具栏上，左侧必须让出位置
  const isMacTitlebar = hasTauriRuntime()

  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(() =>
    session.activeTopicId ? [session.activeTopicId] : activeSheet ? [activeSheet.rootTopic.id] : [],
  )
  const [isPresenting, setIsPresenting] = useState(false)
  // 批次 C6：提案简报（Pitch）。与演示模式并存——演示逐节点揭示，简报按分支分幕
  const [isPitching, setIsPitching] = useState(false)
  // 演说设置是**文档级**的：从 document.settings 解析（损坏即回落默认），
  // 改动写回同一处。此前是纯组件 state，切文档/重开会丢，属于"看得见存不住"的假设置。
  const pitchSettings = resolvePitchSettings(session.document?.settings)
  const pitchAspectRatio: PitchAspectRatio = pitchSettings.aspectRatio
  const pitchThemeStyle: PitchThemeStyle = pitchSettings.themeStyle
  const setPitchAspectRatio = (value: PitchAspectRatio) => {
    void session.setDocumentSetting(PITCH_SETTINGS_KEYS.aspectRatio, value)
  }
  const setPitchThemeStyle = (value: PitchThemeStyle) => {
    void session.setDocumentSetting(PITCH_SETTINGS_KEYS.themeStyle, value)
  }
  const [isZenMode, setIsZenMode] = useState(false)
  // 批次 14：搜索框开关提升到本层，工具栏搜索按钮与 Cmd/Ctrl + F 共用
  const [searchOpen, setSearchOpen] = useState(false)
  // 批次 C3：查找替换状态提升到本层。左栏「主题」Tab 的面板与画布浮层是两个入口，
  // 必须共享同一份查询，否则左栏输入时画布不高亮、两边命中项还会互相打架。
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const searchResults = useMemo(
    () =>
      session.document
        ? searchTopics(buildDocumentTopicSearchIndex(session.document), searchQuery)
        : EMPTY_SEARCH_RESULTS,
    [session.document, searchQuery],
  )
  const replaceAllPlan = useMemo(
    () => summarizePlan(planReplaceAll(searchResults, searchQuery, replaceQuery)),
    [searchResults, searchQuery, replaceQuery],
  )
  const handleSearchQueryChange = useCallback((next: string) => {
    setSearchQuery(next)
    setActiveSearchIndex(0)
  }, [])
  // 替换走 session.renameTopic，与画布内联编辑同一管道，因此可撤销
  const handleReplaceCurrent = useCallback(() => {
    const plan = planReplaceOne(searchResults[activeSearchIndex], searchQuery, replaceQuery)
    if (!plan) return
    void session.renameTopic(plan.topicId, plan.nextText)
  }, [searchResults, activeSearchIndex, searchQuery, replaceQuery, session])
  const handleReplaceAll = useCallback(() => {
    for (const plan of planReplaceAll(searchResults, searchQuery, replaceQuery)) {
      void session.renameTopic(plan.topicId, plan.nextText)
    }
  }, [searchResults, searchQuery, replaceQuery, session])
  const handleActivateSearchResult = useCallback(
    (index: number) => {
      setActiveSearchIndex(index)
      const result = searchResults[index]
      if (result) {
        setSelectedTopicIds([result.topicId])
      }
    },
    [searchResults],
  )
  const stepSearchIndex = useCallback(
    (delta: number) => {
      if (searchResults.length === 0) return
      setActiveSearchIndex((current) => (current + delta + searchResults.length) % searchResults.length)
    },
    [searchResults.length],
  )
  // XMind 基准默认显示右侧格式面板；显式保留状态，避免浏览器测试和桌面启动态漂移。
  const [inspectorVisible, setInspectorVisible] = useState(true)
  // XMind 基准默认不显示左侧导航面板；通过“查看 → 导航面板”按需打开。
  // 显式记忆用户选择，避免首次截图与后续启动状态互相污染。
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem('mindgrid.sidebar-visible') === '1'
    } catch {
      return false
    }
  })
  // XMind 基准默认显示顶部工具栏；查看菜单只负责按需隐藏，不改变首屏基准。
  const [toolbarVisible, setToolbarVisible] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem('mindgrid.toolbar-visible') !== '0'
    } catch {
      return true
    }
  })
  // 批次 D2：底部标签页栏显隐（查看菜单「显示标签页栏」⇧⌘T）
  const [tabBarVisible, setTabBarVisible] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem('mindgrid.tab-bar-visible') !== '0'
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

  // 只把 effect 里真正用到的原始值放进依赖：activeSheet 是每次渲染派生的对象，
  // 直接依赖它会让本 effect 每渲染重跑一次；取 id 则与文档变更同频
  const activeSheetId = activeSheet?.id
  const activeSheetRootTopicId = activeSheet?.rootTopic.id

  useEffect(() => {
    if (!activeSheetId || !activeSheetRootTopicId) {
      setSelectedTopicIds([])
      return
    }

    setSelectedTopicIds((currentSelected) =>
      syncSelectionWithActiveTopic(currentSelected, session.activeTopicId ?? activeSheetRootTopicId),
    )
  }, [activeSheetId, activeSheetRootTopicId, session.activeTopicId, session.document?.revision])

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

  // 状态栏上下箭头：按当前比例步进（XMind 每档约 1.2 倍），仍走绝对缩放通道
  const handleZoomStep = useCallback(
    (direction: 1 | -1) => {
      setZoomRequest((current) => {
        const base = zoom ?? 1
        const next = direction === 1 ? base * 1.2 : base / 1.2
        const clamped = Math.min(8, Math.max(0.1, next))
        return { zoom: clamped, nonce: (current?.nonce ?? 0) + 1 }
      })
    },
    [zoom],
  )

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
        // 思维导图 / 大纲是菜单里的互斥单选项，必须显式置位而非取反
        setOutlineMode: (enabled) => setIsOutlinerMode(enabled),
        toggleGanttMode: () => setIsGanttMode((v) => !v),
        toggleInspector: () => setInspectorVisible((v) => !v),
        toggleSidebar: () => setSidebarVisible((v) => !v),
        toggleToolbar: () => setToolbarVisible((v) => !v),
        toggleTabBar: () => setTabBarVisible((v) => !v),
        startPresentation: () => setIsPresenting(true),
        startPitch: () => setIsPitching(true),
        openSearch: () => setSearchOpen(true),
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
      onCheckForUpdates,
      onCycleTheme,
      onNotify,
      selectedTopicIds,
      session,
    ],
  )

  useNativeMenuActions(handleMenuAction)

  /**
   * 把面板显隐与视图模式回写到原生菜单的勾选态。
   *
   * 不做这一步的话，勾只在「用户点菜单项」时才对；一旦用快捷键（⌘I、⌘B、⇧⌘T）
   * 或工具栏按钮切换，菜单上的勾就停在旧值——用户再点一次反而切回去了。
   * 浏览器开发态没有原生菜单，invoke 会失败，故先用运行时判断挡掉。
   */
  useEffect(() => {
    if (!hasTauriRuntime()) {
      return
    }

    const states: Array<[MenuActionId, boolean]> = [
      ['view.mode-mindmap', !isOutlinerMode],
      ['view.mode-outline', isOutlinerMode],
      ['view.gantt', isGanttMode],
      ['view.sidebar', sidebarVisible],
      ['view.inspector', inspectorVisible],
      ['view.toolbar', toolbarVisible],
      ['view.tab-bar', tabBarVisible],
    ]

    for (const [id, checked] of states) {
      void invoke('set_menu_item_checked', { id, checked }).catch(() => {
        // 菜单缺失或窗口已销毁时静默忽略：勾选态只是显示细节
      })
    }
  }, [
    isOutlinerMode,
    isGanttMode,
    sidebarVisible,
    inspectorVisible,
    toolbarVisible,
    tabBarVisible,
  ])

  // 批次 26：侧栏显隐状态记忆
  useEffect(() => {
    try {
      window.sessionStorage.setItem('mindgrid.sidebar-visible', sidebarVisible ? '1' : '0')
    } catch {
      // 存储不可用（如隐私模式）时静默忽略
    }
  }, [sidebarVisible])

  // 工具栏与标签页栏的显隐同样记忆，重开后保持用户上次的选择
  useEffect(() => {
    try {
      window.sessionStorage.setItem('mindgrid.toolbar-visible', toolbarVisible ? '1' : '0')
      window.sessionStorage.setItem('mindgrid.tab-bar-visible', tabBarVisible ? '1' : '0')
    } catch {
      // 存储不可用（如隐私模式）时静默忽略
    }
  }, [toolbarVisible, tabBarVisible])

  // 快捷键：Shift + Cmd/Ctrl + T 切换底部标签页栏，
  // Cmd/Ctrl + .（或 XMind 的 ⌥⌘F）切换 ZEN 模式（Esc 退出），
  // Shift + Cmd/Ctrl + P 进入演说模式，
  // Cmd/Ctrl + I 切换格式面板显隐（preventDefault 避免浏览器书签栏冲突），
  // Cmd/Ctrl + B 切换左侧导航面板，Cmd/Ctrl + T 新建画布，
  // Alt + Cmd/Ctrl + 0 重设主题样式，
  // Esc 在大纲全屏视图或 ZEN 模式下退出
  //
  // 这里只放**画布与大纲都不处理**的键：⌘Z/⌘⇧Z/⌘F/⌘D 等由 canvas-host 的
  // window 级监听处理，若本层再接一份，一次按键会双触发（preventDefault 挡不住
  // 同一 target 上的其它监听器）。
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (mod && e.shiftKey && key === 't') {
        e.preventDefault()
        setTabBarVisible((v) => !v)
      } else if (mod && !e.shiftKey && key === 'b') {
        e.preventDefault()
        setSidebarVisible((v) => !v)
      } else if (mod && !e.shiftKey && !e.altKey && key === 't') {
        // ⌘T 在浏览器里是「新建标签页」，必须 preventDefault
        e.preventDefault()
        void session.createSheet()
      } else if (mod && e.altKey && e.key === '0') {
        // 重设样式：清掉 styleRef 与 styleOverrides，回到文档主题的样子
        e.preventDefault()
        const topicId = session.activeTopicId ?? activeSheetRootTopicId
        if (topicId) {
          void (async () => {
            await session.setTopicStyleRef(topicId, null)
            await session.setTopicStyleOverrides(topicId, null)
          })()
        }
      } else if (mod && e.altKey && key === 'f') {
        e.preventDefault()
        setIsZenMode((v) => !v)
      } else if (mod && e.key === '.') {
        e.preventDefault()
        setIsZenMode((v) => !v)
      } else if (mod && e.shiftKey && key === 'p') {
        // 与工具栏演说按钮同一进入路径；已打开时 setIsPresenting(true) 为幂等，相当于忽略
        e.preventDefault()
        if (session.document) {
          setIsPresenting(true)
        }
      } else if (mod && !e.shiftKey && key === 'i') {
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
    // 依赖里放原始值而非 activeSheet 对象：后者每次渲染都是新引用，会让监听反复重挂
  }, [isZenMode, isOutlinerMode, isGanttMode, session, activeSheetRootTopicId])

  return (
    <div
      className={`workspace-shell${isZenMode ? ' workspace-shell--zen' : ''}${
        isOutlinerMode ? ' workspace-shell--outliner' : ''
      }${isGanttMode ? ' workspace-shell--gantt' : ''}${
        toolbarVisible ? '' : ' workspace-shell--toolbar-hidden'
      }${isMacTitlebar ? ' workspace-shell--mac-titlebar' : ''}`}
    >
      {/*
        XMind 式工具栏只留：中段 主题/子主题/联系/概要/外框/标记/插入，
        右段 ZEN/演说/格式。搜索(⌘F)、侧栏(⌘B)、大纲、甘特、检查更新一律
        收进原生菜单与状态条，不再占工具栏位置。
      */}
      {!toolbarVisible ? (
        // 工具栏收起时仍留一条拖拽区：窗口改成统一标题栏（Overlay）后，
        // 没有它就没法拖动窗口了；高度只占 28px，不引入新的视觉元素。
        <div className="window-drag-strip" data-tauri-drag-region aria-hidden="true" />
      ) : null}
      {toolbarVisible ? (
        <Toolbar
          session={session}
          selectedTopicIds={selectedTopicIds}
          onClearSelection={clearMultiSelection}
          onStartPresentation={() => setIsPresenting(true)}
          onToggleZenMode={() => setIsZenMode((v) => !v)}
          isZenMode={isZenMode}
          inspectorVisible={inspectorVisible}
          onToggleInspector={() => setInspectorVisible((v) => !v)}
          onFocusInspectorTopicTab={focusInspectorTopicTab}
          onNotify={onNotify}
          themeMode={themeMode}
          themeEffective={themeEffective}
          onCycleTheme={undefined}
          onOpenShortcutsHelp={undefined}
        />
      ) : null}
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
            ? ' workspace-shell__body--sidebar-visible'
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
                searchQuery={searchQuery}
                onSearchQueryChange={handleSearchQueryChange}
                replaceQuery={replaceQuery}
                onReplaceQueryChange={setReplaceQuery}
                searchResults={searchResults}
                activeSearchIndex={activeSearchIndex}
                onActivateSearchResult={handleActivateSearchResult}
                onSearchNext={() => stepSearchIndex(1)}
                onSearchPrevious={() => stepSearchIndex(-1)}
                onReplaceCurrent={handleReplaceCurrent}
                onReplaceAll={handleReplaceAll}
                replaceAllPlan={replaceAllPlan}
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
                searchQuery={searchQuery}
                onSearchQueryChange={handleSearchQueryChange}
                replaceQuery={replaceQuery}
                onReplaceQueryChange={setReplaceQuery}
                activeSearchIndex={activeSearchIndex}
                onActiveSearchIndexChange={setActiveSearchIndex}
                searchResults={searchResults as TopicSearchEntry[]}
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
                onStartPitch={() => setIsPitching(true)}
                pitchAspectRatio={pitchAspectRatio}
                onPitchAspectRatioChange={setPitchAspectRatio}
                pitchThemeStyle={pitchThemeStyle}
                onPitchThemeStyleChange={setPitchThemeStyle}
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
        onZoomStep={handleZoomStep}
        isOutlinerMode={isOutlinerMode}
        onToggleOutliner={() => setIsOutlinerMode((v) => !v)}
        sheetTabs={
          // XMind 只有一个画布时不显示标签栏；多画布时才出现（可用 查看→显示标签页栏 关掉）
          tabBarVisible && (session.document?.sheets.length ?? 0) > 1 ? (
            <SheetTabBar session={session} />
          ) : null
        }
      />
      {isPresenting && session.document ? (
        <PresentationView document={session.document} onExit={() => setIsPresenting(false)} />
      ) : null}
      {isPitching && session.document ? (
        <PitchView
          document={session.document}
          onExit={() => setIsPitching(false)}
          aspectRatio={pitchAspectRatio}
          onAspectRatioChange={setPitchAspectRatio}
          themeStyle={pitchThemeStyle}
          onThemeStyleChange={setPitchThemeStyle}
        />
      ) : null}
      <ShortcutsHelp open={isShortcutsHelpOpen} onClose={() => setIsShortcutsHelpOpen(false)} />
    </div>
  )
}
