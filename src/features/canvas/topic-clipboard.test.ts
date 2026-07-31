import { describe, expect, it } from 'vitest'
import { createTopic } from '../../lib/document/default-document'
import { collectClipboardTopics } from './topic-clipboard'

describe('topic-clipboard', () => {
  const rootTopic = createTopic('中心主题', [
    createTopic('关键洞察', [createTopic('洞察子主题')]),
    createTopic('行动项'),
    createTopic('待验证假设'),
  ])

  it('collects selected branches except the root', () => {
    const copiedTopics = collectClipboardTopics(rootTopic, [
      rootTopic.id,
      rootTopic.children[1].id,
    ])

    expect(copiedTopics).toHaveLength(1)
    expect(copiedTopics[0].text).toBe('行动项')
  })

  it('normalizes descendant selections under an already selected branch', () => {
    const copiedTopics = collectClipboardTopics(rootTopic, [
      rootTopic.children[0].id,
      rootTopic.children[0].children[0].id,
      rootTopic.children[2].id,
    ])

    expect(copiedTopics.map((topic) => topic.text)).toEqual(['关键洞察', '待验证假设'])
    expect(copiedTopics[0].children).toHaveLength(1)
  })
})
