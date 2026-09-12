import { describe, expect, it } from 'vitest'
import { mixWithBlack, mixWithWhite } from './color-utils'

describe('color-utils', () => {
  it('mixes towards white and black by ratio', () => {
    expect(mixWithWhite('#000000', 0)).toBe('#000000')
    expect(mixWithWhite('#000000', 1)).toBe('#ffffff')
    expect(mixWithWhite('#000000', 0.5)).toBe('#808080')
    expect(mixWithBlack('#ffffff', 0.5)).toBe('#808080')
  })

  it('clamps out-of-range ratios', () => {
    expect(mixWithWhite('#123456', 2)).toBe('#ffffff')
    expect(mixWithBlack('#123456', -1)).toBe('#123456')
  })

  it('returns the input unchanged for unsupported formats', () => {
    // 不做隐形兜底：非法色原样返回，调用方仍能看到可见结果而不是变成黑块
    expect(mixWithWhite('rgba(1,2,3,0.5)', 0.5)).toBe('rgba(1,2,3,0.5)')
    expect(mixWithBlack('not-a-color', 0.5)).toBe('not-a-color')
    expect(mixWithBlack('#abc', 0.5)).toBe('#abc')
  })
})
