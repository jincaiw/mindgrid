import { describe, expect, it, vi } from 'vitest'
import type { TopicSnapshot } from '../../../lib/document/types'
import { computeMindMapLayout } from '../mindmap-layout'
import { renderScene } from './canvas-renderer'
import { buildScene, type InteractionOverlays, type TopicVisualStates } from './scene-builder'
import type { CameraProjection, Viewport } from './render-tree'

function makeTopic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

function makeRoot(): TopicSnapshot {
  return makeTopic('root', 'Root', [
    makeTopic('a', 'Alpha'),
    makeTopic('b', 'Beta'),
  ])
}

const defaultViewport: Viewport = { width: 800, height: 600 }
const defaultCamera: CameraProjection = { x: 400, y: 300, zoom: 1 }
const defaultVisualStates: TopicVisualStates = {
  activeTopicId: 'root',
  selectedTopicIds: new Set(['root']),
  editingTopicId: null,
  searchMatchedTopicIds: new Set(),
  activeSearchTopicId: null,
  historyFocusTopicId: null,
  dropTargetTopicId: null,
  draggingTopicId: null,
}
const defaultOverlays: InteractionOverlays = {
  selectionBox: null,
  dragPreview: null,
  dropIndicator: null,
}

/** 创建模拟 Canvas 2D 上下文，记录所有绘制调用。 */
function createMockCtx() {
  const calls: { method: string; args: unknown[] }[] = []
  const ctx = {
    clearRect: vi.fn((...a: unknown[]) => calls.push({ method: 'clearRect', args: a })),
    save: vi.fn(() => calls.push({ method: 'save', args: [] })),
    restore: vi.fn(() => calls.push({ method: 'restore', args: [] })),
    scale: vi.fn((...a: unknown[]) => calls.push({ method: 'scale', args: a })),
    translate: vi.fn((...a: unknown[]) => calls.push({ method: 'translate', args: a })),
    fillRect: vi.fn((...a: unknown[]) => calls.push({ method: 'fillRect', args: a })),
    beginPath: vi.fn(() => calls.push({ method: 'beginPath', args: [] })),
    moveTo: vi.fn((...a: unknown[]) => calls.push({ method: 'moveTo', args: a })),
    lineTo: vi.fn((...a: unknown[]) => calls.push({ method: 'lineTo', args: a })),
    bezierCurveTo: vi.fn((...a: unknown[]) => calls.push({ method: 'bezierCurveTo', args: a })),
    arc: vi.fn((...a: unknown[]) => calls.push({ method: 'arc', args: a })),
    quadraticCurveTo: vi.fn((...a: unknown[]) => calls.push({ method: 'quadraticCurveTo', args: a })),
    closePath: vi.fn(() => calls.push({ method: 'closePath', args: [] })),
    fill: vi.fn(() => calls.push({ method: 'fill', args: [] })),
    stroke: vi.fn(() => calls.push({ method: 'stroke', args: [] })),
    fillText: vi.fn((...a: unknown[]) => calls.push({ method: 'fillText', args: a })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    set fillStyle(v: unknown) { calls.push({ method: 'fillStyle', args: [v] }) },
    set strokeStyle(v: unknown) { calls.push({ method: 'strokeStyle', args: [v] }) },
    set lineWidth(v: unknown) { calls.push({ method: 'lineWidth', args: [v] }) },
    set lineCap(v: unknown) { calls.push({ method: 'lineCap', args: [v] }) },
    set font(v: unknown) { calls.push({ method: 'font', args: [v] }) },
    set textBaseline(v: unknown) { calls.push({ method: 'textBaseline', args: [v] }) },
    set textAlign(v: unknown) { calls.push({ method: 'textAlign', args: [v] }) },
    set globalAlpha(v: unknown) { calls.push({ method: 'globalAlpha', args: [v] }) },
    set shadowColor(v: unknown) { calls.push({ method: 'shadowColor', args: [v] }) },
    set shadowBlur(v: unknown) { calls.push({ method: 'shadowBlur', args: [v] }) },
    set shadowOffsetY(v: unknown) { calls.push({ method: 'shadowOffsetY', args: [v] }) },
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

describe('renderScene', () => {
  it('clears the canvas and draws background', () => {
    const { ctx, calls } = createMockCtx()
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    expect(calls[0].method).toBe('clearRect')
    // Background fill
    expect(calls.some((c) => c.method === 'fillRect')).toBe(true)
  })

  it('applies camera transform before drawing world content', () => {
    const { ctx, calls } = createMockCtx()
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 2)

    // Should scale by DPR first, then translate and scale by camera
    const scaleCalls = calls.filter((c) => c.method === 'scale')
    expect(scaleCalls.length).toBeGreaterThanOrEqual(2)
    // First scale is DPR
    expect(scaleCalls[0].args).toEqual([2, 2])
  })

  it('draws bezier curves for edges', () => {
    const { ctx, calls } = createMockCtx()
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    const bezierCalls = calls.filter((c) => c.method === 'bezierCurveTo')
    // 2 edges → 2 bezier curves
    expect(bezierCalls.length).toBe(2)
  })

  it('draws text for each topic node', () => {
    const { ctx, calls } = createMockCtx()
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    const fillTextCalls = calls.filter((c) => c.method === 'fillText')
    // Each topic has at least: title + meta text + toggle (+/−)
    // root, a, b = 3 topics → at least 3 title texts + 3 meta texts + 3 toggle symbols
    expect(fillTextCalls.length).toBeGreaterThanOrEqual(6)
  })

  it('draws selection box overlay when present', () => {
    const { ctx, calls } = createMockCtx()
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: {
        ...defaultOverlays,
        selectionBox: { x: 50, y: 50, width: 200, height: 100 },
      },
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    // Should have fill + stroke for the selection box
    const strokeCalls = calls.filter((c) => c.method === 'stroke')
    expect(strokeCalls.length).toBeGreaterThan(0)
  })

  it('draws drop indicator label text when present', () => {
    const { ctx, calls } = createMockCtx()
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: {
        ...defaultOverlays,
        dropIndicator: {
          bounds: { x: 100, y: 100, width: 140, height: 44 },
          label: '释放后作为子主题',
        },
      },
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    const fillTextCalls = calls.filter(
      (c) => c.method === 'fillText' && (c.args[0] as string).includes('释放后'),
    )
    expect(fillTextCalls.length).toBe(1)
  })

  it('saves and restores context state around world-space drawing', () => {
    const { ctx, calls } = createMockCtx()
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    const saveCalls = calls.filter((c) => c.method === 'save')
    const restoreCalls = calls.filter((c) => c.method === 'restore')
    expect(saveCalls.length).toBeGreaterThanOrEqual(1)
    expect(restoreCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('handles empty scene without errors', () => {
    const { ctx } = createMockCtx()
    const emptyScene = {
      nodes: [],
      worldBounds: { x: 0, y: 0, width: 0, height: 0 },
      offsetX: 0,
      offsetY: 0,
    }

    expect(() => renderScene(ctx, emptyScene, defaultViewport, defaultCamera, 1)).not.toThrow()
  })

  it('skips background when drawBackground is false', () => {
    const { ctx, calls } = createMockCtx()
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 1, { drawBackground: false })

    // No fillRect calls (background uses fillRect; edges use stroke)
    const fillRectCalls = calls.filter((c) => c.method === 'fillRect')
    expect(fillRectCalls.length).toBe(0)
  })

  it('skips topic text when drawTopics is false but still draws edges', () => {
    const { ctx, calls } = createMockCtx()
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 1, { drawTopics: false })

    // Edges still drawn (bezierCurveTo)
    const bezierCalls = calls.filter((c) => c.method === 'bezierCurveTo')
    expect(bezierCalls.length).toBe(2)
    // No topic text (topics have titles like "Root", "Alpha", "Beta")
    const fillTextCalls = calls.filter(
      (c) => c.method === 'fillText' && typeof c.args[0] === 'string',
    )
    const topicTexts = fillTextCalls.filter((c) =>
      ['Root', 'Alpha', 'Beta'].some((t) => (c.args[0] as string).includes(t)),
    )
    expect(topicTexts.length).toBe(0)
  })
})
