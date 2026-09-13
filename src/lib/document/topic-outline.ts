/**
 * 缩进 / 减少缩进的**目标计算**（纯函数，不碰会话）。
 *
 * 抽出来的理由有两条：
 * 1. **两条触发路径共用**：编辑菜单的「缩进 / 减少缩进」与画布的 ⌘] / ⌘[
 *    必须算出同一个目标——各写一份迟早会漂移（本项目「浏览器后备会话与 Rust 必须同语义」
 *    是同一条纪律）。
 * 2. **可测**：菜单项与原生快捷键在 jsdom 里都驱动不了，能钉住的只有这里的映射关系。
 *
 * 语义对齐 XMind / 大纲工具惯例：
 * - 缩进 = 成为**上一个同级主题**的最后一个子主题
 * - 减少缩进 = 挂到**祖父主题**之下，位置**落在原父主题之后**
 */

import { findParentTopicByChildId } from './tree'
import type { TopicSnapshot } from './types'

/** 缩进目标：挂到哪个主题下面（追加到末尾）。 */
export interface IndentTarget {
  parentId: string
}

/** 减少缩进目标：挂到哪个主题下面、插在哪个下标。 */
export interface OutdentTarget {
  parentId: string
  index: number
}

/**
 * 计算缩进目标。返回 null 表示**无处可缩**：
 * 根主题没有父级，或该主题已经是第一个同级主题（没有"上一个同级"可挂）。
 */
export function resolveIndentTarget(
  rootTopic: TopicSnapshot,
  topicId: string,
): IndentTarget | null {
  const match = findParentTopicByChildId(rootTopic, topicId)
  if (!match || match.index === 0) {
    return null
  }

  const previousSibling = match.parent.children[match.index - 1]
  return { parentId: previousSibling.id }
}

/**
 * 计算减少缩进目标。返回 null 表示**无处可退**：
 * 根主题没有父级，或其父主题已是中心主题（没有祖父可挂）。
 */
export function resolveOutdentTarget(
  rootTopic: TopicSnapshot,
  topicId: string,
): OutdentTarget | null {
  const parentMatch = findParentTopicByChildId(rootTopic, topicId)
  if (!parentMatch) {
    return null
  }

  const grandMatch = findParentTopicByChildId(rootTopic, parentMatch.parent.id)
  if (!grandMatch) {
    return null
  }

  // +1：插到原父主题**之后**，而不是丢到祖父的末尾
  return { parentId: grandMatch.parent.id, index: grandMatch.index + 1 }
}
