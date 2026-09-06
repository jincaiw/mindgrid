import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_ID,
  getTheme,
  listThemes,
  listThemesByFamily,
} from './built-in-themes'

describe('built-in themes', () => {
  it('provides 5 classic plus 12 vivid built-in themes', () => {
    expect(BUILT_IN_THEMES).toHaveLength(17)
  })

  it('has unique theme IDs', () => {
    const ids = BUILT_IN_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes all expected theme IDs', () => {
    const ids = BUILT_IN_THEMES.map((t) => t.id)
    for (const id of [
      'classic-blue',
      'dark',
      'warm',
      'cool',
      'minimal',
      'rainbow',
      'vibrant',
      'dance',
      'code',
      'washi',
      'island',
      'rose',
      'mint',
      'green-tea',
      'cosmos',
      'refined',
      'innocent',
    ]) {
      expect(ids).toContain(id)
    }
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
    expect(themes).toHaveLength(17)
    expect(themes.map((t) => t.id)).toEqual(BUILT_IN_THEMES.map((t) => t.id))
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

  it('every theme declares a family', () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(['classic', 'vivid']).toContain(theme.family)
    }
  })

  it('listThemesByFamily splits classic and vivid without overlap', () => {
    const classic = listThemesByFamily('classic')
    const vivid = listThemesByFamily('vivid')
    expect(classic).toHaveLength(5)
    expect(vivid).toHaveLength(12)
    const classicIds = new Set(classic.map((t) => t.id))
    for (const theme of vivid) {
      expect(classicIds.has(theme.id)).toBe(false)
    }
  })

  it('only vivid themes carry a branch palette', () => {
    for (const theme of BUILT_IN_THEMES) {
      if (theme.family === 'vivid') {
        expect(theme.branchPalette?.length ?? 0).toBeGreaterThan(0)
      } else {
        expect(theme.branchPalette).toBeUndefined()
      }
    }
  })

  it('vivid branch palettes are long enough to wrap without repeating immediately', () => {
    // 分支多于色板长度时会循环取色，至少 5 色才能在常见导图里不撞色。
    for (const theme of listThemesByFamily('vivid')) {
      expect(theme.branchPalette!.length).toBeGreaterThanOrEqual(5)
      expect(new Set(theme.branchPalette!).size).toBe(theme.branchPalette!.length)
    }
  })

  it('classic theme colors are unchanged by the vivid extension', () => {
    // 经典主题色值是用户既有 .mgd 文档的外观契约，改了会静默变样。
    expect(getTheme('classic-blue').root.fill).toBe('rgba(91, 140, 255, 0.96)')
    expect(getTheme('dark').root.fill).toBe('#2d3748')
    expect(getTheme('dark').background).toBe('#1a1a2e')
  })
})
