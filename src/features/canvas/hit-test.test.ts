import { describe, expect, it } from 'vitest'
import { createDefaultDocument } from '../../lib/document/default-document'
import { createDefaultCamera } from './camera'
import {
  canDropTopicOnTarget,
  collectNodesInViewportRect,
  createViewportRectFromPoints,
  hitTestNodeAtViewportPoint,
} from './hit-test'
import { computeMindMapLayout } from './mindmap-layout'

describe('hitTestNodeAtViewportPoint', () => {
  it('returns the deepest node at the viewport point', () => {
    const rootTopic = createDefaultDocument().sheets[0].rootTopic
    const layout = computeMindMapLayout(rootTopic)
    const child = layout.nodes.find((node) => node.depth === 1)!

    const hit = hitTestNodeAtViewportPoint(
      layout.nodes,
      layout.offsetX,
      layout.offsetY,
      createDefaultCamera(),
      { x: child.x + layout.offsetX, y: child.y + layout.offsetY },
    )

    expect(hit?.id).toBe(child.id)
  })
})

describe('collectNodesInViewportRect', () => {
  it('returns nodes intersecting the selection rectangle', () => {
    const rootTopic = createDefaultDocument().sheets[0].rootTopic
    const layout = computeMindMapLayout(rootTopic)
    const rect = createViewportRectFromPoints(
      { x: layout.offsetX - 20, y: layout.offsetY - 20 },
      { x: layout.offsetX + 80, y: layout.offsetY + 80 },
    )

    const selected = collectNodesInViewportRect(
      layout.nodes,
      layout.offsetX,
      layout.offsetY,
      createDefaultCamera(),
      rect,
    )

    expect(selected.some((node) => node.depth === 0)).toBe(true)
  })
})

describe('canDropTopicOnTarget', () => {
  it('rejects dropping a topic into its own subtree', () => {
    const rootTopic = createDefaultDocument().sheets[0].rootTopic
    const child = rootTopic.children[0]

    expect(canDropTopicOnTarget(rootTopic, child.id, child.id)).toBe(false)
    expect(canDropTopicOnTarget(rootTopic, child.id, rootTopic.id)).toBe(true)
  })
})
