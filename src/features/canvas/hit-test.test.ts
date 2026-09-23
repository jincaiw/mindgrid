import { describe, expect, it } from 'vitest'
import { createDefaultDocument } from '../../lib/document/default-document'
import { createDefaultCamera } from './camera'
import {
  canDropTopicOnTarget,
  collectNodesInViewportRect,
  createViewportRectFromPoints,
  hitTestIllustrationAtViewportPoint,
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

describe('hitTestIllustrationAtViewportPoint', () => {
  const illustrations = [
    { id: 'ill_1', x: 0, y: 0, size: 100 },
    { id: 'ill_2', x: 40, y: 0, size: 100 },
  ]

  it('命中中心落在盒内的那一张', () => {
    const hit = hitTestIllustrationAtViewportPoint(
      illustrations,
      0,
      0,
      createDefaultCamera(),
      { x: -20, y: 0 },
    )

    expect(hit?.id).toBe('ill_1')
  })

  it('重叠时返回**最上面**那张（数组顺序即绘制顺序）', () => {
    // (0,0) 同时落在两张里：后画的（ill_2）盖在上面，应当命中它
    const hit = hitTestIllustrationAtViewportPoint(
      illustrations,
      0,
      0,
      createDefaultCamera(),
      { x: 0, y: 0 },
    )

    expect(hit?.id).toBe('ill_2')
  })

  it('把 layout.offset 算进去（否则画布一平移就点不中）', () => {
    const hit = hitTestIllustrationAtViewportPoint(
      illustrations,
      300,
      120,
      createDefaultCamera(),
      { x: 300, y: 120 },
    )

    expect(hit?.id).toBe('ill_2')
  })

  it('尊重相机的平移与缩放', () => {
    const camera = { x: 200, y: 100, zoom: 2 }
    // 世界 (0,0) 在屏幕上的位置 = 200 + 0*2 = (200,100)
    const hit = hitTestIllustrationAtViewportPoint(
      illustrations,
      0,
      0,
      camera,
      { x: 200, y: 100 },
    )

    expect(hit?.id).toBe('ill_2')
  })

  it('落在盒外返回 null', () => {
    const hit = hitTestIllustrationAtViewportPoint(
      illustrations,
      0,
      0,
      createDefaultCamera(),
      { x: 500, y: 500 },
    )

    expect(hit).toBeNull()
  })

  it('空列表返回 null', () => {
    expect(
      hitTestIllustrationAtViewportPoint([], 0, 0, createDefaultCamera(), { x: 0, y: 0 }),
    ).toBeNull()
  })
})
