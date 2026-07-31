import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TopicSnapshot } from '../../../lib/document/types'
import { computeMindMapLayout } from '../mindmap-layout'
import { buildScene, type InteractionOverlays, type TopicVisualStates } from './scene-builder'

const renderSceneMock = vi.hoisted(() => ({
  renderScene: vi.fn(),
}))

vi.mock('./canvas-renderer', () => ({
  renderScene: renderSceneMock.renderScene,
}))

const { renderSceneToPngBytes } = await import('./png-exporter')

function makeTopic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

function makeRoot(): TopicSnapshot {
  return makeTopic('root', 'Root', [
    makeTopic('a', 'Alpha'),
    makeTopic('b', 'Beta'),
  ])
}

const emptyVisualStates: TopicVisualStates = {
  activeTopicId: null,
  selectedTopicIds: new Set(),
  editingTopicId: null,
  searchMatchedTopicIds: new Set(),
  activeSearchTopicId: null,
  historyFocusTopicId: null,
  dropTargetTopicId: null,
  draggingTopicId: null,
}

const emptyOverlays: InteractionOverlays = {
  selectionBox: null,
  dragPreview: null,
  dropIndicator: null,
}

function buildTestScene() {
  const layout = computeMindMapLayout(makeRoot())
  return buildScene({
    layout,
    viewport: { width: 800, height: 600 },
    camera: { x: 0, y: 0, zoom: 1 },
    visualStates: emptyVisualStates,
    overlays: emptyOverlays,
    enableCulling: false,
  })
}

/** 创建 mock canvas 元素，记录 getContext/toBlob 调用。 */
function setupMockCanvas() {
  const mockCtx = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    set fillStyle(_v: unknown) {},
    set strokeStyle(_v: unknown) {},
    set lineWidth(_v: unknown) {},
    set lineCap(_v: unknown) {},
    set font(_v: unknown) {},
    set textBaseline(_v: unknown) {},
    set textAlign(_v: unknown) {},
    set globalAlpha(_v: unknown) {},
    set shadowColor(_v: unknown) {},
    set shadowBlur(_v: unknown) {},
    set shadowOffsetY(_v: unknown) {},
    set lineDash(_v: unknown) {},
  }

  const mockBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })
  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => mockCtx),
    toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
      callback(mockBlob)
    }),
  }

  const originalCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return mockCanvas as unknown as HTMLCanvasElement
    }
    return originalCreateElement(tagName)
  })

  // 确保 OffscreenCanvas 不可用，走 document.createElement 回退路径
  vi.stubGlobal('OffscreenCanvas', undefined)

  return { mockCtx, mockCanvas, mockBlob }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  renderSceneMock.renderScene.mockClear()
})

describe('renderSceneToPngBytes', () => {
  it('renders scene to PNG bytes via offscreen canvas', async () => {
    const scene = buildTestScene()
    const { mockCanvas } = setupMockCanvas()

    const bytes = await renderSceneToPngBytes(scene, { scale: 2 })

    // canvas 被创建并设置了物理像素尺寸
    expect(mockCanvas.width).toBeGreaterThan(0)
    expect(mockCanvas.height).toBeGreaterThan(0)
    // toBlob 被调用生成 PNG
    expect(mockCanvas.toBlob).toHaveBeenCalled()
    // 返回 Uint8Array
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('calls renderScene with correct camera, viewport and dpr', async () => {
    const scene = buildTestScene()
    setupMockCanvas()

    await renderSceneToPngBytes(scene, { scale: 3 })

    expect(renderSceneMock.renderScene).toHaveBeenCalledTimes(1)
    const [ctx, passedScene, viewport, camera, dpr, options] = renderSceneMock.renderScene.mock.calls[0]

    expect(ctx).toBeDefined()
    expect(passedScene).toBe(scene)
    // viewport 是导出包围盒的尺寸
    expect(viewport.width).toBeGreaterThan(0)
    expect(viewport.height).toBeGreaterThan(0)
    // camera 平移到原点，zoom = 1
    expect(camera.zoom).toBe(1)
    // dpr = scale
    expect(dpr).toBe(3)
    // 不画 overlay
    expect(options.drawOverlays).toBe(false)
    expect(options.drawTopics).toBe(true)
    expect(options.drawDecorations).toBe(true)
  })

  it('applies padding to export bounds', async () => {
    const scene = buildTestScene()
    setupMockCanvas()

    await renderSceneToPngBytes(scene, { scale: 1, padding: 0 })
    const [, , viewportNoPadding] = renderSceneMock.renderScene.mock.calls[0]

    await renderSceneToPngBytes(scene, { scale: 1, padding: 100 })
    const [, , viewportWithPadding] = renderSceneMock.renderScene.mock.calls[1]

    expect(viewportWithPadding.width).toBeGreaterThan(viewportNoPadding.width)
    expect(viewportWithPadding.height).toBeGreaterThan(viewportNoPadding.height)
  })

  it('passes drawBackground option to renderScene', async () => {
    const scene = buildTestScene()
    setupMockCanvas()

    await renderSceneToPngBytes(scene, { drawBackground: true })
    const [, , , , , options] = renderSceneMock.renderScene.mock.calls[0]

    expect(options.drawBackground).toBe(true)
  })

  it('defaults to transparent background and 2x scale', async () => {
    const scene = buildTestScene()
    setupMockCanvas()

    await renderSceneToPngBytes(scene)
    const [, , , , dpr, options] = renderSceneMock.renderScene.mock.calls[0]

    expect(dpr).toBe(2)
    expect(options.drawBackground).toBe(false)
  })
})
