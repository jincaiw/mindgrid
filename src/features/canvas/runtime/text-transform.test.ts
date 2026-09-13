import { describe, expect, it } from 'vitest'

import {
  applyTextTransform,
  nextTextTransform,
  TEXT_TRANSFORM_CYCLE,
} from './text-transform'

describe('applyTextTransform', () => {
  it('缺省与 none 都原样返回', () => {
    expect(applyTextTransform('Hello 世界', undefined)).toBe('Hello 世界')
    expect(applyTextTransform('Hello 世界', 'none')).toBe('Hello 世界')
  })

  it('uppercase / lowercase 整体转换且保持长度', () => {
    expect(applyTextTransform('Hello world', 'uppercase')).toBe('HELLO WORLD')
    expect(applyTextTransform('Hello WORLD', 'lowercase')).toBe('hello world')
    expect(applyTextTransform('Hello world', 'uppercase')).toHaveLength(11)
  })

  it('capitalize 逐单词首字母大写', () => {
    expect(applyTextTransform('hello world', 'capitalize')).toBe('Hello World')
    expect(applyTextTransform('a  b   c', 'capitalize')).toBe('A  B   C')
    // 只动首字母，其余字符保持原样（与 CSS text-transform: capitalize 同语义）
    expect(applyTextTransform('hELLO wORLD', 'capitalize')).toBe('HELLO WORLD')
    expect(applyTextTransform('hELLO', 'capitalize')).toBe('HELLO')
  })

  it('空文本原样返回', () => {
    expect(applyTextTransform('', 'uppercase')).toBe('')
  })

  it('多行文本逐行转换', () => {
    expect(applyTextTransform('a\nb', 'capitalize')).toBe('A\nB')
  })
})

describe('nextTextTransform', () => {
  it('按循环顺序推进', () => {
    expect(nextTextTransform(undefined)).toBe('uppercase')
    expect(nextTextTransform('uppercase')).toBe('lowercase')
    expect(nextTextTransform('lowercase')).toBe('capitalize')
    expect(nextTextTransform('capitalize')).toBe('none')
  })

  it('未知值从 none 重新开始', () => {
    expect(nextTextTransform('bogus' as never)).toBe('none')
  })

  it('循环表覆盖全部合法状态且无重复', () => {
    expect(new Set(TEXT_TRANSFORM_CYCLE).size).toBe(TEXT_TRANSFORM_CYCLE.length)
    expect(TEXT_TRANSFORM_CYCLE).toContain('none')
    expect(TEXT_TRANSFORM_CYCLE).toContain('uppercase')
    expect(TEXT_TRANSFORM_CYCLE).toContain('lowercase')
    expect(TEXT_TRANSFORM_CYCLE).toContain('capitalize')
  })
})
