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
import { getActiveSheet } from '../../lib/document/sheets'
import type {
  Boundary,
  ChartType,
  Relationship,
  SheetBranchStyle,
  SummaryNode,
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
import { computeLayout } from './layouts'
import { renderScene } from './runtime/canvas-renderer'
import { resolveTopicStyle } from './runtime/style-resolver'
import { buildScene, type TopicVisualStates } from './runtime/scene-builder'
import { pickTopicImageUrl, useTopicImageUrls } from './runtime/topic-image-store'
import { collectClipboardTopics } from './topic-clipboard'
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
}

const HISTORY_FOCUS_HIGHLIGHT_MS = 1600

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
  activeTopicId,
  selectedTopicIds,
  editingTopicId,
  editingText,
  searchOpen,
  searchQuery,
  searchResults,
  activeSearchIndex,
  matchedSearchTopicIds,
  activeSearchTopicId,
  historyFocusTopicId,
  focusRootNonce,
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
  activeTopicId: string | null
  selectedTopicIds: string[]
  editingTopicId: string | null
  editingText: string
  searchOpen: boolean
  searchQuery: string
  searchResults: TopicSearchEntry[]
  activeSearchIndex: number
  matchedSearchTopicIds: Set<string>
  activeSearchTopicId: string | null
  historyFocusTopicId: string | null
  /** 聚焦根主题的请求 nonce：变化时触发相机动画居中根主题（Cmd+R）。0 表示初始无请求。 */
  focusRootNonce: number
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
  const layout = useMemo(
    () => computeLayout(rootTopic, chartType, floatingTopics),
    [rootTopic, chartType, floatingTopics],
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
  const [replaceQuery, setReplaceQuery] = useState('')
  // 小地图显隐：默认开，localStorage 持久化（对齐 XMind Navigator 开关）
  const [minimapVisible, setMinimapVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try {
      const stored = window.localStorage.getItem('mindgrid:minimap-visible')
      return stored === null ? true : stored === '1'
    } catch {
      return true
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
  // 批次 27：查找替换——按字面量替换（split/join，避免正则转义问题），复用 rename 管道可撤销
  const handleReplaceCurrent = useCallback(async () => {
    const result = searchResults[activeSearchIndex]
    if (!result || !searchQuery) return
    const nextText = searchQuery ? result.text.split(searchQuery).join(replaceQuery) : result.text
    if (nextText !== result.text) {
      await onRenameTopicText(result.topicId, nextText)
    }
  }, [searchResults, activeSearchIndex, searchQuery, replaceQuery, onRenameTopicText])

  const handleReplaceAll = useCallback(async () => {
    if (!searchQuery) return
    const seen = new Set<string>()
    for (const result of searchResults) {
      if (seen.has(result.topicId)) continue
      seen.add(result.topicId)
      const nextText = result.text.split(searchQuery).join(replaceQuery)
      if (nextText !== result.text) {
        await onRenameTopicText(result.topicId, nextText)
      }
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
  const scene = useMemo(
    () =>
      buildScene({
        layout,
        viewport: viewportSize,
        camera,
        visualStates,
        overlays: { selectionBox: null, dragPreview: null, dropIndicator: null },
        relationships,
        boundaries,
        summaries,
        themeId,
        branchStyle,
        enableCulling: viewportSize.width > 0 && viewportSize.height > 0,
      }),
    [layout, camera, visualStates, viewportSize, relationships, boundaries, summaries, themeId, branchStyle],
  )

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
    })
  }, [scene, camera, viewportSize, themeId])

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

      if (interaction.kind === 'drag' && dragPreview?.dropTargetId) {
        suppressClickRef.current = true
        await onMoveTopic(dragPreview.topicId, dragPreview.dropTargetId)
      }

      interactionRef.current = null
      setSelectionBox(null)
      setDragPreview(null)

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    [
      camera,
      dragPreview,
      layout.nodes,
      layout.offsetX,
      layout.offsetY,
      onMoveTopic,
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

      const isModifierPressed = event.metaKey || event.ctrlKey

      // 缩放快捷键（XMind 标配：Cmd/Ctrl + -/=/0/1）
      if (isModifierPressed) {
        if (event.key === '=' || event.key === '+') {
          event.preventDefault()
          setZoomFromViewportCenter(cameraRef.current.zoom * 1.15)
          return
        }
        if (event.key === '-') {
          event.preventDefault()
          setZoomFromViewportCenter(cameraRef.current.zoom / 1.15)
          return
        }
        if (event.key === '0') {
          event.preventDefault()
          fitToView()
          return
        }
        if (event.key === '1') {
          event.preventDefault()
          setZoomFromViewportCenter(1)
          return
        }
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

      const rect = viewportRef.current.getBoundingClientRect()
      const worldX = (event.clientX - rect.left - cameraRef.current.x) / cameraRef.current.zoom
      const worldY = (event.clientY - rect.top - cameraRef.current.y) / cameraRef.current.zoom
      // 转换为根主题相对坐标（与布局坐标系一致）
      const rootX = worldX - layout.offsetX
      const rootY = worldY - layout.offsetY

      void onCreateFloatingTopic('新建浮动主题', rootX, rootY)
    },
    [editingTopicId, searchOpen, onCreateFloatingTopic, layout.offsetX, layout.offsetY],
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
          {minimapVisible ? '🗺' : '🗺 off'}
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
              onChange={(event) => setReplaceQuery(event.target.value)}
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
              offsetX={layout.offsetX}
              offsetY={layout.offsetY}
              themeId={themeId}
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
  themeId,
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
}: {
  node: MindMapNodeLayout
  offsetX: number
  offsetY: number
  themeId: string | undefined
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
}) {
  const left = node.x - node.width / 2 + offsetX
  const top = node.y - node.height / 2 + offsetY
  const inlineEditShouldSkipBlurCommitRef = useRef(false)
  // 解析主题 + 节点覆盖 → 具体颜色与排印，作为内联样式覆盖 CSS 默认配色。
  // 使用 background 简写而非 backgroundColor，以清除 CSS 中的渐变背景。
  const resolvedStyle = resolveTopicStyle(themeId, node.depth, node.side, node.topic.styleOverrides)
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
        }),
    ...(shapeRadius != null ? { borderRadius: `${shapeRadius}px` } : {}),
    transform: dragOffset ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined,
  }
  // 标题排印：字号 / 字重来自解析样式（深度默认 + 节点覆盖），内联覆盖 CSS 深度分级
  const titleStyle: CSSProperties = {
    fontSize: resolvedStyle.fontSize,
    fontWeight: resolvedStyle.fontWeight,
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

  if (isEditing) {
    return (
      <>
        <div
          className={`mindmap-node mindmap-node--${node.side}${isActive ? ' mindmap-node--active' : ''}${isSelected ? ' mindmap-node--selected' : ''}${isSearchMatch ? ' mindmap-node--search-match' : ''}${isActiveSearchResult ? ' mindmap-node--search-active' : ''}${isHistoryFocus ? ' mindmap-node--history-focus' : ''} mindmap-node--editing`}
          style={baseStyle}
        >
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
  const hasMeta = !!(markers || notesText || linkInfo)

  return (
    <>
      <button
        className={`mindmap-node mindmap-node--${node.side} mindmap-node--depth-${Math.min(node.depth, 3)}${isActive ? ' mindmap-node--active' : ''}${isSelected ? ' mindmap-node--selected' : ''}${isSearchMatch ? ' mindmap-node--search-match' : ''}${isActiveSearchResult ? ' mindmap-node--search-active' : ''}${isHistoryFocus ? ' mindmap-node--history-focus' : ''}${isDropTarget ? ' mindmap-node--drop-target' : ''}${dragOffset ? ' mindmap-node--dragging' : ''}${isAppearing ? ' mindmap-node--appear' : ''}`}
        style={baseStyle}
        type="button"
        data-topic-id={node.id}
        onClick={(event) => onClick(event, node.id)}
        onDoubleClick={() => onDoubleClick(node.id)}
        onPointerDown={(event) => onPointerDown(event, node.id)}
        onContextMenu={(event) => onContextMenu(event, node.id)}
        onAnimationEnd={() => onAppearEnd(node.id)}
      >
        {imageUrl ? (
          <img
            className="mindmap-node__image"
            src={imageUrl}
            alt={`${node.topic.text} 的主题图片`}
            draggable={false}
          />
        ) : null}
        <span className="mindmap-node__title" style={titleStyle}>{node.topic.text}</span>
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
  const floatingTopics = activeSheet.floatingTopics ?? []
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
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [historyFocusTopicId, setHistoryFocusTopicId] = useState<string | null>(null)
  // Cmd+R 聚焦根主题的请求 nonce：变化时触发 MindMapScene 相机动画。0 = 初始无请求。
  const [focusRootNonce, setFocusRootNonce] = useState(0)
  const historyFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetCameraMapRef = useRef<Record<string, CameraState>>({})
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
  const searchResults = useMemo(
    () => searchTopics(searchEntries, searchQuery),
    [searchEntries, searchQuery],
  )
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
  }, [setSearchOpen])

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
    [searchResults.length],
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

      if (isModifierPressed && event.key.toLowerCase() === 'f') {
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
      if (isModifierPressed && event.key.toLowerCase() === 'a' && !editingTopicId) {
        event.preventDefault()
        setSelectedTopicIds(collectVisibleTopicIds(rootTopic))
        return
      }

      // Cmd/Ctrl + R：回到中心主题（相机动画聚焦根节点，对齐 XMind）
      if (isModifierPressed && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        setFocusRootNonce((n) => n + 1)
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
    moveTopicInParent,
    openSearch,
    pasteTopics,
    redo,
    rootTopic,
    searchOpen,
    selectTopic,
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
          onCameraChange={(camera) => {
            sheetCameraMapRef.current[activeSheet.id] = camera
          }}
          rootTopic={rootTopic}
          chartType={activeSheet.chartType}
          floatingTopics={floatingTopics}
          relationships={session.document!.relationships ?? []}
          boundaries={activeSheet.boundaries ?? []}
          summaries={activeSheet.summaries ?? []}
          themeId={session.document!.theme?.id}
          branchStyle={activeSheet.branchStyle}
          activeTopicId={activeTopicId}
          selectedTopicIds={selectedTopicIds}
          editingTopicId={editingTopicId}
          editingText={editingText}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          onRenameTopicText={renameTopic}
          searchResults={searchResults}
          activeSearchIndex={activeSearchResult ? activeSearchIndex : -1}
          matchedSearchTopicIds={matchedSearchTopicIds}
          activeSearchTopicId={activeSearchResult?.topicId ?? null}
          historyFocusTopicId={historyFocusTopicId}
          focusRootNonce={focusRootNonce}
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
}: CanvasHostProps) {
  return (
    <main className="canvas-host" aria-label="画布区域">
      <div className="canvas-host__texture" />
      {renderContent({
        session,
        selectedTopicIds,
        onSelectedTopicIdsChange,
        onNotify,
        searchOpen,
        onSearchOpenChange,
      })}
    </main>
  )
}
