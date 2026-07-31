import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTopic } from '../../lib/document/default-document'
import {
  parseTopicsFromClipboard,
  readTopicsFromSystemClipboard,
  serializeTopicsForClipboard,
  writeTopicsToSystemClipboard,
} from './topic-system-clipboard'

describe('topic-system-clipboard', () => {
  const topics = [
    createTopic('关键洞察', [createTopic('洞察子主题')]),
    createTopic('行动项'),
  ]

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
  })

  it('serializes a readable outline with an embedded payload marker', () => {
    const serialized = serializeTopicsForClipboard(topics)

    expect(serialized).toContain('- 关键洞察')
    expect(serialized).toContain('MINDGRID_TOPICS::')
  })

  it('parses embedded clipboard payload back into topics', () => {
    const serialized = serializeTopicsForClipboard(topics)
    const parsed = parseTopicsFromClipboard(serialized)

    expect(parsed).toEqual(topics)
  })

  it('returns a failed result when the system clipboard read throws', async () => {
    const readText = vi.fn(async () => {
      throw new DOMException('Document is not focused.', 'NotAllowedError')
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText },
    })

    await expect(readTopicsFromSystemClipboard()).resolves.toEqual({
      status: 'failed',
      topics: null,
    })
  })

  it('returns a failed result when the system clipboard write throws', async () => {
    const writeText = vi.fn(async () => {
      throw new DOMException('Write permission denied.', 'NotAllowedError')
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    await expect(writeTopicsToSystemClipboard(topics)).resolves.toBe('failed')
  })
})
