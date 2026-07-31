import { useEffect, useRef } from 'react'
import type { CameraState } from './camera'
import type { MindMapLayoutResult } from './mindmap-layout'

interface MinimapProps {
  layout: MindMapLayoutResult
  camera: CameraState
  viewportSize: { width: number; height: number }
  onNavigate: (target: CameraState) => void
}

const MINIMAP_WIDTH = 168
const MINIMAP_HEIGHT = 116
const MINIMAP_PADDING = 8

/**
 * 右下角浮动小地图（参考 XMind Navigator）。
 *
 * - 用 Canvas 2D 绘制全图缩略：节点矩形 + 边线（无文字）
 * - accent 色视口框标识当前可见区域
 * - 点击/拖拽 minimap 平滑跳转（复用相机缓动动画）
 *
 * 坐标系：minimap 内部用"画板坐标"（节点布局坐标 + offset），
 * 与 camera 变换保持一致，确保视口框与节点位置对齐。
 */
export function Minimap({ layout, camera, viewportSize, onNavigate }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // 计算 minimap 内容的缩放与偏移（contain 策略：整图居中适应）
  const contentWidth = MINIMAP_WIDTH - MINIMAP_PADDING * 2
  const contentHeight = MINIMAP_HEIGHT - MINIMAP_PADDING * 2
  const sceneScale =
    layout.width > 0 && layout.height > 0
      ? Math.min(contentWidth / layout.width, contentHeight / layout.height)
      : 0
  const contentOffsetX =
    MINIMAP_PADDING + (contentWidth - layout.width * sceneScale) / 2
  const contentOffsetY =
    MINIMAP_PADDING + (contentHeight - layout.height * sceneScale) / 2

  /** 画板坐标 → minimap 画布坐标。 */
  const boardToMinimap = (bx: number, by: number) => ({
    x: bx * sceneScale + contentOffsetX,
    y: by * sceneScale + contentOffsetY,
  })

  /** minimap 画布坐标 → 画板坐标（用于点击跳转）。 */
  const minimapToBoard = (mx: number, my: number) => ({
    x: (mx - contentOffsetX) / sceneScale,
    y: (my - contentOffsetY) / sceneScale,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const pixelWidth = MINIMAP_WIDTH * dpr
    const pixelHeight = MINIMAP_HEIGHT * dpr
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT)

    if (sceneScale <= 0) return

    // ---- 边线（细灰线）----
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)'
    ctx.lineWidth = Math.max(0.5, sceneScale)
    ctx.beginPath()
    for (const edge of layout.edges) {
      const start = boardToMinimap(edge.start.x, edge.start.y)
      const end = boardToMinimap(edge.end.x, edge.end.y)
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
    }
    ctx.stroke()

    // ---- 节点矩形（按深度取色）----
    for (const node of layout.nodes) {
      const topLeft = boardToMinimap(
        node.x + layout.offsetX - node.width / 2,
        node.y + layout.offsetY - node.height / 2,
      )
      const w = Math.max(2, node.width * sceneScale)
      const h = Math.max(2, node.height * sceneScale)
      ctx.fillStyle =
        node.depth === 0
          ? 'rgba(59, 130, 246, 0.9)'
          : node.depth === 1
            ? 'rgba(99, 102, 241, 0.7)'
            : 'rgba(148, 163, 184, 0.65)'
      ctx.fillRect(topLeft.x, topLeft.y, w, h)
    }

    // ---- 视口框（accent 色）----
    if (camera.zoom > 0 && viewportSize.width > 0 && viewportSize.height > 0) {
      const viewWorldX = -camera.x / camera.zoom
      const viewWorldY = -camera.y / camera.zoom
      const viewWorldW = viewportSize.width / camera.zoom
      const viewWorldH = viewportSize.height / camera.zoom
      const topLeft = boardToMinimap(viewWorldX, viewWorldY)
      const w = viewWorldW * sceneScale
      const h = viewWorldH * sceneScale
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(topLeft.x, topLeft.y, w, h)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.08)'
      ctx.fillRect(topLeft.x, topLeft.y, w, h)
    }
  }, [layout, camera, viewportSize, sceneScale, contentOffsetX, contentOffsetY])

  const handleNavigate = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (sceneScale <= 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = event.clientX - rect.left
    const my = event.clientY - rect.top
    const board = minimapToBoard(mx, my)

    // 以点击点为新的视口中心，保持当前缩放
    const target: CameraState = {
      zoom: camera.zoom,
      x: viewportSize.width / 2 - board.x * camera.zoom,
      y: viewportSize.height / 2 - board.y * camera.zoom,
    }
    onNavigate(target)
  }

  return (
    <div className="minimap" role="navigation" aria-label="小地图导航">
      <canvas
        ref={canvasRef}
        className="minimap__canvas"
        style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
        onClick={handleNavigate}
      />
    </div>
  )
}
