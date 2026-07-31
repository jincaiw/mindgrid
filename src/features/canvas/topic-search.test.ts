import { describe, expect, it } from 'vitest'
import { buildDocumentTopicSearchIndex, buildTopicSearchIndex, searchTopics } from './topic-search'
import { createTopic } from '../../lib/document/default-document'

describe('topic-search', () => {
  const rootTopic = createTopic('中心主题', [
    createTopic('关键洞察'),
    createTopic('行动项', [createTopic('本周行动')]),
    createTopic('待验证假设'),
  ])

  it('builds a flattened search index with depth and path', () => {
    const entries = buildTopicSearchIndex(rootTopic)
    const weeklyAction = entries.find((entry) => entry.text === '本周行动')

    expect(entries).toHaveLength(5)
    expect(weeklyAction).toMatchObject({
      depth: 2,
      path: ['中心主题', '行动项', '本周行动'],
    })
  })

  it('matches against topic text and path tokens', () => {
    const entries = buildTopicSearchIndex(rootTopic)

    expect(searchTopics(entries, '行动')).toHaveLength(2)
    expect(searchTopics(entries, '中心 本周')).toHaveLength(1)
    expect(searchTopics(entries, '不存在')).toHaveLength(0)
  })

  it('builds a document-wide index with sheet metadata', () => {
    const entries = buildDocumentTopicSearchIndex({
      schemaVersion: '1.0.0',
      documentId: 'doc_1',
      revision: 1,
      activeSheetId: 'sheet_1',
      sheets: [
        {
          id: 'sheet_1',
          title: '主画布',
          rootTopic,
        },
        {
          id: 'sheet_2',
          title: '执行画布',
          rootTopic: createTopic('执行中心', [createTopic('本周行动')]),
        },
      ],
    })

    expect(searchTopics(entries, '执行')).toHaveLength(2)
    expect(searchTopics(entries, '执行画布 本周')).toHaveLength(1)
    expect(entries.find((entry) => entry.sheetTitle === '执行画布')).toMatchObject({
      sheetId: 'sheet_2',
      sheetTitle: '执行画布',
    })
  })
})
