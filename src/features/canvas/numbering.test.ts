import { describe, expect, it } from 'vitest'
import { buildTopicNumbers, formatNumberingPart, topicNumberText } from './numbering'
import type { NumberingFormat, TopicSnapshot } from '../../lib/document/types'

function topic(
  id: string,
  children: TopicSnapshot[] = [],
  collapsed = false,
): TopicSnapshot {
  return { id, text: id, collapsed, children }
}

const tree = topic('root', [
  topic('a', [topic('a1'), topic('a2')]),
  topic('b', [topic('b1', [topic('b1x')])]),
  topic('c'),
])

describe('formatNumberingPart', () => {
  it('renders decimal by default', () => {
    expect(formatNumberingPart(1, 'decimal')).toBe('1')
    expect(formatNumberingPart(12, 'decimal')).toBe('12')
  })

  it('renders alpha with spreadsheet-style overflow', () => {
    expect(formatNumberingPart(1, 'lowerAlpha')).toBe('a')
    expect(formatNumberingPart(26, 'lowerAlpha')).toBe('z')
    expect(formatNumberingPart(27, 'lowerAlpha')).toBe('aa')
    expect(formatNumberingPart(3, 'upperAlpha')).toBe('C')
  })

  it('renders roman numerals', () => {
    expect(formatNumberingPart(1, 'lowerRoman')).toBe('i')
    expect(formatNumberingPart(4, 'lowerRoman')).toBe('iv')
    expect(formatNumberingPart(9, 'lowerRoman')).toBe('ix')
    expect(formatNumberingPart(14, 'upperRoman')).toBe('XIV')
  })
})

describe('buildTopicNumbers', () => {
  it('returns an empty map when numbering is disabled or absent', () => {
    expect(buildTopicNumbers(tree, undefined).size).toBe(0)
    expect(buildTopicNumbers(tree, { enabled: false }).size).toBe(0)
  })

  it('numbers branches with dotted decimals and skips the root by default', () => {
    const numbers = buildTopicNumbers(tree, { enabled: true })

    expect(numbers.get('root')).toBeUndefined()
    expect(numbers.get('a')).toBe('1')
    expect(numbers.get('a1')).toBe('1.1')
    expect(numbers.get('a2')).toBe('1.2')
    expect(numbers.get('b')).toBe('2')
    expect(numbers.get('b1x')).toBe('2.1.1')
    expect(numbers.get('c')).toBe('3')
  })

  it('honours the separator and format', () => {
    const numbers = buildTopicNumbers(tree, {
      enabled: true,
      format: 'upperAlpha' as NumberingFormat,
      separator: '-',
    })

    expect(numbers.get('a1')).toBe('A-A')
    expect(numbers.get('b1x')).toBe('B-A-A')
  })

  it('falls back to dot for unsupported separators', () => {
    const numbers = buildTopicNumbers(tree, { enabled: true, separator: '|' })
    expect(numbers.get('a1')).toBe('1.1')
  })

  it('can include the root as the first segment', () => {
    const numbers = buildTopicNumbers(tree, { enabled: true, includeRoot: true })
    expect(numbers.get('root')).toBe('1')
    expect(numbers.get('a')).toBe('1.1')
    expect(numbers.get('a1')).toBe('1.1.1')
  })

  it('does not number descendants of a collapsed branch', () => {
    const collapsedTree = topic('root', [topic('a', [topic('a1')], true)])
    const numbers = buildTopicNumbers(collapsedTree, { enabled: true })

    expect(numbers.get('a')).toBe('1')
    expect(numbers.has('a1')).toBe(false)
  })
})

describe('topicNumberText', () => {
  it('returns null when numbering is off', () => {
    const numbers = buildTopicNumbers(tree, { enabled: true })
    expect(topicNumberText(numbers, 'a', undefined)).toBeNull()
    expect(topicNumberText(numbers, 'a', { enabled: false })).toBeNull()
  })

  it('returns the number for topics that have one', () => {
    const numbers = buildTopicNumbers(tree, { enabled: true })
    expect(topicNumberText(numbers, 'a1', { enabled: true })).toBe('1.1')
    expect(topicNumberText(numbers, 'root', { enabled: true })).toBeNull()
  })
})
