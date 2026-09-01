import { describe, expect, it } from 'vitest'
import { matchesShortcut, matchesShortcutId } from './match'
import { SHORTCUTS, groupShortcutsByCategory, formatCombo, type KeyCombo } from './registry'

/** 构造最小 KeyboardLike，便于测试。 */
function keyEvent(overrides: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}): { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean } {
  return {
    key: 'a',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  }
}

describe('matchesShortcut', () => {
  it('matches plain key without modifiers', () => {
    expect(matchesShortcut(keyEvent({ key: 'Tab' }), { key: 'Tab' })).toBe(true)
  })

  it('matches Cmd/Ctrl as mod (cross-platform normalization)', () => {
    const combo: KeyCombo = { key: 's', mod: true }
    expect(matchesShortcut(keyEvent({ key: 's', metaKey: true }), combo)).toBe(true)
    expect(matchesShortcut(keyEvent({ key: 's', ctrlKey: true }), combo)).toBe(true)
    expect(matchesShortcut(keyEvent({ key: 's' }), combo)).toBe(false)
  })

  it('matches shift modifier exactly', () => {
    const combo: KeyCombo = { key: 'Enter', shift: true }
    expect(matchesShortcut(keyEvent({ key: 'Enter', shiftKey: true }), combo)).toBe(true)
    // Shift+Enter 不应匹配普通 Enter
    expect(matchesShortcut(keyEvent({ key: 'Enter' }), combo)).toBe(false)
  })

  it('matches alt modifier exactly', () => {
    const combo: KeyCombo = { key: 'ArrowUp', alt: true }
    expect(matchesShortcut(keyEvent({ key: 'ArrowUp', altKey: true }), combo)).toBe(true)
    expect(matchesShortcut(keyEvent({ key: 'ArrowUp' }), combo)).toBe(false)
  })

  it('matches combined mod+shift exactly (Cmd+Shift+S 不匹配 Cmd+S)', () => {
    const saveCombo: KeyCombo = { key: 's', mod: true }
    const saveAsCombo: KeyCombo = { key: 's', mod: true, shift: true }

    // Cmd+Shift+S 不匹配普通 Cmd+S
    expect(matchesShortcut(keyEvent({ key: 's', metaKey: true, shiftKey: true }), saveCombo)).toBe(false)
    // 但匹配 Cmd+Shift+S
    expect(matchesShortcut(keyEvent({ key: 's', metaKey: true, shiftKey: true }), saveAsCombo)).toBe(true)
    // 普通 Cmd+S 不匹配 Cmd+Shift+S
    expect(matchesShortcut(keyEvent({ key: 's', metaKey: true }), saveAsCombo)).toBe(false)
  })

  it('is case-insensitive on the main key', () => {
    const combo: KeyCombo = { key: 'p', mod: true, shift: true }
    expect(matchesShortcut(keyEvent({ key: 'p', metaKey: true, shiftKey: true }), combo)).toBe(true)
    expect(matchesShortcut(keyEvent({ key: 'P', metaKey: true, shiftKey: true }), combo)).toBe(true)
  })

  it('rejects when any undeclared modifier is pressed', () => {
    // Cmd+S 不匹配 plain S（mod 未声明但按下）
    expect(matchesShortcut(keyEvent({ key: 's', metaKey: true }), { key: 's' })).toBe(false)
    // Tab 不匹配 Shift+Tab
    expect(matchesShortcut(keyEvent({ key: 'Tab', shiftKey: true }), { key: 'Tab' })).toBe(false)
  })
})

describe('matchesShortcutId', () => {
  it('looks up combo by id and matches event', () => {
    const combos = [
      { id: 'file-save', combo: { key: 's', mod: true } as KeyCombo },
      { id: 'file-save-as', combo: { key: 's', mod: true, shift: true } as KeyCombo },
    ]
    expect(matchesShortcutId(keyEvent({ key: 's', metaKey: true }), 'file-save', combos)).toBe(true)
    expect(matchesShortcutId(keyEvent({ key: 's', metaKey: true, shiftKey: true }), 'file-save-as', combos)).toBe(true)
    expect(matchesShortcutId(keyEvent({ key: 's', metaKey: true, shiftKey: true }), 'file-save', combos)).toBe(false)
  })

  it('returns false for unknown id', () => {
    expect(matchesShortcutId(keyEvent({ key: 's', metaKey: true }), 'unknown-id', SHORTCUTS)).toBe(false)
  })
})

describe('groupShortcutsByCategory', () => {
  it('returns all 5 categories in fixed order', () => {
    const groups = groupShortcutsByCategory()
    expect(groups.map((g) => g.category)).toEqual(['文件', '视图', '主题', '编辑', '画布导航'])
  })

  it('every shortcut appears exactly once in its category', () => {
    const groups = groupShortcutsByCategory()
    const all = groups.flatMap((g) => g.items)
    expect(all).toHaveLength(SHORTCUTS.length)
    // 无重复 id
    const ids = new Set(all.map((s) => s.id))
    expect(ids.size).toBe(SHORTCUTS.length)
  })

  it('accepts a custom shortcut list', () => {
    const custom = [
      { id: 'x', combo: { key: 'x' } as KeyCombo, label: 'X', description: '', category: '文件' as const, scope: 'global' as const },
    ]
    const groups = groupShortcutsByCategory(custom)
    expect(groups[0].items).toHaveLength(1)
    // 未提供的分类应为空数组
    expect(groups[1].items).toEqual([])
  })
})

describe('formatCombo', () => {
  it('formats plain key', () => {
    expect(formatCombo({ key: 'Tab' })).toBe('Tab')
    expect(formatCombo({ key: 'Enter' })).toBe('Enter')
  })

  it('formats mod prefix', () => {
    expect(formatCombo({ key: 's', mod: true })).toBe('⌘/s')
  })

  it('formats shift + mod prefixes in canonical order (mod, shift, alt)', () => {
    expect(formatCombo({ key: 'p', mod: true, shift: true })).toBe('⌘/⇧/p')
    expect(formatCombo({ key: 'ArrowUp', alt: true })).toBe('⌥/ArrowUp')
    expect(formatCombo({ key: 's', mod: true, shift: true, alt: true })).toBe('⌘/⇧/⌥/s')
  })

  it('formats Space as readable label', () => {
    expect(formatCombo({ key: ' ' })).toBe('Space')
  })
})
