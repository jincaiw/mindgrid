/**
 * 「仅显示该分支」的可见集计算（纯函数）。
 *
 * 对齐 XMind 查看菜单的「仅显示该分支」：只保留**从根到该主题的路径**
 * 与**该主题的整棵子树**，其余主题（含同级分支）全部隐藏。
 *
 * 为什么单独成模块：真正决定行为的是这段集合运算，而画布裁剪、菜单派发、
 * 画布上的聚焦提示条、⌘A 的可选范围都要用它。抽出来之后语义可以被逐条单测钉死——
 * 画布里的过滤是"接线"，不是逻辑。
 */

import { collectSubtreeTopicIds, findAncestorTopicIds, findTopicById } from './tree'
import type { TopicSnapshot } from './types'

/**
 * 计算聚焦某个主题时应保留的主题 id 集合。
 *
 * 返回 `null` 表示**不聚焦**，以下三种情况都算不聚焦：
 * - 没有指定主题（未开启聚焦）
 * - 指定的就是中心主题（只显示中心主题的"分支"没有意义，直接当作退出聚焦）
 * - 指定的主题在树里找不到（文档变了之后残留的 id，不该把画布清空）
 */
export function resolveFocusVisibleTopicIds(
  rootTopic: TopicSnapshot,
  focusTopicId: string | null | undefined,
): Set<string> | null {
  if (!focusTopicId || focusTopicId === rootTopic.id) {
    return null
  }

  const focusTopic = findTopicById(rootTopic, focusTopicId)
  if (!focusTopic) {
    return null
  }

  // 路径（不含自身）+ 自身子树 = 要保留的全部
  const ancestors = findAncestorTopicIds(rootTopic, focusTopicId) ?? []
  return new Set([...ancestors, ...collectSubtreeTopicIds(focusTopic)])
}

/**
 * 计算「导出选中主题」时应保留的主题 id 集合。
 *
 * 语义与「仅显示该分支」相同（根→目标路径 + 目标子树），只是目标可以有多个：
 * 逐个求可见集再取并集。
 *
 * 返回 `null` 表示**不裁剪**（导出整幅图），两种情况：
 * - 没有选中任何主题
 * - 选中里含**中心主题**——中心主题的"分支"就是整幅图本身，此时裁剪没有意义
 *   （注意这与聚焦不同：聚焦会**拒绝**中心主题，而导出应当照常工作）
 * - 选中的 id 在树里一个都找不到（文档变了之后的残留 id）
 */
export function resolveSelectionVisibleTopicIds(
  rootTopic: TopicSnapshot,
  topicIds: readonly string[],
): Set<string> | null {
  if (topicIds.length === 0) {
    return null
  }

  if (topicIds.includes(rootTopic.id)) {
    return null
  }

  const visible = new Set<string>()
  let resolvedAny = false

  for (const topicId of topicIds) {
    const ids = resolveFocusVisibleTopicIds(rootTopic, topicId)
    if (!ids) {
      continue
    }
    resolvedAny = true
    for (const id of ids) {
      visible.add(id)
    }
  }

  return resolvedAny ? visible : null
}

/**
 * 过滤「引用了若干主题」的装饰元素，只保留**引用全部可见**的那些。
 *
 * 用于联系线 / 外框 / 概要：它们的世界几何由被引用主题的位置算出。
 * 若不过滤，聚焦模式下会留下"连到看不见的主题"的线，或外框缩成只剩一个主题的小圈
 * （`topicGroupBounds` 对缺失主题是**跳过**而非整体作废）。
 */
export function restrictToVisibleTopics<T>(
  items: readonly T[],
  referencesOf: (item: T) => readonly string[],
  visibleTopicIds: ReadonlySet<string>,
): T[] {
  return items.filter((item) => referencesOf(item).every((id) => visibleTopicIds.has(id)))
}

/**
 * 把「当前看起来选中/激活的主题」解析成可聚焦的目标。
 *
 * 中心主题、空值、以及树里找不到的 id 都返回 `null`。
 *
 * 为什么中心主题也算不可聚焦：只显示中心主题的"分支"就是整幅图本身，
 * 语义上是空操作。与其把它当成一次成功的聚焦（提示条亮起、画布却毫无变化），
 * 不如明确拒绝——这样"聚焦中"这个说法在任何时刻都与画布实际状态一致。
 *
 * 快捷键与菜单项共用本函数，保证两条入口对"能不能聚焦"给出同一个答案。
 */
export function resolveBranchFocusTarget(
  rootTopic: TopicSnapshot,
  preferredTopicId: string | null | undefined,
): string | null {
  if (!preferredTopicId || preferredTopicId === rootTopic.id) {
    return null
  }
  return findTopicById(rootTopic, preferredTopicId) ? preferredTopicId : null
}

/** 无法聚焦时的统一提示文案（快捷键与菜单项共用，避免两处各写一句、说法漂移）。 */
export const FOCUS_BRANCH_UNAVAILABLE_MESSAGE = '中心主题不能只显示其分支'
