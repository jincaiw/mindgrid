import { findTopicById } from '../../lib/document/tree'
import type { TopicSnapshot } from '../../lib/document/types'

function cloneTopic(topic: TopicSnapshot): TopicSnapshot {
  return {
    id: topic.id,
    text: topic.text,
    collapsed: topic.collapsed,
    children: topic.children.map(cloneTopic),
  }
}

export function collectClipboardTopics(
  rootTopic: TopicSnapshot,
  selectedTopicIds: string[],
): TopicSnapshot[] {
  const eligibleTopicIds = selectedTopicIds.filter((topicId) => topicId !== rootTopic.id)
  const normalizedTopicIds = selectedTopicIds.filter((topicId, index) => {
    if (topicId === rootTopic.id) {
      return false
    }

    if (selectedTopicIds.indexOf(topicId) !== index) {
      return false
    }

    const topic = findTopicById(rootTopic, topicId)

    if (!topic) {
      return false
    }

    return !eligibleTopicIds.some((candidateId) => {
      if (candidateId === topicId) {
        return false
      }

      const candidate = findTopicById(rootTopic, candidateId)

      return candidate ? !!findTopicById(candidate, topicId) : false
    })
  })

  return normalizedTopicIds
    .map((topicId) => findTopicById(rootTopic, topicId))
    .filter((topic): topic is TopicSnapshot => !!topic)
    .map(cloneTopic)
}
