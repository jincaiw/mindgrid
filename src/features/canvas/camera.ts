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
