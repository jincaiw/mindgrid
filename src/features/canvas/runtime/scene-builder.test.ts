import { describe, expect, it } from 'vitest'
import type { Boundary, Relationship, SummaryNode, TopicSnapshot } from '../../../lib/document/types'
import { computeMindMapLayout } from '../mindmap-layout'
import { buildScene, type InteractionOverlays, type TopicVisualStates } from './scene-builder'
import type { CameraProjection, Viewport } from './render-tree'

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
})
