import { afterEach, describe, expect, it } from 'vitest'
import type { DocumentSessionSnapshot, TopicSnapshot } from '../document/types'
import { findTopicById } from '../document/tree'
import { invokeBrowserCommand, resetBrowserSessionForTests } from './browser-session'

afterEach(() => {
  resetBrowserSessionForTests()
})

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** 建文档并取到第一个子主题（root 之下）。 */
async function createDocumentAndFirstChild() {
  const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
  const rootTopic = created.document.sheets[0].rootTopic
  return { created, rootTopic, child: rootTopic.children[0] as TopicSnapshot }
}

describe('主题图片的浏览器镜像命令', () => {
  it('插入图片后记录 assetId，并可按 id 读回 data URL', async () => {
    const { created, child } = await createDocumentAndFirstChild()

    const inserted = await invokeBrowserCommand<DocumentSessionSnapshot>(
      'set_topic_image',
      { topic_id: child.id, source_path: PNG_DATA_URL },
    )
    const insertedTopic = findTopicById(
      inserted.document.sheets[0].rootTopic,
      child.id,
    )
    const assetId = insertedTopic?.image?.assetId

    expect(assetId).toBeTruthy()
    expect(inserted.nextUndoAction).toBe('插入图片')
    expect(
      await invokeBrowserCommand<string>('read_asset_data_url', { asset_id: assetId }),
    ).toBe(PNG_DATA_URL)

    // 未变更字段不受影响
    expect(created.summary.topicCount).toBe(inserted.summary.topicCount)
  })

  it('移除图片后资源引用被清空，且可撤销', async () => {
    const { child } = await createDocumentAndFirstChild()

    const inserted = await invokeBrowserCommand<DocumentSessionSnapshot>(
      'set_topic_image',
      { topic_id: child.id, source_path: PNG_DATA_URL },
    )
    const assetId = findTopicById(inserted.document.sheets[0].rootTopic, child.id)?.image
      ?.assetId

    const removed = await invokeBrowserCommand<DocumentSessionSnapshot>(
      'remove_topic_image',
      { topic_id: child.id },
    )
    const removedTopic = findTopicById(removed.document.sheets[0].rootTopic, child.id)

    expect(removedTopic?.image).toBeUndefined()
    expect(removed.nextUndoAction).toBe('移除图片')

    const undone =
      await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    expect(findTopicById(undone.document.sheets[0].rootTopic, child.id)?.image).toEqual({
      assetId,
    })
  })

  it('读取不存在的资源返回空串（渲染层静默降级）', async () => {
    expect(
      await invokeBrowserCommand<string>('read_asset_data_url', { asset_id: 'asset_missing' }),
    ).toBe('')
  })

  it('本地绝对路径在浏览器开发态不可读，抛出明确错误', async () => {
    const { child } = await createDocumentAndFirstChild()

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_image', {
        topic_id: child.id,
        source_path: '/Users/me/Pictures/demo.png',
      }),
    ).rejects.toThrow('浏览器开发态暂不支持读取本地图片路径')
  })
})
