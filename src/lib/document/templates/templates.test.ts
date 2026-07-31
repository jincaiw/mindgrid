import { describe, expect, it } from 'vitest'
import { findTemplate, listTemplates, templatesByCategory } from './index'
import { BUILT_IN_TEMPLATES } from './built-in-templates'

describe('templates', () => {
  it('provides at least 5 built-in templates', () => {
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThanOrEqual(5)
  })

  it('each template has a unique id', () => {
    const ids = BUILT_IN_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('each template has a valid document with at least one sheet and root topic', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      expect(template.document.sheets.length).toBeGreaterThanOrEqual(1)
      const rootTopic = template.document.sheets[0].rootTopic
      expect(rootTopic.text).toBeTruthy()
      expect(rootTopic.id).toBeTruthy()
    }
  })

  it('each template document has consistent activeSheetId', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      const sheetIds = template.document.sheets.map((s) => s.id)
      expect(sheetIds).toContain(template.document.activeSheetId)
    }
  })

  it('findTemplate returns the correct template by id', () => {
    const first = BUILT_IN_TEMPLATES[0]
    const found = findTemplate(first.id)
    expect(found).toBeDefined()
    expect(found?.id).toBe(first.id)
  })

  it('findTemplate returns undefined for unknown id', () => {
    expect(findTemplate('nonexistent')).toBeUndefined()
  })

  it('templatesByCategory filters correctly', () => {
    const blank = templatesByCategory('blank')
    expect(blank.length).toBeGreaterThanOrEqual(1)
    expect(blank.every((t) => t.category === 'blank')).toBe(true)

    const business = templatesByCategory('business')
    expect(business.length).toBeGreaterThanOrEqual(1)
    expect(business.every((t) => t.category === 'business')).toBe(true)
  })

  it('includes a blank template', () => {
    const blank = findTemplate('blank')
    expect(blank).toBeDefined()
    expect(blank?.document.sheets[0].rootTopic.children).toHaveLength(0)
  })

  it('includes a SWOT template with 4 branches', () => {
    const swot = findTemplate('swot-analysis')
    expect(swot).toBeDefined()
    expect(swot?.document.sheets[0].rootTopic.children).toHaveLength(4)
  })

  it('listTemplates returns all built-in templates', () => {
    const all = listTemplates()
    expect(all.length).toBe(BUILT_IN_TEMPLATES.length)
  })
})
