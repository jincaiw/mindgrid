export interface CameraState {
  x: number
  y: number
  zoom: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface WorldSize {
  width: number
  height: number
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function createDefaultCamera(): CameraState {
  return { x: 0, y: 0, zoom: 1 }
}

export function fitSceneToViewport(
  viewport: ViewportSize,
  world: WorldSize,
  padding = 48,
): CameraState {
  if (viewport.width <= 0 || viewport.height <= 0 || world.width <= 0 || world.height <= 0) {
    return createDefaultCamera()
  }

  const availableWidth = Math.max(1, viewport.width - padding * 2)
  const availableHeight = Math.max(1, viewport.height - padding * 2)
  const zoom = clampZoom(Math.min(availableWidth / world.width, availableHeight / world.height))

  return {
    zoom,
    x: (viewport.width - world.width * zoom) / 2,
    y: (viewport.height - world.height * zoom) / 2,
  }
}

export function zoomAtViewportPoint(
  camera: CameraState,
  nextZoomInput: number,
  pointer: { x: number; y: number },
): CameraState {
  const nextZoom = clampZoom(nextZoomInput)
  const worldX = (pointer.x - camera.x) / camera.zoom
  const worldY = (pointer.y - camera.y) / camera.zoom

  return {
    zoom: nextZoom,
    x: pointer.x - worldX * nextZoom,
    y: pointer.y - worldY * nextZoom,
  }
}

export function panCamera(
  camera: CameraState,
  delta: { x: number; y: number },
): CameraState {
  return {
    ...camera,
    x: camera.x + delta.x,
    y: camera.y + delta.y,
  }
}

export function centerCameraOnWorldPoint(
  viewport: ViewportSize,
  point: { x: number; y: number },
  zoom: number,
): CameraState {
  const nextZoom = clampZoom(zoom)

  return {
    zoom: nextZoom,
    x: viewport.width / 2 - point.x * nextZoom,
    y: viewport.height / 2 - point.y * nextZoom,
  }
}

// ---- 相机缓动动画 ----
// 参考 XMind：fitToView / 聚焦主题 / 缩放按钮都带 300ms ease-out 动画，
// 消除 setCamera 直接跳变带来的"廉价感"。

/** 动画总开关：测试环境关闭以避免 RAF + performance.now() 导致的时序问题。 */
let cameraAnimationEnabled = true

/** 关闭/开启相机动画（测试用）。关闭后 animateCamera 直接跳到目标。 */
export function setCameraAnimationEnabled(enabled: boolean): void {
  cameraAnimationEnabled = enabled
}

/** ease-out cubic 缓动函数：起步快、末段慢，适合"滑入目标"的相机动画。 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** 线性插值两个相机状态。 */
export function lerpCamera(from: CameraState, to: CameraState, t: number): CameraState {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    zoom: from.zoom + (to.zoom - from.zoom) * t,
  }
}

/**
 * 用 requestAnimationFrame 在 durationMs 内把相机从 from 平滑动画到 to。
 * 每帧调用 onUpdate(插值后的相机状态)。
 * 返回一个 cancel() 函数，调用后立即终止动画（用于用户中途打断）。
 *
 * 用法：
 * ```ts
 * const cancel = animateCamera(current, target, 300, setCamera)
 * // 用户开始拖拽时：
 * cancel()
 * ```
 */
export function animateCamera(
  from: CameraState,
  to: CameraState,
  durationMs: number,
  onUpdate: (camera: CameraState) => void,
): () => void {
  // 测试环境或显式关闭时直接跳到目标，避免 RAF 时序问题
  if (!cameraAnimationEnabled) {
    onUpdate(to)
    return () => {}
  }

  let cancelled = false
  const start = performance.now()

  function frame(now: number) {
    if (cancelled) return
    const t = Math.min(1, (now - start) / durationMs)
    const eased = easeOutCubic(t)
    onUpdate(lerpCamera(from, to, eased))
    if (t < 1) {
      requestAnimationFrame(frame)
    }
  }

  requestAnimationFrame(frame)

  return () => {
    cancelled = true
  }
}

/** 默认动画时长：参考 XMind 的 280-320ms 区间。 */
export const CAMERA_ANIMATION_MS = 300
