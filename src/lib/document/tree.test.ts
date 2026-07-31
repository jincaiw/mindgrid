import { describe, expect, it } from 'vitest'
import { createDefaultDocument } from './default-document'
import {
  canReparentTopic,
  findTopicById,
  flattenTopicTree,
  getBatchReparentTopicValidation,
  getReparentTopicValidation,
  normalizeTopicIdsForBatch,
} from './tree'

describe('findTopicById', () => {
  it('returns the nested topic when the id exists', () => {
    const document = createDefaultDocument()
    const targetId = document.sheets[0].rootTopic.children[1].id

    expect(findTopicById(document.sheets[0].rootTopic, targetId)?.text).toBe('行动项')
  })
})

describe('flattenTopicTree', () => {
  it('returns entries with depth and full path', () => {
    const document = createDefaultDocument()
    const entries = flattenTopicTree(document.sheets[0].rootTopic)
    const nestedEntry = entries.find((entry) => entry.text === '待验证假设')

    expect(entries[0]?.path).toEqual(['中心主题'])
    expect(nestedEntry).toMatchObject({
      depth: 1,
      path: ['中心主题', '待验证假设'],
    })
  })
})

describe('canReparentTopic', () => {
  it('rejects moving a topic into its own subtree', () => {
    const document = createDefaultDocument()
    const sourceTopicId = document.sheets[0].rootTopic.children[0].id
    const childTopicId = 'topic_nested_child'

    document.sheets[0].rootTopic.children[0].children.push({
      id: childTopicId,
      text: '嵌套子主题',
      collapsed: false,
      children: [],
    })

    expect(canReparentTopic(document.sheets[0].rootTopic, sourceTopicId, childTopicId)).toBe(false)
  })

  it('allows moving a nested topic under another branch', () => {
    const document = createDefaultDocument()
    const sourceTopicId = document.sheets[0].rootTopic.children[0].id
    const targetParentId = document.sheets[0].rootTopic.children[1].id

    expect(canReparentTopic(document.sheets[0].rootTopic, sourceTopicId, targetParentId)).toBe(true)
  })
})

describe('getReparentTopicValidation', () => {
  it('returns a readable reason for moving into a subtree', () => {
    const document = createDefaultDocument()
    const sourceTopicId = document.sheets[0].rootTopic.children[0].id
    const childTopicId = 'topic_nested_child'

    document.sheets[0].rootTopic.children[0].children.push({
      id: childTopicId,
      text: '嵌套子主题',
      collapsed: false,
      children: [],
    })

    expect(getReparentTopicValidation(document.sheets[0].rootTopic, sourceTopicId, childTopicId))
      .toMatchObject({
        isValid: false,
        reason: '不能把主题移动到自己的子主题下面。',
      })
  })
})

describe('normalizeTopicIdsForBatch', () => {
  it('removes duplicate and descendant selections while preserving top-level order', () => {
    const document = createDefaultDocument()
    const rootTopic = document.sheets[0].rootTopic
    const parentTopic = rootTopic.children[0]!
    const nestedChildId = 'topic_nested_child'

    parentTopic.children.push({
      id: nestedChildId,
      text: '嵌套子主题',
      collapsed: false,
      children: [],
    })

    expect(
      normalizeTopicIdsForBatch(rootTopic, [
        nestedChildId,
        parentTopic.id,
        parentTopic.id,
        rootTopic.children[1]!.id,
      ]),
    ).toEqual([parentTopic.id, rootTopic.children[1]!.id])
  })
})

describe('getBatchReparentTopicValidation', () => {
  it('returns only movable top-level topics for a valid batch reparent', () => {
    const document = createDefaultDocument()
    const rootTopic = document.sheets[0].rootTopic
    const sourceTopic = rootTopic.children[0]!
    const nestedChildId = 'topic_nested_child'

    sourceTopic.children.push({
      id: nestedChildId,
      text: '嵌套子主题',
      collapsed: false,
      children: [],
    })

    expect(
      getBatchReparentTopicValidation(rootTopic, [sourceTopic.id, nestedChildId], rootTopic.children[1]!.id),
    ).toMatchObject({
      isValid: true,
      reason: null,
      normalizedTopicIds: [sourceTopic.id],
    })
  })

  it('returns a readable reason when all selected topics already share the target parent', () => {
    const document = createDefaultDocument()
    const rootTopic = document.sheets[0].rootTopic

    expect(
      getBatchReparentTopicValidation(
        rootTopic,
        [rootTopic.children[0]!.id, rootTopic.children[1]!.id],
        rootTopic.id,
      ),
    ).toMatchObject({
      isValid: false,
      reason: '所选主题已经都在这个父主题下面了。',
    })
  })
})
