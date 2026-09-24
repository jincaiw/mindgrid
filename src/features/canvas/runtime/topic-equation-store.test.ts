import { describe, expect, it } from 'vitest'

import {
  collectTopicEquationKeys,
  colorizeEquationSvg,
  embedEquationSvg,
  pickTopicEquationPayload,
  toEquationRender,
  topicEquationKey,
} from './topic-equation-store'

const SAMPLE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="965.6" height="1083.9" role="img" viewBox="0 -833.9 965.6 1083.9"><g fill="currentColor" stroke="currentColor"><path d="M0 0"/></g></svg>'

describe('topicEquationKey / collectTopicEquationKeys', () => {
  it('空 LaTeX 视作没有方程', () => {
    expect(topicEquationKey(null)).toBeNull()
    expect(topicEquationKey({ latex: '' })).toBeNull()
    expect(topicEquationKey({ latex: '   ' })).toBeNull()
    expect(topicEquationKey({ latex: ' x ' })).toBe('inline:x')
  })

  it('display 与 inline 是不同的键（排版不同，不能共用缓存）', () => {
    expect(topicEquationKey({ latex: 'x' })).not.toBe(topicEquationKey({ latex: 'x', display: true }))
  })

  it('同一公式只出现一次（跨主题共用一次渲染）', () => {
    const keys = collectTopicEquationKeys([
      { latex: 'a^2' },
      { latex: 'a^2' },
      null,
      undefined,
      { latex: '  a^2  ' },
      { latex: 'a^2', display: true },
      { latex: '' },
    ])
    expect(keys).toEqual(['inline:a^2', 'display:a^2'])
  })
})

describe('colorizeEquationSvg', () => {
  it('只替换 fill / stroke 上的 currentColor', () => {
    const colored = colorizeEquationSvg(SAMPLE, '#123456')
    expect(colored).toContain('fill="#123456"')
    expect(colored).toContain('stroke="#123456"')
    expect(colored).not.toContain('currentColor')
  })

  it('不碰 data-* 属性里出现的同名文本（只在属性位置替换）', () => {
    const svg = '<svg><g data-latex="currentColor" fill="currentColor"/></svg>'
    const colored = colorizeEquationSvg(svg, '#000')
    expect(colored).toContain('data-latex="currentColor"')
    expect(colored).toContain('fill="#000"')
  })

  it('颜色里能破坏属性值的字符会被剔掉（畸形颜色不该弄坏整份导出）', () => {
    const colored = colorizeEquationSvg(SAMPLE, '#fff" onload="x')
    expect(colored).toContain('fill="#fff onload=x"')
  })

  it('空输入原样返回', () => {
    expect(colorizeEquationSvg('', '#000')).toBe('')
  })
})

describe('embedEquationSvg', () => {
  const rect = { x: 10, y: 20, width: 30, height: 40 }

  it('重写根标签的 x/y/宽高并补 preserveAspectRatio（否则会按 viewBox 单位摆放）', () => {
    const embedded = embedEquationSvg(SAMPLE, rect, '#111111')
    expect(embedded.startsWith('<svg x="10" y="20" width="30" height="40" preserveAspectRatio="xMidYMid meet"')).toBe(
      true,
    )
    // 原来的 width/height（viewBox 单位）必须被去掉，不能留下两个同名属性
    expect(embedded).not.toContain('width="965.6"')
    expect(embedded).not.toContain('height="1083.9"')
    // viewBox 与 xmlns 保留 —— 保住缩放语义与独立可用性
    expect(embedded).toContain('viewBox="0 -833.9 965.6 1083.9"')
    expect(embedded).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('同时落定颜色', () => {
    expect(embedEquationSvg(SAMPLE, rect, '#abcdef')).toContain('fill="#abcdef"')
  })

  it('不是 SVG 时返回空串（宁可什么都不画，也不产出半截标记）', () => {
    expect(embedEquationSvg('<div/>', rect, '#000')).toBe('')
    expect(embedEquationSvg('', rect, '#000')).toBe('')
  })
})

describe('toEquationRender / pickTopicEquationPayload', () => {
  it('成功 → 带 svg 与尺寸；失败 → 带可读错误；未渲染 → 空对象', () => {
    expect(toEquationRender({ status: 'ok', svg: '<svg/>', width: 10, height: 20 })).toEqual({
      svg: '<svg/>',
      width: 10,
      height: 20,
    })
    expect(toEquationRender({ status: 'error', message: 'Missing close brace' })).toEqual({
      error: 'Missing close brace',
    })
    expect(toEquationRender(null)).toEqual({})
  })

  it('取某主题的方程：没有方程 → null；文档有但还没渲染好 → 空对象（照样占住槽位）', () => {
    expect(pickTopicEquationPayload({ latex: '' }, {})).toBeNull()
    expect(pickTopicEquationPayload({ latex: 'x' }, {})).toEqual({})
    expect(pickTopicEquationPayload({ latex: 'x' }, { 'inline:x': { svg: '<svg/>', width: 1, height: 1 } })).toEqual(
      { svg: '<svg/>', width: 1, height: 1 },
    )
  })
})
