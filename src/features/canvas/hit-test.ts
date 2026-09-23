import { canReparentTopic } from '../../lib/document/tree'
import type { TopicSnapshot } from '../../lib/document/types'
import type { CameraState } from './camera'
import type { MindMapNodeLayout } from './mindmap-layout'

export interface ViewportPoint {
  x: number
  y: number
}

export interface ViewportRect {
  left: number
  top: number
  right: number
  bottom: number
}

function createNodeWorldRect(
  node: MindMapNodeLayout,
  offsetX: number,
  offsetY: number,
): ViewportRect {
  const centerX = node.x + offsetX
  const centerY = node.y + offsetY

  return {
    left: centerX - node.width / 2,
    right: centerX + node.width / 2,
    top: centerY - node.height / 2,
    bottom: centerY + node.height / 2,
  }
}

export function viewportPointToWorld(
  point: ViewportPoint,
  camera: CameraState,
): ViewportPoint {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  }
}

export function createViewportRectFromPoints(
  start: ViewportPoint,
  end: ViewportPoint,
): ViewportRect {
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  }
}

export function hitTestNodeAtViewportPoint(
  nodes: MindMapNodeLayout[],
  offsetX: number,
  offsetY: number,
  camera: CameraState,
  point: ViewportPoint,
) {
  const worldPoint = viewportPointToWorld(point, camera)

  return [...nodes]
    .sort((left, right) => right.depth - left.depth)
    .find((node) => {
      const rect = createNodeWorldRect(node, offsetX, offsetY)

      return (
        worldPoint.x >= rect.left &&
        worldPoint.x <= rect.right &&
        worldPoint.y >= rect.top &&
        worldPoint.y <= rect.bottom
      )
    })
}

export function collectNodesInViewportRect(
  nodes: MindMapNodeLayout[],
  offsetX: number,
  offsetY: number,
  camera: CameraState,
  rect: ViewportRect,
) {
  const worldStart = viewportPointToWorld({ x: rect.left, y: rect.top }, camera)
  const worldEnd = viewportPointToWorld({ x: rect.right, y: rect.bottom }, camera)
  const worldRect = createViewportRectFromPoints(worldStart, worldEnd)

  return nodes.filter((node) => {
    const nodeRect = createNodeWorldRect(node, offsetX, offsetY)

    return !(
      nodeRect.right < worldRect.left ||
      nodeRect.left > worldRect.right ||
      nodeRect.bottom < worldRect.top ||
      nodeRect.top > worldRect.bottom
    )
  })
}

export function canDropTopicOnTarget(
  rootTopic: TopicSnapshot,
  topicId: string,
  targetParentId: string,
) {
  return canReparentTopic(rootTopic, topicId, targetParentId)
}

/**
 * 画布级对象（插画）命中测试需要的最小字段子集。
 *
 * 刻意不收 `IllustrationRenderNode`：这层只做几何，纯函数才好单测。
 */
export interface CanvasObjectHitCandidate {
  id: string
  /** 中心点（布局坐标系，未加 layout.offset）。 */
  x: number
  y: number
  /** 边长（正方形）。 */
  size: number
}

/**
 * 命中画布上的某张插画，返回**最上面**那张（未命中返回 null）。
 *
 * 与主题命中测试的关键差别：插画是画布级对象、有明确 z-order
 * （数组顺序即绘制顺序，后画的盖在上面），所以从**末尾往前**找，
 * 而不是像主题那样按 depth 排序。
 */
export function hitTestIllustrationAtViewportPoint(
  illustrations: readonly CanvasObjectHitCandidate[],
  offsetX: number,
  offsetY: number,
  camera: CameraState,
  point: ViewportPoint,
): CanvasObjectHitCandidate | null {
  const worldPoint = viewportPointToWorld(point, camera)

  for (let index = illustrations.length - 1; index >= 0; index -= 1) {
    const item = illustrations[index]
    const cx = item.x + offsetX
    const cy = item.y + offsetY
    const half = item.size / 2

    if (
      worldPoint.x >= cx - half &&
      worldPoint.x <= cx + half &&
      worldPoint.y >= cy - half &&
      worldPoint.y <= cy + half
    ) {
      return item
    }
  }

  return null
}
