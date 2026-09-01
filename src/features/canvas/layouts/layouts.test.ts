import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from '../../../lib/document/types'
import { computeLayout } from './index'
import { computeFishboneLayout } from './fishbone-layout'
import { computeLogicLayout } from './logic-layout'
import { computeOrgLayout } from './org-layout'
import { computeTimelineLayout } from './timeline-layout'
import { computeTreeLayout } from './tree-layout'

function makeTopic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

function makeRoot(): TopicSnapshot {
  return makeTopic('root', 'Root', [
    makeTopic('a', 'Alpha', [
      makeTopic('a1', 'Alpha-1'),
      makeTopic('a2', 'Alpha-2'),
    ]),
    makeTopic('b', 'Beta'),
    makeTopic('c', 'Gamma', [
      makeTopic('c1', 'Gamma-1'),
    ]),
  ])
}

// 所有布局共享的不变量测试
function assertCommonInvariants(
  layout: ReturnType<typeof computeLayout>,
  rootId: string,
  expectedNodeCount: number,
  expectedEdgeCount: number,
): void {
  expect(layout.nodes.length).toBe(expectedNodeCount)
  expect(layout.edges.length).toBe(expectedEdgeCount)
  expect(layout.width).toBeGreaterThan(0)
  expect(layout.height).toBeGreaterThan(0)

  // 所有节点位置有限
  for (const node of layout.nodes) {
    expect(Number.isFinite(node.x)).toBe(true)
    expect(Number.isFinite(node.y)).toBe(true)
    expect(Number.isFinite(node.width)).toBe(true)
    expect(Number.isFinite(node.height)).toBe(true)
  }

  // 根节点存在
  const root = layout.nodes.find((n) => n.id === rootId)
  expect(root).toBeDefined()
  expect(root!.depth).toBe(0)

  // 每条边的 parentId 和 childId 都对应已有节点
  const nodeIds = new Set(layout.nodes.map((n) => n.id))
  for (const edge of layout.edges) {
    expect(nodeIds.has(edge.parentId)).toBe(true)
    expect(nodeIds.has(edge.childId)).toBe(true)
    expect(edge.start).toBeDefined()
    expect(edge.end).toBeDefined()
    expect(edge.control1).toBeDefined()
    expect(edge.control2).toBeDefined()
  }

  // 无节点位置完全重叠（相同坐标 + 相同尺寸）
  for (let i = 0; i < layout.nodes.length; i++) {
    for (let j = i + 1; j < layout.nodes.length; j++) {
      const a = layout.nodes[i]
      const b = layout.nodes[j]
      if (a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height) {
        throw new Error(`节点 ${a.id} 和 ${b.id} 完全重叠于 (${a.x}, ${a.y})`)
      }
    }
  }
}

describe('computeLayout dispatcher', () => {
  it('routes to mindmap by default', () => {
    const root = makeRoot()
    const layout = computeLayout(root, undefined)
    expect(layout.nodes.length).toBe(7) // root + 3 children + 3 grandchildren
  })

  it('routes to each chart type', () => {
    const root = makeRoot()
    const types = ['logic', 'tree', 'org', 'fishbone', 'timeline'] as const
    for (const chartType of types) {
      const layout = computeLayout(root, chartType)
      expect(layout.nodes.length).toBe(7)
      expect(layout.edges.length).toBe(6)
    }
  })
})

describe('computeLayout with floating topics', () => {
  function makeFloatingTopic(
    id: string,
    text: string,
    offsetX: number,
    offsetY: number,
  ): TopicSnapshot {
    return {
      id,
      text,
      collapsed: false,
      children: [],
      layoutHints: { offsetX, offsetY },
    }
  }

  it('includes floating topics as layout nodes without adding edges', () => {
    const root = makeRoot()
    const floating = [
      makeFloatingTopic('f1', 'Floating 1', 400, -200),
      makeFloatingTopic('f2', 'Floating 2', -300, 250),
    ]
    const layout = computeLayout(root, 'mindmap', floating)

    // 7 tree nodes + 2 floating
    expect(layout.nodes.length).toBe(9)
    // Edges unchanged (floating topics have no parent-child edges)
    expect(layout.edges.length).toBe(6)

    // Floating nodes present
    const f1 = layout.nodes.find((n) => n.id === 'f1')
    expect(f1).toBeDefined()
    expect(f1!.x).toBe(400)
    expect(f1!.y).toBe(-200)

    const f2 = layout.nodes.find((n) => n.id === 'f2')
    expect(f2).toBeDefined()
    expect(f2!.x).toBe(-300)
    expect(f2!.y).toBe(250)
  })

  it('returns unchanged layout when no floating topics', () => {
    const root = makeRoot()
    const layout = computeLayout(root, 'mindmap', undefined)
    const layoutEmpty = computeLayout(root, 'mindmap', [])

    expect(layout.nodes.length).toBe(7)
    expect(layoutEmpty.nodes.length).toBe(7)
    expect(layoutEmpty.offsetX).toBe(layout.offsetX)
    expect(layoutEmpty.offsetY).toBe(layout.offsetY)
  })

  it('expands bounds to include floating topics outside tree bounds', () => {
    const root = makeRoot()
    const farFloating = [makeFloatingTopic('far', 'Far Away', 5000, 5000)]
    const baseLayout = computeLayout(root, 'mindmap')
    const layout = computeLayout(root, 'mindmap', farFloating)

    // Layout must be large enough to contain the far floating topic
    expect(layout.width).toBeGreaterThan(baseLayout.width)
    expect(layout.height).toBeGreaterThan(baseLayout.height)
  })
})

describe('computeLogicLayout', () => {
  it('places root at leftmost, children to the right', () => {
    const layout = computeLogicLayout(makeRoot())
    assertCommonInvariants(layout, 'root', 7, 6)

    const root = layout.nodes.find((n) => n.id === 'root')!
    const childA = layout.nodes.find((n) => n.id === 'a')!

    // 子节点在根节点右侧
    expect(childA.x).toBeGreaterThan(root.x)
  })

  it('handles collapsed root', () => {
    const root = makeTopic('root', 'Root')
    root.collapsed = true
    root.children = [makeTopic('hidden', 'Hidden')]
    const layout = computeLogicLayout(root)
    expect(layout.nodes.length).toBe(1)
    expect(layout.edges.length).toBe(0)
  })
})

describe('computeTreeLayout', () => {
  it('places root at top, children below', () => {
    const layout = computeTreeLayout(makeRoot())
    assertCommonInvariants(layout, 'root', 7, 6)

    const root = layout.nodes.find((n) => n.id === 'root')!
    const childA = layout.nodes.find((n) => n.id === 'a')!

    // 子节点在根节点下方
    expect(childA.y).toBeGreaterThan(root.y)
  })

  it('handles single root with no children', () => {
    const layout = computeTreeLayout(makeTopic('solo', 'Solo'))
    expect(layout.nodes.length).toBe(1)
    expect(layout.edges.length).toBe(0)
    expect(layout.width).toBeGreaterThan(0)
  })
})

describe('computeOrgLayout', () => {
  it('places children centered under parent', () => {
    const layout = computeOrgLayout(makeRoot())
    assertCommonInvariants(layout, 'root', 7, 6)

    const root = layout.nodes.find((n) => n.id === 'root')!
    const children = layout.nodes.filter((n) => n.depth === 1)

    // 所有 depth=1 节点在 root 下方
    for (const child of children) {
      expect(child.y).toBeGreaterThan(root.y)
    }

    // 子节点的中心 x 分布在 root 的左右
    const childXs = children.map((c) => c.x).sort((a, b) => a - b)
    // root 应大致在子节点的水平中点附近
    const midX = (childXs[0] + childXs[childXs.length - 1]) / 2
    expect(Math.abs(midX - root.x)).toBeLessThan(100)
  })
})

describe('computeFishboneLayout', () => {
  it('places root at right, causes alternate above/below', () => {
    const root = makeRoot()
    const layout = computeFishboneLayout(root)
    assertCommonInvariants(layout, 'root', 7, 6)

    const rootNode = layout.nodes.find((n) => n.id === 'root')!
    const causes = layout.nodes.filter((n) => n.depth === 1)

    // 根节点在最右侧
    for (const cause of causes) {
      expect(cause.x).toBeLessThan(rootNode.x)
    }

    // 原因上下交替（至少有一个 y > 0 和一个 y < 0）
    const aboveCount = causes.filter((c) => c.y < 0).length
    const belowCount = causes.filter((c) => c.y > 0).length
    expect(aboveCount).toBeGreaterThan(0)
    expect(belowCount).toBeGreaterThan(0)
  })

  it('handles single cause (no alternation needed)', () => {
    const root = makeTopic('root', 'Root', [makeTopic('only', 'Only Cause')])
    const layout = computeFishboneLayout(root)
    expect(layout.nodes.length).toBe(2)
    expect(layout.edges.length).toBe(1)
  })
})

describe('computeTimelineLayout', () => {
  it('places events sequentially along horizontal axis', () => {
    const layout = computeTimelineLayout(makeRoot())
    assertCommonInvariants(layout, 'root', 7, 6)

    const events = layout.nodes.filter((n) => n.depth === 1)
    // 事件 x 坐标递增
    for (let i = 1; i < events.length; i++) {
      const prev = events.find((e) => e.id === ['a', 'b', 'c'][i - 1])!
      const curr = events.find((e) => e.id === ['a', 'b', 'c'][i])!
      expect(curr.x).toBeGreaterThan(prev.x)
    }
  })

  it('chains events with edges between consecutive nodes', () => {
    const root = makeTopic('root', 'Root', [
      makeTopic('e1', 'Event 1'),
      makeTopic('e2', 'Event 2'),
      makeTopic('e3', 'Event 3'),
    ])
    const layout = computeTimelineLayout(root)
    expect(layout.edges.length).toBe(3)
    // root → e1, e1 → e2, e2 → e3
    expect(layout.edges[0].parentId).toBe('root')
    expect(layout.edges[0].childId).toBe('e1')
    expect(layout.edges[1].parentId).toBe('e1')
    expect(layout.edges[1].childId).toBe('e2')
  })
})

describe('all layouts handle edge cases', () => {
  const layouts = [
    { name: 'logic', fn: computeLogicLayout },
    { name: 'tree', fn: computeTreeLayout },
    { name: 'org', fn: computeOrgLayout },
    { name: 'fishbone', fn: computeFishboneLayout },
    { name: 'timeline', fn: computeTimelineLayout },
  ]

  for (const { name, fn } of layouts) {
    it(`${name} handles empty root (no children)`, () => {
      const layout = fn(makeTopic('solo', 'Solo'))
      expect(layout.nodes.length).toBe(1)
      expect(layout.edges.length).toBe(0)
    })

    it(`${name} handles collapsed root`, () => {
      const root = makeTopic('root', 'Root', [makeTopic('hidden', 'Hidden')])
      root.collapsed = true
      const layout = fn(root)
      expect(layout.nodes.length).toBe(1)
      expect(layout.edges.length).toBe(0)
    })

    it(`${name} produces valid edge geometry`, () => {
      const layout = fn(makeRoot())
      for (const edge of layout.edges) {
        expect(edge.path).toBeTruthy()
        expect(edge.path.startsWith('M')).toBe(true)
        expect(Number.isFinite(edge.start.x)).toBe(true)
        expect(Number.isFinite(edge.start.y)).toBe(true)
        expect(Number.isFinite(edge.end.x)).toBe(true)
        expect(Number.isFinite(edge.end.y)).toBe(true)
      }
    })
  }
})
