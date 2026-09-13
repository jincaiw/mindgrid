import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from '../../../lib/document/types'
import { computeLayout } from './index'
import { computeBraceLayout } from './brace-layout'
import { computeBubbleLayout } from './bubble-layout'
import { computeFishboneLayout } from './fishbone-layout'
import { computeLogicLayout } from './logic-layout'
import { computeMatrixLayout } from './matrix-layout'
import { computeOrgLayout } from './org-layout'
import { computeTimelineLayout } from './timeline-layout'
import { computeTreeLayout } from './tree-layout'
import { computeTreeTableLayout } from './tree-table-layout'

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
    const types = [
      'logic',
      'tree',
      'org',
      'fishbone',
      'timeline',
      'brace',
      'matrix',
      'bubble',
      'treetable',
    ] as const
    for (const chartType of types) {
      const layout = computeLayout(root, chartType)
      expect(layout.nodes.length).toBe(7)
      expect(layout.edges.length).toBe(6)
    }
  })
})

describe('mindmap layout options', () => {
  it('compact reduces the scene height without moving the root', () => {
    const root = makeTopic('root', 'Root', [
      makeTopic('a', 'Alpha', [makeTopic('a1', 'Alpha-1'), makeTopic('a2', 'Alpha-2')]),
      makeTopic('b', 'Beta', [makeTopic('b1', 'Beta-1'), makeTopic('b2', 'Beta-2')]),
      makeTopic('c', 'Gamma', [makeTopic('c1', 'Gamma-1'), makeTopic('c2', 'Gamma-2')]),
    ])
    const regular = computeLayout(root, 'mindmap')
    const compact = computeLayout(root, 'mindmap', undefined, { compact: true })

    expect(compact.height).toBeLessThan(regular.height)
    expect(compact.nodes.find((node) => node.id === 'root')?.y).toBe(0)
  })

  it('balance distributes root subtrees by leaf weight', () => {
    const root = makeTopic('root', 'Root', [
      makeTopic('heavy', 'Heavy', [
        makeTopic('h1', 'H1', [makeTopic('h1a', 'H1A'), makeTopic('h1b', 'H1B')]),
        makeTopic('h2', 'H2', [makeTopic('h2a', 'H2A'), makeTopic('h2b', 'H2B')]),
      ]),
      makeTopic('light-a', 'Light A'),
      makeTopic('light-b', 'Light B'),
    ])
    const balanced = computeLayout(root, 'mindmap', undefined, { balance: true })
    const directChildren = balanced.nodes.filter((node) => node.depth === 1)
    const leftWeight = directChildren
      .filter((node) => node.side === 'left')
      .reduce((sum, node) => sum + (node.id === 'heavy' ? 4 : 1), 0)
    const rightWeight = directChildren
      .filter((node) => node.side === 'right')
      .reduce((sum) => sum + 1, 0)

    expect(directChildren.map((node) => [node.id, node.side])).toEqual([
      ['heavy', 'left'],
      ['light-a', 'right'],
      ['light-b', 'right'],
    ])
    expect(Math.abs(leftWeight - rightWeight)).toBeLessThan(4)
  })

  it('aligns direct siblings to a stable compact row spacing', () => {
    const root = makeTopic('root', 'Root', [
      makeTopic('a', 'Alpha', [makeTopic('a1', 'A1'), makeTopic('a2', 'A2')]),
      makeTopic('b', 'Beta'),
      makeTopic('c', 'Gamma', [makeTopic('c1', 'C1')]),
      makeTopic('d', 'Delta'),
    ])
    const aligned = computeLayout(root, 'mindmap', undefined, { alignSiblings: true })
    const rightChildren = aligned.nodes
      .filter((node) => node.depth === 1 && node.side === 'right')
      .sort((a, b) => a.y - b.y)

    expect(rightChildren).toHaveLength(2)
    expect(rightChildren[1].y - rightChildren[0].y).toBe(98)
  })

  it('keeps variable-height subtrees from overlapping', () => {
    const root = makeTopic('root', 'Root', [
      makeTopic('long', 'Long', [
        makeTopic('long-1', 'Long 1', [
          makeTopic('long-1-a', 'Long 1 A'),
          makeTopic('long-1-b', 'Long 1 B'),
          makeTopic('long-1-c', 'Long 1 C'),
        ]),
        makeTopic('long-2', 'Long 2'),
      ]),
      makeTopic('short', 'Short'),
      makeTopic('short-2', 'Short 2'),
    ])
    const layout = computeLayout(root, 'mindmap', undefined, {
      balance: true,
      compact: true,
      alignSiblings: true,
    })

    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i]
        const b = layout.nodes[j]
        if (a.depth !== b.depth || a.side !== b.side) continue
        const overlaps =
          Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
          Math.abs(a.y - b.y) < (a.height + b.height) / 2
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false)
      }
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

  it('places all first-level branches on one side when direction is set', () => {
    const root = makeRoot()
    const left = computeLayout(root, 'mindmap', undefined, { direction: 'left' })
    const right = computeLayout(root, 'mindmap', undefined, { direction: 'right' })

    const rootNode = (layout: ReturnType<typeof computeLayout>) =>
      layout.nodes.find((n) => n.id === root.id)!

    for (const child of root.children) {
      expect(left.nodes.find((n) => n.id === child.id)!.side).toBe('left')
      expect(right.nodes.find((n) => n.id === child.id)!.side).toBe('right')
    }

    // 全部放一侧后，该侧节点横坐标同号（左为负、右为正）
    expect(left.nodes.filter((n) => n.depth === 1).every((n) => n.x < rootNode(left).x)).toBe(
      true,
    )
    expect(
      right.nodes.filter((n) => n.depth === 1).every((n) => n.x > rootNode(right).x),
    ).toBe(true)
  })

  it('honours stored branch positions when free branch layout is on', () => {
    const root = makeRoot()
    const branch = root.children[0]
    const moved = {
      ...root,
      children: [
        {
          ...branch,
          layoutHints: { offsetX: 600, offsetY: -240 },
        },
        ...root.children.slice(1),
      ],
    }

    const auto = computeLayout(root, 'mindmap')
    const free = computeLayout(moved, 'mindmap', undefined, { freeBranch: true })

    const autoNode = auto.nodes.find((n) => n.id === branch.id)!
    const freeNode = free.nodes.find((n) => n.id === branch.id)!
    expect(freeNode.x).toBeCloseTo(600, 5)
    expect(freeNode.y).toBeCloseTo(-240, 5)
    expect(freeNode.x).not.toBeCloseTo(autoNode.x, 1)

    // 子树整体跟随：父与子的相对位置不变
    const childId = branch.children[0].id
    const autoChild = auto.nodes.find((n) => n.id === childId)!
    const freeChild = free.nodes.find((n) => n.id === childId)!
    expect(freeChild.x - freeNode.x).toBeCloseTo(autoChild.x - autoNode.x, 5)
    expect(freeChild.y - freeNode.y).toBeCloseTo(autoChild.y - autoNode.y, 5)

    // 连线跟着分支走：端点仍在子节点边框上
    const freeEdge = free.edges.find((e) => e.childId === branch.id)!
    expect(freeEdge.end.x).toBeCloseTo(freeNode.x - freeNode.width / 2, 5)
  })

  it('honours a per-topic fixed width from style overrides', () => {
    const root = makeRoot()
    const branch = { ...root.children[0], styleOverrides: { width: 320 } }
    const withWidth = { ...root, children: [branch, ...root.children.slice(1)] }

    const auto = computeLayout(root, 'mindmap')
    const fixed = computeLayout(withWidth, 'mindmap')

    const autoNode = auto.nodes.find((n) => n.id === root.children[0].id)!
    const fixedNode = fixed.nodes.find((n) => n.id === root.children[0].id)!

    expect(fixedNode.width).toBe(320)
    expect(fixedNode.width).not.toBe(autoNode.width)
    // 固定宽度会被夹到合法区间，防止极端值把布局撑坏
    const clamped = computeLayout(
      { ...root, children: [{ ...root.children[0], styleOverrides: { width: 9999 } }, ...root.children.slice(1)] },
      'mindmap',
    )
    expect(clamped.nodes.find((n) => n.id === root.children[0].id)!.width).toBeLessThanOrEqual(800)
  })

  it('separates overlapping free branches when topic stacking is off', () => {
    const root = makeRoot()
    const [first, second] = root.children
    // 把两个分支摆到几乎同一位置（故意重叠）
    const moved = {
      ...root,
      children: [
        { ...first, layoutHints: { offsetX: 300, offsetY: 0 } },
        { ...second, layoutHints: { offsetX: 300, offsetY: 4 } },
        ...root.children.slice(2),
      ],
    }

    const stacked = computeLayout(moved, 'mindmap', undefined, {
      freeBranch: true,
      stackTopics: true,
    })
    const separated = computeLayout(moved, 'mindmap', undefined, {
      freeBranch: true,
      stackTopics: false,
      stackGap: 20,
    })

    const box = (layout: ReturnType<typeof computeLayout>, id: string) =>
      layout.nodes.find((n) => n.id === id)!

    // 层叠打开：保持用户摆放的重叠
    const stackedGap =
      Math.abs(box(stacked, second.id).y - box(stacked, first.id).y)
    expect(stackedGap).toBeLessThan(10)

    // 层叠关闭：自动让开，间隙不小于设定的 stackGap
    const top = box(separated, first.id)
    const bottom = box(separated, second.id)
    const [upper, lower] = top.y <= bottom.y ? [top, bottom] : [bottom, top]
    expect(lower.y - lower.height / 2 - (upper.y + upper.height / 2)).toBeGreaterThanOrEqual(
      20 - 0.001,
    )

    // 只动被摆放过的分支：自动定位的第三个分支坐标不受影响
    const auto = computeLayout(moved, 'mindmap', undefined, { freeBranch: true })
    const thirdId = root.children[2].id
    expect(box(separated, thirdId).y).toBeCloseTo(box(auto, thirdId).y, 5)
  })

  it('ignores stored branch positions when free branch layout is off', () => {
    const root = makeRoot()
    const branch = root.children[0]
    const moved = {
      ...root,
      children: [
        { ...branch, layoutHints: { offsetX: 600, offsetY: -240 } },
        ...root.children.slice(1),
      ],
    }

    const auto = computeLayout(root, 'mindmap')
    const withHints = computeLayout(moved, 'mindmap')
    const autoNode = auto.nodes.find((n) => n.id === branch.id)!
    const hintedNode = withHints.nodes.find((n) => n.id === branch.id)!

    expect(hintedNode.x).toBeCloseTo(autoNode.x, 5)
    expect(hintedNode.y).toBeCloseTo(autoNode.y, 5)
  })

  it('keeps the alternating default when direction is omitted', () => {
    const root = makeRoot()
    const layout = computeLayout(root, 'mindmap')
    const sides = root.children.map(
      (child) => layout.nodes.find((n) => n.id === child.id)!.side,
    )

    expect(sides).toContain('left')
    expect(sides).toContain('right')
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

describe('computeBraceLayout', () => {
  it('expands columns to the right with brace elbow edges', () => {
    const layout = computeBraceLayout(makeRoot())
    assertCommonInvariants(layout, 'root', 7, 6)

    const root = layout.nodes.find((n) => n.id === 'root')!
    const childA = layout.nodes.find((n) => n.id === 'a')!
    const grandChild = layout.nodes.find((n) => n.id === 'a1')!

    // 子节点在根右侧，孙辈更靠右（逐列展开）
    expect(childA.x).toBeGreaterThan(root.x)
    expect(grandChild.x).toBeGreaterThan(childA.x)

    // 括号式边：起点在父节点右缘，终点在子节点左缘
    const edge = layout.edges.find((e) => e.parentId === 'root' && e.childId === 'a')!
    expect(edge).toBeDefined()
    expect(edge.start.x).toBeGreaterThan(root.x)
    expect(edge.end.x).toBeLessThan(childA.x)
  })
})

describe('computeMatrixLayout', () => {
  it('arranges level-1 topics as column headers with cells below', () => {
    const layout = computeMatrixLayout(makeRoot())
    assertCommonInvariants(layout, 'root', 7, 6)

    const headers = layout.nodes.filter((n) => n.depth === 1)
    expect(headers.length).toBe(3)

    // 列表头在同一行（y 相同），列 x 递增
    const ys = new Set(headers.map((h) => h.y))
    expect(ys.size).toBe(1)

    // 单元格（depth=2）在表头下方
    const cells = layout.nodes.filter((n) => n.depth === 2)
    expect(cells.length).toBe(3)
    for (const cell of cells) {
      const header = headers.find((h) => h.x === cell.x)
      expect(header).toBeDefined()
      expect(cell.y).toBeGreaterThan(header!.y)
    }
  })
})

describe('computeBubbleLayout', () => {
  it('places level-1 topics on a ring around centered root', () => {
    const layout = computeBubbleLayout(makeRoot())
    assertCommonInvariants(layout, 'root', 7, 6)

    const root = layout.nodes.find((n) => n.id === 'root')!
    expect(root.x).toBe(0)
    expect(root.y).toBe(0)

    // 所有 depth=1 节点到根的距离相等（同一环）
    const ring = layout.nodes.filter((n) => n.depth === 1)
    expect(ring.length).toBe(3)
    const distances = ring.map((n) => Math.hypot(n.x - root.x, n.y - root.y))
    for (const distance of distances) {
      expect(Math.abs(distance - distances[0])).toBeLessThan(0.001)
    }

    // depth=2 在更外层环上
    const outer = layout.nodes.filter((n) => n.depth === 2)
    expect(outer.length).toBe(3)
    for (const node of outer) {
      expect(Math.hypot(node.x, node.y)).toBeGreaterThan(distances[0])
    }
  })
})

describe('all layouts handle edge cases', () => {
  const layouts = [
    { name: 'logic', fn: computeLogicLayout },
    { name: 'tree', fn: computeTreeLayout },
    { name: 'org', fn: computeOrgLayout },
    { name: 'fishbone', fn: computeFishboneLayout },
    { name: 'timeline', fn: computeTimelineLayout },
    { name: 'brace', fn: computeBraceLayout },
    { name: 'matrix', fn: computeMatrixLayout },
    { name: 'bubble', fn: computeBubbleLayout },
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

describe('computeTreeTableLayout', () => {
  it('puts every level in its own column with strictly increasing x', () => {
    const root = makeRoot()
    const layout = computeTreeTableLayout(root)

    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    for (const node of layout.nodes) {
      for (const child of node.topic.children) {
        const childNode = byId.get(child.id)
        expect(childNode).toBeDefined()
        expect(childNode!.depth).toBe(node.depth + 1)
        expect(childNode!.x).toBeGreaterThan(node.x)
      }
    }
  })

  it('aligns all cells of the same depth to a shared column center', () => {
    const root = makeRoot()
    const layout = computeTreeTableLayout(root)

    const perDepth = new Map<number, Set<number>>()
    for (const node of layout.nodes) {
      const set = perDepth.get(node.depth) ?? new Set<number>()
      set.add(node.x)
      perDepth.set(node.depth, set)
    }

    for (const centers of perDepth.values()) {
      expect(centers.size).toBe(1)
    }
  })

  it('gives one row to each leaf and merges parents across their subtree rows', () => {
    const root = makeRoot()
    const layout = computeTreeTableLayout(root)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))

    const leaves = layout.nodes.filter((n) => n.topic.children.length === 0)
    const leafTops = leaves.map((n) => n.y - n.height / 2).sort((a, b) => a - b)
    // 每个叶子占据互不相同的行
    expect(new Set(leafTops).size).toBe(leaves.length)

    for (const node of layout.nodes) {
      if (node.topic.children.length === 0) continue
      const childTops = node.topic.children.map((c) => {
        const childNode = byId.get(c.id)!
        return childNode.y - childNode.height / 2
      })
      const childBottoms = node.topic.children.map((c) => {
        const childNode = byId.get(c.id)!
        return childNode.y + childNode.height / 2
      })
      // 父单元格纵向覆盖其全部子单元格
      expect(node.y - node.height / 2).toBeLessThanOrEqual(Math.min(...childTops))
      expect(node.y + node.height / 2).toBeGreaterThanOrEqual(Math.max(...childBottoms))
    }
  })

  it('treats collapsed branches as a single row without descendants', () => {
    const root: TopicSnapshot = {
      id: 'root',
      text: 'Root',
      collapsed: false,
      children: [
        { id: 'a', text: 'A', collapsed: true, children: [makeTopic('a1', 'A-1')] },
        makeTopic('b', 'B'),
      ],
    }

    const layout = computeTreeTableLayout(root)
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'root'])
    // 折叠分支不产生边
    expect(layout.edges.map((e) => e.childId)).toEqual(['a', 'b'])
  })

  it('keeps every cell inside the reported layout bounds', () => {
    const root = makeRoot()
    const layout = computeTreeTableLayout(root)

    for (const node of layout.nodes) {
      const left = node.x - node.width / 2 + layout.offsetX
      const right = node.x + node.width / 2 + layout.offsetX
      expect(left).toBeGreaterThanOrEqual(0)
      expect(right).toBeLessThanOrEqual(layout.width)
    }
  })
})
