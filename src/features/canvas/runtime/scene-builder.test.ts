import { describe, expect, it } from 'vitest'
import type { Boundary, Relationship, SummaryNode, TopicSnapshot } from '../../../lib/document/types'
import { computeMindMapLayout } from '../mindmap-layout'
import {
  buildBranchIndexMap,
  buildScene,
  type InteractionOverlays,
  type TopicVisualStates,
} from './scene-builder'
import type { CameraProjection, Viewport } from './render-tree'
import { BRANCH_COLORS } from './style-constants'
import { getTheme } from '../../../lib/document/themes'
import {
  DEFAULT_CANVAS_SETTINGS,
  resolveBranchPalette,
  type DocumentCanvasSettings,
} from '../../../lib/document/canvas-settings'

function makeTopic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

function makeRoot(): TopicSnapshot {
  return makeTopic('root', 'Root', [
    makeTopic('a', 'Alpha', [makeTopic('a1', 'Alpha 1'), makeTopic('a2', 'Alpha 2')]),
    makeTopic('b', 'Beta'),
  ])
}

const defaultViewport: Viewport = { width: 1920, height: 1080 }
const defaultCamera: CameraProjection = { x: 0, y: 0, zoom: 1 }
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

describe('buildScene', () => {
  it('produces nodes for all topics and edges', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    const topicNodes = scene.nodes.filter((n) => n.type === 'topic')
    const edgeNodes = scene.nodes.filter((n) => n.type === 'edge')

    // root, a, a1, a2, b = 5 topics
    expect(topicNodes).toHaveLength(5)
    // root->a, root->b, a->a1, a->a2 = 4 edges
    expect(edgeNodes).toHaveLength(4)
  })

  it('anchors every edge on its parent and child node borders (offset applied)', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    const topicById = new Map(
      scene.nodes.filter((n) => n.type === 'topic').map((n) => [n.id, n]),
    )
    const edges = scene.nodes.filter((n) => n.type === 'edge')
    expect(edges.length).toBeGreaterThan(0)

    for (const edge of edges) {
      const parent = topicById.get(edge.parentId)!
      const child = topicById.get(edge.childId)!
      expect(parent).toBeDefined()
      expect(child).toBeDefined()

      // 连线的起点必须落在父节点边框上（横向 x 相差不超过 0.001，纵向在父节点范围内）。
      // 布局产出的边是根相对坐标，场景构建漏掉 layout.offset 时这根线会整体偏移
      // （偏移量 = 场景内边线位置与节点位置之差），此断言即为此缺陷的守门测试。
      const startOnParent =
        Math.abs(edge.start.x - (parent.bounds.x + parent.bounds.width)) < 0.001 ||
        Math.abs(edge.start.x - parent.bounds.x) < 0.001
      expect(startOnParent).toBe(true)
      expect(edge.start.y).toBeGreaterThanOrEqual(parent.bounds.y - 0.001)
      expect(edge.start.y).toBeLessThanOrEqual(
        parent.bounds.y + parent.bounds.height + 0.001,
      )

      const endOnChild =
        Math.abs(edge.end.x - child.bounds.x) < 0.001 ||
        Math.abs(edge.end.x - (child.bounds.x + child.bounds.width)) < 0.001
      expect(endOnChild).toBe(true)
      expect(edge.end.y).toBeGreaterThanOrEqual(child.bounds.y - 0.001)
      expect(edge.end.y).toBeLessThanOrEqual(
        child.bounds.y + child.bounds.height + 0.001,
      )
    }
  })

  it('keeps edges inside the reported scene bounds', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    for (const edge of scene.nodes.filter((n) => n.type === 'edge')) {
      expect(edge.bounds.x).toBeGreaterThanOrEqual(0)
      expect(edge.bounds.y).toBeGreaterThanOrEqual(0)
      expect(edge.bounds.x + edge.bounds.width).toBeLessThanOrEqual(
        scene.worldBounds.width,
      )
      expect(edge.bounds.y + edge.bounds.height).toBeLessThanOrEqual(
        scene.worldBounds.height,
      )
    }
  })

  it('sets visual state correctly on topic nodes', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: {
        ...defaultVisualStates,
        activeTopicId: 'a',
        selectedTopicIds: new Set(['a', 'b']),
        editingTopicId: 'a1',
        searchMatchedTopicIds: new Set(['a2']),
      },
      overlays: defaultOverlays,
      enableCulling: false,
    })

    const topicNodes = scene.nodes.filter((n) => n.type === 'topic')
    const nodeA = topicNodes.find((n) => n.id === 'a')
    const nodeA1 = topicNodes.find((n) => n.id === 'a1')
    const nodeA2 = topicNodes.find((n) => n.id === 'a2')
    const nodeRoot = topicNodes.find((n) => n.id === 'root')

    expect(nodeA?.state.isActive).toBe(true)
    expect(nodeA?.state.isSelected).toBe(true)
    expect(nodeA1?.state.isEditing).toBe(true)
    expect(nodeA2?.state.isSearchMatch).toBe(true)
    expect(nodeRoot?.state.isActive).toBe(false)
  })

  it('marks edge as active when child is the active topic', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: { ...defaultVisualStates, activeTopicId: 'a' },
      overlays: defaultOverlays,
      enableCulling: false,
    })

    const edgeNodes = scene.nodes.filter((n) => n.type === 'edge')
    const edgeToA = edgeNodes.find((e) => e.type === 'edge' && e.childId === 'a')
    const edgeToB = edgeNodes.find((e) => e.type === 'edge' && e.childId === 'b')

    expect(edgeToA?.type).toBe('edge')
    if (edgeToA?.type === 'edge') {
      expect(edgeToA.isActive).toBe(true)
    }
    expect(edgeToB?.type).toBe('edge')
    if (edgeToB?.type === 'edge') {
      expect(edgeToB.isActive).toBe(false)
    }
  })

  it('culls nodes outside the viewport when culling is enabled', () => {
    const root = makeRoot()
    const layout = computeMindMapLayout(root)

    // Camera positioned far away so nothing is visible
    const farCamera: CameraProjection = { x: 100000, y: 100000, zoom: 1 }
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: farCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: true,
    })

    expect(scene.nodes).toHaveLength(0)
  })

  it('includes all nodes when culling is disabled', () => {
    const layout = computeMindMapLayout(makeRoot())
    const farCamera: CameraProjection = { x: 100000, y: 100000, zoom: 1 }
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: farCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    const topicNodes = scene.nodes.filter((n) => n.type === 'topic')
    expect(topicNodes).toHaveLength(5)
  })

  it('adds selection box overlay when provided', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: {
        ...defaultOverlays,
        selectionBox: { x: 10, y: 10, width: 200, height: 150 },
      },
      enableCulling: false,
    })

    const overlay = scene.nodes.find((n) => n.type === 'selection-box')
    expect(overlay).toBeDefined()
    expect(overlay?.type).toBe('selection-box')
    if (overlay?.type === 'selection-box') {
      expect(overlay.bounds).toEqual({ x: 10, y: 10, width: 200, height: 150 })
    }
  })

  it('adds drag preview overlay when provided', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: {
        ...defaultOverlays,
        dragPreview: {
          topicId: 'a',
          text: 'Alpha',
          depth: 1,
          side: 'right',
          bounds: { x: 100, y: 100, width: 140, height: 44 },
        },
      },
      enableCulling: false,
    })

    const overlay = scene.nodes.find((n) => n.type === 'drag-preview')
    expect(overlay).toBeDefined()
    if (overlay?.type === 'drag-preview') {
      expect(overlay.text).toBe('Alpha')
      expect(overlay.depth).toBe(1)
    }
  })

  it('preserves world bounds and offset from layout', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    expect(scene.worldBounds.width).toBe(layout.width)
    expect(scene.worldBounds.height).toBe(layout.height)
    expect(scene.offsetX).toBe(layout.offsetX)
    expect(scene.offsetY).toBe(layout.offsetY)
  })

  it('edge bounds encompass all control points', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      enableCulling: false,
    })

    const edgeNodes = scene.nodes.filter((n) => n.type === 'edge')
    for (const edge of edgeNodes) {
      if (edge.type !== 'edge') continue
      const { bounds, start, end, control1, control2 } = edge
      const minX = Math.min(start.x, end.x, control1.x, control2.x)
      const maxX = Math.max(start.x, end.x, control1.x, control2.x)
      const minY = Math.min(start.y, end.y, control1.y, control2.y)
      const maxY = Math.max(start.y, end.y, control1.y, control2.y)
      expect(bounds.x).toBe(minX)
      expect(bounds.y).toBe(minY)
      expect(bounds.x + bounds.width).toBe(maxX)
      expect(bounds.y + bounds.height).toBe(maxY)
    }
  })

  // ---- 装饰元素（关系线 / 边界 / 概要）----

  it('generates relationship render nodes from document relationships', () => {
    const layout = computeMindMapLayout(makeRoot())
    const relationships: Relationship[] = [
      { id: 'rel1', fromTopicId: 'a1', toTopicId: 'b', label: '依赖' },
    ]
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      relationships,
      enableCulling: false,
    })

    const relNodes = scene.nodes.filter((n) => n.type === 'relationship')
    expect(relNodes).toHaveLength(1)

    const rel = relNodes[0]
    expect(rel?.type).toBe('relationship')
    if (rel?.type === 'relationship') {
      expect(rel.id).toBe('rel1')
      expect(rel.label).toBe('依赖')
      // from/to 坐标应来自布局节点的世界中心
      const fromLayoutNode = layout.nodes.find((n) => n.id === 'a1')
      const toLayoutNode = layout.nodes.find((n) => n.id === 'b')
      expect(fromLayoutNode).toBeDefined()
      expect(toLayoutNode).toBeDefined()
      expect(rel.from.x).toBe(fromLayoutNode!.x + layout.offsetX)
      expect(rel.from.y).toBe(fromLayoutNode!.y + layout.offsetY)
      expect(rel.to.x).toBe(toLayoutNode!.x + layout.offsetX)
      expect(rel.to.y).toBe(toLayoutNode!.y + layout.offsetY)
    }
  })

  it('skips relationships referencing non-existent topics', () => {
    const layout = computeMindMapLayout(makeRoot())
    const relationships: Relationship[] = [
      { id: 'rel1', fromTopicId: 'a1', toTopicId: 'nonexistent', label: undefined },
    ]
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      relationships,
      enableCulling: false,
    })

    const relNodes = scene.nodes.filter((n) => n.type === 'relationship')
    expect(relNodes).toHaveLength(0)
  })

  it('generates boundary render nodes with bounds enclosing member topics', () => {
    const layout = computeMindMapLayout(makeRoot())
    const boundaries: Boundary[] = [
      { id: 'bnd1', topicIds: ['a1', 'a2'], label: '分组A' },
    ]
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      boundaries,
      enableCulling: false,
    })

    const bndNodes = scene.nodes.filter((n) => n.type === 'boundary')
    expect(bndNodes).toHaveLength(1)

    const bnd = bndNodes[0]
    expect(bnd?.type).toBe('boundary')
    if (bnd?.type === 'boundary') {
      expect(bnd.id).toBe('bnd1')
      expect(bnd.label).toBe('分组A')
      // bounds 应包含 a1 和 a2 的世界包围盒
      const a1Node = layout.nodes.find((n) => n.id === 'a1')!
      const a2Node = layout.nodes.find((n) => n.id === 'a2')!
      const a1Left = a1Node.x - a1Node.width / 2 + layout.offsetX
      const a1Top = a1Node.y - a1Node.height / 2 + layout.offsetY
      const a2Right = a2Node.x + a2Node.width / 2 + layout.offsetX
      const a2Bottom = a2Node.y + a2Node.height / 2 + layout.offsetY
      expect(bnd.bounds.x).toBeLessThanOrEqual(a1Left)
      expect(bnd.bounds.y).toBeLessThanOrEqual(a1Top)
      expect(bnd.bounds.x + bnd.bounds.width).toBeGreaterThanOrEqual(a2Right)
      expect(bnd.bounds.y + bnd.bounds.height).toBeGreaterThanOrEqual(a2Bottom)
    }
  })

  it('skips boundaries with no valid member topics', () => {
    const layout = computeMindMapLayout(makeRoot())
    const boundaries: Boundary[] = [
      { id: 'bnd1', topicIds: ['nonexistent1', 'nonexistent2'], label: undefined },
    ]
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      boundaries,
      enableCulling: false,
    })

    const bndNodes = scene.nodes.filter((n) => n.type === 'boundary')
    expect(bndNodes).toHaveLength(0)
  })

  it('generates summary render nodes with bracket anchor at right edge', () => {
    const layout = computeMindMapLayout(makeRoot())
    const summaries: SummaryNode[] = [
      { id: 'sum1', topicIds: ['a1', 'a2'], label: '总结' },
    ]
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      summaries,
      enableCulling: false,
    })

    const sumNodes = scene.nodes.filter((n) => n.type === 'summary')
    expect(sumNodes).toHaveLength(1)

    const sum = sumNodes[0]
    expect(sum?.type).toBe('summary')
    if (sum?.type === 'summary') {
      expect(sum.id).toBe('sum1')
      expect(sum.label).toBe('总结')
      // 锚点应在包围盒右边缘的中点
      expect(sum.anchor.x).toBe(sum.bounds.x + sum.bounds.width)
      expect(sum.anchor.y).toBe(sum.bounds.y + sum.bounds.height / 2)
    }
  })

  it('culls decoration nodes outside the viewport', () => {
    const layout = computeMindMapLayout(makeRoot())
    const relationships: Relationship[] = [
      { id: 'rel1', fromTopicId: 'a1', toTopicId: 'b', label: undefined },
    ]
    const boundaries: Boundary[] = [
      { id: 'bnd1', topicIds: ['a1', 'a2'], label: undefined },
    ]
    const summaries: SummaryNode[] = [
      { id: 'sum1', topicIds: ['a1', 'a2'], label: '总结' },
    ]

    // 相机远离所有内容
    const farCamera: CameraProjection = { x: 100000, y: 100000, zoom: 1 }
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: farCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      relationships,
      boundaries,
      summaries,
      enableCulling: true,
    })

    const relNodes = scene.nodes.filter((n) => n.type === 'relationship')
    const bndNodes = scene.nodes.filter((n) => n.type === 'boundary')
    const sumNodes = scene.nodes.filter((n) => n.type === 'summary')
    expect(relNodes).toHaveLength(0)
    expect(bndNodes).toHaveLength(0)
    expect(sumNodes).toHaveLength(0)
  })

  it('includes decorations alongside topics and edges when in viewport', () => {
    const layout = computeMindMapLayout(makeRoot())
    const relationships: Relationship[] = [
      { id: 'rel1', fromTopicId: 'a1', toTopicId: 'b', label: '关联' },
    ]
    const boundaries: Boundary[] = [
      { id: 'bnd1', topicIds: ['a1', 'a2'], label: '边界' },
    ]
    const summaries: SummaryNode[] = [
      { id: 'sum1', topicIds: ['a1', 'a2'], label: '概要' },
    ]
    const scene = buildScene({
      layout,
      viewport: defaultViewport,
      camera: defaultCamera,
      visualStates: defaultVisualStates,
      overlays: defaultOverlays,
      relationships,
      boundaries,
      summaries,
      enableCulling: false,
    })

    // 所有类型都应存在
    expect(scene.nodes.filter((n) => n.type === 'topic')).toHaveLength(5)
    expect(scene.nodes.filter((n) => n.type === 'edge')).toHaveLength(4)
    expect(scene.nodes.filter((n) => n.type === 'relationship')).toHaveLength(1)
    expect(scene.nodes.filter((n) => n.type === 'boundary')).toHaveLength(1)
    expect(scene.nodes.filter((n) => n.type === 'summary')).toHaveLength(1)
  })

  describe('分支连线配色', () => {
    /** 按连线终点（子主题 id）查分支色，避免依赖节点数组顺序。 */
    const buildEdges = (options: {
      themeId?: string
      colorPalette?: string[]
      canvasSettings?: Partial<DocumentCanvasSettings>
    }) => {
      const layout = computeMindMapLayout(makeRoot())
      const scene = buildScene({
        layout,
        viewport: defaultViewport,
        camera: defaultCamera,
        visualStates: defaultVisualStates,
        overlays: defaultOverlays,
        themeId: options.themeId,
        branchStyle: options.colorPalette ? { colorPalette: options.colorPalette } : undefined,
        canvasSettings: options.canvasSettings
          ? { ...DEFAULT_CANVAS_SETTINGS, ...options.canvasSettings }
          : undefined,
        enableCulling: false,
      })
      return scene.nodes.filter((n) => n.type === 'edge')
    }

    const branchColorByChild = (options: Parameters<typeof buildEdges>[0]) => {
      const map = new Map<string, string>()
      for (const node of buildEdges(options)) {
        map.set(node.childId, node.branchColor)
      }
      return map
    }

    it('无主题色板时沿用默认 8 色循环', () => {
      const colors = branchColorByChild({ themeId: 'classic-blue' })
      expect(colors.get('a')).toBe(BRANCH_COLORS[0])
      expect(colors.get('b')).toBe(BRANCH_COLORS[1])
    })

    it('缤纷主题用主题自带色板，且与分支节点填充同色', () => {
      const palette = getTheme('rainbow').branchPalette!
      const colors = branchColorByChild({ themeId: 'rainbow' })
      expect(colors.get('a')).toBe(palette[0])
      expect(colors.get('b')).toBe(palette[1])
    })

    it('后代连线继承所在分支的色，不重新计数', () => {
      const palette = getTheme('rainbow').branchPalette!
      const colors = branchColorByChild({ themeId: 'rainbow' })
      // a1、a2 属于分支 0，应与 a 同色而非顺延到 palette[1]
      expect(colors.get('a1')).toBe(palette[0])
      expect(colors.get('a2')).toBe(palette[0])
    })

    it('画布级自定义色板优先于主题色板', () => {
      const colors = branchColorByChild({
        themeId: 'rainbow',
        colorPalette: ['#111111', '#222222'],
      })
      expect(colors.get('a')).toBe('#111111')
      expect(colors.get('b')).toBe('#222222')
    })

    it('彩虹分支显式关闭时全部连线统一为单色（含缤纷主题）', () => {
      const single = getTheme('rainbow').edge
      const colors = branchColorByChild({
        themeId: 'rainbow',
        canvasSettings: { rainbowBranch: false },
      })
      expect(colors.get('a')).toBe(single)
      expect(colors.get('b')).toBe(single)
      expect(colors.get('a1')).toBe(single)
      // 确实退出了多色：两条一级分支不再异色
      expect(colors.get('a')).toBe(colors.get('b'))
    })

    it('彩虹分支显式开启时用画布设置里的预设色板', () => {
      const preset = resolveBranchPalette('ocean')
      const colors = branchColorByChild({
        themeId: 'classic-blue',
        canvasSettings: { rainbowBranch: true, branchPalette: 'ocean' },
      })
      expect(colors.get('a')).toBe(preset[0])
      expect(colors.get('b')).toBe(preset[1])
    })

    it('彩虹分支未设置（null）时跟随主题，不覆盖既有行为', () => {
      const colors = branchColorByChild({
        themeId: 'classic-blue',
        canvasSettings: { rainbowBranch: null },
      })
      expect(colors.get('a')).toBe(BRANCH_COLORS[0])
      expect(colors.get('b')).toBe(BRANCH_COLORS[1])
    })
  })

  describe('分支线粗细', () => {
    const lineWidthOfFirst = (options: {
      branchStyle?: { thickness?: number }
      canvasSettings?: Partial<DocumentCanvasSettings>
    }) => {
      const layout = computeMindMapLayout(makeRoot())
      const scene = buildScene({
        layout,
        viewport: defaultViewport,
        camera: defaultCamera,
        visualStates: defaultVisualStates,
        overlays: defaultOverlays,
        branchStyle: options.branchStyle,
        canvasSettings: options.canvasSettings
          ? { ...DEFAULT_CANVAS_SETTINGS, ...options.canvasSettings }
          : undefined,
        enableCulling: false,
      })
      const edge = scene.nodes.find((n) => n.type === 'edge')!
      return edge.lineWidth
    }

    it('画布设置的粗细档位生效', () => {
      const base = lineWidthOfFirst({ canvasSettings: { branchThickness: 'default' } })
      expect(lineWidthOfFirst({ canvasSettings: { branchThickness: 'thick' } })).toBeCloseTo(
        base * 2,
        5,
      )
      expect(lineWidthOfFirst({ canvasSettings: { branchThickness: 'thin' } })).toBeCloseTo(
        base * 0.75,
        5,
      )
    })

    it('滑杆值（branchStyle.thickness）优先于画布档位，二者不叠加', () => {
      const withSlider = lineWidthOfFirst({
        branchStyle: { thickness: 3 },
        canvasSettings: { branchThickness: 'thick' },
      })
      const sliderOnly = lineWidthOfFirst({ branchStyle: { thickness: 3 } })
      expect(withSlider).toBeCloseTo(sliderOnly, 5)
    })
  })

  describe('buildBranchIndexMap', () => {
    it('根的直接子节点按序编号，后代继承', () => {
      const layout = computeMindMapLayout(makeRoot())
      const map = buildBranchIndexMap(layout.nodes)
      expect(map.get('a')).toBe(0)
      expect(map.get('a1')).toBe(0)
      expect(map.get('a2')).toBe(0)
      expect(map.get('b')).toBe(1)
      // 根节点自身不参与分支编码
      expect(map.get('root')).toBeUndefined()
    })

    it('没有根节点时返回空映射', () => {
      expect(buildBranchIndexMap([]).size).toBe(0)
    })
  })
})
