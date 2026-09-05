import type { TopicSearchEntry } from '../canvas/topic-search'

export interface ReplacementPlanEntry {
  topicId: string
  /** 替换后的完整文本 */
  nextText: string
  /** 该主题内被替换的处数 */
  replacedCount: number
}

/**
 * 字面量替换（不解析正则，避免用户输入 `.` `*` `(` 等字符时炸掉或误替换）。
 *
 * 大小写策略刻意与检索保持一致：searchTopics 用 toLocaleLowerCase 做不敏感匹配，
 * 所以替换也必须不敏感，否则会出现「搜到了 'MindGrid'（查 'mind'），点替换却毫无反应」
 * 的静默失效。批次 C3 之前这里用的是 text.split(query).join(replacement)，
 * 大小写不一致时 split 找不到、nextText === text，替换被跳过且不报错。
 *
 * @returns 替换后的文本；若文本中不含 query 则返回 null（调用方据此跳过无变化的写入）
 */
export function replaceLiteral(
  text: string,
  query: string,
  replacement: string,
): string | null {
  if (query.length === 0) return null

  const haystack = text.toLocaleLowerCase()
  const needle = query.toLocaleLowerCase()

  if (!haystack.includes(needle)) return null

  // 大小写不敏感查找 + 保留原文未被匹配部分，逐段拼接
  let output = ''
  let cursor = 0

  for (;;) {
    const index = haystack.indexOf(needle, cursor)

    if (index === -1) {
      output += text.slice(cursor)
      break
    }

    output += text.slice(cursor, index) + replacement
    cursor = index + needle.length
  }

  return output
}

/** 统计 query 在 text 中的出现次数（大小写不敏感，与检索口径一致） */
export function countOccurrences(text: string, query: string): number {
  if (query.length === 0) return 0

  const haystack = text.toLocaleLowerCase()
  const needle = query.toLocaleLowerCase()
  let count = 0
  let cursor = 0

  for (;;) {
    const index = haystack.indexOf(needle, cursor)
    if (index === -1) break
    count += 1
    cursor = index + needle.length
  }

  return count
}

/**
 * 规划「替换当前」的写入。
 *
 * 注意入参是检索结果而非任意主题：searchTopics 的匹配范围是
 * `sheetTitle + text + path`，命中可能来自祖先路径而不在主题自身文本里。
 * 这类条目替换后文本不变，返回 null，避免产生一次无意义的撤销记录。
 */
export function planReplaceOne(
  result: TopicSearchEntry | null | undefined,
  query: string,
  replacement: string,
): ReplacementPlanEntry | null {
  if (!result) return null

  const nextText = replaceLiteral(result.text, query, replacement)
  if (nextText === null) return null

  return {
    topicId: result.topicId,
    nextText,
    replacedCount: countOccurrences(result.text, query),
  }
}

/**
 * 规划「全部替换」的写入序列。
 *
 * 两点与旧实现不同：
 *   1. 按 topicId 去重——同一主题在结果里可能重复出现（例如同时命中自身文本与路径），
 *      不去重会对同一主题连续写入两次，产生两条撤销记录且第二次无变化
 *   2. 只产出"文本真的会变"的条目，便于 UI 显示"将替换 N 个主题 / M 处"
 */
export function planReplaceAll(
  results: readonly TopicSearchEntry[],
  query: string,
  replacement: string,
): ReplacementPlanEntry[] {
  if (query.length === 0) return []

  const plan: ReplacementPlanEntry[] = []
  const seen = new Set<string>()

  for (const result of results) {
    if (seen.has(result.topicId)) continue
    seen.add(result.topicId)

    const entry = planReplaceOne(result, query, replacement)
    if (entry) plan.push(entry)
  }

  return plan
}

/** 汇总一个替换计划的受影响主题数与总处数，供 UI 展示确认信息 */
export function summarizePlan(plan: readonly ReplacementPlanEntry[]) {
  return {
    topicCount: plan.length,
    occurrenceCount: plan.reduce((total, entry) => total + entry.replacedCount, 0),
  }
}
