/**
 * PNG Exporter：将 Scene（Render Tree）渲染为高 DPI PNG 字节。
 *
 * 复用 Canvas 2D Renderer 的 renderScene，在离屏 canvas 上按目标分辨率渲染，
 * 保证与画布显示像素级一致（文本换行、阴影、渐变）。
 *
 * 导出流程：
 * 1. computeNodesBounds 计算所有节点的紧包围盒 + padding
 * 2. 创建离屏 canvas（物理像素 = 逻辑尺寸 × scale）
 * 3. renderScene 渲染（camera 平移到原点，dpr = scale，不画 overlay）
 * 4. canvas.toBlob('image/png') → Uint8Array
 */

import { renderScene, type RenderOptions } from './canvas-renderer'
import { computeNodesBounds, type CameraProjection, type Scene, type Viewport } from './render-tree'

export interface PngExportOptions {
  /** 缩放倍数（2 = 2x 高 DPI，3 = 3x）。默认 2。 */
  scale?: number
  /** 是否绘制白色背景（默认 false，透明 PNG）。 */
  drawBackground?: boolean
  /** 画布外边距（世界坐标，默认 32）。 */
  padding?: number
}

const DEFAULT_SCALE = 2
const DEFAULT_PADDING = 32

/**
 * 将场景渲染为 PNG 字节。
 *
 * @param scene 场景（建议用 enableCulling: false 构建全量场景）
 * @param options 导出选项
 * @returns PNG 二进制数据
 */
export async function renderSceneToPngBytes(
  scene: Scene,
  options: PngExportOptions = {},
): Promise<Uint8Array> {
  const { scale = DEFAULT_SCALE, drawBackground = false, padding = DEFAULT_PADDING } = options

  // 过滤掉 overlay 节点（与 SVG 导出一致）
  const exportableNodes = scene.nodes.filter(
    (node) =>
      node.type !== 'selection-box' &&
      node.type !== 'drag-preview' &&
      node.type !== 'drop-indicator',
  )

  const contentBounds = computeNodesBounds(exportableNodes)
  const exportBounds = {
    x: contentBounds.x - padding,
    y: contentBounds.y - padding,
    width: contentBounds.width + padding * 2,
    height: contentBounds.height + padding * 2,
  }

  // 创建离屏 canvas（优先 OffscreenCanvas，回退普通 canvas）
  const physicalWidth = Math.max(1, Math.round(exportBounds.width * scale))
  const physicalHeight = Math.max(1, Math.round(exportBounds.height * scale))
  const canvas = createOffscreenCanvas(physicalWidth, physicalHeight)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法获取 Canvas 2D 上下文，PNG 导出失败')
  }

  // 渲染参数：camera 平移到原点，dpr = scale，不画 overlay
  const viewport: Viewport = {
    width: exportBounds.width,
    height: exportBounds.height,
  }
  const camera: CameraProjection = {
    x: -exportBounds.x,
    y: -exportBounds.y,
    zoom: 1,
  }
  const topicImages = await preloadTopicImages(scene)

  const renderOptions: RenderOptions = {
    drawBackground,
    drawTopics: true,
    drawOverlays: false,
    drawDecorations: true,
    topicImages,
  }

  renderScene(ctx, scene, viewport, camera, scale, renderOptions)

  // 转为 PNG 字节
  const blob = await canvasToPngBlob(canvas)
  const arrayBuffer = await blob.arrayBuffer()

  return new Uint8Array(arrayBuffer)
}

// ---- 主题图片预加载 ----

/**
 * 单张图片解码的超时上限。
 *
 * 必要性：jsdom 等环境里 `Image` 构造器存在但没有真实解码能力，
 * `onload` 与 `onerror` **都不会触发**，若不设超时会让导出永久挂起。
 */
const IMAGE_DECODE_TIMEOUT_MS = 1000

/**
 * 预加载场景内所有主题图片，返回「已成功解码」的子集。
 *
 * `renderScene` 是同步的，无法在绘制过程中等待图片解码，因此导出流程必须提前完成。
 * 本函数独立导出，便于直接测试容错行为。
 *
 * @returns topicId → 已解码图像；仅包含解码成功的项
 */
export async function preloadTopicImages(
  scene: Scene,
  timeoutMs: number = IMAGE_DECODE_TIMEOUT_MS,
): Promise<Map<string, HTMLImageElement>> {
  const decoded = new Map<string, HTMLImageElement>()
  const pending: Array<Promise<void>> = []

  for (const node of scene.nodes) {
    if (node.type !== 'topic') continue
    const dataUrl = node.rich?.image
    if (!dataUrl) continue

    const topicId = node.id
    pending.push(
      decodeImage(dataUrl, timeoutMs).then((image) => {
        if (image) {
          decoded.set(topicId, image)
        }
      }),
    )
  }

  await Promise.all(pending)
  return decoded
}

/** 解码单个 data URL。环境不支持 / 解码失败 / 超时均返回 null，绝不抛错。 */
export function decodeImage(
  dataUrl: string,
  timeoutMs: number = IMAGE_DECODE_TIMEOUT_MS,
): Promise<HTMLImageElement | null> {
  // 无 DOM 环境（Node 侧单测）直接降级
  if (typeof Image === 'undefined') {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let settled = false
    const settle = (value: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }

    // 超时兜底：无真实解码能力的环境下事件不会触发，避免导出挂起
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => settle(null), timeoutMs)

    const image = new Image()
    image.onload = () => settle(image)
    image.onerror = () => settle(null)
    image.src = dataUrl
  })
}

// ---- 离屏 canvas 创建 ----

interface OffscreenCanvasLike {
  width: number
  height: number
  getContext(contextId: '2d'): CanvasRenderingContext2D | null
  convertToBlob(options?: { type: string }): Promise<Blob>
}

interface HtmlCanvasLike {
  width: number
  height: number
  getContext(contextId: '2d'): CanvasRenderingContext2D | null
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: unknown): void
}

type ExportCanvas = OffscreenCanvasLike | HtmlCanvasLike

function createOffscreenCanvas(width: number, height: number): ExportCanvas {
  // 优先 OffscreenCanvas（Tauri WebView 支持）
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height) as unknown as ExportCanvas
  }

  // 回退普通 canvas
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas as unknown as ExportCanvas
  }

  throw new Error('当前环境不支持 Canvas，PNG 导出失败')
}

async function canvasToPngBlob(canvas: ExportCanvas): Promise<Blob> {
  // OffscreenCanvas 路径
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/png' })
  }

  // HTMLCanvasElement 路径
  if ('toBlob' in canvas && typeof canvas.toBlob === 'function') {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Canvas toBlob 返回空数据，PNG 导出失败'))
        }
      }, 'image/png')
    })
  }

  throw new Error('Canvas 不支持 toBlob/convertToBlob，PNG 导出失败')
}
