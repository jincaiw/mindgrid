import type { TopicSnapshot } from './types'

export interface TopicTreeEntry {
  topicId: string
  text: string
  depth: number
  path: string[]
}

export function findTopicById(topic: TopicSnapshot, topicId: string): TopicSnapshot | null {
  if (topic.id === topicId) {
    return topic
  }

  for (const child of topic.children) {
    const match = findTopicById(child, topicId)

    if (match) {
      return match
    }
  }

  return null
}

export function countTopics(topic: TopicSnapshot): number {
  return 1 + topic.children.reduce((sum, child) => sum + countTopics(child), 0)
}

export function findParentTopicByChildId(
  topic: TopicSnapshot,
  childId: string,
): { parent: TopicSnapshot; index: number } | null {
  for (const [index, child] of topic.children.entries()) {
    if (child.id === childId) {
      return { parent: topic, index }
    }

    const nested = findParentTopicByChildId(child, childId)

    if (nested) {
      return nested
    }
  }

  return null
}

export function findAncestorTopicIds(topic: TopicSnapshot, topicId: string): string[] | null {
  if (topic.id === topicId) {
    return []
  }

  for (const child of topic.children) {
    if (child.id === topicId) {
      return [topic.id]
    }

    const nested = findAncestorTopicIds(child, topicId)

    if (nested) {
      return [topic.id, ...nested]
    }
  }

  return null
}

export function canReparentTopic(
  rootTopic: TopicSnapshot,
  topicId: string,
  targetParentId: string,
) {
  return getReparentTopicValidation(rootTopic, topicId, targetParentId).isValid
}

export function getReparentTopicValidation(
  rootTopic: TopicSnapshot,
  topicId: string,
  targetParentId: string,
) {
  if (topicId === targetParentId) {
    return {
      isValid: false,
      reason: '主题不能移动到自己下面。',
    }
  }

  if (rootTopic.id === topicId) {
    return {
      isValid: false,
      reason: '根主题不能作为拖拽移动对象。',
    }
  }

  const movingTopic = findTopicById(rootTopic, topicId)

  if (!movingTopic) {
    return {
      isValid: false,
      reason: '找不到正在移动的主题。',
    }
  }

  if (findTopicById(movingTopic, targetParentId)) {
    return {
      isValid: false,
      reason: '不能把主题移动到自己的子主题下面。',
    }
  }

  return {
    isValid: true,
    reason: null,
  }
}

export function normalizeTopicIdsForBatch(
  rootTopic: TopicSnapshot,
  topicIds: string[],
  options?: { excludeRoot?: boolean },
) {
  const excludeRoot = options?.excludeRoot ?? true
  const normalizedTopicIds: string[] = []

  for (const topicId of topicIds) {
    if (excludeRoot && topicId === rootTopic.id) {
      continue
    }

    const topic = findTopicById(rootTopic, topicId)

    if (!topic) {
      continue
    }

    if (normalizedTopicIds.includes(topicId)) {
      continue
    }

    if (
      normalizedTopicIds.some((selectedId) => {
        const selectedTopic = findTopicById(rootTopic, selectedId)
        return selectedTopic ? !!findTopicById(selectedTopic, topicId) : false
      })
    ) {
      continue
    }

    for (let index = normalizedTopicIds.length - 1; index >= 0; index -= 1) {
      const selectedTopic = findTopicById(rootTopic, normalizedTopicIds[index]!)

      if (selectedTopic && findTopicById(topic, selectedTopic.id)) {
        normalizedTopicIds.splice(index, 1)
      }
    }

    normalizedTopicIds.push(topicId)
  }

  return normalizedTopicIds
}

export function getBatchReparentTopicValidation(
  rootTopic: TopicSnapshot,
  topicIds: string[],
  targetParentId: string,
) {
  if (topicIds.includes(rootTopic.id)) {
    return {
      isValid: false,
      reason: '根主题不能参与批量移动。',
      normalizedTopicIds: [],
    }
  }

  const normalizedTopicIds = normalizeTopicIdsForBatch(rootTopic, topicIds)

  if (normalizedTopicIds.length === 0) {
    return {
      isValid: false,
      reason: '没有可移动的主题。',
      normalizedTopicIds: [],
    }
  }

  for (const topicId of normalizedTopicIds) {
    if (topicId === targetParentId) {
      return {
        isValid: false,
        reason: '不能把所选主题移动到自己下面。',
        normalizedTopicIds,
      }
    }

    const movingTopic = findTopicById(rootTopic, topicId)

    if (movingTopic && findTopicById(movingTopic, targetParentId)) {
      return {
        isValid: false,
        reason: '不能把所选主题移动到自己的子主题下面。',
        normalizedTopicIds,
      }
    }
  }

  const movableTopicIds = normalizedTopicIds.filter((topicId) => {
    const parentMatch = findParentTopicByChildId(rootTopic, topicId)
    return parentMatch?.parent.id !== targetParentId
  })

  if (movableTopicIds.length === 0) {
    return {
      isValid: false,
      reason: '所选主题已经都在这个父主题下面了。',
      normalizedTopicIds,
    }
  }

  return {
    isValid: true,
    reason: null,
    normalizedTopicIds: movableTopicIds,
  }
}

export function flattenTopicTree(topic: TopicSnapshot, depth = 0, path: string[] = []): TopicTreeEntry[] {
  const nextPath = [...path, topic.text]
  const entries: TopicTreeEntry[] = [
    {
      topicId: topic.id,
      text: topic.text,
      depth,
      path: nextPath,
    },
  ]

  topic.children.forEach((child) => {
    entries.push(...flattenTopicTree(child, depth + 1, nextPath))
  })

  return entries
}

/**
 * 收集当前可见的主题 ID（含根节点）；遇到折叠节点时停止下钻，
 * 与画布实际渲染的节点集合保持一致。用于 Cmd/Ctrl + A 全选等场景。
 */
export function collectVisibleTopicIds(root: TopicSnapshot): string[] {
  const ids: string[] = []

  function walk(topic: TopicSnapshot) {
    ids.push(topic.id)

    if (!topic.collapsed) {
      topic.children.forEach(walk)
    }
  }

  walk(root)
  return ids
}
