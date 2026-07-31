import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createDefaultDocument } from './default-document'

describe('createDefaultDocument', () => {
  it('creates a document with a root topic and one sheet', () => {
    const document = createDefaultDocument()

    expect(document.sheets).toHaveLength(1)
    expect(document.sheets[0].rootTopic.text).toBe('中心主题')
    expect(document.sheets[0].rootTopic.children).toHaveLength(3)
  })

  it('writes the current schema version and leaves rich fields absent', () => {
    const document = createDefaultDocument()

    expect(document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(document.schemaVersion).toBe('1.1.0')
    expect(document.sheets[0].chartType).toBeUndefined()
    expect(document.sheets[0].rootTopic.styleRef).toBeUndefined()
    expect(document.relationships).toBeUndefined()
  })
})
