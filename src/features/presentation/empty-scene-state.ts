/**
 * 放映/预览用的「空交互状态」。
 *
 * 放映台与演说预览只需要**只读渲染**，不参与编辑交互，因此把选中/编辑/搜索/拖拽
 * 这些视觉状态一律置空，只保留 activeTopicId（高亮当前页的主题）。
 *
 * 原先 presentation-view 与 pitch-view **各写了一份**；预览组件要用第三次时抽出来，
 * 避免三份各自漂移。
 */

import type { TopicVisualStates } from '../canvas/runtime/scene-builder'

export const EMPTY_VISUAL_STATES: TopicVisualStates = {
  activeTopicId: null,
  selectedTopicIds: new Set<string>(),
  editingTopicId: null,
  searchMatchedTopicIds: new Set<string>(),
  activeSearchTopicId: null,
  historyFocusTopicId: null,
  dropTargetTopicId: null,
  draggingTopicId: null,
}

export const EMPTY_OVERLAYS = {
  selectionBox: null,
  dragPreview: null,
  dropIndicator: null,
}
