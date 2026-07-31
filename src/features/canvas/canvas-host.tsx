import {
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
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
import type { Boundary, ChartType, Relationship, SummaryNode, TopicSnapshot } from '../../lib/document/types'
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
import { collectClipboardTopics } from './topic-clipboard'
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
import { TopicTreeNode } from '../workspace/topic-tree'
import { ContextMenu, menuItem, menuSeparator, type ContextMenuItem } from '../workspace/context-menu'

interface CanvasHostProps {
  session: DocumentSession
  selectedTopicIds?: string[]
  // 受控回调接受 SetStateAction，与 workspace 传入的 useState setter 一致，
  // 使画布内部可以用函数式更新读取最新多选状态。
  onSelectedTopicIdsChange?: (topicIds: SetStateAction<string[]>) => void
}

const HISTORY_FOCUS_HIGHLIGHT_MS = 1600

const EDGE_AUTO_PAN_THRESHOLD = 72
const EDGE_AUTO_PAN_MAX_STEP = 18

function formatClipboardLabel(topics: TopicSnapshot[]) {
  if (topics.length === 0) {
    return null
  }

  return topics.length === 1
    ? topics[0].text
    : `${topics[0].text} 等 ${topics.length} 个主题`
}

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
  relationships,
  boundaries,
  summaries,
  themeId,
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
}: {
  initialCamera: CameraState | null
  onCameraChange: (camera: CameraState) => void
  rootTopic: TopicSnapshot
  chartType: ChartType | undefined
  relationships: Relationship[]
  boundaries: Boundary[]
  summaries: SummaryNode[]
  themeId: string | undefined
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
}) {
  const layout = useMemo(() => computeLayout(rootTopic, chartType), [rootTopic, chartType])
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
        enableCulling: viewportSize.width > 0 && viewportSize.height > 0,
      }),
    [layout, camera, visualStates, viewportSize, relationships, boundaries, summaries, themeId],
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

      // 用户开始手动操作，立即取消正在进行的相机缓动动画
      cancelCameraAnimation()

      interactionRef.current = {
        kind: event.shiftKey ? 'box' : 'pan',
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
      }

      if (event.shiftKey) {
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
      </div>

      {viewportSize.width > 0 && viewportSize.height > 0 ? (
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
}) {
  const left = node.x - node.width / 2 + offsetX
  const top = node.y - node.height / 2 + offsetY
  const inlineEditShouldSkipBlurCommitRef = useRef(false)
  // 解析主题 + 节点覆盖 → 具体颜色，作为内联样式覆盖 CSS 默认配色。
  // 使用 background 简写而非 backgroundColor，以清除 CSS 中的渐变背景。
  const resolvedStyle = resolveTopicStyle(themeId, node.depth, node.side, node.topic.styleOverrides)
  const baseStyle = {
    width: `${node.width}px`,
    minHeight: `${node.height}px`,
    left: `${left}px`,
    top: `${top}px`,
    background: resolvedStyle.fill,
    color: resolvedStyle.textColor,
    borderColor: resolvedStyle.borderColor,
    transform: dragOffset ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined,
  }
  const toggleStyle = {
    left: `${left + node.width - 14}px`,
    top: `${top - 8}px`,
  }

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
            autoFocus
            onChange={(event) => onEditingTextChange(event.target.value)}
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

              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                inlineEditShouldSkipBlurCommitRef.current = true
                void onCommitEditingTopic()
              }
            }}
          />
          <span className="mindmap-node__edit-hint">Esc 取消，Cmd/Ctrl + Enter 提交</span>
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
        <span className="mindmap-node__title">{node.topic.text}</span>
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
}: CanvasHostProps) {
  const {
    activeTopicId,
    createChildTopic,
    createSiblingTopic,
    deleteTopic,
    deleteTopics,
    moveTopic,
    pasteTopics,
    redo,
    renameTopic,
    selectSheet,
    selectTopic,
    summary,
    toggleTopicCollapsed,
    undo,
  } = session
  const activeSheet = getActiveSheet(session.document!)
  const rootTopic = activeSheet.rootTopic
  const activeTopic = useMemo(
    () =>
      activeTopicId
        ? findTopicById(rootTopic, activeTopicId)
        : rootTopic,
    [activeTopicId, rootTopic],
  )
  const [draftName, setDraftName] = useState(activeTopic?.text ?? '')
  const [localSelectedTopicIds, setLocalSelectedTopicIds] = useState<string[]>(() =>
    activeTopicId ? [activeTopicId] : [rootTopic.id],
  )
  const selectedTopicIds = controlledSelectedTopicIds ?? localSelectedTopicIds
  const setSelectedTopicIds = controlledOnSelectedTopicIdsChange ?? setLocalSelectedTopicIds
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [clipboardTopics, setClipboardTopics] = useState<TopicSnapshot[]>([])
  const [clipboardLabel, setClipboardLabel] = useState<string | null>(null)
  const [clipboardHint, setClipboardHint] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [historyFocusTopicId, setHistoryFocusTopicId] = useState<string | null>(null)
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
    setDraftName(activeTopic?.text ?? '')
  }, [activeTopic?.id, activeTopic?.text])

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
  }, [])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
  }, [])

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
    setClipboardLabel(formatClipboardLabel(copyableTopics))
    setClipboardHint(null)

    const writeResult = await writeTopicsToSystemClipboard(copyableTopics)
    setClipboardHint(formatClipboardWriteHint(writeResult))
  }, [copyableTopics])

  const handlePasteTopics = useCallback(async () => {
    const systemClipboardResult = await readTopicsFromSystemClipboard()

    if (systemClipboardResult.status === 'success') {
      const topicsToPaste = systemClipboardResult.topics

      setClipboardTopics(topicsToPaste)
      setClipboardLabel(formatClipboardLabel(topicsToPaste))
      setClipboardHint('已从系统剪贴板粘贴')

      await pasteTopics(topicsToPaste, activeTopicId ?? rootTopic.id)
      return
    }

    const topicsToPaste = clipboardTopics

    if (topicsToPaste.length === 0) {
      setClipboardHint(formatClipboardReadHint(systemClipboardResult, false))
      return
    }

    setClipboardTopics(topicsToPaste)
    setClipboardLabel(formatClipboardLabel(topicsToPaste))
    setClipboardHint(formatClipboardReadHint(systemClipboardResult, true))

    await pasteTopics(topicsToPaste, activeTopicId ?? rootTopic.id)
  }, [activeTopicId, clipboardTopics, pasteTopics, rootTopic.id])

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

      // Cmd/Ctrl + A：全选当前画布可见主题（编辑中由 textarea 自行处理文本全选）
      if (isModifierPressed && event.key.toLowerCase() === 'a' && !editingTopicId) {
        event.preventDefault()
        setSelectedTopicIds(collectVisibleTopicIds(rootTopic))
        return
      }

      if (editingTopicId) {
        return
      }

      const selectedTopicId = activeTopicId ?? rootTopic.id

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

      if (event.key === 'Enter') {
        if (selectedTopicId === rootTopic.id) {
          return
        }

        event.preventDefault()
        void createSiblingTopic(selectedTopicId)
        return
      }

      if (event.key === ' ') {
        const selectedTopic = findTopicById(rootTopic, selectedTopicId)

        if (!selectedTopic || selectedTopic.children.length === 0) {
          return
        }

        event.preventDefault()
        void toggleTopicCollapsed(selectedTopicId)
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
    deleteTopic,
    deleteTopics,
    deletableTopicIds,
    closeSearch,
    editingTopicId,
    goToNextSearchResult,
    goToPreviousSearchResult,
    handleCopyTopics,
    handlePasteTopics,
    openSearch,
    pasteTopics,
    redo,
    rootTopic,
    searchOpen,
    selectTopic,
    selectedTopicIds.length,
    setSelectedTopicIds,
    startInlineEditing,
    toggleTopicCollapsed,
    undo,
  ])

  return (
    <div className="canvas-stage canvas-stage--editor">
      <div className="canvas-stage__hero">
        <p className="canvas-stage__clipboard">
          剪贴板：
          {clipboardLabel ? `已复制 ${clipboardLabel}` : '当前为空'}
          {clipboardHint ? (
            <span className="canvas-stage__clipboard-detail">（{clipboardHint}）</span>
          ) : null}
        </p>
        <div className="canvas-stage__actions">
          <button
            className="toolbar__button"
            type="button"
            onClick={() => void createChildTopic(activeTopicId ?? rootTopic.id)}
          >
            新建子主题
          </button>
          <button
            className="toolbar__button"
            type="button"
            disabled={(activeTopicId ?? rootTopic.id) === rootTopic.id}
            onClick={() => void createSiblingTopic(activeTopicId ?? rootTopic.id)}
          >
            新建同级主题
          </button>
          <button
            className="toolbar__button"
            type="button"
            disabled={copyableTopics.length === 0}
            onClick={() => void handleCopyTopics()}
          >
            复制主题
          </button>
          <button
            className="toolbar__button"
            type="button"
            disabled={clipboardTopics.length === 0 && !canUseSystemClipboardPaste}
            onClick={() => void handlePasteTopics()}
          >
            粘贴为子主题
          </button>
          <button
            className="toolbar__button"
            type="button"
            disabled={(activeTopicId ?? rootTopic.id) === rootTopic.id}
            onClick={() => {
              if (deletableTopicIds.length > 1) {
                void deleteTopics(deletableTopicIds, `删除 ${deletableTopicIds.length} 个主题`)
                return
              }

              void deleteTopic(activeTopicId ?? rootTopic.id)
            }}
          >
            {deletableTopicIds.length > 1 ? `删除已选 ${deletableTopicIds.length} 个主题` : '删除主题'}
          </button>
        </div>
      </div>

      <div className="editor-grid editor-grid--scene">
        <MindMapScene
          key={activeSheet.id}
          initialCamera={sheetCameraMapRef.current[activeSheet.id] ?? null}
          onCameraChange={(camera) => {
            sheetCameraMapRef.current[activeSheet.id] = camera
          }}
          rootTopic={rootTopic}
          chartType={activeSheet.chartType}
          relationships={session.document!.relationships ?? []}
          boundaries={activeSheet.boundaries ?? []}
          summaries={activeSheet.summaries ?? []}
          themeId={session.document!.theme?.id}
          activeTopicId={activeTopicId}
          selectedTopicIds={selectedTopicIds}
          editingTopicId={editingTopicId}
          editingText={editingText}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          searchResults={searchResults}
          activeSearchIndex={activeSearchResult ? activeSearchIndex : -1}
          matchedSearchTopicIds={matchedSearchTopicIds}
          activeSearchTopicId={activeSearchResult?.topicId ?? null}
          historyFocusTopicId={historyFocusTopicId}
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
        />

        <div className="editor-rail">
          <section className="editor-card">
            <div className="editor-card__header">
              <div>
                <p className="panel__eyebrow">Outline</p>
                <h3>主题树</h3>
              </div>
              <span className="editor-card__hint">点击节点切换选中</span>
            </div>

            <ul className="topic-tree" aria-label="主题树">
              <TopicTreeNode
                topic={rootTopic}
                activeTopicId={activeTopicId}
                matchedTopicIds={matchedSearchTopicIds}
                activeSearchTopicId={activeSearchResult?.topicId ?? null}
                onSelect={(topicId) => void selectTopic(topicId)}
                onToggleCollapsed={(topicId) => void toggleTopicCollapsed(topicId)}
              />
            </ul>
          </section>

          <section className="editor-card editor-card--focus">
            <div className="editor-card__header">
              <div>
                <p className="panel__eyebrow">Inline Editor</p>
                <h3>{activeTopic?.text ?? '未选中主题'}</h3>
              </div>
              <span className="editor-card__hint">主题 ID: {activeTopic?.id ?? '-'}</span>
            </div>

            <label className="editor-field">
              <span>主题文本</span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && activeTopic) {
                    void renameTopic(activeTopic.id, draftName)
                  }
                }}
              />
            </label>

            <div className="editor-inline-actions">
              <button
                className="toolbar__button toolbar__button--primary"
                type="button"
                disabled={!activeTopic}
                onClick={() => activeTopic && void renameTopic(activeTopic.id, draftName)}
              >
                提交重命名
              </button>
              <button
                className="toolbar__button"
                type="button"
                disabled={!activeTopic}
                onClick={() => setDraftName(activeTopic?.text ?? '')}
              >
                恢复文本
              </button>
            </div>

            <div className="stats-grid">
              <article className="stat-card">
                <span>文档 ID</span>
                <strong>{summary!.documentId}</strong>
              </article>
              <article className="stat-card">
                <span>修订号</span>
                <strong>{summary!.revision}</strong>
              </article>
              <article className="stat-card">
                <span>节点数</span>
                <strong>{summary!.topicCount}</strong>
              </article>
              <article className="stat-card">
                <span>活动 Sheet</span>
                <strong>{activeSheet.title}</strong>
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export function CanvasHost({
  session,
  selectedTopicIds,
  onSelectedTopicIdsChange,
}: CanvasHostProps) {
  return (
    <main className="canvas-host" aria-label="画布区域">
      <div className="canvas-host__texture" />
      {renderContent({
        session,
        selectedTopicIds,
        onSelectedTopicIdsChange,
      })}
    </main>
  )
}
