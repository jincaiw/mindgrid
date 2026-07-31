import { describe, expect, it } from 'vitest'
import {
  getDeletableTopicIds,
  projectWorldPointToViewport,
  syncSelectionWithActiveTopic,
} from './interaction-state'

describe('interaction-state', () => {
  it('keeps current selection when it already contains the active topic', () => {
    expect(
      syncSelectionWithActiveTopic(['topic_a', 'topic_b'], 'topic_b'),
    ).toEqual(['topic_a', 'topic_b'])
  })

  it('falls back to the active topic when selection drifts away', () => {
    expect(syncSelectionWithActiveTopic(['topic_a'], 'topic_root')).toEqual([
      'topic_root',
    ])
  })

  it('filters the root topic out of delete candidates', () => {
    expect(
      getDeletableTopicIds(['topic_root', 'topic_a', 'topic_b'], 'topic_root'),
    ).toEqual(['topic_a', 'topic_b'])
  })

  it('projects a world point into the viewport with the current camera', () => {
    expect(
      projectWorldPointToViewport(
        { x: 120, y: 80 },
        { x: 24, y: -16, zoom: 1.5 },
      ),
    ).toEqual({ x: 204, y: 104 })
  })
})
