import { describe, expect, it } from 'vitest'
import {
  TOPIC_IMAGE_DIALOG_OPTIONS,
  TOPIC_IMAGE_EXTENSIONS,
  toSelectedImagePath,
} from './topic-image-picker'

describe('TOPIC_IMAGE_DIALOG_OPTIONS', () => {
  it('asks for a single file, not a directory', () => {
    expect(TOPIC_IMAGE_DIALOG_OPTIONS.multiple).toBe(false)
    expect(TOPIC_IMAGE_DIALOG_OPTIONS.directory).toBe(false)
  })

  it('limits the picker to renderable image formats', () => {
    const extensions = TOPIC_IMAGE_DIALOG_OPTIONS.filters[0].extensions
    expect(extensions).toEqual([...TOPIC_IMAGE_EXTENSIONS])
    // 与 Rust 白名单一致：不含 bmp/tiff 等不可渲染格式
    expect(extensions).toContain('png')
    expect(extensions).toContain('svg')
    expect(extensions).not.toContain('bmp')
  })
})

describe('toSelectedImagePath', () => {
  it('accepts a plain path', () => {
    expect(toSelectedImagePath('/Users/jason/a.png')).toBe('/Users/jason/a.png')
  })

  it('takes the first usable entry from an array result', () => {
    expect(toSelectedImagePath(['/t/one.png', '/t/two.png'])).toBe('/t/one.png')
    expect(toSelectedImagePath([null, '/t/two.png'])).toBe('/t/two.png')
  })

  it('returns null for cancellation and unusable values', () => {
    expect(toSelectedImagePath(null)).toBeNull()
    expect(toSelectedImagePath(undefined)).toBeNull()
    expect(toSelectedImagePath('')).toBeNull()
    expect(toSelectedImagePath('   ')).toBeNull()
    expect(toSelectedImagePath([])).toBeNull()
    expect(toSelectedImagePath({ path: '/t/obj.png' })).toBeNull()
    expect(toSelectedImagePath(42)).toBeNull()
  })
})
