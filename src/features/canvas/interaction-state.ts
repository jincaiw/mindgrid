import type { CameraState } from './camera'

export function syncSelectionWithActiveTopic(
  currentSelectedTopicIds: string[],
  activeTopicId: string | null,
) {
  if (!activeTopicId) {
    return []
  }

  return currentSelectedTopicIds.includes(activeTopicId)
    ? currentSelectedTopicIds
    : [activeTopicId]
}

export function getDeletableTopicIds(topicIds: string[], rootTopicId: string) {
  return topicIds.filter((topicId) => topicId !== rootTopicId)
}

export function projectWorldPointToViewport(
  point: { x: number; y: number },
  camera: CameraState,
) {
  return {
    x: camera.x + point.x * camera.zoom,
    y: camera.y + point.y * camera.zoom,
  }
}
