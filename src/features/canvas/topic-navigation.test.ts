import { describe, expect, it } from 'vitest'
import { findNearestNodeInDirection } from './topic-navigation'
import type { MindMapNodeLayout } from './mindmap-layout'
import type { TopicSnapshot } from '../../lib/document/types'

function makeNode(
  id: string,
  x: number,
  y: number,
  overrides: Partial<MindMapNodeLayout> = {},
): MindMapNodeLayout {
  const topic: TopicSnapshot = {
    id,
    text: id,
    collapsed: false,
    children: [],
  }
  return {
    id,
    topic,
    depth: 0,
    side: 'center',
    x,
    y,
    width: 120,
    height: 40,
    ...overrides,
  }
}

describe('findNearestNodeInDirection', () => {
  it('returns null when the current node is not in the list', () => {
    const nodes = [makeNode('a', 0, 0)]
    expect(findNearestNodeInDirection(nodes, 'missing', 'right')).toBeNull()
  })

  it('moves right to the nearest node on the right side', () => {
    const nodes = [
      makeNode('root', 0, 0),
      makeNode('right_near', 200, 10), // 正前方略偏下
      makeNode('right_far', 400, 0),
    ]

    const next = findNearestNodeInDirection(nodes, 'root', 'right')
    expect(next?.id).toBe('right_near')
  })

  it('prefers the node directly ahead over a closer-but-perpendicular node', () => {
    const nodes = [
      makeNode('root', 0, 0),
      makeNode('ahead', 200, 0), // 正前方
      makeNode('perp', 150, 300), // 右侧但远离正前方
    ]

    const next = findNearestNodeInDirection(nodes, 'root', 'right')
    expect(next?.id).toBe('ahead')
  })

  it('moves down to the nearest node below', () => {
    const nodes = [
      makeNode('root', 0, 0),
      makeNode('below', 20, 200),
      makeNode('below_far', 0, 400),
    ]

    const next = findNearestNodeInDirection(nodes, 'root', 'down')
    expect(next?.id).toBe('below')
  })

  it('moves left ignoring nodes on the right', () => {
    const nodes = [
      makeNode('root', 0, 0),
      makeNode('right', 200, 0),
      makeNode('left', -200, 0),
    ]

    expect(findNearestNodeInDirection(nodes, 'root', 'left')?.id).toBe('left')
    expect(findNearestNodeInDirection(nodes, 'root', 'right')?.id).toBe('right')
  })

  it('moves up to the nearest node above', () => {
    const nodes = [
      makeNode('root', 0, 0),
      makeNode('above', -10, -200),
      makeNode('above_far', 0, -400),
    ]

    const next = findNearestNodeInDirection(nodes, 'root', 'up')
    expect(next?.id).toBe('above')
  })

  it('returns null when no node exists in the direction', () => {
    const nodes = [
      makeNode('root', 0, 0),
      makeNode('right', 200, 0),
    ]

    expect(findNearestNodeInDirection(nodes, 'root', 'left')).toBeNull()
  })
})
