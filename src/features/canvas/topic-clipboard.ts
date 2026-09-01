import { findTopicById } from '../../lib/document/tree'
import type { TopicSnapshot } from '../../lib/document/types'

/**
 * 深拷贝主题，保留全部富内容字段（styleOverrides / markers / labels / notes / link /
 * image / task / layoutHints / extensions），确保复制/剪切/粘贴不丢失元信息。
 * 根主题不可剪切/复制，调用方需自行过滤。
 */
function cloneTopic(topic: TopicSnapshot): TopicSnapshot {
  return {
    id: topic.id,
    text: topic.text,
    collapsed: topic.collapsed,
    children: topic.children.map(cloneTopic),
    styleRef: topic.styleRef,
    styleOverrides: topic.styleOverrides
      ? {
          fill: topic.styleOverrides.fill,
          textColor: topic.styleOverrides.textColor,
          borderColor: topic.styleOverrides.borderColor,
        }
      : undefined,
    markers: topic.markers?.map((m) => ({ id: m.id, label: m.label })),
    labels: topic.labels?.slice(),
    notes: topic.notes,
    link: topic.link ? { url: topic.link.url, title: topic.link.title } : undefined,
    image: topic.image
      ? {
          assetId: topic.image.assetId,
          width: topic.image.width,
          height: topic.image.height,
        }
      : undefined,
    task: topic.task
      ? {
          status: topic.task.status,
          dueDateMs: topic.task.dueDateMs,
          priority: topic.task.priority,
        }
      : undefined,
    layoutHints: topic.layoutHints
      ? {
          direction: topic.layoutHints.direction,
          offsetX: topic.layoutHints.offsetX,
          offsetY: topic.layoutHints.offsetY,
        }
      : undefined,
    extensions: topic.extensions ? { ...topic.extensions } : undefined,
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
