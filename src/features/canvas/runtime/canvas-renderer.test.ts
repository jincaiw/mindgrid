import { describe, expect, it, vi } from 'vitest'
import type { TopicSnapshot } from '../../../lib/document/types'
import { computeMindMapLayout } from '../mindmap-layout'
import { renderScene } from './canvas-renderer'
import { COLORS } from './style-constants'
import { buildScene, type InteractionOverlays, type TopicVisualStates } from './scene-builder'
import type { CameraProjection, TopicRenderNode, Viewport } from './render-tree'
import { resolveEffectiveTheme } from './effective-theme'

/**
 * `buildScene` 现在要求显式传"**生效主题**"（画布级分支色板已叠加）。
 * 这些用例只关心场景结构与绘制调用，用内置默认主题即可 ——
 * 与改动前不传 themeId 时的缺省行为一致。
 */
const TEST_THEME = resolveEffectiveTheme({ themeId: undefined })


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
  setLineDash(v: unknown) { calls.push({ method: 'setLineDash', args: [v] }) },
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
      theme: TEST_THEME,
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
      theme: TEST_THEME,
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
      theme: TEST_THEME,
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
      theme: TEST_THEME,
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
      theme: TEST_THEME,
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
      theme: TEST_THEME,
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
      theme: TEST_THEME,
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
      theme: TEST_THEME,
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
      theme: TEST_THEME,
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 1, { drawBackground: false })

    // No fillRect calls (background uses fillRect; edges use stroke)
    const fillRectCalls = calls.filter((c) => c.method === 'fillRect')
    expect(fillRectCalls.length).toBe(0)
  })

  it('draws dashed borders and right-aligned titles from node overrides', () => {
    const scene = buildScene({
      layout: computeMindMapLayout(makeRoot()),
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      theme: resolveEffectiveTheme({ themeId: 'classic-blue' }),
      enableCulling: false,
    })

    // 给一个分支节点打上虚线边框 + 右对齐覆盖
    const branch = scene.nodes.find(
      (n): n is TopicRenderNode => n.type === 'topic' && n.depth === 1,
    )!
    branch.style = { ...branch.style, borderStyle: 'dashed', textAlign: 'right', borderWidth: 2 }

    const { ctx, calls } = createMockCtx()
    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    // 虚线：setLineDash 收到非空数组（solid 时是空数组）
    const dashes = calls.filter((c) => c.method === 'setLineDash')
    expect(dashes.some((c) => Array.isArray(c.args[0]) && (c.args[0] as number[]).length > 0)).toBe(
      true,
    )

    // 右对齐：写文本前 textAlign 被设成 right，且绘制后复位为 left
    const textAligns = calls.filter((c) => c.method === 'textAlign').map((c) => c.args[0])
    expect(textAligns).toContain('right')
    expect(textAligns[textAligns.length - 1]).toBe('left')
  })

  it('renders italic font family and case transform from node overrides', () => {
    const scene = buildScene({
      layout: computeMindMapLayout(makeRoot()),
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      theme: resolveEffectiveTheme({ themeId: 'classic-blue' }),
      enableCulling: false,
    })

    const branch = scene.nodes.find(
      (n): n is TopicRenderNode => n.type === 'topic' && n.depth === 1,
    )!
    branch.text = 'hello'
    branch.style = {
      ...branch.style,
      fontFamily: '"Songti SC", SimSun, serif',
      italic: true,
      textTransform: 'uppercase',
    }

    const { ctx, calls } = createMockCtx()
    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    // 斜体写在 font 简写的 style 段，字体族取节点级覆盖而非画布全局字体
    const fonts = calls.filter((c) => c.method === 'font').map((c) => String(c.args[0]))
    expect(fonts.some((f) => f.startsWith('italic ') && f.includes('Songti SC'))).toBe(true)

    // 大小写转换只作用于渲染层：画出来是全大写，文档文本不变
    const texts = calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]))
    expect(texts).toContain('HELLO')
    expect(branch.text).toBe('hello')
  })

  it('draws one extra strike line per text line when strikethrough is on', () => {
    const strokeCount = (strikethrough: boolean) => {
      const scene = buildScene({
        layout: computeMindMapLayout(makeRoot()),
        viewport: defaultViewport,
        camera: defaultCamera,
        visualStates: defaultVisualStates,
        overlays: defaultOverlays,
        theme: resolveEffectiveTheme({ themeId: 'classic-blue' }),
        enableCulling: false,
      })
      const branch = scene.nodes.find(
        (n): n is TopicRenderNode => n.type === 'topic' && n.depth === 1,
      )!
      branch.style = { ...branch.style, strikethrough }

      const { ctx, calls } = createMockCtx()
      renderScene(ctx, scene, defaultViewport, defaultCamera, 1)
      return calls.filter((c) => c.method === 'stroke').length
    }

    // Canvas 2D 没有原生 line-through：开启后每行文本多一条手绘横线
    expect(strokeCount(true)).toBeGreaterThan(strokeCount(false))
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
      theme: TEST_THEME,
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
      theme: TEST_THEME,
      enableCulling: false,
    })

    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    // 状态描边色应被设置为 strokeStyle。
    // 从 COLORS 取值而不是写字面量：批次 B4 曾把 #5b8cff 换成 #2d7ff9，写死字面量的
    // 断言会跟着失效一次；取常量则与生产代码同源，不会再漂。
    const accentStrokes = calls.filter(
      (c) => c.method === 'strokeStyle' && c.args[0] === COLORS.activeOutline,
    )
    expect(accentStrokes.length).toBeGreaterThan(0)
    // 线宽 2px（XMind 式 outline）
    const lineWidth2 = calls.filter(
      (c) => c.method === 'lineWidth' && c.args[0] === 2,
    )
    expect(lineWidth2.length).toBeGreaterThan(0)
    // 不应再出现已被替换的旧状态色批次（B4 前的 #5b8cff / rgba(59,130,246,…)）
    const legacyBlues = calls.filter(
      (c) =>
        (c.method === 'strokeStyle' || c.method === 'fillStyle') &&
        typeof c.args[0] === 'string' &&
        /#5b8cff|rgba\(59, 130, 246/i.test(c.args[0] as string),
    )
    expect(legacyBlues).toEqual([])
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
      theme: TEST_THEME,
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

    // 备注图标（便签纸：#f6be00 **填充**）与链接图标（链条：#5b8cff **描边**）。
    // 链接此前是"蓝色实心圆"，改成链条后填充没了 —— 判据必须跟着图形走，
    // 否则守的是图形本身而不是"有没有画"。
    const noteFills = calls.filter(
      (c) => c.method === 'fillStyle' && c.args[0] === '#f6be00',
    )
    const linkStrokes = calls.filter(
      (c) => c.method === 'strokeStyle' && c.args[0] === '#5b8cff',
    )
    expect(noteFills.length).toBeGreaterThan(0)
    expect(linkStrokes.length).toBeGreaterThan(0)
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
      theme: TEST_THEME,
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

/**
 * meta 行图标（PNG 端）：附件回形针与语音备注话筒。
 *
 * 这两个此前**根本没进 `rich`**，PNG 里自然也没有。它们都是描边/填充路径，
 * 用"只带这一个来源"的主题来测，颜色就成了有鉴别力的判据：
 *   - 回形针是 `stroke: #f6be00`（便签图标用的是同色的 **fill**，两者可区分）
 *   - 话筒囊体是 `fill: #e5484d`（priority 标记同色，故此处不放标记）
 */
describe('renderScene — 附件 / 语音备注图标', () => {
  function sceneWith(child: TopicSnapshot) {
    const layout = computeMindMapLayout(makeTopic('root', '中心', [child]))
    return buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      theme: TEST_THEME,
      enableCulling: false,
    })
  }

  function boundsOfChild(scene: ReturnType<typeof sceneWith>) {
    const node = scene.nodes.find(
      (n): n is Extract<typeof n, { type: 'topic' }> => n.type === 'topic' && n.id === 'child',
    )
    if (!node) throw new Error('场景里找不到 child')
    return node.bounds
  }

  it('只带附件的主题：节点右侧画出描边的回形针', () => {
    const { ctx, calls } = createMockCtx()
    const scene = sceneWith({
      id: 'child',
      text: '带附件',
      collapsed: false,
      children: [],
      attachment: { assetId: 'asset_pdf', name: '方案草案.pdf' },
    })
    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    const bounds = boundsOfChild(scene)
    const rightEdge = bounds.x + bounds.width
    const attachmentStrokes = calls.filter(
      (c) => c.method === 'strokeStyle' && c.args[0] === '#f6be00',
    )
    expect(attachmentStrokes.length, 'PNG 里没有画出附件回形针').toBeGreaterThan(0)
    // 描边确实发生在节点右侧的 meta 行区域（不能只是别处恰好用了同色）
    const strokesRightOfNode = calls.filter(
      (c) => c.method === 'lineTo' && (c.args[0] as number) > rightEdge,
    )
    expect(strokesRightOfNode.length).toBeGreaterThan(0)
    // 负向对照：没有备注，就不该出现"填充的黄色圆/便签"
    expect(calls.some((c) => c.method === 'fillStyle' && c.args[0] === '#f6be00')).toBe(false)
  })

  it('只带语音备注的主题：话筒囊体画成上下两个 r=1.6 的半圆，且方向朝外', () => {
    const { ctx, calls } = createMockCtx()
    const scene = sceneWith({
      id: 'child',
      text: '带语音',
      collapsed: false,
      children: [],
      voiceNote: { assetId: 'asset_voice', mimeType: 'audio/webm', durationMs: 3200 },
    })
    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    const bounds = boundsOfChild(scene)
    const nodeCenterY = bounds.y + bounds.height / 2
    expect(calls.some((c) => c.method === 'fillStyle' && c.args[0] === '#e5484d')).toBe(true)

    // 囊体由两段 r=1.6 的半圆组成：把每段按参数采样，看它们真正覆盖到的 y 范围。
    // viewBox 里囊体是 y 1.6→8.0、图标上沿在 nodeCenterY-7 → 世界坐标 -5.4 → +1.0。
    // 若 sweep 方向写反，两段弧会向**内**鼓，永远够不到这两个极值。
    const capsuleArcs = calls.filter(
      (c) => c.method === 'arc' && Math.abs((c.args[2] as number) - 1.6) < 1e-6,
    )
    expect(capsuleArcs.length, '话筒囊体没画出来（是不是又用回了 <rect>？）').toBe(2)

    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const centers = capsuleArcs.map((arc) => {
      const [cx, cy, r, start, end] = arc.args as number[]
      // `drawArcSegment` 传给 ctx.arc 的 `end` 已经带上方向（ccw 时 end < start），
      // 所以采样就是 start → end 的线性插值；再按 ccw 反向插值会把方向绕回来。
      for (let step = 0; step <= 64; step += 1) {
        const theta = start + ((end - start) * step) / 64
        const y = cy + r * Math.sin(theta)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
      return { cx, cy }
    })

    // 两段半圆的圆心必须在同一条竖中轴上，纵向相距正好 3.2（viewBox 6.4 - 3.2）
    expect(centers[0].cx).toBeCloseTo(centers[1].cx, 6)
    expect(Math.abs(centers[0].cy - centers[1].cy)).toBeCloseTo(3.2, 6)
    // 采样后的极值必须落在囊体真正的上下沿
    expect(minY).toBeCloseTo(nodeCenterY - 5.4, 4)
    expect(maxY).toBeCloseTo(nodeCenterY + 1.0, 4)
  })

  /**
   * `people` 标记的"身体"是一条用**紧凑 flag 写法**写的半圆：
   * `M1.5 11.5a3.5 3.5 0 017 0z`（= 0 0 1 7 0）。
   *
   * 回归：旧分词器把 `017` 读成数字 17，这条弧只剩 5 个参数、不足 7 个，
   * `buildPath` 整个跳过 —— PNG 里这个小人的身体是空的，而 SVG 与屏幕都正常。
   */
  it('people 标记的圆弧被真的画出来（紧凑 flag 写法的回归）', () => {
    const { ctx, calls } = createMockCtx()
    const scene = sceneWith({
      id: 'child',
      text: '带小人标记',
      collapsed: false,
      children: [],
      markers: [{ id: 'people' }],
    })
    renderScene(ctx, scene, defaultViewport, defaultCamera, 1)

    const bounds = boundsOfChild(scene)
    const nodeCenterY = bounds.y + bounds.height / 2
    const iconY = nodeCenterY - 7 // RICH_ICON_SIZE / 2
    // 身体弧的圆心在 viewBox (5, 11.5)、r = 3.5
    const bodyArcs = calls.filter(
      (c) => c.method === 'arc' && Math.abs((c.args[2] as number) - 3.5) < 1e-6,
    )
    expect(bodyArcs, 'people 标记的身体弧在 PNG 里被丢掉了').toHaveLength(1)
    expect(bodyArcs[0].args[1] as number).toBeCloseTo(iconY + 11.5, 6)
  })
})

/**
 * 画布级插画（PNG 端）。
 *
 * jsdom 没有 Path2D，用替身接住 `d` 字符串——这样断言的是
 * "画的是哪条路径、缩放多少"，而不是"有没有调用某个方法"。
 */
class FakePath2D {
  readonly d: string

  constructor(d: string) {
    this.d = d
  }
}

describe('画布级插画绘制', () => {
  function withFakePath2D<T>(run: () => T): T {
    const globalWithPath = globalThis as unknown as { Path2D?: unknown }
    const original = globalWithPath.Path2D
    globalWithPath.Path2D = FakePath2D
    try {
      return run()
    } finally {
      globalWithPath.Path2D = original
    }
  }

  it('按中心平移 + size/viewBox 缩放，并用素材自己的 path', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      illustrations: [{ id: 'ill_1', illustrationId: 'rocket', x: 40, y: 20, size: 128 }],
      theme: TEST_THEME,
      enableCulling: false,
    })

    const { ctx, calls } = createMockCtx()
    withFakePath2D(() => renderScene(ctx, scene, defaultViewport, defaultCamera, 1))

    const cx = 40 + layout.offsetX
    const cy = 20 + layout.offsetY
    const translates = calls.filter((c) => c.method === 'translate').map((c) => c.args)
    expect(translates).toContainEqual([cx, cy])
    // 末尾再平移半个 viewBox，把中心对到 (cx, cy)
    expect(translates).toContainEqual([-32, -32])
    expect(calls.filter((c) => c.method === 'scale').map((c) => c.args)).toContainEqual([2, 2])
    // 至少画了一次（火箭有多个图元）
    expect(calls.filter((c) => c.method === 'fill').length).toBeGreaterThan(0)
  })

  it('drawIllustrations=false 时不画插画（其余层不受影响）', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      illustrations: [{ id: 'ill_1', illustrationId: 'rocket', x: 40, y: 20, size: 128 }],
      theme: TEST_THEME,
      enableCulling: false,
    })

    const { ctx, calls } = createMockCtx()
    withFakePath2D(() =>
      renderScene(ctx, scene, defaultViewport, defaultCamera, 1, { drawIllustrations: false }),
    )

    expect(calls.some((c) => c.method === 'translate' && c.args[0] === 40 + layout.offsetX)).toBe(
      false,
    )
  })

  it('未知素材 id 静默跳过（不抛错、不中断导出）', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      illustrations: [{ id: 'ill_x', illustrationId: 'not-a-real-id', x: 0, y: 0, size: 96 }],
      theme: TEST_THEME,
      enableCulling: false,
    })

    const { ctx } = createMockCtx()
    expect(() =>
      withFakePath2D(() => renderScene(ctx, scene, defaultViewport, defaultCamera, 1)),
    ).not.toThrow()
  })
})
