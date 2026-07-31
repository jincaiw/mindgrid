import { describe, expect, it } from 'vitest'
import { resolveThemeBackground, resolveThemeEdge, resolveTopicStyle } from './style-resolver'

describe('resolveTopicStyle', () => {
  it('returns root colors for depth 0 without overrides', () => {
    const style = resolveTopicStyle('classic-blue', 0, 'center', undefined)
    expect(style.fill).toBe('rgba(91, 140, 255, 0.96)')
    expect(style.textColor).toBe('#ffffff')
    expect(style.metaTextColor).toBe('rgba(255, 255, 255, 0.82)')
    expect(style.borderColor).toBe('transparent')
  })

  it('returns branch colors for depth > 0 without overrides', () => {
    const style = resolveTopicStyle('classic-blue', 1, 'left', undefined)
    expect(style.fill).toBe('#ffffff')
    expect(style.textColor).toBe('#1d1d1f')
    expect(style.metaTextColor).toBe('rgba(60, 60, 67, 0.6)')
    expect(style.borderColor).toBe('rgba(0, 0, 0, 0.08)')
  })

  it('applies fill override over theme default', () => {
    const style = resolveTopicStyle('classic-blue', 1, 'right', { fill: '#ff0000' })
    expect(style.fill).toBe('#ff0000')
    // Non-overridden properties keep theme defaults
    expect(style.textColor).toBe('#1d1d1f')
    expect(style.borderColor).toBe('rgba(0, 0, 0, 0.08)')
  })

  it('applies textColor and borderColor overrides', () => {
    const style = resolveTopicStyle('dark', 0, 'center', {
      textColor: '#00ff00',
      borderColor: '#ff00ff',
    })
    expect(style.textColor).toBe('#00ff00')
    expect(style.borderColor).toBe('#ff00ff')
    // fill not overridden → keeps theme root fill
    expect(style.fill).toBe('#2d3748')
  })

  it('does not allow metaTextColor to be overridden', () => {
    const style = resolveTopicStyle('classic-blue', 0, 'center', {
      // @ts-expect-error — metaTextColor is not in TopicStyleOverrides
      metaTextColor: '#fake',
    })
    // metaTextColor always comes from theme
    expect(style.metaTextColor).toBe('rgba(255, 255, 255, 0.82)')
  })

  it('falls back to default theme for undefined themeId', () => {
    const style = resolveTopicStyle(undefined, 0, 'center', undefined)
    expect(style.fill).toBe('rgba(91, 140, 255, 0.96)')
  })

  it('falls back to default theme for unknown themeId', () => {
    const style = resolveTopicStyle('nonexistent', 0, 'center', undefined)
    expect(style.fill).toBe('rgba(91, 140, 255, 0.96)')
  })

  it('resolves all 5 themes for root and branch levels', () => {
    const themeIds = ['classic-blue', 'dark', 'warm', 'cool', 'minimal']
    for (const id of themeIds) {
      const rootStyle = resolveTopicStyle(id, 0, 'center', undefined)
      const branchStyle = resolveTopicStyle(id, 1, 'left', undefined)
      expect(rootStyle.fill).toBeTruthy()
      expect(branchStyle.fill).toBeTruthy()
      expect(rootStyle.fill).not.toBe(branchStyle.fill)
    }
  })

  it('applies full overrides with all three properties', () => {
    const style = resolveTopicStyle('warm', 2, 'right', {
      fill: '#abcdef',
      textColor: '#123456',
      borderColor: '#789abc',
    })
    expect(style).toEqual({
      fill: '#abcdef',
      textColor: '#123456',
      metaTextColor: 'rgba(124, 45, 18, 0.54)', // from theme branch
      borderColor: '#789abc',
    })
  })
})

describe('resolveThemeBackground', () => {
  it('returns background and gridLine for classic-blue', () => {
    const bg = resolveThemeBackground('classic-blue')
    expect(bg.background).toBe('#f5f5f7')
    expect(bg.gridLine).toBe('rgba(0, 0, 0, 0.06)')
  })

  it('returns background for dark theme', () => {
    const bg = resolveThemeBackground('dark')
    expect(bg.background).toBe('#1a1a2e')
  })

  it('falls back to default for undefined', () => {
    const bg = resolveThemeBackground(undefined)
    expect(bg.background).toBe('#f5f5f7')
  })
})

describe('resolveThemeEdge', () => {
  it('returns edge and edgeActive colors', () => {
    const edge = resolveThemeEdge('classic-blue')
    expect(edge.edge).toBe('rgba(41, 88, 176, 0.34)')
    expect(edge.edgeActive).toBe('rgba(59, 130, 246, 0.74)')
  })

  it('returns edge for warm theme', () => {
    const edge = resolveThemeEdge('warm')
    expect(edge.edge).toBe('rgba(194, 65, 12, 0.34)')
  })
})
