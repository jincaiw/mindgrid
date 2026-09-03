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

  it('does not draw a dot grid on the background', () => {
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

    // 对齐 XMind：默认无点阵网格。唯一的 arc 调用来自根节点的折叠/展开按钮。
    const arcCalls = calls.filter((c) => c.method === 'arc')
    expect(arcCalls).toHaveLength(1)
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
    // Each topic has at least: title text (+ toggle symbol for nodes with children)
    // root, a, b = 3 topics → at least 3 title texts (meta text removed, XMind-style)
    expect(fillTextCalls.length).toBeGreaterThanOrEqual(3)
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

  it('draws XMind-style 2px outline (stroke) for active topic instead of filled ring', () => {
    const { ctx, calls } = createMockCtx()
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      // root 同时为 active + selected
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    // 状态描边色（accent #5b8cff）应被设置为 strokeStyle
    const accentStrokes = calls.filter(
      (c) => c.method === 'strokeStyle' && c.args[0] === '#5b8cff',
    )
    expect(accentStrokes.length).toBeGreaterThan(0)
    // 线宽 2px（XMind 式 outline）
    const lineWidth2 = calls.filter(
      (c) => c.method === 'lineWidth' && c.args[0] === 2,
    )
    expect(lineWidth2.length).toBeGreaterThan(0)
    // 不应再出现旧的半透明填充光环色 rgba(59,130,246,0.12)
    const oldRingFills = calls.filter(
      (c) => c.method === 'fillStyle' && c.args[0] === 'rgba(59, 130, 246, 0.12)',
    )
    expect(oldRingFills.length).toBe(0)
  })
})

describe('renderScene — 富内容（task / markers / notes / link / labels）', () => {
  function makeRichRoot(): TopicSnapshot {
    return makeTopic('root', '中心', [
      {
        id: 'rich_child',
        text: '富内容节点',
        collapsed: false,
        children: [],
        markers: [{ id: 'priority-1' }, { id: 'star' }],
        labels: ['重要', '待办'],
        notes: '这是一段备注',
        link: { url: 'https://example.com', title: '示例' },
        task: { status: 'started', priority: 2 },
      },
    ])
  }

  function buildRichScene() {
    const layout = computeMindMapLayout(makeRichRoot())
    return buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })
  }

  function childBounds(scene: ReturnType<typeof buildRichScene>) {
    const node = scene.nodes.find(
      (n): n is Extract<typeof n, { type: 'topic' }> => n.type === 'topic' && n.id === 'rich_child',
    )
    if (!node) throw new Error('场景里找不到 rich_child')
    return node.bounds
  }

  it('draws label pills below the node', () => {
    const { ctx, calls } = createMockCtx()
    renderScene(ctx, buildRichScene(), defaultViewport, defaultCamera, 1)

    const texts = calls
      .filter((c) => c.method === 'fillText')
      .map((c) => c.args[0] as string)
    expect(texts).toContain('重要')
    expect(texts).toContain('待办')

    // 胶囊背景色（与 SVG 端同源）
    expect(
      calls.some((c) => c.method === 'fillStyle' && c.args[0] === 'rgba(91,140,255,0.12)'),
    ).toBe(true)
  })

  it('draws label pills centered under the node box', () => {
    const { ctx, calls } = createMockCtx()
    const scene = buildRichScene()
    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    const bounds = childBounds(scene)
    const labelTexts = calls.filter(
      (c) => c.method === 'fillText' && c.args[0] === '重要',
    )
    expect(labelTexts).toHaveLength(1)
    const labelX = labelTexts[0].args[1] as number
    const nodeCenterX = bounds.x + bounds.width / 2
    // 两个标签 + 一个间距，整行居中，故第一个标签中心应在节点中心左侧
    expect(labelX).toBeLessThan(nodeCenterX)
    expect(labelX).toBeGreaterThan(bounds.x)
    // 标签位于节点下方
    expect(labelTexts[0].args[2] as number).toBeGreaterThan(bounds.y + bounds.height)
  })

  it('draws task icon to the left of the node', () => {
    const { ctx, calls } = createMockCtx()
    const scene = buildRichScene()
    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    const bounds = childBounds(scene)
    // 任务图标（started 状态）为描边圆环 + 实心内点，均表现为 arc 调用
    const taskArcs = calls.filter(
      (c) => c.method === 'arc' && (c.args[0] as number) < bounds.x,
    )
    expect(taskArcs.length).toBeGreaterThan(0)
  })

  it('draws marker/note/link icons to the right of the node', () => {
    const { ctx, calls } = createMockCtx()
    const scene = buildRichScene()
    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    const bounds = childBounds(scene)
    const rightEdge = bounds.x + bounds.width
    // priority-1 是「红圆 + 数字 1」：数字以 fillText 落在节点右侧
    const markerTexts = calls.filter(
      (c) =>
        c.method === 'fillText' &&
        c.args[0] === '1' &&
        (c.args[1] as number) > rightEdge,
    )
    expect(markerTexts.length).toBeGreaterThan(0)

    // 备注图标（#f6be00）与链接图标（#5b8cff）应各出现一次填充
    const noteFills = calls.filter(
      (c) => c.method === 'fillStyle' && c.args[0] === '#f6be00',
    )
    const linkFills = calls.filter(
      (c) => c.method === 'fillStyle' && c.args[0] === '#5b8cff',
    )
    expect(noteFills.length).toBeGreaterThan(0)
    expect(linkFills.length).toBeGreaterThan(0)
  })

  it('omits rich content when the topic has none', () => {
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

    const texts = calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string)
    expect(texts).not.toContain('重要')
    expect(
      calls.some((c) => c.method === 'fillStyle' && c.args[0] === 'rgba(91,140,255,0.12)'),
    ).toBe(false)
  })

  it('does not leak text state after drawing rich content', () => {
    const { ctx, calls } = createMockCtx()
    renderScene(ctx, buildRichScene(), defaultViewport, defaultCamera, 1)

    // 标签绘制会切到 center/middle，绘制结束必须复原，否则后续节点文字会错位
    const lastAlign = calls.filter((c) => c.method === 'textAlign').pop()
    const lastBaseline = calls.filter((c) => c.method === 'textBaseline').pop()
    expect(lastAlign?.args[0]).toBe('left')
    expect(lastBaseline?.args[0]).toBe('top')
  })
})
