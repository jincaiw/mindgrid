import {
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  findAncestorTopicIds,
  findParentTopicByChildId,
  findTopicById,
  collectVisibleTopicIds,
} from '../../lib/document/tree'
import { resolveIndentTarget, resolveOutdentTarget } from '../../lib/document/topic-outline'
import { isFreelyPositionableTopic } from '../../lib/document/free-topics'
import { displayAttachmentName } from '../../lib/document/attachment'
import { StickerIcon } from './stickers'
import { findStickerDefinition } from './sticker-definitions'
import {
  TOPIC_STICKER_SIZE,
  computeTopicStickerPlacement,
} from './runtime/topic-sticker-constants'
import {
  TOPIC_CALLOUT_FONT_SIZE,
  TOPIC_CALLOUT_LINE_HEIGHT,
  TOPIC_CALLOUT_PADDING,
  TOPIC_CALLOUT_TEXT_WIDTH,
  TOPIC_CALLOUT_WIDTH,
  computeTopicCalloutLeadBox,
  computeTopicCalloutPlacement,
} from './runtime/topic-callout-constants'
import { wrapText } from './runtime/style-constants'
import {
  FOCUS_BRANCH_UNAVAILABLE_MESSAGE,
  resolveBranchFocusTarget,
  resolveFocusVisibleTopicIds,
  restrictToVisibleTopics,
} from '../../lib/document/focus'
import { resolveZoomShortcut } from './zoom-shortcut'
import { getActiveSheet } from '../../lib/document/sheets'
import type {
  Boundary,
  CanvasIllustration,
  ChartType,
  Relationship,
  SheetBranchStyle,
  SheetNumbering,
  SummaryNode,
  TopicDirection,
  TopicSnapshot,
  TopicStyleOverrides,
} from '../../lib/document/types'
import type { DocumentSession } from '../document/use-document-session'
import {
  animateCamera,
  CAMERA_ANIMATION_MS,
  centerCameraOnWorldPoint,
  createDefaultCamera,
  fitSceneToViewport,
  panCamera,
  zoomAtViewportPoint,
  type CameraState,
} from './camera'
import {
  canDropTopicOnTarget,
  collectNodesInViewportRect,
  createViewportRectFromPoints,
  hitTestNodeAtViewportPoint,
} from './hit-test'
import {
  getDeletableTopicIds,
  projectWorldPointToViewport,
  syncSelectionWithActiveTopic,
} from './interaction-state'
import {
  type MindMapNodeLayout,
} from './mindmap-layout'
import { findNearestNodeInDirection, type NavigationDirection } from './topic-navigation'
import { Minimap } from './minimap'
import type { CanvasCommand, ZoomCommand } from '../menu/menu-actions'
import { ZOOM_COMMAND_BY_MENU_ACTION } from '../menu/menu-actions'
import { computeLayout, resolveLayoutOptions, restrictLayoutToTopicIds } from './layouts'
import { hitTestIllustrationAtViewportPoint } from './hit-test'
import { renderScene } from './runtime/canvas-renderer'
import { resolveThemeBackground, resolveTopicStyleFrom } from './runtime/style-resolver'
import { resolveEffectiveTheme } from './runtime/effective-theme'
import type { ThemePalette } from '../../lib/document/themes'
import {
  buildFontStack,
  resolveCanvasSettings,
  type DocumentCanvasSettings,
} from '../../lib/document/canvas-settings'
import {
  buildBranchIndexMap,
  buildScene,
  type TopicVisualStates,
} from './runtime/scene-builder'
import { pickTopicImageUrl, useTopicImageUrls } from './runtime/topic-image-store'
import { collectClipboardTopics } from './topic-clipboard'
import { buildTopicNumbers } from './numbering'
import { MarkerIcon } from './markers'
import {
  readTopicsFromSystemClipboard,
  type SystemClipboardReadResult,
  type SystemClipboardWriteResult,
  writeTopicsToSystemClipboard,
} from './topic-system-clipboard'
import {
  buildDocumentTopicSearchIndex,
  searchTopics,
  type TopicSearchEntry,
} from './topic-search'
import { planReplaceAll, planReplaceOne } from '../search/replace'
import { ContextMenu, menuItem, menuSeparator, type ContextMenuItem } from '../workspace/context-menu'

interface CanvasHostProps {
  session: DocumentSession
  selectedTopicIds?: string[]
  // 受控回调接受 SetStateAction，与 workspace 传入的 useState setter 一致，
  // 使画布内部可以用函数式更新读取最新多选状态。
  onSelectedTopicIdsChange?: (topicIds: SetStateAction<string[]>) => void
  // 瞬态通知（如系统剪贴板不可用），由 AppShell 经 ToastRegion 展示
  onNotify?: (message: string) => void
  // 搜索框开关：可选受控（工具栏搜索按钮与 Cmd/Ctrl + F 共用），缺省内部自管理
  searchOpen?: boolean
  onSearchOpenChange?: (open: boolean) => void
  /**
   * 查找替换状态：可选受控，缺省内部自管理。
   *
   * 为什么需要受控：左栏「主题」Tab 与画布浮层是同一个查找能力的两个入口，
   * 若各自持有 query，左栏输入时画布不会高亮、两边结果还会互相打架。
   * 故由 WorkspaceScreen 统一持有，两边共享同一份查询与当前命中项。
   */
  searchQuery?: string
  onSearchQueryChange?: (query: string) => void
  replaceQuery?: string
  onReplaceQueryChange?: (query: string) => void
  activeSearchIndex?: number
  /** 接受 SetStateAction：画布内部会把索引向上取整到结果范围内，需要读到当前值 */
  onActiveSearchIndexChange?: (next: SetStateAction<number>) => void
  searchResults?: TopicSearchEntry[]
  // 画布线网格显示开关（XMind 默认无网格），由检查器「画布设置」驱动
  showGrid?: boolean
  // 相机变化上报（供外层在状态栏显示缩放比例，对标 XMind 状态条右段）
  onCameraChange?: (camera: CameraState) => void
  /**
   * 外部请求设置缩放（nonce 变化时触发一次）。用于状态栏「缩放比例」点击复位到 100%。
   * 沿用 focusRootNonce 的 nonce 请求模式：受控相机状态容易造成双向反馈，
   * 单向请求 + nonce 更安全。null / nonce 为 0 表示无请求。
   */
  zoomRequest?: { zoom: number; nonce: number } | null
  /**
   * 外部请求执行画布内部命令（nonce 变化时触发一次），用于原生菜单栏。
   *
   * 复制 / 剪切 / 粘贴依赖画布内的主题剪贴板状态，回到中心依赖相机动画，
   * 外层都驱动不了，故沿用 zoomRequest 的单向 nonce 请求模式。
   */
  canvasCommand?: { command: CanvasCommand; nonce: number } | null
  /**
   * 「仅显示该分支」的聚焦主题（`null` = 不聚焦）。
   *
   * 与 `canvasCommand` 的 nonce 模式不同：聚焦是**持续状态**而非一次性动作，
   * 状态栏提示、菜单项、画布三处都要读到同一个值，故走受控 prop。
   * 悬空 id（主题已被删除）与中心主题一律按"不聚焦"处理，见 lib/document/focus.ts。
   */
  focusTopicId?: string | null
  /**
   * 请求改变聚焦主题（画布内的 ⌘; 与 Esc 走这里）。
   *
   * 状态仍归 WorkspaceScreen 所有——状态栏提示、菜单项可用性都要读同一份值。
   * 画布只作为又一个入口，不自己存一份，否则两处会各说各话。
   */
  onFocusTopicIdChange?: (topicId: string | null) => void
}

const HISTORY_FOCUS_HIGHLIGHT_MS = 1600

/**
 * 没有浮动主题时的稳定空数组。
 *
 * `activeSheet.floatingTopics ?? []` 每次都新建一个数组，于是所有以它为依赖的
 * memo / useCallback 每渲染都失效一次（其中就有指针抬起处理器）。
 * 与 workspace-screen 的 EMPTY_SEARCH_RESULTS 同一手法：**同一语义只用一个引用**。
 */
const EMPTY_FLOATING_TOPICS: TopicSnapshot[] = []

const EDGE_AUTO_PAN_THRESHOLD = 72
const EDGE_AUTO_PAN_MAX_STEP = 18

function formatClipboardWriteHint(result: SystemClipboardWriteResult) {
  switch (result) {
    case 'success':
      return '已同步到系统剪贴板'
    case 'failed':
      return '系统剪贴板暂不可写，仍可在当前会话内粘贴'
    case 'unavailable':
      return '当前环境不支持系统剪贴板同步'
  }
}

function formatClipboardReadHint(
  result: Exclude<SystemClipboardReadResult, { status: 'success' }>,
  usedLocalClipboard: boolean,
) {
  if (usedLocalClipboard) {
    switch (result.status) {
      case 'failed':
        return '系统剪贴板暂不可读，已回退到当前会话剪贴板'
      case 'invalid':
        return '系统剪贴板里没有可识别的 MindGrid 内容，已回退到当前会话剪贴板'
      case 'unavailable':
        return '当前环境不支持系统剪贴板粘贴，已使用当前会话剪贴板'
    }
  }

  switch (result.status) {
    case 'failed':
      return '系统剪贴板暂不可读，请聚焦窗口后重试'
    case 'invalid':
      return '系统剪贴板里没有可识别的 MindGrid 内容'
    case 'unavailable':
      return '当前环境不支持系统剪贴板粘贴'
  }
}

function getEdgeAutoPanDelta(
  viewportSize: { width: number; height: number },
  point: { x: number; y: number },
) {
  const calculateAxisDelta = (distanceToStart: number, distanceToEnd: number) => {
    if (distanceToStart < EDGE_AUTO_PAN_THRESHOLD) {
      const intensity = 1 - distanceToStart / EDGE_AUTO_PAN_THRESHOLD
      return EDGE_AUTO_PAN_MAX_STEP * intensity
    }

    if (distanceToEnd < EDGE_AUTO_PAN_THRESHOLD) {
      const intensity = 1 - distanceToEnd / EDGE_AUTO_PAN_THRESHOLD
      return -EDGE_AUTO_PAN_MAX_STEP * intensity
    }

    return 0
  }

  return {
    x: calculateAxisDelta(point.x, viewportSize.width - point.x),
    y: calculateAxisDelta(point.y, viewportSize.height - point.y),
  }
}

/** 将键盘 Arrow* 事件 key 映射为导航方向，非方向键返回 null。 */
function arrowDirection(key: string): NavigationDirection | null {
  switch (key) {
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    default:
      return null
  }
}

function MindMapScene({
  initialCamera,
  onCameraChange,
  rootTopic,
  chartType,
  floatingTopics,
  relationships,
  boundaries,
  summaries,
  themeId,
  branchStyle,
  numbering,
  layoutDirection,
  canvasSettings,
  focusVisibleTopicIds,
  activeTopicId,
  selectedTopicIds,
  editingTopicId,
  editingText,
  searchOpen,
  searchQuery,
  replaceQuery,
  onReplaceQueryChange,
  searchResults,
  activeSearchIndex,
  matchedSearchTopicIds,
  activeSearchTopicId,
  historyFocusTopicId,
  focusRootNonce,
  zoomRequest,
  zoomCommand,
  onSelectedTopicIdsChange,
  onEditingTextChange,
  onStartEditingTopic,
  onCommitEditingTopic,
  onCancelEditingTopic,
  onSearchQueryChange,
  onActivateSearchResult,
  onSearchNext,
  onSearchPrevious,
  onCloseSearch,
  onRenameTopicText,
  onToggleTopicCollapsed,
  onSelect,
  onMoveTopic,
  onPlaceTopicFreely,
  onStickerMove,
  onCalloutMove,
  illustrations,
  onIllustrationMove,
  onCreateChildTopic,
  onCreateSiblingTopic,
  onDeleteTopics,
  onCopyTopics,
  onPasteTopics,
  canCopy,
  canPaste,
  onOpenLink,
  onCreateFloatingTopic,
}: {
  initialCamera: CameraState | null
  onCameraChange: (camera: CameraState) => void
  rootTopic: TopicSnapshot
  chartType: ChartType | undefined
  floatingTopics: TopicSnapshot[]
  relationships: Relationship[]
  boundaries: Boundary[]
  summaries: SummaryNode[]
  themeId: string | undefined
  branchStyle: SheetBranchStyle | undefined
  /** 画布级主题编号配置，缺省不显示编号。 */
  numbering: SheetNumbering | undefined
  /** 画布级分支方向（来自 layoutConfig.direction），缺省自动。 */
  layoutDirection: TopicDirection | undefined
  /** 文档级画布设置（彩虹分支 / 色板 / 粗细 / 布局开关）。 */
  canvasSettings: DocumentCanvasSettings
  /**
   * 「仅显示该分支」的可见主题集（`null` = 不聚焦，全部可见）。
   *
   * 由 TreeWorkspace 用 `resolveFocusVisibleTopicIds` 算出后下传：算一次、三处共用
   * （布局裁剪 / 装饰元素过滤 / 选中态收敛），不在场景里重复遍历整棵树。
   */
  focusVisibleTopicIds: ReadonlySet<string> | null
  activeTopicId: string | null
  selectedTopicIds: string[]
  editingTopicId: string | null
  editingText: string
  searchOpen: boolean
  searchQuery: string
  replaceQuery: string
  onReplaceQueryChange: (text: string) => void
  searchResults: TopicSearchEntry[]
  activeSearchIndex: number
  matchedSearchTopicIds: Set<string>
  activeSearchTopicId: string | null
  historyFocusTopicId: string | null
  /** 聚焦根主题的请求 nonce：变化时触发相机动画居中根主题（Cmd+R）。0 表示初始无请求。 */
  focusRootNonce: number
  /** 外部请求设置缩放的 nonce（配合 zoomRequest.zoom），0 表示初始无请求。 */
  zoomRequest: { zoom: number; nonce: number } | null
  /**
   * 相对缩放命令（放大 / 缩小 / 实际大小 / 适应画布）的 nonce 请求。
   * 必须走相机内部状态：放大缩小基于当前缩放，外层只有上一帧的快照。
   */
  zoomCommand: { command: ZoomCommand; nonce: number } | null
  onSelectedTopicIdsChange: (topicIds: string[]) => void
  onEditingTextChange: (text: string) => void
  onStartEditingTopic: (topicId: string) => void
  onCommitEditingTopic: () => Promise<void>
  onCancelEditingTopic: () => void
  onSearchQueryChange: (text: string) => void
  onActivateSearchResult: (index: number) => void
  onSearchNext: () => void
  onSearchPrevious: () => void
  onCloseSearch: () => void
  /** 批次 27：查找替换——直接改写主题文本（复用 rename 管道，可撤销） */
  onRenameTopicText: (topicId: string, text: string) => Promise<void>
  onToggleTopicCollapsed: (topicId: string) => Promise<void>
  onSelect: (topicId: string) => void
  onMoveTopic: (topicId: string, targetParentId: string) => Promise<void>
  /** 分支自由布局下把一级分支摆到指定位置（相对中心主题的世界坐标）。 */
  onPlaceTopicFreely: (topicId: string, offsetX: number, offsetY: number) => Promise<void>
  /** 松手时提交贴纸新偏移（世界单位，相对节点中心）。一次拖动只调一次。 */
  onStickerMove: (topicId: string, stickerId: string, offsetX: number, offsetY: number) => void
  onCalloutMove: (topicId: string, offsetX: number, offsetY: number) => void
  /** 画布级插画（不依附主题的浮动装饰）。 */
  illustrations: CanvasIllustration[]
  /** 拖动插画结束（松手）时提交新位置；一次拖动 = 一条撤销记录。 */
  onIllustrationMove: (illustrationId: string, x: number, y: number) => void
  // 右键上下文菜单动作（由 TreeWorkspace 注入）
  onCreateChildTopic: (topicId: string) => Promise<void>
  onCreateSiblingTopic: (topicId: string) => Promise<void>
  onDeleteTopics: (topicIds: string[]) => Promise<void>
  onCopyTopics: () => Promise<void>
  onPasteTopics: () => Promise<void>
  canCopy: boolean
  canPaste: boolean
  /** 点击节点上的链接图标时调用（由 TreeWorkspace 注入打开逻辑）。 */
  onOpenLink?: (url: string) => void
  /** 双击画布空白时创建浮动主题（XMind 式）。offsetX/offsetY 为根主题相对坐标。 */
  onCreateFloatingTopic?: (text: string, offsetX: number, offsetY: number) => Promise<void>
}) {
  const layout = useMemo(() => {
    // 选项一律来自 resolveLayoutOptions（唯一来源）：菜单侧的自由主题对齐
    // 也用同一份，才能保证"它算的框"就是"屏幕上看到的框"
    const full = computeLayout(
      rootTopic,
      chartType,
      floatingTopics,
      resolveLayoutOptions(canvasSettings, layoutDirection),
    )
    // 「仅显示该分支」在**布局出口**裁剪一次：命中测试、视口剔除、缩略图、连线几何、
    // 拖拽落点读的都是这份 layout，因此裁剪一次即全局生效。若改在画节点时过滤，
    // 仍会点到看不见的主题、连线仍指向空白处。
    return focusVisibleTopicIds ? restrictLayoutToTopicIds(full, focusVisibleTopicIds) : full
  }, [
    rootTopic,
    chartType,
    floatingTopics,
    // canvasSettings 本身是 TreeWorkspace 里 useMemo 出来的（只在文档设置变化时换引用），
    // 依赖它即可——逐字段列出来反而与 resolveLayoutOptions 的实际读取范围对不上
    canvasSettings,
    layoutDirection,
    focusVisibleTopicIds,
  ])

  // 联系线 / 外框 / 概要的世界几何由被引用主题的位置算出，必须一起裁剪：
  // 否则聚焦模式下会留下连到不可见主题的线，或外框缩成只剩一个主题的小圈
  // （scene-builder 的 topicGroupBounds 对缺失主题是**跳过**，没有这条就会画出"半截"装饰）。
  const visibleRelationships = useMemo(
    () =>
      focusVisibleTopicIds
        ? restrictToVisibleTopics(
            relationships,
            (item) => [item.fromTopicId, item.toTopicId],
            focusVisibleTopicIds,
          )
        : relationships,
    [relationships, focusVisibleTopicIds],
  )
  const visibleBoundaries = useMemo(
    () =>
      focusVisibleTopicIds
        ? restrictToVisibleTopics(boundaries, (item) => item.topicIds, focusVisibleTopicIds)
        : boundaries,
    [boundaries, focusVisibleTopicIds],
  )
  const visibleSummaries = useMemo(
    () =>
      focusVisibleTopicIds
        ? restrictToVisibleTopics(summaries, (item) => item.topicIds, focusVisibleTopicIds)
        : summaries,
    [summaries, focusVisibleTopicIds],
  )
  // 插画是**画布级**对象、不属于任何分支：一旦有可见集限制（仅显示该分支）
  // 就整体排除。与导出端（export-scene）用同一条规则，否则会出现
  // "屏幕上没有、导出的图里却有一张"这种两端不一致。
  const visibleIllustrations = focusVisibleTopicIds ? EMPTY_ILLUSTRATIONS : illustrations

  const [draggingIllustration, setDraggingIllustration] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)
  const illustrationDragRef = useRef<{
    id: string
    startClientX: number
    startClientY: number
    baseX: number
    baseY: number
  } | null>(null)

  // 拖动期间把被拖的那张换成预览坐标：场景从这一份列表构建，
  // 所以"预览"与"提交后"走的是同一条渲染路径，松手时不会跳一下。
  const sceneIllustrations = useMemo(() => {
    if (!draggingIllustration) {
      return visibleIllustrations
    }
    return visibleIllustrations.map((item) =>
      item.id === draggingIllustration.id
        ? { ...item, x: draggingIllustration.x, y: draggingIllustration.y }
        : item,
    )
  }, [visibleIllustrations, draggingIllustration])


  // 主题编号：从画布 numbering 配置派生的展示层前缀，不写入主题文本。
  // 屏幕与导出必须算同一份映射，否则编号会一端有一端没有。
  const numberMap = useMemo(
    () => buildTopicNumbers(rootTopic, numbering),
    [rootTopic, numbering],
  )

  const nodeMap = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  )
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hasInitializedCameraRef = useRef(false)
  const [camera, setCamera] = useState<CameraState>(() => initialCamera ?? createDefaultCamera())
  // cameraRef 始终指向最新相机状态，供回调读取避免依赖 camera 导致的无限重渲染
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [selectionBox, setSelectionBox] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)
  const [dragPreview, setDragPreview] = useState<{
    topicId: string
    deltaX: number
    deltaY: number
    dropTargetId: string | null
  } | null>(null)
  const suppressClickRef = useRef(false)
  // 批次 27：查找替换的替换词输入（局部状态，随搜索浮层开关保留）
  // replaceQuery 由上层（TreeWorkspace → WorkspaceScreen）持有：左栏「主题」Tab 的
  // 查找替换面板与画布浮层共用同一个替换词，避免两处各填各的。
  // 小地图显隐：**默认关**，localStorage 持久化。
  // XMind 桌面端默认没有小地图，常驻一块缩略图属于额外视觉噪声；
  // 能力保留，用户需要时从右下角缩放条打开。
  // 分支自由布局开关（来自画布设置）
  const freeBranchLayout = canvasSettings.freeBranchLayout

  const [minimapVisible, setMinimapVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('mindgrid:minimap-visible') === '1'
    } catch {
      return false
    }
  })
  const toggleMinimap = useCallback(() => {
    setMinimapVisible((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem('mindgrid:minimap-visible', next ? '1' : '0')
      } catch {
        // localStorage 不可用时静默忽略
      }
      return next
    })
  }, [])
  /**
   * 查找替换：替换逻辑本身在 src/features/search/replace.ts（纯函数，有单测）。
   * 这里只负责把规划结果交给 rename 管道，从而自动获得撤销能力。
   *
   * 注意不要退回到 `text.split(query).join(replacement)`：检索是大小写不敏感的，
   * 字面量 split 在大小写不一致时会静默找不到，表现为"点了替换没反应"。
   */
  const handleReplaceCurrent = useCallback(async () => {
    const plan = planReplaceOne(searchResults[activeSearchIndex], searchQuery, replaceQuery)
    if (!plan) return
    await onRenameTopicText(plan.topicId, plan.nextText)
  }, [searchResults, activeSearchIndex, searchQuery, replaceQuery, onRenameTopicText])

  const handleReplaceAll = useCallback(async () => {
    for (const plan of planReplaceAll(searchResults, searchQuery, replaceQuery)) {
      await onRenameTopicText(plan.topicId, plan.nextText)
    }
  }, [searchResults, searchQuery, replaceQuery, onRenameTopicText])
  // Space 键状态：按下时作为平移修饰键（XMind 式 Space+拖拽平移）；
  // 松开时若未发生拖拽则触发折叠切换（兼容旧 MindGrid 行为）。
  // spaceUsedForPanRef：Space 按下期间是否发生指针拖拽，用于抑制 keyup 时的折叠切换。
  const spacePressedRef = useRef(false)
  const spaceUsedForPanRef = useRef(false)
  // 相机动画取消器：用户手动操作（拖拽/滚轮）时立即取消正在进行的缓动动画
  const cancelCameraAnimationRef = useRef<(() => void) | null>(null)
  // 节点出现动画追踪：
  // - knownTopicIdsRef：本画布内已"见过"的全部主题 ID（含视口外），避免滚动虚拟化时重复触发动画
  // - appearingTopicIdsRef：正在播放出现动画的主题 ID，animationend 后移除（防止重渲染截断动画）
  // key={activeSheet.id} 会让 MindMapScene 在切换画布时整体重挂，两个 ref 自动重置。
  const knownTopicIdsRef = useRef<Set<string>>(new Set())
  const appearingTopicIdsRef = useRef<Set<string>>(new Set())
  const [, bumpAppearingVersion] = useReducer((x: number) => x + 1, 0)
  // 右键上下文菜单状态
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)
  const interactionRef = useRef<
    | ({
        pointerId: number
        originX: number
        originY: number
      } & (
        | { kind: 'pan' }
        | { kind: 'box' }
        | { kind: 'drag_candidate'; topicId: string }
        | { kind: 'drag'; topicId: string }
      ))
    | null
  >(null)
  const dropTargetNode = dragPreview?.dropTargetId
    ? nodeMap.get(dragPreview.dropTargetId) ?? null
    : null
  const dropIndicatorPosition = dropTargetNode
    ? projectWorldPointToViewport(
        {
          x: dropTargetNode.x + layout.offsetX,
          y: dropTargetNode.y + layout.offsetY + dropTargetNode.height / 2,
        },
        camera,
      )
    : null

  // ---- Scene 构建（视口剔除 + Render Tree）----
  // 用于 Canvas 边渲染 + DOM 主题虚拟化（只渲染可见节点）
  const visualStates = useMemo<TopicVisualStates>(
    () => ({
      activeTopicId,
      selectedTopicIds: new Set(selectedTopicIds),
      editingTopicId,
      searchMatchedTopicIds: matchedSearchTopicIds,
      activeSearchTopicId,
      historyFocusTopicId,
      dropTargetTopicId: dragPreview?.dropTargetId ?? null,
      draggingTopicId: dragPreview?.topicId ?? null,
    }),
    [
      activeTopicId,
      selectedTopicIds,
      editingTopicId,
      matchedSearchTopicIds,
      activeSearchTopicId,
      historyFocusTopicId,
      dragPreview,
    ],
  )
  /**
   * **生效主题**：把画布级分支色板叠加进主题，只在这里解析一次。
   *
   * 场景（连线 + 导出用的节点样式）与屏幕上的 DOM 节点都读这一份，
   * 于是"节点填充色 == 该分支的连线色"在**结构上**成立。
   * 之前连线读画布色板、节点只读主题，换成不带色板的主题时就会出现
   * "节点单色、连线彩虹"（详见 runtime/effective-theme.ts 的文件头）。
   */
  const effectiveTheme = useMemo(
    () => resolveEffectiveTheme({ themeId, branchStyle, canvasSettings }),
    [themeId, branchStyle, canvasSettings],
  )

  const scene = useMemo(
    () =>
      buildScene({
        layout,
        viewport: viewportSize,
        camera,
        visualStates,
        overlays: { selectionBox: null, dragPreview: null, dropIndicator: null },
        relationships: visibleRelationships,
        boundaries: visibleBoundaries,
        summaries: visibleSummaries,
        illustrations: sceneIllustrations,
        theme: effectiveTheme,
        branchStyle,
        numberMap,
        canvasSettings,
        enableCulling: viewportSize.width > 0 && viewportSize.height > 0,
      }),
    [
      layout,
      camera,
      visualStates,
      viewportSize,
      visibleRelationships,
      visibleBoundaries,
      visibleSummaries,
      sceneIllustrations,
      effectiveTheme,
      branchStyle,
      numberMap,
      canvasSettings,
    ],
  )


  // —— 画布级插画：拖动 ——
  //
  // 与贴纸/标注同一套做法：拖动只改本地预览、松手才提交（一次拖动 = 一条撤销记录），
  // 没挪动不写文档（否则"点一下看看"也会往撤销栈里塞一条空记录）。
  /**
   * 插画命中放在**捕获阶段**。
   *
   * 插画画在 Canvas 2D 层、不是 DOM 元素，拿不到自己的 pointer 事件；
   * 而它在 z-order 上压住主题。若等冒泡阶段再判断，主题节点已经先开始拖拽了
   * （用户看到的是"点在插画上却把下面的主题拖走了"）。捕获阶段先手命中即可。
   */
  const handleIllustrationPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || illustrations.length === 0) {
      return
    }
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    const hit = hitTestIllustrationAtViewportPoint(
      illustrations,
      layout.offsetX,
      layout.offsetY,
      camera,
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
    )
    if (!hit) {
      return
    }

    event.stopPropagation()
    illustrationDragRef.current = {
      id: hit.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseX: hit.x,
      baseY: hit.y,
    }
    setDraggingIllustration({ id: hit.id, x: hit.x, y: hit.y })
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleIllustrationPointerMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = illustrationDragRef.current
    if (!drag) {
      return
    }
    event.stopPropagation()
    const safeZoom = camera.zoom > 0 ? camera.zoom : 1
    setDraggingIllustration({
      id: drag.id,
      x: drag.baseX + (event.clientX - drag.startClientX) / safeZoom,
      y: drag.baseY + (event.clientY - drag.startClientY) / safeZoom,
    })
  }

  const handleIllustrationPointerEndCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = illustrationDragRef.current
    if (!drag) {
      return
    }
    event.stopPropagation()
    illustrationDragRef.current = null
    const safeZoom = camera.zoom > 0 ? camera.zoom : 1
    const deltaX = (event.clientX - drag.startClientX) / safeZoom
    const deltaY = (event.clientY - drag.startClientY) / safeZoom
    setDraggingIllustration(null)

    // 没挪动就是一次点击，不写文档、不产生撤销记录
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
      return
    }
    onIllustrationMove(drag.id, drag.baseX + deltaX, drag.baseY + deltaY)
  }

  // 分支序号：一级主题在其父下的序号，缤纷主题的分支配色按此取色。
  // 与导出链路共用 buildBranchIndexMap，确保屏幕 DOM 和 PNG/SVG 取到同一颜色。
  const branchIndexMap = useMemo(() => buildBranchIndexMap(layout.nodes), [layout.nodes])

  // ---- DOM 主题虚拟化：只渲染视口内（含 overscan）的主题 ----
  const visibleLayoutNodes = useMemo(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) {
      return layout.nodes
    }
    const visibleIds = new Set(
      scene.nodes.filter((n) => n.type === 'topic').map((n) => n.id),
    )
    // 编辑中 / 拖拽中的主题始终渲染，即使位于视口外
    if (editingTopicId) visibleIds.add(editingTopicId)
    if (dragPreview?.topicId) visibleIds.add(dragPreview.topicId)
    return layout.nodes.filter((n) => visibleIds.has(n.id))
  }, [layout.nodes, scene, viewportSize, editingTopicId, dragPreview])

  // 主题图片：按 assetId 去重拉取 data URL，缺图/加载中时节点不渲染图片元素
  const topicImageUrls = useTopicImageUrls(
    visibleLayoutNodes.map((node) => node.topic.image),
  )

  // 标记本画布内所有布局节点为"已知"（含视口外），首次出现的新节点加入动画集合。
  // 仅可见的新节点会真正播放出现动画；视口外的新节点只登记，避免滚入时重复动画。
  {
    const visibleIdSet = new Set(visibleLayoutNodes.map((n) => n.id))
    for (const node of layout.nodes) {
      if (!knownTopicIdsRef.current.has(node.id)) {
        knownTopicIdsRef.current.add(node.id)
        if (visibleIdSet.has(node.id)) {
          appearingTopicIdsRef.current.add(node.id)
        }
      }
    }
  }

  const handleNodeAppearEnd = useCallback((topicId: string) => {
    if (appearingTopicIdsRef.current.delete(topicId)) {
      bumpAppearingVersion()
    }
  }, [])

  /** 取消正在进行的相机动画（用户手动操作时调用）。 */
  const cancelCameraAnimation = useCallback(() => {
    if (cancelCameraAnimationRef.current) {
      cancelCameraAnimationRef.current()
      cancelCameraAnimationRef.current = null
    }
  }, [])

  /** 把相机平滑动画到目标状态（300ms ease-out），中途可被 cancelCameraAnimation 打断。 */
  const animateCameraTo = useCallback(
    (target: CameraState) => {
      cancelCameraAnimation()
      const from = cameraRef.current
      cancelCameraAnimationRef.current = animateCamera(from, target, CAMERA_ANIMATION_MS, (next) => {
        setCamera(next)
      })
    },
    [cancelCameraAnimation],
  )

  const fitToView = useCallback(
    (animate = true) => {
      const viewport = viewportRef.current

      if (!viewport) {
        return
      }

      const target = fitSceneToViewport(
        { width: viewport.clientWidth, height: viewport.clientHeight },
        { width: layout.width, height: layout.height },
      )

      if (animate) {
        animateCameraTo(target)
      } else {
        setCamera(target)
      }
    },
    [animateCameraTo, layout.height, layout.width],
  )

  useEffect(() => {
    if (hasInitializedCameraRef.current) {
      return
    }

    if (initialCamera) {
      hasInitializedCameraRef.current = true
      setCamera(initialCamera)
      return
    }

    hasInitializedCameraRef.current = true
    // 初始加载直接定位，不播放动画
    fitToView(false)
  }, [fitToView, initialCamera])

  useEffect(() => {
    onCameraChange(camera)
  }, [camera, onCameraChange])

  /**
   * 聚焦根主题（Cmd+R）：相机平滑动画居中到根主题，保持当前缩放。
   * nonce 变化时触发，0 跳过（初始无请求）。
   */
  const focusRootTopic = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const rootLayoutNode = layout.nodes.find((n) => n.depth === 0)
    if (!rootLayoutNode) return
    const rootCenter = {
      x: rootLayoutNode.x + layout.offsetX,
      y: rootLayoutNode.y + layout.offsetY,
    }
    const target = centerCameraOnWorldPoint(
      { width: viewport.clientWidth, height: viewport.clientHeight },
      rootCenter,
      cameraRef.current.zoom,
    )
    animateCameraTo(target)
  }, [animateCameraTo, layout.nodes, layout.offsetX, layout.offsetY])

  useEffect(() => {
    if (focusRootNonce === 0) return
    focusRootTopic()
  }, [focusRootNonce, focusRootTopic])

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport || typeof ResizeObserver === 'undefined') {
      return
    }

    const updateViewport = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      })
      // 窗口尺寸变化时直接适配，不播放动画
      fitToView(false)
    }

    updateViewport()

    const observer = new ResizeObserver(updateViewport)
    observer.observe(viewport)

    return () => {
      observer.disconnect()
    }
  }, [fitToView])

  // ---- Canvas 2D 渲染：边层（替代 SVG）----
  // 主题节点仍由 DOM 渲染（可访问性 + 内联编辑）；背景由 CSS 渲染。
  // Canvas 只绘制边，通过 camera 变换与 DOM 主题对齐。
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      // jsdom 不支持 Canvas 2D 上下文，测试环境跳过渲染
      return
    }
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const pixelWidth = Math.round(viewportSize.width * dpr)
    const pixelHeight = Math.round(viewportSize.height * dpr)

    if (pixelWidth > 0 && pixelHeight > 0) {
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight
    }

    renderScene(ctx, scene, viewportSize, camera, dpr, {
      drawBackground: false,
      drawTopics: false,
      drawOverlays: false,
      themeId,
      background: canvasSettings.background,
      fontFamily: buildFontStack(canvasSettings.fontFamily, canvasSettings.cjkFont),
    })
  }, [scene, camera, viewportSize, themeId, canvasSettings])

  const setZoomFromViewportCenter = useCallback(
    (nextZoom: number) => {
      const viewport = viewportRef.current

      if (!viewport) {
        return
      }

      const target = zoomAtViewportPoint(cameraRef.current, nextZoom, {
        x: viewport.clientWidth / 2,
        y: viewport.clientHeight / 2,
      })
      animateCameraTo(target)
    },
    [animateCameraTo],
  )

  // 外部缩放请求（状态栏点击「缩放比例」复位到 100%）。
  // 拆成两个原始值再进依赖数组，避免把对象整体放进依赖导致每次渲染都触发。
  const zoomRequestNonce = zoomRequest?.nonce ?? 0
  const zoomRequestTarget = zoomRequest?.zoom ?? null

  useEffect(() => {
    if (zoomRequestNonce === 0 || zoomRequestTarget == null) {
      return
    }

    setZoomFromViewportCenter(zoomRequestTarget)
  }, [zoomRequestNonce, zoomRequestTarget, setZoomFromViewportCenter])

  // 菜单「放大 / 缩小 / 实际大小 / 适应画布」。
  // 必须落在 MindMapScene 内：缩放基于**当前**相机，而相机状态只存在于本组件，
  // 外层（TreeWorkspace）拿到的 zoom 是上一帧上报的快照。
  // 乘数 1.15 与画布右键菜单、⌘+ / ⌘- 快捷键保持一致。
  const zoomCommandNonce = zoomCommand?.nonce ?? 0
  const zoomCommandName = zoomCommand?.command ?? null

  useEffect(() => {
    if (zoomCommandNonce === 0 || !zoomCommandName) {
      return
    }

    switch (zoomCommandName) {
      case 'in':
        setZoomFromViewportCenter(cameraRef.current.zoom * 1.15)
        return
      case 'out':
        setZoomFromViewportCenter(cameraRef.current.zoom / 1.15)
        return
      case 'actual':
        setZoomFromViewportCenter(1)
        return
      case 'fit':
        fitToView()
        return
    }
  }, [zoomCommandNonce, zoomCommandName, setZoomFromViewportCenter, fitToView])

  const focusTopicInViewport = useCallback(
    (topicId: string) => {
      const viewport = viewportRef.current
      const node = nodeMap.get(topicId)

      if (!viewport || !node) {
        return
      }

      const target = centerCameraOnWorldPoint(
        { width: viewport.clientWidth, height: viewport.clientHeight },
        { x: node.x + layout.offsetX, y: node.y + layout.offsetY },
        cameraRef.current.zoom,
      )
      animateCameraTo(target)
    },
    [animateCameraTo, layout.offsetX, layout.offsetY, nodeMap],
  )

  useEffect(() => {
    if (!searchOpen || !activeSearchTopicId) {
      return
    }

    focusTopicInViewport(activeSearchTopicId)
  }, [activeSearchTopicId, focusTopicInViewport, searchOpen])

  useEffect(() => {
    if (!historyFocusTopicId) {
      return
    }

    focusTopicInViewport(historyFocusTopicId)
  }, [focusTopicInViewport, historyFocusTopicId])

  const handleViewportPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const target = event.target

      if (
        target instanceof HTMLElement &&
        target.closest('button, input, textarea, label')
      ) {
        return
      }

      // 右键交给 onContextMenu 处理
      if (event.button === 2) {
        return
      }

      // 用户开始手动操作，立即取消正在进行的相机缓动动画
      cancelCameraAnimation()

      // 平移模式：中键拖拽，或 Space 按住时左键拖拽（对齐 XMind）；
      // 其余（左键 / Shift+左键）= 框选（对齐 XMind：空白左键拖拽即框选）。
      const isPanMode =
        event.button === 1 || (event.button === 0 && spacePressedRef.current)
      if (isPanMode) {
        spaceUsedForPanRef.current = true
      }

      interactionRef.current = {
        kind: isPanMode ? 'pan' : 'box',
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
      }

      if (!isPanMode) {
        const rect = event.currentTarget.getBoundingClientRect()

        setSelectionBox({
          startX: event.clientX - rect.left,
          startY: event.clientY - rect.top,
          currentX: event.clientX - rect.left,
          currentY: event.clientY - rect.top,
        })
      }

      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [cancelCameraAnimation],
  )

  const handleNodePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, topicId: string) => {
      if (editingTopicId) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        return
      }

      if (!selectedTopicIds.includes(topicId) || selectedTopicIds.length > 1) {
        onSelectedTopicIdsChange([topicId])
        void onSelect(topicId)
      }

      interactionRef.current = {
        kind: 'drag_candidate',
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        topicId,
      }

      viewportRef.current?.setPointerCapture(event.pointerId)
    },
    [editingTopicId, onSelect, onSelectedTopicIdsChange, selectedTopicIds],
  )

  const handleNodeClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, topicId: string) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }

      const nextIsToggle = event.metaKey || event.ctrlKey || event.shiftKey

      const nextSelectedTopicIds = (() => {
        if (!nextIsToggle) {
          return [topicId]
        }

        const nextSelection = new Set(selectedTopicIds)

        if (nextSelection.has(topicId)) {
          nextSelection.delete(topicId)
        } else {
          nextSelection.add(topicId)
        }

        return [...nextSelection]
      })()

      onSelectedTopicIdsChange(nextSelectedTopicIds)
      void onSelect(topicId)
    },
    [onSelect, onSelectedTopicIdsChange, selectedTopicIds],
  )

  const handleViewportPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const interaction = interactionRef.current

      if (!interaction || interaction.pointerId !== event.pointerId) {
        return
      }

      const deltaX = event.clientX - interaction.originX
      const deltaY = event.clientY - interaction.originY

      if (interaction.kind === 'pan') {
        interactionRef.current = {
          ...interaction,
          originX: event.clientX,
          originY: event.clientY,
        }
        setCamera((currentCamera) => panCamera(currentCamera, { x: deltaX, y: deltaY }))
        return
      }

      if (interaction.kind === 'box') {
        const rect = event.currentTarget.getBoundingClientRect()
        const pointInViewport = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }
        const autoPanDelta = getEdgeAutoPanDelta(
          { width: event.currentTarget.clientWidth, height: event.currentTarget.clientHeight },
          pointInViewport,
        )

        setSelectionBox((currentBox) =>
          currentBox
            ? {
                ...currentBox,
                currentX: pointInViewport.x,
                currentY: pointInViewport.y,
              }
            : currentBox,
        )

        if (autoPanDelta.x !== 0 || autoPanDelta.y !== 0) {
          setCamera((currentCamera) => panCamera(currentCamera, autoPanDelta))
        }
        return
      }

      if (interaction.kind === 'drag_candidate' && Math.hypot(deltaX, deltaY) < 6) {
        return
      }

      const rect = event.currentTarget.getBoundingClientRect()
      const pointInViewport = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      const autoPanDelta = getEdgeAutoPanDelta(
        { width: event.currentTarget.clientWidth, height: event.currentTarget.clientHeight },
        pointInViewport,
      )
      const hoveredNode = hitTestNodeAtViewportPoint(
        layout.nodes,
        layout.offsetX,
        layout.offsetY,
        camera,
        pointInViewport,
      )
      const dropTargetId =
        hoveredNode &&
        hoveredNode.id !== interaction.topicId &&
        canDropTopicOnTarget(rootTopic, interaction.topicId, hoveredNode.id)
          ? hoveredNode.id
          : null

      interactionRef.current = {
        kind: 'drag',
        pointerId: interaction.pointerId,
        originX: interaction.originX,
        originY: interaction.originY,
        topicId: interaction.topicId,
      }
      setDragPreview({
        topicId: interaction.topicId,
        deltaX: deltaX / camera.zoom,
        deltaY: deltaY / camera.zoom,
        dropTargetId,
      })

      if (autoPanDelta.x !== 0 || autoPanDelta.y !== 0) {
        setCamera((currentCamera) => panCamera(currentCamera, autoPanDelta))
      }
    },
    [camera, layout.nodes, layout.offsetX, layout.offsetY, rootTopic],
  )

  const handleViewportPointerEnd = useCallback(
    async (event: ReactPointerEvent<HTMLDivElement>) => {
      const interaction = interactionRef.current

      if (!interaction || interaction.pointerId !== event.pointerId) {
        return
      }

      // ⚠️ React 只在**派发期间**填 `event.currentTarget`，派发一结束就置空。
      // 本函数下面有 `await`（摆放/移动都要落库），等到清理那一行时
      // `event.currentTarget` 已经是 null —— 读它就是一个
      // 「Cannot read properties of null (reading 'hasPointerCapture')」的未捕获异常，
      // 而且它发生在 `await` 之后，**只在真的拖动成功时**才出现（静默、难复现）。
      // 所以在任何 await 之前先把元素与 pointerId 取出来。
      const captureTarget = event.currentTarget
      const pointerId = event.pointerId

      if (interaction.kind === 'box' && selectionBox) {
        const selectionRect = createViewportRectFromPoints(
          { x: selectionBox.startX, y: selectionBox.startY },
          { x: selectionBox.currentX, y: selectionBox.currentY },
        )
        const nextSelectedNodes = collectNodesInViewportRect(
          layout.nodes,
          layout.offsetX,
          layout.offsetY,
          camera,
          selectionRect,
        )
        const nextSelectedIds = nextSelectedNodes.map((node) => node.id)

        onSelectedTopicIdsChange(nextSelectedIds)

        if (nextSelectedIds.length > 0) {
          await onSelect(nextSelectedIds[0])
        }
      }

      // 分支自由布局：拖一级分支时写"自由位置"而不是改结构。
      // 判据是「开关打开 + 被拖的是根的直接子节点」，不满足则退回结构移动/吸附。
      const draggedNode = dragPreview ? nodeMap.get(dragPreview.topicId) : null
      // 「能不能自由摆放」走共享规则（lib/document/free-topics.ts）：
      // 菜单的「自由主题对齐」用同一条，两边各写一份必然会有一处先腐坏（踩过）
      const canPlaceFreely = isFreelyPositionableTopic({
        isFloatingTopic: !!draggedNode && floatingTopics.some((t) => t.id === draggedNode.id),
        isFirstLevelBranch:
          !!draggedNode && rootTopic.children.some((child) => child.id === draggedNode.id),
        freeBranchLayout,
      })

      if (interaction.kind === 'drag' && dragPreview && canPlaceFreely) {
        suppressClickRef.current = true
        await onPlaceTopicFreely(
          dragPreview.topicId,
          draggedNode!.x + dragPreview.deltaX,
          draggedNode!.y + dragPreview.deltaY,
        )
      } else if (interaction.kind === 'drag' && dragPreview?.dropTargetId) {
        suppressClickRef.current = true
        await onMoveTopic(dragPreview.topicId, dragPreview.dropTargetId)
      }

      interactionRef.current = null
      setSelectionBox(null)
      setDragPreview(null)

      if (captureTarget.hasPointerCapture(pointerId)) {
        captureTarget.releasePointerCapture(pointerId)
      }
    },
    [
      camera,
      dragPreview,
      layout.nodes,
      layout.offsetX,
      layout.offsetY,
      onMoveTopic,
      onPlaceTopicFreely,
      freeBranchLayout,
      floatingTopics,
      nodeMap,
      rootTopic,
      onSelect,
      onSelectedTopicIdsChange,
      selectionBox,
    ],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      // 编辑/输入中时不拦截快捷键，让 textarea/input 自行处理光标与文字
      if (isTypingTarget) {
        return
      }

      // Space：作为平移修饰键记录按下状态（不在此触发折叠）。
      // 折叠切换延迟到 keyup（见下方 keyup 监听）：若期间发生拖拽则视为平移，不触发折叠。
      if (event.key === ' ') {
        spacePressedRef.current = true
        spaceUsedForPanRef.current = false
        return
      }

      // 缩放快捷键（Cmd/Ctrl + -/=/0/1）。
      // 映射抽在 zoom-shortcut.ts 里：它在 jsdom 中无法用行为断言守住
      // （测试视口下 fit 与 100% 不可区分），只能对映射表本身做单测。
      const zoomAction = resolveZoomShortcut(event)
      if (zoomAction) {
        event.preventDefault()
        if (zoomAction === 'in') {
          setZoomFromViewportCenter(cameraRef.current.zoom * 1.15)
        } else if (zoomAction === 'out') {
          setZoomFromViewportCenter(cameraRef.current.zoom / 1.15)
        } else if (zoomAction === 'actual') {
          setZoomFromViewportCenter(1)
        } else {
          fitToView()
        }
        return
      }

      // 方向键导航：在相邻节点间移动焦点（编辑中禁用）
      if (!editingTopicId) {
        const direction = arrowDirection(event.key)
        if (direction && activeTopicId) {
          const next = findNearestNodeInDirection(layout.nodes, activeTopicId, direction)
          if (next) {
            event.preventDefault()
            onSelectedTopicIdsChange([next.id])
            void onSelect(next.id)
          }
          return
        }
      }

      if (event.key !== 'Escape') {
        return
      }

      const viewport = viewportRef.current
      const interaction = interactionRef.current

      if (viewport && interaction && viewport.hasPointerCapture(interaction.pointerId)) {
        viewport.releasePointerCapture(interaction.pointerId)
      }

      if (interaction || selectionBox || dragPreview) {
        event.preventDefault()
        interactionRef.current = null
        setSelectionBox(null)
        setDragPreview(null)
        onSelectedTopicIdsChange(activeTopicId ? [activeTopicId] : [])
        return
      }

      if (selectedTopicIds.length > 1) {
        event.preventDefault()
        onSelectedTopicIdsChange(activeTopicId ? [activeTopicId] : [])
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    activeTopicId,
    dragPreview,
    editingTopicId,
    fitToView,
    layout.nodes,
    onSelect,
    onSelectedTopicIdsChange,
    selectedTopicIds.length,
    selectionBox,
    setZoomFromViewportCenter,
  ])

  // Space keyup：若按下期间未发生拖拽（且未在编辑/搜索态），触发折叠切换（兼容旧行为）。
  // 拖拽发生时视为平移手势，抑制折叠切换，避免「Space+拖拽平移」误触折叠。
  useEffect(() => {
    function handleKeyUp(event: KeyboardEvent) {
      if (event.key !== ' ') {
        return
      }

      const wasPressed = spacePressedRef.current
      spacePressedRef.current = false

      if (!wasPressed) {
        return
      }

      const usedForPan = spaceUsedForPanRef.current || interactionRef.current !== null
      spaceUsedForPanRef.current = false

      if (usedForPan || editingTopicId || searchOpen) {
        return
      }

      const selectedTopicId = activeTopicId ?? rootTopic.id
      const selectedTopic = findTopicById(rootTopic, selectedTopicId)

      if (!selectedTopic || selectedTopic.children.length === 0) {
        return
      }

      event.preventDefault()
      void onToggleTopicCollapsed(selectedTopicId)
    }

    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [
    activeTopicId,
    editingTopicId,
    onToggleTopicCollapsed,
    rootTopic,
    searchOpen,
  ])

  const handleViewportWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault()

      const viewport = viewportRef.current

      if (!viewport) {
        return
      }

      // 滚轮缩放/平移是连续手动操作，取消正在进行的缓动动画避免冲突
      cancelCameraAnimation()

      const rect = viewport.getBoundingClientRect()

      if (event.metaKey || event.ctrlKey) {
        const zoomFactor = Math.exp(-event.deltaY * 0.0016)

        setCamera((currentCamera) =>
          zoomAtViewportPoint(currentCamera, currentCamera.zoom * zoomFactor, {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          }),
        )
        return
      }

      setCamera((currentCamera) =>
        panCamera(currentCamera, {
          x: -event.deltaX,
          y: -event.deltaY,
        }),
      )
    },
    [cancelCameraAnimation],
  )

  const handleNodeDoubleClick = useCallback(
    (topicId: string) => {
      onStartEditingTopic(topicId)
    },
    [onStartEditingTopic],
  )

  // 画布空白双击：创建浮动主题（XMind 式）
  const handleViewportDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (editingTopicId || searchOpen) {
        return
      }
      // 仅画布空白处触发（节点双击由 handleNodeDoubleClick 处理）
      if (event.target instanceof HTMLButtonElement) {
        return
      }
      if (!onCreateFloatingTopic || !viewportRef.current) {
        return
      }
      // 画布设置里的「自由主题」开关必须真的生效：关掉后空白双击不再创建
      if (canvasSettings.freeTopic === false) {
        return
      }

      const rect = viewportRef.current.getBoundingClientRect()
      const worldX = (event.clientX - rect.left - cameraRef.current.x) / cameraRef.current.zoom
      const worldY = (event.clientY - rect.top - cameraRef.current.y) / cameraRef.current.zoom
      // 转换为根主题相对坐标（与布局坐标系一致）
      const rootX = worldX - layout.offsetX
      const rootY = worldY - layout.offsetY

      void onCreateFloatingTopic('新建浮动主题', rootX, rootY)
    },
    [
      editingTopicId,
      searchOpen,
      onCreateFloatingTopic,
      layout.offsetX,
      layout.offsetY,
      canvasSettings.freeTopic,
    ],
  )

  // 节点右键：编辑/增删/复制/粘贴/折叠/删除（参考 XMind 节点右键菜单）
  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, topicId: string) => {
      event.preventDefault()
      event.stopPropagation()

      const topic = findTopicById(rootTopic, topicId)
      if (!topic) {
        return
      }

      const isRoot = topic.id === rootTopic.id
      const hasChildren = topic.children.length > 0
      const isInSelection = selectedTopicIds.includes(topicId)

      // 右键未选中的节点时，改为单选该节点，使后续操作作用于它
      if (!isInSelection) {
        onSelectedTopicIdsChange([topicId])
        void onSelect(topicId)
      }

      const effectiveSelectedIds = isInSelection ? selectedTopicIds : [topicId]
      const deletableIds = getDeletableTopicIds(effectiveSelectedIds, rootTopic.id)

      const items: ContextMenuItem[] = [
        menuItem('编辑文本', () => onStartEditingTopic(topicId), { shortcut: 'F2' }),
        menuItem('新建子主题', () => void onCreateChildTopic(topicId), { shortcut: 'Tab' }),
        menuItem('新建同级', () => void onCreateSiblingTopic(topicId), {
          shortcut: 'Enter',
          disabled: isRoot,
        }),
        menuSeparator,
        menuItem('复制', () => void onCopyTopics(), { shortcut: '⌘C', disabled: !canCopy }),
        menuItem('粘贴为子主题', () => void onPasteTopics(), {
          shortcut: '⌘V',
          disabled: !canPaste,
        }),
        menuSeparator,
        menuItem(topic.collapsed ? '展开' : '折叠', () => void onToggleTopicCollapsed(topicId), {
          disabled: !hasChildren,
        }),
        menuSeparator,
        menuItem('删除', () => void onDeleteTopics(deletableIds), {
          shortcut: '⌫',
          disabled: deletableIds.length === 0,
          danger: true,
        }),
      ]

      setContextMenu({ x: event.clientX, y: event.clientY, items })
    },
    [
      rootTopic,
      selectedTopicIds,
      onSelectedTopicIdsChange,
      onSelect,
      onStartEditingTopic,
      onCreateChildTopic,
      onCreateSiblingTopic,
      onCopyTopics,
      onPasteTopics,
      onToggleTopicCollapsed,
      onDeleteTopics,
      canCopy,
      canPaste,
    ],
  )

  // 画布空白右键：粘贴 + 视图缩放（参考 XMind 画布右键菜单）
  const handleViewportContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()

      const items: ContextMenuItem[] = [
        menuItem('粘贴', () => void onPasteTopics(), {
          shortcut: '⌘V',
          disabled: !canPaste,
        }),
        menuSeparator,
        menuItem('放大', () => setZoomFromViewportCenter(cameraRef.current.zoom * 1.15), {
          shortcut: '⌘+',
        }),
        menuItem('缩小', () => setZoomFromViewportCenter(cameraRef.current.zoom / 1.15), {
          shortcut: '⌘-',
        }),
        menuItem('100%', () => setZoomFromViewportCenter(1)),
        menuItem('适配视图', () => fitToView(), { shortcut: '⌘0' }),
      ]

      setContextMenu({ x: event.clientX, y: event.clientY, items })
    },
    [canPaste, onPasteTopics, setZoomFromViewportCenter, fitToView],
  )

  return (
    <section className="editor-card editor-card--scene" aria-label="思维导图舞台">
      {selectedTopicIds.length > 1 ? (
        <div className="scene-selection-badge" role="status" aria-live="polite">
          已选中 {selectedTopicIds.length} 个主题
        </div>
      ) : null}
      <div className="scene-toolbar scene-toolbar--floating">
        <span className="editor-card__hint">{Math.round(camera.zoom * 100)}%</span>
        <button className="scene-toolbar__button" type="button" onClick={() => setZoomFromViewportCenter(camera.zoom / 1.15)} title="缩小">
          -
        </button>
        <button className="scene-toolbar__button" type="button" onClick={() => setZoomFromViewportCenter(camera.zoom * 1.15)} title="放大">
          +
        </button>
        <button className="scene-toolbar__button" type="button" onClick={() => fitToView()} title="适配视图">
          适配
        </button>
        <button className="scene-toolbar__button" type="button" onClick={() => setZoomFromViewportCenter(1)} title="100%">
          100%
        </button>
        <button
          className="scene-toolbar__button"
          type="button"
          onClick={toggleMinimap}
          title={minimapVisible ? '隐藏小地图' : '显示小地图'}
          aria-pressed={minimapVisible}
        >
          小地图
        </button>
      </div>

      {minimapVisible && viewportSize.width > 0 && viewportSize.height > 0 ? (
        <Minimap
          layout={layout}
          camera={camera}
          viewportSize={viewportSize}
          onNavigate={animateCameraTo}
        />
      ) : null}

      {searchOpen ? (
        <div className="mindmap-search" role="search">
          <div className="mindmap-search__header">
            <strong>搜索主题</strong>
            <span>
              {searchResults.length === 0
                ? '无匹配结果'
                : `${activeSearchIndex + 1} / ${searchResults.length}`}
            </span>
          </div>
          <div className="mindmap-search__controls">
            <input
              className="mindmap-search__input"
              type="text"
              aria-label="搜索主题"
              value={searchQuery}
              autoFocus
              placeholder="输入关键词，Enter 跳转下一个"
              onChange={(event) => onSearchQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onCloseSearch()
                  return
                }

                if (event.key === 'Enter') {
                  event.preventDefault()

                  if (event.shiftKey) {
                    onSearchPrevious()
                  } else {
                    onSearchNext()
                  }
                }
              }}
            />
            <button className="scene-toolbar__button" type="button" onClick={onSearchPrevious}>
              上一个
            </button>
            <button className="scene-toolbar__button" type="button" onClick={onSearchNext}>
              下一个
            </button>
            <button className="scene-toolbar__button" type="button" onClick={onCloseSearch}>
              关闭
            </button>
          </div>
          <div className="mindmap-search__controls">
            <input
              className="mindmap-search__input"
              type="text"
              aria-label="替换为"
              value={replaceQuery}
              placeholder="替换为（留空即删除匹配文本）"
              onChange={(event) => onReplaceQueryChange(event.target.value)}
            />
            <button
              className="scene-toolbar__button"
              type="button"
              disabled={!searchQuery || searchResults.length === 0}
              onClick={() => void handleReplaceCurrent()}
            >
              替换当前
            </button>
            <button
              className="scene-toolbar__button"
              type="button"
              disabled={!searchQuery || searchResults.length === 0}
              onClick={() => void handleReplaceAll()}
            >
              全部替换
            </button>
          </div>
          {searchResults.length > 0 ? (
            <div className="mindmap-search__results">
              {searchResults.slice(0, 6).map((result, index) => (
                <button
                  key={result.topicId}
                  className={`mindmap-search__result${index === activeSearchIndex ? ' mindmap-search__result--active' : ''}`}
                  type="button"
                  onClick={() => onActivateSearchResult(index)}
                >
                  <strong>{result.text}</strong>
                  <span>
                    {result.sheetTitle ? `${result.sheetTitle} / ` : ''}
                    {result.path.join(' / ')}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        ref={viewportRef}
        className="mindmap-scene"
        onPointerDownCapture={handleIllustrationPointerDownCapture}
        onPointerMoveCapture={handleIllustrationPointerMoveCapture}
        onPointerUpCapture={handleIllustrationPointerEndCapture}
        onPointerCancelCapture={handleIllustrationPointerEndCapture}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerEnd}
        onPointerCancel={handleViewportPointerEnd}
        onWheel={handleViewportWheel}
        onContextMenu={handleViewportContextMenu}
        onDoubleClick={handleViewportDoubleClick}
      >
        <canvas
          ref={canvasRef}
          className="mindmap-scene__canvas"
          aria-hidden="true"
        />

        {selectionBox ? (
          <div
            className="mindmap-selection-box"
            style={{
              left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`,
              top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`,
              width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`,
              height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px`,
            }}
          />
        ) : null}

        {dropTargetNode && dropIndicatorPosition ? (
          <div
            className="mindmap-drop-indicator"
            style={{
              left: `${dropIndicatorPosition.x}px`,
              top: `${dropIndicatorPosition.y + 20}px`,
            }}
          >
            释放后作为“{dropTargetNode.topic.text}”的子主题
          </div>
        ) : null}

        <div
          className="mindmap-scene__board"
          style={{
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          }}
        >
          {visibleLayoutNodes.map((node) => (
            <MindMapNode
              key={node.id}
              node={node}
              zoom={camera.zoom}
              onStickerMove={onStickerMove}
              onCalloutMove={onCalloutMove}
              offsetX={layout.offsetX}
              offsetY={layout.offsetY}
              theme={effectiveTheme}
              branchIndex={branchIndexMap.get(node.id) ?? null}
              isActive={node.id === activeTopicId}
              isSelected={selectedTopicIds.includes(node.id)}
              isEditing={editingTopicId === node.id}
              editingText={editingTopicId === node.id ? editingText : ''}
              isSearchMatch={matchedSearchTopicIds.has(node.id)}
              isActiveSearchResult={activeSearchTopicId === node.id}
              isHistoryFocus={historyFocusTopicId === node.id}
              isDropTarget={dragPreview?.dropTargetId === node.id}
              dragOffset={
                dragPreview?.topicId === node.id
                  ? { x: dragPreview.deltaX, y: dragPreview.deltaY }
                  : null
              }
              onClick={handleNodeClick}
              onDoubleClick={handleNodeDoubleClick}
              onPointerDown={handleNodePointerDown}
              onContextMenu={handleNodeContextMenu}
              onToggleCollapsed={onToggleTopicCollapsed}
              onEditingTextChange={onEditingTextChange}
              onCommitEditingTopic={onCommitEditingTopic}
              onCancelEditingTopic={onCancelEditingTopic}
              isAppearing={appearingTopicIdsRef.current.has(node.id)}
              onAppearEnd={handleNodeAppearEnd}
              onOpenLink={onOpenLink}
              imageUrl={pickTopicImageUrl(node.topic.image, topicImageUrls)}
              fontFamily={buildFontStack(canvasSettings.fontFamily, canvasSettings.cjkFont)}
              numberText={numberMap.get(node.id) ?? null}
            />
          ))}
        </div>
      </div>

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </section>
  )
}

/** 任务状态图标：todo/doing/done/pending + 优先级色点。 */
function TaskStatusIcon({ status, priority }: { status: string; priority?: number }) {
  if (status === 'completed') {
    return (
      <svg className="task-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="6" fill="#34c759" />
        <path d="M4 7l2 2 4-4.5" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'started') {
    return (
      <svg className="task-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="#5b8cff" strokeWidth="1.4" />
        <path
          d="M7 1.5a5.5 5.5 0 015.5 5.5h-5.5z"
          fill="#5b8cff"
          fillOpacity="0.35"
        />
      </svg>
    )
  }
  if (status === 'pending') {
    return (
      <svg className="task-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="#ff9f0a" strokeWidth="1.4" />
        <path d="M4 7h6" stroke="#ff9f0a" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }
  // none：空复选框
  const dot = priority != null && priority > 0 ? PRIORITY_DOT_COLORS[(priority - 1) % PRIORITY_DOT_COLORS.length] : null
  return (
    <svg className="task-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="rgba(15,23,42,0.28)" strokeWidth="1.2" />
      {dot ? <circle cx="7" cy="1.5" r="1.6" fill={dot} /> : null}
    </svg>
  )
}

const PRIORITY_DOT_COLORS = ['#e5484d', '#ff8b3d', '#f6be00', '#4cb050', '#0ea5e9', '#5b8cff', '#9b6bff']

/** 备注指示图标（便签纸样式）。 */
function NoteGlyph() {
  return (
    <svg className="note-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2.5 1.5h6l3 3v8h-9z" fill="#f6be00" fillOpacity="0.18" stroke="#f6be00" strokeWidth="1" strokeLinejoin="round" />
      <path d="M8.5 1.5v3h3" fill="none" stroke="#f6be00" strokeWidth="1" strokeLinejoin="round" />
      <path d="M4 6.5h5M4 8.5h5M4 10.5h3" stroke="rgba(180,83,9,0.5)" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  )
}

/** 链接指示图标。 */
/**
 * 把偏移量写成 `calc(50% ± N px)`。
 *
 * 负数不写成 `calc(50% + -14px)`：虽然多数解析器接受，
 * 但把"加负数"写成减法在任何实现下都无歧义，也更好读。
 */
function stickerOffsetExpression(offset: number): string {
  const rounded = Math.round(offset * 100) / 100
  return rounded >= 0 ? `calc(50% + ${rounded}px)` : `calc(50% - ${Math.abs(rounded)}px)`
}

/** 标注在装饰拖动状态里用的 id（与贴纸实例 id 区分开）。 */
export const CALLOUT_DECOR_ID = '__callout__'

/** 被过滤时的空插画列表：复用模块级常量，写成 `[]` 每次渲染都是新引用，
 *  会让依赖它的 useMemo（场景构建）每渲染重算一次。 */
const EMPTY_ILLUSTRATIONS: CanvasIllustration[] = []

/** 透明边框回退到文字色，与 underline 形状的既有约定一致。 */
function calloutStrokeColor(style: { borderColor: string; textColor: string }): string {
  return style.borderColor === 'transparent' ? style.textColor : style.borderColor
}

function AttachmentGlyph() {
  // 回形针：XMind 用同一个隐喻表示"这个主题带了附件"
  return (
    <svg className="attachment-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M9.5 4.5l-4 4a2 2 0 002.8 2.8l4.2-4.2a3.5 3.5 0 00-5-5L3.2 6.4a5 5 0 007 7l1.6-1.6"
        fill="none"
        stroke="#f6be00"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LinkGlyph() {
  return (
    <svg className="link-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M5.5 8.5l3-3M5 6a2.5 2.5 0 00-3 0l-.5.5a2.5 2.5 0 003.5 3.5L6 9M9 8a2.5 2.5 0 003 0l.5-.5a2.5 2.5 0 00-3.5-3.5L8 5"
        fill="none"
        stroke="#5b8cff"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MindMapNode({
  node,
  offsetX,
  offsetY,
  theme,
  isActive,
  isSelected,
  isEditing,
  editingText,
  isSearchMatch,
  isActiveSearchResult,
  isHistoryFocus,
  isDropTarget,
  dragOffset,
  onClick,
  onDoubleClick,
  onPointerDown,
  onContextMenu,
  onToggleCollapsed,
  onEditingTextChange,
  onCommitEditingTopic,
  onCancelEditingTopic,
  isAppearing,
  onAppearEnd,
  onOpenLink,
  imageUrl,
  zoom,
  onStickerMove,
  onCalloutMove,
  branchIndex,
  fontFamily,
  numberText,
}: {
  node: MindMapNodeLayout
  offsetX: number
  offsetY: number
  /**
   * **生效主题**（画布级分支色板已叠加）。与 scene 里节点用的是同一个对象，
   * 所以屏幕上看到的填充色与导出、与该分支连线色必然一致。
   */
  theme: ThemePalette
  /** 在一级分支中的序号，缤纷主题按此取分支色；null 表示不适用（根节点/经典主题）。 */
  branchIndex: number | null
  isActive: boolean
  isSelected: boolean
  isEditing: boolean
  editingText: string
  isSearchMatch: boolean
  isActiveSearchResult: boolean
  isHistoryFocus: boolean
  isDropTarget: boolean
  dragOffset: { x: number; y: number } | null
  onClick: (event: ReactMouseEvent<HTMLButtonElement>, topicId: string) => void
  onDoubleClick: (topicId: string) => void
  onPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    topicId: string,
  ) => void
  onContextMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    topicId: string,
  ) => void
  onToggleCollapsed: (topicId: string) => Promise<void>
  onEditingTextChange: (text: string) => void
  onCommitEditingTopic: () => Promise<void>
  onCancelEditingTopic: () => void
  isAppearing: boolean
  onAppearEnd: (topicId: string) => void
  /** 点击节点上的链接图标时调用（非编辑态）。 */
  onOpenLink?: (url: string) => void
  /** 主题图片的 data URL，null 表示无图或尚未加载完成（此时不渲染图片元素）。 */
  imageUrl: string | null
  /** 当前相机缩放。贴纸拖动要把屏幕位移换算回世界单位。 */
  zoom: number
  /** 拖动贴纸结束（松手）时提交新偏移；一次拖动只提交一次，故只产生一条撤销记录。 */
  onStickerMove: (topicId: string, stickerId: string, offsetX: number, offsetY: number) => void
  /** 拖动标注结束（松手）时提交新偏移，规则与贴纸相同。 */
  onCalloutMove: (topicId: string, offsetX: number, offsetY: number) => void
  fontFamily?: string
  /** 主题编号（形如 "1.2"），null 表示未启用编号。 */
  numberText?: string | null
}) {
  const left = node.x - node.width / 2 + offsetX
  const top = node.y - node.height / 2 + offsetY
  const inlineEditShouldSkipBlurCommitRef = useRef(false)
  // 解析主题 + 节点覆盖 → 具体颜色与排印，作为内联样式覆盖 CSS 默认配色。
  // 使用 background 简写而非 backgroundColor，以清除 CSS 中的渐变背景。
  const resolvedStyle = resolveTopicStyleFrom(
    theme,
    node.depth,
    node.side,
    node.topic.styleOverrides,
    branchIndex,
  )
  // 形状 → 圆角：rounded 沿用 CSS 深度分级圆角（不内联），其余形状内联覆盖。
  const isUnderline = resolvedStyle.shape === 'underline'
  const shapeRadius =
    resolvedStyle.shape === 'rect' || isUnderline
      ? 0
      : resolvedStyle.shape === 'pill'
        ? 9999
        : undefined
  // underline 形状下划线色：borderColor 透明时回退 textColor（根节点默认透明边框）
  const underlineColor =
    resolvedStyle.borderColor === 'transparent' ? resolvedStyle.textColor : resolvedStyle.borderColor
  const baseStyle: CSSProperties = {
    width: `${node.width}px`,
    minHeight: `${node.height}px`,
    left: `${left}px`,
    top: `${top}px`,
    color: resolvedStyle.textColor,
    // underline 形状：透明背景 + 仅底部下划线（对齐 Canvas/SVG 渲染）
    ...(isUnderline
      ? {
          background: 'transparent',
          border: 'none',
          borderBottom: `${resolvedStyle.borderWidth}px solid ${underlineColor}`,
          boxShadow: 'none',
        }
      : {
          background: resolvedStyle.fill,
          borderColor: resolvedStyle.borderColor,
          borderWidth: `${resolvedStyle.borderWidth}px`,
          // 边框线型与 Canvas/SVG 的 dash 语义一致（solid 时不写，走 CSS 默认）
          borderStyle: resolvedStyle.borderStyle,
        }),
    ...(shapeRadius != null ? { borderRadius: `${shapeRadius}px` } : {}),
    transform: dragOffset ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined,
  }
  // 标题排印：字号 / 字重来自解析样式（深度默认 + 节点覆盖），内联覆盖 CSS 深度分级
  // 字体族：节点级覆盖优先于画布全局字体；斜体 / 删除线 / 大小写走 CSS，
  // 与 Canvas 手绘横线、SVG 手绘 <line> 保持同一视觉（转换函数三端同源）。
  const titleStyle: CSSProperties = {
    fontSize: resolvedStyle.fontSize,
    fontWeight: resolvedStyle.fontWeight,
    // 标题对齐（XMind 样式页「对齐」）：左/中/右
    textAlign: resolvedStyle.textAlign,
    ...(resolvedStyle.fontFamily
      ? { fontFamily: resolvedStyle.fontFamily }
      : fontFamily
        ? { fontFamily }
        : {}),
    ...(resolvedStyle.italic ? { fontStyle: 'italic' } : {}),
    ...(resolvedStyle.strikethrough ? { textDecoration: 'line-through' } : {}),
    ...(resolvedStyle.textTransform ? { textTransform: resolvedStyle.textTransform } : {}),
  }
  // XMind 式：折叠 toggle 位于"连线起点侧"——中心节点贴下缘、
  // 左侧分支贴左缘、右侧分支贴右缘，16px 按钮半嵌于节点边。
  const toggleHalf = 8
  const toggleStyle =
    node.side === 'center'
      ? { left: `${left + node.width / 2 - toggleHalf}px`, top: `${top + node.height - toggleHalf}px` }
      : node.side === 'left'
        ? { left: `${left - toggleHalf}px`, top: `${top + node.height / 2 - toggleHalf}px` }
        : { left: `${left + node.width - toggleHalf}px`, top: `${top + node.height / 2 - toggleHalf}px` }

  // —— 贴纸：渲染 + 拖动 ——
  // 拖动时只改本地预览、松手才提交：一次拖动 = 一条撤销记录（与其它动作一致），
  // 也避免每帧都往文档写一次。
  const [decorDrag, setDecorDrag] = useState<{
    id: string
    offsetX: number
    offsetY: number
  } | null>(null)
  const decorDragRef = useRef<{
    /** 被拖动的是哪个装饰：贴纸实例 id，或 CALLOUT_DECOR_ID（标注）。 */
    itemId: string
    startClientX: number
    startClientY: number
    baseOffsetX: number
    baseOffsetY: number
  } | null>(null)

  const stickerList = node.topic.stickers ?? []

  const handleStickerPointerDown = (
    event: ReactPointerEvent<HTMLSpanElement>,
    sticker: { id: string; offsetX?: number; offsetY?: number },
  ) => {
    if (event.button !== 0) {
      return
    }
    // 不让节点开始自己的拖拽：在贴纸上按下就是要挪贴纸
    event.stopPropagation()
    const baseOffsetX = sticker.offsetX ?? 0
    const baseOffsetY = sticker.offsetY ?? 0
    decorDragRef.current = {
      itemId: sticker.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseOffsetX,
      baseOffsetY,
    }
    setDecorDrag({ id: sticker.id, offsetX: baseOffsetX, offsetY: baseOffsetY })
    // jsdom 与部分环境没有指针捕获，缺了也不该让拖动整体失效
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleDecorPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = decorDragRef.current
    if (!drag) {
      return
    }
    event.stopPropagation()
    const safeZoom = zoom > 0 ? zoom : 1
    setDecorDrag({
      id: drag.itemId,
      offsetX: drag.baseOffsetX + (event.clientX - drag.startClientX) / safeZoom,
      offsetY: drag.baseOffsetY + (event.clientY - drag.startClientY) / safeZoom,
    })
  }

  const handleDecorPointerEnd = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = decorDragRef.current
    if (!drag) {
      return
    }
    event.stopPropagation()
    decorDragRef.current = null
    const safeZoom = zoom > 0 ? zoom : 1
    const deltaX = (event.clientX - drag.startClientX) / safeZoom
    const deltaY = (event.clientY - drag.startClientY) / safeZoom
    setDecorDrag(null)

    // 没挪动就是一次点击（选中主题），不该写文档、也不该产生撤销记录
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
      return
    }
    if (drag.itemId === CALLOUT_DECOR_ID) {
      onCalloutMove(node.id, drag.baseOffsetX + deltaX, drag.baseOffsetY + deltaY)
      return
    }
    onStickerMove(node.id, drag.itemId, drag.baseOffsetX + deltaX, drag.baseOffsetY + deltaY)
  }

  const stickerElements =
    stickerList.length > 0 ? (
      <>
        {stickerList.map((sticker, index) => {
          // 默认落点按节点尺寸现算（未拖过的贴纸存储里没有 offset）
          const placement =
            decorDrag?.id === sticker.id
              ? decorDrag
              : computeTopicStickerPlacement(
                  { x: 0, y: 0, width: node.width, height: node.height },
                  sticker,
                  index,
                )

          return (
            <span
              key={sticker.id}
              className={`mindmap-node__sticker${decorDrag?.id === sticker.id ? ' mindmap-node__sticker--dragging' : ''}`}
              data-sticker-id={sticker.id}
              title={findStickerDefinition(sticker.stickerId)?.label ?? sticker.stickerId}
              style={{
                left: stickerOffsetExpression(placement.offsetX),
                top: stickerOffsetExpression(placement.offsetY),
                transform: `translate(-50%, -50%) rotate(` + (sticker.rotation ?? 0) + `deg)`,
              }}
              onPointerDown={(event) => handleStickerPointerDown(event, sticker)}
              onPointerMove={handleDecorPointerMove}
              onPointerUp={handleDecorPointerEnd}
              onPointerCancel={handleDecorPointerEnd}
            >
              <StickerIcon stickerId={sticker.stickerId} size={TOPIC_STICKER_SIZE} />
            </span>
          )
        })}
      </>
    ) : null

  // —— 标注（callout）：挂在节点外侧的说明框 ——
  //
  // **文本行由 wrapText 切好并逐行渲染**（不使用 CSS 自动换行）：于是 DOM 与 PNG/SVG 用的是同一份换行结果，
  // 不会出现"两端行数不同 → 框高不同"这类偏差。
  const calloutInfo = node.topic.callout ?? null
  const calloutFont = `${TOPIC_CALLOUT_FONT_SIZE}px ${resolvedStyle.fontFamily ?? fontFamily}`
  const calloutLines =
    calloutInfo && calloutInfo.text.trim().length > 0
      ? wrapText(calloutInfo.text, TOPIC_CALLOUT_TEXT_WIDTH, calloutFont)
      : []

  const calloutPlacement =
    calloutInfo && calloutLines.length > 0
      ? computeTopicCalloutPlacement(
          { x: 0, y: 0, width: node.width, height: node.height },
          calloutInfo,
          calloutLines.length,
          node.side === 'left' ? 'left' : 'right',
        )
      : null

  const handleCalloutPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0 || !calloutPlacement) {
      return
    }
    // 与贴纸同理：在标注上按下是挪标注，不让节点开始自己的拖拽
    event.stopPropagation()
    decorDragRef.current = {
      itemId: CALLOUT_DECOR_ID,
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseOffsetX: calloutPlacement.offsetX,
      baseOffsetY: calloutPlacement.offsetY,
    }
    setDecorDrag({
      id: CALLOUT_DECOR_ID,
      offsetX: calloutPlacement.offsetX,
      offsetY: calloutPlacement.offsetY,
    })
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const calloutElement =
    calloutPlacement && calloutLines.length > 0 ? (
      <span
        className={`mindmap-node__callout${decorDrag?.id === CALLOUT_DECOR_ID ? ' mindmap-node__callout--dragging' : ''}`}
        data-callout="true"
        title={calloutInfo?.text ?? ''}
        style={{
          left: stickerOffsetExpression(calloutPlacement.offsetX),
          top: stickerOffsetExpression(calloutPlacement.offsetY),
          // ⚠️ 偏移量是**框中心**相对节点中心的偏移（与导出端的 placement.x/y 同源），
          // 所以必须再平移半个自身尺寸把自己摆正。漏了这行，框会整体向右下各偏半宽/半高——
          // 单测只断言 style 字符串、看不出这个错，是**真引擎量出来**的（dev/capture-callout.mjs）。
          transform: 'translate(-50%, -50%)',
          width: `${TOPIC_CALLOUT_WIDTH}px`,
          padding: `${TOPIC_CALLOUT_PADDING}px`,
          fontSize: `${TOPIC_CALLOUT_FONT_SIZE}px`,
          lineHeight: `${TOPIC_CALLOUT_LINE_HEIGHT}px`,
          background: resolvedStyle.fill,
          border: `${resolvedStyle.borderWidth}px solid ${calloutStrokeColor(resolvedStyle)}`,
          color: resolvedStyle.textColor,
        }}
        onPointerDown={handleCalloutPointerDown}
        onPointerMove={handleDecorPointerMove}
        onPointerUp={handleDecorPointerEnd}
        onPointerCancel={handleDecorPointerEnd}
      >
        <span
          className="mindmap-node__callout-lead"
          style={computeTopicCalloutLeadBox(node.width, calloutPlacement)}
        />
        {calloutLines.map((line, index) => (
          <span key={index} className="mindmap-node__callout-line">
            {line}
          </span>
        ))}
      </span>
    ) : null

  // 主题图片元素：编辑态与非编辑态共用一份，避免两条分支各写一遍（曾因此让图片
  // 在进入编辑时凭空消失、节点高度内边距同时跳变）。
  const topicImageElement = imageUrl ? (
    <img
      className="mindmap-node__image"
      src={imageUrl}
      alt={`${node.topic.text} 的主题图片`}
      draggable={false}
    />
  ) : null

  if (isEditing) {
    return (
      <>
        <div
          className={`mindmap-node mindmap-node--${node.side} mindmap-node--depth-${Math.min(node.depth, 3)}${imageUrl ? ' mindmap-node--with-image' : ''}${isActive ? ' mindmap-node--active' : ''}${isSelected ? ' mindmap-node--selected' : ''}${isSearchMatch ? ' mindmap-node--search-match' : ''}${isActiveSearchResult ? ' mindmap-node--search-active' : ''}${isHistoryFocus ? ' mindmap-node--history-focus' : ''} mindmap-node--editing`}
          style={baseStyle}
        >
          {topicImageElement}
          {stickerElements}
          {calloutElement}
          <textarea
            className="mindmap-node__editor"
            aria-label="内联编辑主题"
            value={editingText}
            rows={Math.max(2, Math.min(6, editingText.split('\n').length + 1))}
            style={titleStyle}
            onChange={(event) => onEditingTextChange(event.target.value)}
            onClick={(event) => {
              // 三击选中全部文本（对齐 XMind/MindNode 编辑体验）
              if (event.detail >= 3) {
                const target = event.currentTarget
                target.select()
              }
            }}
            onBlur={() => {
              if (inlineEditShouldSkipBlurCommitRef.current) {
                inlineEditShouldSkipBlurCommitRef.current = false
                return
              }

              void onCommitEditingTopic()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                inlineEditShouldSkipBlurCommitRef.current = true
                onCancelEditingTopic()
                return
              }

              // Enter 提交编辑（对齐 XMind）；Shift+Enter 换行（textarea 默认行为，不阻止）
              // Cmd/Ctrl+Enter 同样提交，保留肌肉记忆兼容
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                inlineEditShouldSkipBlurCommitRef.current = true
                void onCommitEditingTopic()
              }
            }}
          />
          <span className="mindmap-node__edit-hint">Enter 提交，Shift+Enter 换行，Esc 取消</span>
        </div>
        {node.topic.children.length > 0 ? (
          <button
            className="mindmap-node__toggle"
            type="button"
            style={toggleStyle}
            aria-label={node.topic.collapsed ? '展开主题' : '折叠主题'}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.stopPropagation()
              void onToggleCollapsed(node.id)
            }}
          >
            {node.topic.collapsed ? '+' : '-'}
          </button>
        ) : null}
      </>
    )
  }

  // —— 富内容投影（task / markers / notes / link / labels）——
  const topicData = node.topic
  const task = topicData.task
  const markers = topicData.markers && topicData.markers.length > 0 ? topicData.markers : null
  const notesText = topicData.notes && topicData.notes.length > 0 ? topicData.notes : null
  const linkInfo = topicData.link ?? null
  const labelList = topicData.labels && topicData.labels.length > 0 ? topicData.labels : null
  const attachmentInfo = topicData.attachment ?? null
  // ⚠️ 附件必须算进 hasMeta：这个布尔值决定整行 meta 是否渲染，
  // 漏掉它会让"只带附件的主题"完全看不到回形针（接了一半的线）
  const hasMeta = !!(markers || notesText || linkInfo || attachmentInfo)

  return (
    <>
      <button
        className={`mindmap-node mindmap-node--${node.side} mindmap-node--depth-${Math.min(node.depth, 3)}${imageUrl ? ' mindmap-node--with-image' : ''}${isActive ? ' mindmap-node--active' : ''}${isSelected ? ' mindmap-node--selected' : ''}${isSearchMatch ? ' mindmap-node--search-match' : ''}${isActiveSearchResult ? ' mindmap-node--search-active' : ''}${isHistoryFocus ? ' mindmap-node--history-focus' : ''}${isDropTarget ? ' mindmap-node--drop-target' : ''}${dragOffset ? ' mindmap-node--dragging' : ''}${isAppearing ? ' mindmap-node--appear' : ''}`}
        style={baseStyle}
        type="button"
        data-topic-id={node.id}
        onClick={(event) => onClick(event, node.id)}
        onDoubleClick={() => onDoubleClick(node.id)}
        onPointerDown={(event) => onPointerDown(event, node.id)}
        onContextMenu={(event) => onContextMenu(event, node.id)}
        onAnimationEnd={() => onAppearEnd(node.id)}
      >
        {topicImageElement}
        {stickerElements}
        {calloutElement}
        <span className="mindmap-node__title" style={titleStyle}>
          {numberText ? <span className="mindmap-node__number">{numberText}</span> : null}
          {node.topic.text}
        </span>
        {isActive ? (
          // XMind 的选中态：节点上是**细边框**，四角各一个小方块手柄。
          // 手柄只是视觉提示，不参与命中（pointer-events: none），否则点角上会变成点手柄。
          <>
            <span className="mindmap-node__handle mindmap-node__handle--nw" aria-hidden="true" />
            <span className="mindmap-node__handle mindmap-node__handle--ne" aria-hidden="true" />
            <span className="mindmap-node__handle mindmap-node__handle--sw" aria-hidden="true" />
            <span className="mindmap-node__handle mindmap-node__handle--se" aria-hidden="true" />
          </>
        ) : null}
        {task ? (
          <span
            className="mindmap-node__task"
            aria-label={`任务状态：${task.status}${task.priority ? `，优先级 ${task.priority}` : ''}`}
          >
            <TaskStatusIcon status={task.status} priority={task.priority} />
          </span>
        ) : null}
        {hasMeta ? (
          <span className="mindmap-node__meta">
            {markers?.map((m) => (
              <span className="mindmap-node__marker" key={m.id} title={m.label ?? m.id}>
                <MarkerIcon marker={m} />
              </span>
            ))}
            {notesText ? (
              <span
                className="mindmap-node__note-indicator"
                title={notesText.length > 200 ? `${notesText.slice(0, 200)}…` : notesText}
                aria-label={`备注：${notesText.slice(0, 50)}${notesText.length > 50 ? '…' : ''}`}
              >
                <NoteGlyph />
              </span>
            ) : null}
            {attachmentInfo ? (
              <span
                className="mindmap-node__attachment-indicator"
                title={`附件：${displayAttachmentName(attachmentInfo.name)}`}
                aria-label={`附件：${displayAttachmentName(attachmentInfo.name)}`}
              >
                <AttachmentGlyph />
              </span>
            ) : null}
            {linkInfo ? (
              <a
                className="mindmap-node__link-indicator"
                href={linkInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                title={linkInfo.title || linkInfo.url}
                aria-label={`打开链接：${linkInfo.title || linkInfo.url}`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (onOpenLink) {
                    event.preventDefault()
                    onOpenLink(linkInfo.url)
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <LinkGlyph />
              </a>
            ) : null}
          </span>
        ) : null}
        {labelList ? (
          <span className="mindmap-node__labels">
            {labelList.slice(0, 3).map((label, i) => (
              <span key={`${i}-${label}`} className="mindmap-node__label">
                {label}
              </span>
            ))}
            {labelList.length > 3 ? (
              <span className="mindmap-node__label mindmap-node__label--more">+{labelList.length - 3}</span>
            ) : null}
          </span>
        ) : null}
      </button>
      {node.topic.children.length > 0 ? (
        <button
          className="mindmap-node__toggle"
          type="button"
          style={toggleStyle}
          aria-label={node.topic.collapsed ? '展开主题' : '折叠主题'}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            void onToggleCollapsed(node.id)
          }}
        >
          {node.topic.collapsed ? '+' : '-'}
        </button>
      ) : null}
    </>
  )
}

function renderContent(props: CanvasHostProps) {
  const { session } = props

  if (session.status === 'loading' || session.status === 'idle') {
    return (
      <div className="canvas-skeleton" role="status" aria-label="正在加载文档">
        <div className="canvas-skeleton__bar" />
        <div className="canvas-skeleton__bar canvas-skeleton__bar--short" />
        <div className="canvas-skeleton__surface" />
      </div>
    )
  }

  if (session.status === 'error' || !session.document || !session.summary) {
    return (
      <div className="canvas-empty">
        <p>当前文档未能成功加载。</p>
        <button
          className="toolbar__button toolbar__button--primary"
          type="button"
          onClick={() => void session.createNewDocument()}
        >
          重试创建文档
        </button>
      </div>
    )
  }

  return <TreeWorkspace {...props} />
}

function TreeWorkspace({
  session,
  selectedTopicIds: controlledSelectedTopicIds,
  onSelectedTopicIdsChange: controlledOnSelectedTopicIdsChange,
  onNotify,
  searchOpen: controlledSearchOpen,
  onSearchOpenChange: controlledOnSearchOpenChange,
  searchQuery: controlledSearchQuery,
  onSearchQueryChange: controlledOnSearchQueryChange,
  replaceQuery: controlledReplaceQuery,
  onReplaceQueryChange: controlledOnReplaceQueryChange,
  activeSearchIndex: controlledActiveSearchIndex,
  onActiveSearchIndexChange: controlledOnActiveSearchIndexChange,
  searchResults: controlledSearchResults,
  onCameraChange,
  zoomRequest,
  canvasCommand,
  focusTopicId,
  onFocusTopicIdChange,
}: CanvasHostProps) {
  const {
    activeTopicId,
    createChildTopic,
    createSiblingTopic,
    createParentTopic,
    createFloatingTopic,
    deleteTopic,
    deleteTopics,
    moveTopic,
    moveTopicFreely,
    moveTopicInParent,
    pasteTopics,
    redo,
    renameTopic,
    selectSheet,
    selectTopic,
    setTopicStyleOverrides,
    setTopicStyleRef,
    toggleTopicCollapsed,
    undo,
  } = session
  const activeSheet = getActiveSheet(session.document!)
  const rootTopic = activeSheet.rootTopic
  const floatingTopics = activeSheet.floatingTopics ?? EMPTY_FLOATING_TOPICS
  // 文档级画布设置。必须 useMemo：进 MindMapScene 的 effect 依赖数组，
  // 每次渲染新建对象会让场景反复重建。
  const canvasSettings = useMemo(
    () => resolveCanvasSettings(session.document!.settings),
    [session.document!.settings],
  )
  /**
   * 「仅显示该分支」的可见主题集；`null` = 不聚焦。
   *
   * 在这里算一次而不是在 MindMapScene 里算：布局裁剪、⌘A 的可选范围、装饰元素过滤
   * 三处用的是同一个集合，算三遍会各遍历一遍整棵树。
   */
  const focusVisibleTopicIds = useMemo(
    () => resolveFocusVisibleTopicIds(rootTopic, focusTopicId),
    [rootTopic, focusTopicId],
  )
  /**
   * ⌘A 的可选范围 = 可见主题 ∩ 聚焦可见集。
   *
   * 少了这一层交集，聚焦时按 ⌘A 会把**隐藏分支也选进来**——屏幕上只看到一条分支，
   * 接一个 Delete 却删掉了整幅图。聚焦模式下"看得见的"与"选得到的"必须一致。
   */
  const selectableTopicIds = useMemo(() => {
    const visible = collectVisibleTopicIds(rootTopic)
    return focusVisibleTopicIds
      ? visible.filter((topicId) => focusVisibleTopicIds.has(topicId))
      : visible
  }, [rootTopic, focusVisibleTopicIds])
  const [localSelectedTopicIds, setLocalSelectedTopicIds] = useState<string[]>(() =>
    activeTopicId ? [activeTopicId] : [rootTopic.id],
  )
  const selectedTopicIds = controlledSelectedTopicIds ?? localSelectedTopicIds
  const setSelectedTopicIds = controlledOnSelectedTopicIdsChange ?? setLocalSelectedTopicIds
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [clipboardTopics, setClipboardTopics] = useState<TopicSnapshot[]>([])
  // 搜索框开关：受控（WorkspaceScreen 持有，工具栏按钮可触发）或非受控二选一
  const [localSearchOpen, setLocalSearchOpen] = useState(false)
  const searchOpen = controlledSearchOpen ?? localSearchOpen
  const setSearchOpen = useCallback(
    (open: boolean) => {
      if (controlledOnSearchOpenChange) {
        controlledOnSearchOpenChange(open)
      } else {
        setLocalSearchOpen(open)
      }
    },
    [controlledOnSearchOpenChange],
  )
  // 查找状态：受控（WorkspaceScreen 持有，与左栏「主题」Tab 共享）或非受控二选一。
  // 受控时画布与左栏是同一份查询，画布高亮与左栏命中列表必然一致。
  const [localSearchQuery, setLocalSearchQuery] = useState('')
  const searchQuery = controlledSearchQuery ?? localSearchQuery
  const setSearchQuery = useCallback(
    (next: string) => {
      if (controlledOnSearchQueryChange) {
        controlledOnSearchQueryChange(next)
        return
      }
      setLocalSearchQuery(next)
    },
    [controlledOnSearchQueryChange],
  )
  const [localActiveSearchIndex, setLocalActiveSearchIndex] = useState(0)
  const activeSearchIndex = controlledActiveSearchIndex ?? localActiveSearchIndex
  const setActiveSearchIndex = useCallback(
    (next: SetStateAction<number>) => {
      if (controlledOnActiveSearchIndexChange) {
        controlledOnActiveSearchIndexChange(next)
        return
      }
      setLocalActiveSearchIndex(next)
    },
    [controlledOnActiveSearchIndexChange],
  )
  const [localReplaceQuery, setLocalReplaceQuery] = useState('')
  const replaceQuery = controlledReplaceQuery ?? localReplaceQuery
  const setReplaceQuery = useCallback(
    (next: string) => {
      if (controlledOnReplaceQueryChange) {
        controlledOnReplaceQueryChange(next)
        return
      }
      setLocalReplaceQuery(next)
    },
    [controlledOnReplaceQueryChange],
  )
  const [historyFocusTopicId, setHistoryFocusTopicId] = useState<string | null>(null)
  // Cmd+R 聚焦根主题的请求 nonce：变化时触发 MindMapScene 相机动画。0 = 初始无请求。
  const [focusRootNonce, setFocusRootNonce] = useState(0)
  // 菜单缩放命令的 nonce 请求（转发给 MindMapScene，由它在相机内部执行）
  const [zoomCommand, setZoomCommand] = useState<{ command: ZoomCommand; nonce: number } | null>(
    null,
  )
  const historyFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetCameraMapRef = useRef<Record<string, CameraState>>({})
  /**
   * 必须保持引用稳定：MindMapScene 的相机上报 effect 把 onCameraChange 放进依赖数组，
   * 内联箭头会导致「上报 → 外层 setState → 重渲染 → 新箭头 → effect 重跑」无限循环
   * （camera 对象引用未变，但 React 在 effect 刷新期走不到相同值提前退出的快路径）。
   */
  const handleCameraChange = useCallback(
    (camera: CameraState) => {
      sheetCameraMapRef.current[activeSheet.id] = camera
      onCameraChange?.(camera)
    },
    [activeSheet.id, onCameraChange],
  )
  const deletableTopicIds = useMemo(
    () => getDeletableTopicIds(selectedTopicIds, rootTopic.id),
    [rootTopic.id, selectedTopicIds],
  )
  const copyableTopics = useMemo(
    () => collectClipboardTopics(rootTopic, selectedTopicIds),
    [rootTopic, selectedTopicIds],
  )
  const canUseSystemClipboardPaste =
    typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function'
  // 右键菜单：复制/粘贴可用性（本地剪贴板或系统剪贴板任一可用即可粘贴）
  const canCopy = copyableTopics.length > 0
  const canPaste = clipboardTopics.length > 0 || canUseSystemClipboardPaste
  const searchEntries = useMemo(
    () => buildDocumentTopicSearchIndex(session.document!),
    [session.document],
  )
  const localSearchResults = useMemo(
    () => searchTopics(searchEntries, searchQuery),
    [searchEntries, searchQuery],
  )
  const searchResults = controlledSearchResults ?? localSearchResults
  const matchedSearchTopicIds = useMemo(
    () => new Set(searchResults.map((result) => result.topicId)),
    [searchResults],
  )
  const activeSearchResult =
    searchResults.length > 0 ? searchResults[Math.min(activeSearchIndex, searchResults.length - 1)] : null

  useEffect(() => {
    setSelectedTopicIds((currentSelected) =>
      syncSelectionWithActiveTopic(currentSelected, activeTopicId ?? rootTopic.id),
    )
  }, [activeTopicId, rootTopic.id])

  useEffect(() => {
    if (!editingTopicId) {
      return
    }

    if (!findTopicById(rootTopic, editingTopicId)) {
      setEditingTopicId(null)
      setEditingText('')
    }
  }, [editingTopicId, rootTopic])

  useEffect(() => {
    if (searchResults.length === 0) {
      setActiveSearchIndex(0)
      return
    }

    setActiveSearchIndex((currentIndex) => Math.min(currentIndex, searchResults.length - 1))
  }, [searchResults.length])

  useEffect(() => {
    if (!searchOpen || !activeSearchResult) {
      return
    }

    let cancelled = false
    const searchTarget = activeSearchResult

    async function revealAndSelectSearchResult() {
      if (searchTarget.sheetId && searchTarget.sheetId !== activeSheet.id) {
        await selectSheet(searchTarget.sheetId)
        return
      }

      const ancestorTopicIds = findAncestorTopicIds(rootTopic, searchTarget.topicId) ?? []

      for (const ancestorTopicId of ancestorTopicIds) {
        const ancestorTopic = findTopicById(rootTopic, ancestorTopicId)

        if (ancestorTopic?.collapsed) {
          await toggleTopicCollapsed(ancestorTopicId)
        }
      }

      if (cancelled) {
        return
      }

      setSelectedTopicIds([searchTarget.topicId])

      if (activeTopicId !== searchTarget.topicId) {
        await selectTopic(searchTarget.topicId)
      }
    }

    void revealAndSelectSearchResult()

    return () => {
      cancelled = true
    }
  }, [
    activeSearchResult,
    activeTopicId,
    activeSheet.id,
    rootTopic,
    searchOpen,
    selectSheet,
    selectTopic,
    toggleTopicCollapsed,
  ])

  useEffect(
    () => () => {
      if (historyFocusTimeoutRef.current) {
        clearTimeout(historyFocusTimeoutRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (
      !activeTopicId ||
      (!session.recentAction.startsWith('已撤销 ') && !session.recentAction.startsWith('已重做 '))
    ) {
      return
    }

    if (historyFocusTimeoutRef.current) {
      clearTimeout(historyFocusTimeoutRef.current)
    }

    setHistoryFocusTopicId(activeTopicId)
    historyFocusTimeoutRef.current = setTimeout(() => {
      historyFocusTimeoutRef.current = null
      setHistoryFocusTopicId(null)
    }, HISTORY_FOCUS_HIGHLIGHT_MS)
  }, [activeTopicId, session.recentAction])

  const startInlineEditing = useCallback(
    (topicId: string) => {
      const topic = findTopicById(rootTopic, topicId)

      if (!topic) {
        return
      }

      setSelectedTopicIds([topicId])

      if (activeTopicId !== topicId) {
        void selectTopic(topicId)
      }

      setEditingTopicId(topicId)
      setEditingText(topic.text)
    },
    [activeTopicId, rootTopic, selectTopic],
  )

  const cancelInlineEditing = useCallback(() => {
    setEditingTopicId(null)
    setEditingText('')
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setActiveSearchIndex(0)
    // setSearchQuery / setActiveSearchIndex 是稳定包装（受控时也是外层 setState），
    // 列入依赖只为满足 lint：它们不会导致本回调重建
  }, [setSearchOpen, setSearchQuery, setActiveSearchIndex])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
  }, [setSearchOpen])

  const goToSearchResult = useCallback(
    (index: number) => {
      if (searchResults.length === 0) {
        return
      }

      const normalizedIndex = ((index % searchResults.length) + searchResults.length) % searchResults.length

      setActiveSearchIndex(normalizedIndex)
    },
    [searchResults.length, setActiveSearchIndex],
  )

  const goToNextSearchResult = useCallback(() => {
    if (searchResults.length === 0) {
      return
    }

    goToSearchResult(activeSearchIndex + 1)
  }, [activeSearchIndex, goToSearchResult, searchResults.length])

  const goToPreviousSearchResult = useCallback(() => {
    if (searchResults.length === 0) {
      return
    }

    goToSearchResult(activeSearchIndex - 1)
  }, [activeSearchIndex, goToSearchResult, searchResults.length])

  const commitInlineEditing = useCallback(async () => {
    if (!editingTopicId) {
      return
    }

    const topic = findTopicById(rootTopic, editingTopicId)

    if (!topic) {
      setEditingTopicId(null)
      setEditingText('')
      return
    }

    const nextText = editingText.trim()

    if (!nextText) {
      setEditingText(topic.text)
      return
    }

    if (nextText === topic.text) {
      setEditingTopicId(null)
      return
    }

    await renameTopic(editingTopicId, nextText)
    setEditingTopicId(null)
  }, [editingText, editingTopicId, renameTopic, rootTopic])

  const handleCopyTopics = useCallback(async () => {
    if (copyableTopics.length === 0) {
      return
    }

    setClipboardTopics(copyableTopics)

    const writeResult = await writeTopicsToSystemClipboard(copyableTopics)

    if (writeResult !== 'success') {
      onNotify?.(formatClipboardWriteHint(writeResult))
    }
  }, [copyableTopics, onNotify])

  const handlePasteTopics = useCallback(async () => {
    const systemClipboardResult = await readTopicsFromSystemClipboard()

    if (systemClipboardResult.status === 'success') {
      const topicsToPaste = systemClipboardResult.topics

      setClipboardTopics(topicsToPaste)
      await pasteTopics(topicsToPaste, activeTopicId ?? rootTopic.id)
      return
    }

    const topicsToPaste = clipboardTopics

    if (topicsToPaste.length === 0) {
      onNotify?.(formatClipboardReadHint(systemClipboardResult, false))
      return
    }

    onNotify?.(formatClipboardReadHint(systemClipboardResult, true))
    await pasteTopics(topicsToPaste, activeTopicId ?? rootTopic.id)
  }, [activeTopicId, clipboardTopics, onNotify, pasteTopics, rootTopic.id])

  /**
   * 打开主题上的超链接：优先 window.open（浏览器/Tauri webview 均可用）；
   * 被阻止时回退到剪贴板复制并提示用户。
   */
  const handleOpenLink = useCallback(
    (url: string) => {
      if (!url) return
      try {
        const win = window.open(url, '_blank', 'noopener,noreferrer')
        if (!win) {
          throw new Error('popup blocked')
        }
      } catch {
        void navigator.clipboard?.writeText(url).then(
          () => onNotify?.(`链接已复制：${url}`),
          () => onNotify?.(`无法打开链接，请手动复制：${url}`),
        )
      }
    },
    [onNotify],
  )

  /**
   * 剪切：复制选中主题到剪贴板后删除，撤销标签"剪切主题"。
   * 根主题不可剪切（copyableTopics 已过滤）；走 deleteTopics 以携带自定义 actionLabel。
   */
  const handleCutTopics = useCallback(async () => {
    if (copyableTopics.length === 0 || deletableTopicIds.length === 0) {
      return
    }
    setClipboardTopics(copyableTopics)
    await writeTopicsToSystemClipboard(copyableTopics)
    await deleteTopics(deletableTopicIds, '剪切主题')
  }, [copyableTopics, deletableTopicIds, deleteTopics])

  // 外部命令请求（原生菜单栏的复制/剪切/粘贴、样式剪贴板、缩放、回到中心）。
  //
  // 处理器闭包了选区与剪贴板状态，每次渲染都是新引用；若把它们放进依赖数组，
  // 下一次任何无关的状态变化都会让 effect 重跑、命令被重复执行。
  // 故用 ref 承载最新处理器，effect 只依赖 nonce。
  //
  // 这些处理器定义在下方（复制主题、样式剪贴板等），故初始对象里用空函数占位：
  // 挂载后的 effect 会在每次渲染末尾把它们替换成真实实现。
  const canvasCommandHandlersRef = useRef<Record<string, () => void>>({})

  useEffect(() => {
    // 样式命令的作用目标与 Alt+Cmd+C/V 快捷键一致：选中主题 → 活动主题 → 根主题
    const styleTopicId = selectedTopicIds[0] ?? activeTopicId ?? rootTopic.id
    canvasCommandHandlersRef.current = {
      copy: () => void handleCopyTopics(),
      cut: () => void handleCutTopics(),
      paste: () => void handlePasteTopics(),
      duplicate: () => void handleDuplicateTopic(),
      copyStyle: () => handleCopyStyle(styleTopicId),
      pasteStyle: () => void handlePasteStyle(styleTopicId),
      goToCenter: () => setFocusRootNonce((n) => n + 1),
    }
  })

  const canvasCommandNonce = canvasCommand?.nonce ?? 0
  const canvasCommandName = canvasCommand?.command ?? null

  useEffect(() => {
    if (canvasCommandNonce === 0 || !canvasCommandName) {
      return
    }

    // 命令名 → ref 里的处理器键，与 menu-actions.ts 的 CanvasCommand 一一对应
    const HANDLER_BY_COMMAND: Partial<Record<string, string>> = {
      'edit.copy': 'copy',
      'edit.cut': 'cut',
      'edit.paste': 'paste',
      'edit.duplicate': 'duplicate',
      'edit.copy-style': 'copyStyle',
      'edit.paste-style': 'pasteStyle',
      'edit.go-to-center': 'goToCenter',
    }

    const handlerKey = HANDLER_BY_COMMAND[canvasCommandName]
    if (handlerKey) {
      canvasCommandHandlersRef.current[handlerKey]?.()
      return
    }

    // 缩放不在这里执行：相机状态在 MindMapScene 内部，外层拿得到的是上一帧快照。
    // 故转成 nonce 请求下传，由 MindMapScene 基于当前相机执行。
    const zoomCommand = ZOOM_COMMAND_BY_MENU_ACTION[canvasCommandName]
    if (zoomCommand) {
      setZoomCommand((current) => ({ command: zoomCommand, nonce: (current?.nonce ?? 0) + 1 }))
    }
  }, [canvasCommandNonce, canvasCommandName])

  /**
   * 复制主题（Cmd+D）：复制为同级紧随，撤销标签"复制主题"。
   * 实现复用粘贴管道：拷贝当前主题 → 作为父主题的子节点粘贴（即原主题的同级）。
   */
  const handleDuplicateTopic = useCallback(async () => {
    if (copyableTopics.length === 0) {
      return
    }
    const parentId =
      activeTopicId && activeTopicId !== rootTopic.id
        ? (findParentTopicByChildId(rootTopic, activeTopicId)?.parent.id ?? rootTopic.id)
        : rootTopic.id
    setClipboardTopics(copyableTopics)
    await pasteTopics(copyableTopics, parentId)
  }, [copyableTopics, activeTopicId, rootTopic, pasteTopics])

  /**
   * 会话内样式剪贴板：Alt+Cmd+C 复制、Alt+Cmd+V 粘贴节点样式（styleRef + styleOverrides）。
   * 仅存于内存，不写入系统剪贴板；粘贴时复用 setTopicStyleRef/Overrides 的历史栈，支持撤销。
   */
  const styleClipboardRef = useRef<{
    styleRef: string | null
    styleOverrides: TopicStyleOverrides | null
  } | null>(null)

  const handleCopyStyle = useCallback(
    (topicId: string) => {
      const topic = findTopicById(rootTopic, topicId)
      if (!topic) return
      styleClipboardRef.current = {
        styleRef: topic.styleRef ?? null,
        styleOverrides: topic.styleOverrides ?? null,
      }
      onNotify?.('已复制节点样式')
    },
    [rootTopic, onNotify],
  )

  const handlePasteStyle = useCallback(
    async (topicId: string) => {
      const snapshot = styleClipboardRef.current
      if (!snapshot) {
        onNotify?.('无可粘贴的样式（先按 Alt+Cmd+C 复制）')
        return
      }
      const target = findTopicById(rootTopic, topicId)
      if (!target) return
      // 仅在值变化时提交，避免 noop 入历史栈；styleRef 与 overrides 分两次提交（两次撤销）
      if ((target.styleRef ?? null) !== snapshot.styleRef) {
        await setTopicStyleRef(topicId, snapshot.styleRef)
      }
      if (
        JSON.stringify(target.styleOverrides ?? null) !==
        JSON.stringify(snapshot.styleOverrides)
      ) {
        await setTopicStyleOverrides(topicId, snapshot.styleOverrides)
      }
      onNotify?.('已粘贴节点样式')
    },
    [rootTopic, setTopicStyleRef, setTopicStyleOverrides, onNotify],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (isTypingTarget) {
        return
      }

      const isModifierPressed = event.metaKey || event.ctrlKey

      // Alt+Cmd+C / Alt+Cmd+V：复制/粘贴节点样式（会话内 styleRef+overrides 快照）
      // 须在普通 Cmd+C/V 之前判断，否则 Alt 组合会被前者吞掉。
      if (isModifierPressed && event.altKey) {
        const styleTopicId = selectedTopicIds[0] ?? activeTopicId ?? rootTopic.id
        const styleKey = event.key.toLowerCase()
        if (styleKey === 'c') {
          event.preventDefault()
          handleCopyStyle(styleTopicId)
          return
        }
        if (styleKey === 'v') {
          event.preventDefault()
          void handlePasteStyle(styleTopicId)
          return
        }
      }

      // ⌥⌘F 是 ZEN 模式（XMind 的双绑定），必须排除 Alt，否则一次按键既进 ZEN 又开搜索
      if (isModifierPressed && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        openSearch()
        return
      }

      if (isModifierPressed && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        void handleCopyTopics()
        return
      }

      if (isModifierPressed && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        void handlePasteTopics()
        return
      }

      // Cmd/Ctrl + X：剪切（复制 + 删除，撤销标签"剪切主题"）
      if (isModifierPressed && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        void handleCutTopics()
        return
      }

      // Cmd/Ctrl + D：复制为主题同级（撤销标签沿用粘贴"复制主题"）
      if (isModifierPressed && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        void handleDuplicateTopic()
        return
      }

      // Cmd/Ctrl + A：全选当前画布可见主题（编辑中由 textarea 自行处理文本全选）
      // 「可见」= 未被折叠隐藏 ∩ 未被聚焦隐藏：聚焦时全选必须只圈住看得见的那些，
      // 否则接着一个 Delete 会删掉屏幕外看不见的整条分支。
      if (isModifierPressed && event.key.toLowerCase() === 'a' && !editingTopicId) {
        event.preventDefault()
        setSelectedTopicIds(selectableTopicIds)
        return
      }

      // Cmd/Ctrl + R：回到中心主题（相机动画聚焦根节点，对齐 XMind）
      if (isModifierPressed && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        setFocusRootNonce((n) => n + 1)
        return
      }

      // ⌘;「仅显示该分支」（与 XMind 同键）。目标解析、中心主题的拒绝、提示文案
      // 都与「查看 → 仅显示该分支」共用同一份实现——两条入口不能各判一套。
      // 退出方向不在此处配键（Esc 由 WorkspaceScreen 统一处理），故没有 shift 分支。
      if (isModifierPressed && event.key === ';') {
        event.preventDefault()
        const selectedTopicId = selectedTopicIds[0] ?? activeTopicId ?? rootTopic.id
        const target = resolveBranchFocusTarget(rootTopic, selectedTopicId)
        if (!target) {
          onNotify?.(FOCUS_BRANCH_UNAVAILABLE_MESSAGE)
          return
        }
        onFocusTopicIdChange?.(target)
        return
      }

      if (editingTopicId) {
        return
      }

      // 优先使用本地选中态（点击即更新，测试与即时反馈一致），
      // 回退到会话 activeTopicId（多选时为最后激活主题），最后回退到根主题。
      const selectedTopicId = selectedTopicIds[0] ?? activeTopicId ?? rootTopic.id

      if (searchOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeSearch()
          return
        }

        if (event.key === 'Enter') {
          event.preventDefault()

          if (event.shiftKey) {
            goToPreviousSearchResult()
          } else {
            goToNextSearchResult()
          }

          return
        }
      }

      // F2：进入内联编辑（XMind/MindNode 标准重命名快捷键）
      if (event.key === 'F2' && !searchOpen) {
        event.preventDefault()
        startInlineEditing(selectedTopicId)
        return
      }

      if (event.key === 'Tab') {
        if (event.shiftKey && selectedTopicId !== rootTopic.id) {
          event.preventDefault()
          const parent = findParentTopicByChildId(rootTopic, selectedTopicId)

          if (parent) {
            void selectTopic(parent.parent.id)
          }
          return
        }

        event.preventDefault()
        void createChildTopic(selectedTopicId)
        return
      }

      // Cmd/Ctrl + Enter：插入父主题（对齐 XMind，把当前主题包裹为新父主题的子主题）
      if (isModifierPressed && event.key === 'Enter') {
        if (selectedTopicId === rootTopic.id) {
          return
        }
        event.preventDefault()
        void createParentTopic(selectedTopicId)
        return
      }

      if (event.key === 'Enter') {
        if (selectedTopicId === rootTopic.id) {
          return
        }

        event.preventDefault()
        // Shift+Enter 前插同级（before）；Enter 默认后插同级（after）
        void createSiblingTopic(selectedTopicId, event.shiftKey ? 'before' : 'after')
        return
      }

      // Space 折叠切换已迁移到 MindMapScene 的 keyup 监听（支持 Space+拖拽平移时不误触折叠）。

      // Cmd/Ctrl + /：折叠/展开切换（XMind 主快捷键，Space 为兼容辅快捷键）
      if (isModifierPressed && event.key === '/') {
        const selectedTopic = findTopicById(rootTopic, selectedTopicId)
        if (!selectedTopic || selectedTopic.children.length === 0) {
          return
        }
        event.preventDefault()
        void toggleTopicCollapsed(selectedTopicId)
        return
      }

      // ⌘] / ⌘[：缩进 / 减少缩进。与编辑菜单的两项**共用同一个目标计算**
      // （lib/document/topic-outline.ts），不是另写一份。
      // 给快捷键是因为这两件事只能从原生菜单触发时：既不好用，也无法自动化验证。
      if (isModifierPressed && !event.altKey && (event.key === ']' || event.key === '[')) {
        if (event.key === ']') {
          const target = resolveIndentTarget(rootTopic, selectedTopicId)
          if (!target) {
            return
          }
          event.preventDefault()
          void moveTopic(selectedTopicId, target.parentId, '缩进')
          return
        }

        const target = resolveOutdentTarget(rootTopic, selectedTopicId)
        if (!target) {
          return
        }
        event.preventDefault()
        void moveTopic(selectedTopicId, target.parentId, '减少缩进', target.index)
        return
      }

      // Alt + ↑/↓：同级内排序（复用 moveTopicInParent，根主题不可排序）
      if (event.altKey && !isModifierPressed && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (selectedTopicId === rootTopic.id) {
          return
        }
        event.preventDefault()
        void moveTopicInParent(selectedTopicId, event.key === 'ArrowUp' ? 'up' : 'down')
        return
      }

      if (event.key === 'Escape' && selectedTopicIds.length > 1) {
        event.preventDefault()
        setSelectedTopicIds([selectedTopicId])
        return
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && deletableTopicIds.length > 0) {
        event.preventDefault()

        if (deletableTopicIds.length === 1) {
          void deleteTopic(deletableTopicIds[0])
        } else {
          void deleteTopics(deletableTopicIds, `删除 ${deletableTopicIds.length} 个主题`)
        }
        return
      }

      if (isModifierPressed && event.key.toLowerCase() === 'z') {
        event.preventDefault()

        if (event.shiftKey) {
          void redo()
        } else {
          void undo()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    activeTopicId,
    createChildTopic,
    createSiblingTopic,
    createParentTopic,
    deleteTopic,
    deleteTopics,
    deletableTopicIds,
    closeSearch,
    editingTopicId,
    goToNextSearchResult,
    goToPreviousSearchResult,
    handleCopyTopics,
    handleCopyStyle,
    handleCutTopics,
    handleDuplicateTopic,
    handlePasteStyle,
    handlePasteTopics,
    moveTopic,
    moveTopicInParent,
    onFocusTopicIdChange,
    onNotify,
    openSearch,
    pasteTopics,
    redo,
    rootTopic,
    searchOpen,
    selectTopic,
    selectableTopicIds,
    selectedTopicIds,
    setFocusRootNonce,
    setSelectedTopicIds,
    startInlineEditing,
    toggleTopicCollapsed,
    undo,
  ])

  return (
    <div className="canvas-stage canvas-stage--editor">
      <div className="editor-grid editor-grid--scene">
        <MindMapScene
          key={activeSheet.id}
          initialCamera={sheetCameraMapRef.current[activeSheet.id] ?? null}
          onCameraChange={handleCameraChange}
          rootTopic={rootTopic}
          chartType={activeSheet.chartType}
          floatingTopics={floatingTopics}
          relationships={session.document!.relationships ?? []}
          boundaries={activeSheet.boundaries ?? []}
          summaries={activeSheet.summaries ?? []}
          illustrations={activeSheet.illustrations ?? []}
          themeId={session.document!.theme?.id}
          branchStyle={activeSheet.branchStyle}
          numbering={activeSheet.numbering}
          layoutDirection={activeSheet.layoutConfig?.direction}
          canvasSettings={canvasSettings}
          focusVisibleTopicIds={focusVisibleTopicIds}
          activeTopicId={activeTopicId}
          selectedTopicIds={selectedTopicIds}
          editingTopicId={editingTopicId}
          editingText={editingText}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          replaceQuery={replaceQuery}
          onReplaceQueryChange={setReplaceQuery}
          onRenameTopicText={renameTopic}
          searchResults={searchResults}
          activeSearchIndex={activeSearchResult ? activeSearchIndex : -1}
          matchedSearchTopicIds={matchedSearchTopicIds}
          activeSearchTopicId={activeSearchResult?.topicId ?? null}
          historyFocusTopicId={historyFocusTopicId}
          focusRootNonce={focusRootNonce}
          zoomRequest={zoomRequest ?? null}
          zoomCommand={zoomCommand}
          onSelectedTopicIdsChange={setSelectedTopicIds}
          onEditingTextChange={setEditingText}
          onStartEditingTopic={startInlineEditing}
          onCommitEditingTopic={commitInlineEditing}
          onCancelEditingTopic={cancelInlineEditing}
          onSearchQueryChange={(nextQuery) => {
            setSearchQuery(nextQuery)
            setActiveSearchIndex(0)
          }}
          onActivateSearchResult={goToSearchResult}
          onSearchNext={goToNextSearchResult}
          onSearchPrevious={goToPreviousSearchResult}
          onCloseSearch={closeSearch}
          onToggleTopicCollapsed={toggleTopicCollapsed}
          onSelect={(topicId) => void selectTopic(topicId)}
          onMoveTopic={(topicId, targetParentId) => moveTopic(topicId, targetParentId)}
          onCalloutMove={(topicId, offsetX, offsetY) => {
            // 与贴纸同一套规则：拖动结束才提交，一次拖动 = 一条撤销记录
            const topic =
              findTopicById(activeSheet.rootTopic, topicId) ??
              floatingTopics.find((candidate) => candidate.id === topicId)
            if (!topic?.callout) {
              return
            }
            void session.setTopicCallout(topicId, { ...topic.callout, offsetX, offsetY })
          }}
          onIllustrationMove={(illustrationId, x, y) => {
            // 画布级插画是**整表替换**：改一张也整批提交（与贴纸同一条通道）
            const next = (activeSheet.illustrations ?? []).map((item) =>
              item.id === illustrationId ? { ...item, x, y } : item,
            )
            void session.setSheetIllustrations(activeSheet.id, next)
          }}
          onStickerMove={(topicId, stickerId, offsetX, offsetY) => {
          // 贴纸是**列表型富字段**：改一张也要整批提交（一次拖动 = 一条撤销记录）。
          // 主题可能在树里，也可能是浮动主题，两处都要找。
          const topic =
            findTopicById(activeSheet.rootTopic, topicId) ??
            floatingTopics.find((candidate) => candidate.id === topicId)
          if (!topic) {
            return
          }
          const nextStickers = (topic.stickers ?? []).map((sticker) =>
            sticker.id === stickerId ? { ...sticker, offsetX, offsetY } : sticker,
          )
          void session.setTopicStickers(topicId, nextStickers)
        }}
        onPlaceTopicFreely={(topicId, offsetX, offsetY) =>
            moveTopicFreely(topicId, offsetX, offsetY)
          }
          onCreateChildTopic={(parentId) => createChildTopic(parentId)}
          onCreateSiblingTopic={(topicId) => createSiblingTopic(topicId)}
          onDeleteTopics={(topicIds) => deleteTopics(topicIds, `删除 ${topicIds.length} 个主题`)}
          onCopyTopics={handleCopyTopics}
          onPasteTopics={handlePasteTopics}
          canCopy={canCopy}
          canPaste={canPaste}
          onOpenLink={handleOpenLink}
          onCreateFloatingTopic={createFloatingTopic}
        />
      </div>
    </div>
  )
}

export function CanvasHost({
  session,
  selectedTopicIds,
  onSelectedTopicIdsChange,
  onNotify,
  searchOpen,
  onSearchOpenChange,
  searchQuery,
  onSearchQueryChange,
  replaceQuery,
  onReplaceQueryChange,
  activeSearchIndex,
  onActiveSearchIndexChange,
  searchResults,
  showGrid = false,
  onCameraChange,
  zoomRequest,
  canvasCommand,
  focusTopicId,
  onFocusTopicIdChange,
}: CanvasHostProps) {
  // 画布背景：主题背景色 + 画布级覆盖，与 PNG/SVG 导出同源。
  // 屏幕过去用的是 UI 令牌，切到暗色主题后「屏幕浅、导出深」，此处统一。
  const canvasBackground = resolveThemeBackground(
    session.document?.theme?.id,
    resolveCanvasSettings(session.document?.settings).background,
  ).background
  return (
    <main
      className={`canvas-host${showGrid ? ' canvas-host--grid-on' : ''}`}
      aria-label="画布区域"
      style={{ background: canvasBackground }}
    >
      <div className="canvas-host__texture" />
      {renderContent({
        session,
        selectedTopicIds,
        onSelectedTopicIdsChange,
        onNotify,
        searchOpen,
        onSearchOpenChange,
        searchQuery,
        onSearchQueryChange,
        replaceQuery,
        onReplaceQueryChange,
        activeSearchIndex,
        onActiveSearchIndexChange,
        searchResults,
        onCameraChange,
        zoomRequest,
        canvasCommand,
        focusTopicId,
        onFocusTopicIdChange,
      })}
    </main>
  )
}
