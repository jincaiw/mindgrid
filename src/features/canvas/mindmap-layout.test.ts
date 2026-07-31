import { describe, expect, it } from 'vitest'
import { createDefaultDocument, createTopic } from '../../lib/document/default-document'
import { computeMindMapLayout } from './mindmap-layout'

describe('computeMindMapLayout', () => {
  it('places the root in the center and splits first-level topics across both sides', () => {
    const rootTopic = createDefaultDocument().sheets[0].rootTopic
    const layout = computeMindMapLayout(rootTopic)
    const root = layout.nodes.find((node) => node.id === rootTopic.id)
    const firstLevelNodes = layout.nodes.filter((node) => node.depth === 1)

    expect(root?.x).toBe(0)
    expect(firstLevelNodes.some((node) => node.side === 'left')).toBe(true)
    expect(firstLevelNodes.some((node) => node.side === 'right')).toBe(true)
    expect(layout.edges).toHaveLength(firstLevelNodes.length)
  })

  it('does not layout descendants of collapsed topics', () => {
    const rootTopic = createTopic('中心主题', [
      {
        ...createTopic('已折叠主题', [createTopic('隐藏子主题')]),
        collapsed: true,
      },
      createTopic('可见主题'),
    ])
    const layout = computeMindMapLayout(rootTopic)

    expect(layout.nodes.some((node) => node.topic.text === '已折叠主题')).toBe(true)
    expect(layout.nodes.some((node) => node.topic.text === '隐藏子主题')).toBe(false)
  })

  it('keeps only the root node visible when the root is collapsed', () => {
    const rootTopic = {
      ...createDefaultDocument().sheets[0].rootTopic,
      collapsed: true,
    }
    const layout = computeMindMapLayout(rootTopic)

    expect(layout.nodes).toHaveLength(1)
    expect(layout.edges).toHaveLength(0)
  })
})
