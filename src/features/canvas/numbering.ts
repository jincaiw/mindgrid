/**
 * 画布级主题编号（XMind 样式页「编号」）。
 *
 * 编号是**展示层派生数据**，不写入主题文本：开关后即时出现，关闭后消失，
 * 保存的 .mgd 只记录编号配置（SheetSnapshot.numbering）。
 * DOM / Canvas / SVG 三端共用此模块计算，保证编号一致。
 */

import type { SheetNumbering, TopicSnapshot } from '../../lib/document/types'

export type NumberingFormat =
  | 'decimal'
  | 'lowerAlpha'
  | 'upperAlpha'
  | 'lowerRoman'
  | 'upperRoman'

export const NUMBERING_SEPARATORS = ['.', '-', ')'] as const

export const NUMBERING_FORMAT_OPTIONS: { value: NumberingFormat; label: string }[] = [
  { value: 'decimal', label: '1, 2, 3' },
  { value: 'lowerAlpha', label: 'a, b, c' },
  { value: 'upperAlpha', label: 'A, B, C' },
  { value: 'lowerRoman', label: 'i, ii, iii' },
  { value: 'upperRoman', label: 'I, II, III' },
]

const ROMAN_TABLE: readonly [number, string][] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
]

function toRoman(value: number): string {
  let remaining = Math.max(1, Math.floor(value))
  let out = ''
  for (const [numeral, symbol] of ROMAN_TABLE) {
    while (remaining >= numeral) {
      out += symbol
      remaining -= numeral
    }
  }
  return out
}

function toAlpha(value: number): string {
  // 1 → a；超过 26 后按 aa, ab… 递进（与常见表格列号一致）
  let remaining = Math.max(1, Math.floor(value))
  let out = ''
  while (remaining > 0) {
    const rest = (remaining - 1) % 26
    out = String.fromCharCode(97 + rest) + out
    remaining = Math.floor((remaining - rest - 1) / 26)
  }
  return out
}

/** 把一个序号渲染为指定格式的片段。 */
export function formatNumberingPart(index: number, format: NumberingFormat): string {
  switch (format) {
    case 'lowerAlpha':
      return toAlpha(index)
    case 'upperAlpha':
      return toAlpha(index).toUpperCase()
    case 'lowerRoman':
      return toRoman(index)
    case 'upperRoman':
      return toRoman(index).toUpperCase()
    case 'decimal':
    default:
      return String(index)
  }
}

/**
 * 计算全树编号：Map<topicId, 编号字符串>。
 *
 * - 未启用返回空 Map（渲染端按无编号处理）。
 * - 折叠主题的后代不参与编号（与布局一致）。
 * - 根主题默认不编号，`includeRoot` 为真时作为第一段。
 */
export function buildTopicNumbers(
  rootTopic: TopicSnapshot,
  numbering: SheetNumbering | undefined,
): Map<string, string> {
  const result = new Map<string, string>()

  if (!numbering || numbering.enabled !== true) {
    return result
  }

  const format: NumberingFormat = numbering.format ?? 'decimal'
  const separator = NUMBERING_SEPARATORS.includes(
    numbering.separator as (typeof NUMBERING_SEPARATORS)[number],
  )
    ? numbering.separator!
    : '.'
  const includeRoot = numbering.includeRoot === true

  const walk = (topic: TopicSnapshot, prefix: string[]) => {
    if (prefix.length > 0) {
      result.set(topic.id, prefix.join(separator))
    }

    if (topic.collapsed || topic.children.length === 0) {
      return
    }

    topic.children.forEach((child, index) => {
      walk(child, [...prefix, formatNumberingPart(index + 1, format)])
    })
  }

  walk(rootTopic, includeRoot ? [formatNumberingPart(1, format)] : [])

  return result
}

/** 取主题编号文本，未启用或无编号时返回 null。 */
export function topicNumberText(
  numbers: Map<string, string>,
  topicId: string,
  numbering: SheetNumbering | undefined,
): string | null {
  if (!numbering || numbering.enabled !== true) {
    return null
  }
  const value = numbers.get(topicId)
  return value && value.length > 0 ? value : null
}
