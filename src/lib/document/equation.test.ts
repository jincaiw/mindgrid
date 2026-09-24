/**
 * 方程文档级口径的守卫。
 *
 * 这几条纯函数是"界面输入"与"落盘数据"之间的唯一转换点，一旦口径散了
 * （例如 `display: false` 有时存字段有时不存），会出现两类难查的问题：
 * ① 同一种文档状态有两种写法 → "内容是否变化"的判断要写两套；
 * ② 空串与 `null` 混用 → 布局按"有方程"预留了空间，渲染却什么都不画。
 */
import { describe, expect, it } from 'vitest'
import {
  hasTopicEquation,
  isDisplayEquation,
  isSameTopicEquation,
  normalizeEquationLatex,
  toTopicEquation,
} from './equation'

describe('方程口径', () => {
  it('首尾空白无语义；全空白视为没有方程', () => {
    expect(normalizeEquationLatex('  a^2  ')).toBe('a^2')
    expect(normalizeEquationLatex('   ')).toBe('')
    expect(normalizeEquationLatex(null)).toBe('')
    expect(normalizeEquationLatex(undefined)).toBe('')
  })

  it('只有非空 LaTeX 才算"有方程"（布局与渲染共用这一条）', () => {
    expect(hasTopicEquation({ latex: 'a^2' })).toBe(true)
    expect(hasTopicEquation({ latex: '  a^2  ' })).toBe(true)
    expect(hasTopicEquation({ latex: '   ' })).toBe(false)
    expect(hasTopicEquation({ latex: '' })).toBe(false)
    expect(hasTopicEquation(null)).toBe(false)
    expect(hasTopicEquation(undefined)).toBe(false)
  })

  it('显示模式缺省等同 inline', () => {
    expect(isDisplayEquation({ latex: 'a' })).toBe(false)
    expect(isDisplayEquation({ latex: 'a', display: false })).toBe(false)
    expect(isDisplayEquation({ latex: 'a', display: true })).toBe(true)
    expect(isDisplayEquation(null)).toBe(false)
  })

  it('空输入转成 null（= 移除），而不是一条空 LaTeX 记录', () => {
    expect(toTopicEquation('', false)).toBeNull()
    expect(toTopicEquation('   ', true)).toBeNull()
    expect(toTopicEquation(null, false)).toBeNull()
    expect(toTopicEquation(undefined, true)).toBeNull()
  })

  it('display 为 false 时**省略字段**：同一种状态不该有两种写法', () => {
    expect(toTopicEquation('a^2', false)).toEqual({ latex: 'a^2' })
    // 关键：不能是 { latex, display: undefined } 之外的第三种形态
    expect(Object.keys(toTopicEquation('a^2', false) ?? {})).toEqual(['latex'])
    expect(toTopicEquation('a^2', true)).toEqual({ latex: 'a^2', display: true })
  })

  it('转义时去掉首尾空白，落盘的就是规范形式', () => {
    expect(toTopicEquation('  \\frac{a}{b}  ', false)).toEqual({ latex: '\\frac{a}{b}' })
  })

  it('语义比较：忽略 display 的 false 与缺省之别', () => {
    expect(isSameTopicEquation({ latex: 'a' }, { latex: 'a', display: false })).toBe(true)
    expect(isSameTopicEquation({ latex: ' a ' }, { latex: 'a' })).toBe(true)
    expect(isSameTopicEquation(null, { latex: '  ' })).toBe(true)
    expect(isSameTopicEquation(undefined, null)).toBe(true)
  })

  it('语义比较：真实的差异必须被识别出来', () => {
    // 这三条是"点一下输入框就多出一条撤销记录"的守卫 —— 它们必须为 false
    expect(isSameTopicEquation({ latex: 'a' }, { latex: 'b' })).toBe(false)
    expect(isSameTopicEquation({ latex: 'a' }, { latex: 'a', display: true })).toBe(false)
    expect(isSameTopicEquation({ latex: 'a' }, { latex: 'a', display: false })).toBe(true)
    expect(isSameTopicEquation({ latex: 'a' }, null)).toBe(false)
    expect(isSameTopicEquation(null, { latex: 'a' })).toBe(false)
  })
})
