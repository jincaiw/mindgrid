import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_ID,
  getTheme,
  listThemes,
} from './built-in-themes'

describe('built-in themes', () => {
  it('provides exactly 5 built-in themes', () => {
    expect(BUILT_IN_THEMES).toHaveLength(5)
  })

  it('has unique theme IDs', () => {
    const ids = BUILT_IN_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes all expected theme IDs', () => {
    const ids = BUILT_IN_THEMES.map((t) => t.id)
    expect(ids).toContain('classic-blue')
    expect(ids).toContain('dark')
    expect(ids).toContain('warm')
    expect(ids).toContain('cool')
    expect(ids).toContain('minimal')
  })

  it('returns classic-blue as the default theme', () => {
    expect(DEFAULT_THEME_ID).toBe('classic-blue')
  })

  it('getTheme returns the matching theme by ID', () => {
    const dark = getTheme('dark')
    expect(dark.id).toBe('dark')
    expect(dark.root.fill).toBe('#2d3748')
  })

  it('getTheme falls back to default for undefined ID', () => {
    const fallback = getTheme(undefined)
    expect(fallback.id).toBe(DEFAULT_THEME_ID)
  })

  it('getTheme falls back to default for unknown ID', () => {
    const fallback = getTheme('nonexistent-theme')
    expect(fallback.id).toBe(DEFAULT_THEME_ID)
  })

  it('listThemes returns all built-in themes', () => {
    const themes = listThemes()
    expect(themes).toHaveLength(5)
    expect(themes.map((t) => t.id)).toEqual(
      expect.arrayContaining([
        'classic-blue',
        'dark',
        'warm',
        'cool',
        'minimal',
      ]),
    )
  })

  it('each theme has complete palette with root and branch colors', () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(theme.background).toBeTruthy()
      expect(theme.gridLine).toBeTruthy()
      expect(theme.root.fill).toBeTruthy()
      expect(theme.root.textColor).toBeTruthy()
      expect(theme.root.metaTextColor).toBeTruthy()
      expect(theme.root.borderColor).toBeTruthy()
      expect(theme.branch.fill).toBeTruthy()
      expect(theme.branch.textColor).toBeTruthy()
      expect(theme.branch.metaTextColor).toBeTruthy()
      expect(theme.branch.borderColor).toBeTruthy()
      expect(theme.edge).toBeTruthy()
      expect(theme.edgeActive).toBeTruthy()
    }
  })
})
