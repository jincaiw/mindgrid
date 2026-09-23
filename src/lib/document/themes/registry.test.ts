import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_THEMES, DEFAULT_THEME_ID } from './built-in-themes'
import { CUSTOM_THEME_ID_PREFIX, type CustomTheme, type CustomThemePalette } from './custom-themes'
import {
  getCustomThemes,
  getTheme,
  isThemeResolvable,
  listThemes,
  listThemesByFamily,
  setCustomThemes,
  subscribeCustomThemes,
} from './registry'

const palette: CustomThemePalette = {
  background: '#ffffff',
  gridLine: '#eeeeee',
  root: { fill: '#111111', textColor: '#ffffff', borderColor: '#111111' },
  branch: { fill: '#222222', textColor: '#ffffff', borderColor: '#222222' },
  edge: '#333333',
  edgeActive: '#444444',
}

const theme = (id: string, name = '我的风格'): CustomTheme => ({
  id: `${CUSTOM_THEME_ID_PREFIX}${id}`,
  name,
  palette,
})

afterEach(() => {
  // 注册表是模块级状态：用例之间必须复位，否则会互相串
  setCustomThemes([])
})

describe('registry', () => {
  it('空库时行为与只有内置时完全一致', () => {
    expect(getTheme('rainbow').id).toBe('rainbow')
    expect(getTheme(undefined).id).toBe(DEFAULT_THEME_ID)
    expect(listThemes()).toHaveLength(BUILT_IN_THEMES.length)
    expect(listThemesByFamily('custom')).toEqual([])
  })

  it('按 id 解析出自定义风格（这是本功能的**核心行为**：漏了它 = 选了不生效）', () => {
    setCustomThemes([theme('a', '品牌色')])
    const resolved = getTheme(`${CUSTOM_THEME_ID_PREFIX}a`)
    expect(resolved.name).toBe('品牌色')
    expect(resolved.family).toBe('custom')
    expect(resolved.background).toBe('#ffffff')
  })

  it('未知 id 回落到默认主题（文档来自别的机器时会走到这条）', () => {
    expect(getTheme(`${CUSTOM_THEME_ID_PREFIX}ghost`).id).toBe(DEFAULT_THEME_ID)
    expect(getTheme('').id).toBe(DEFAULT_THEME_ID)
  })

  it('自定义风格不能覆盖内置 id', () => {
    // 前缀已经隔离了绝大多数情况；这条挡的是"数据被手改成内置 id"
    setCustomThemes([{ id: 'rainbow', name: '假的', palette }])
    expect(getCustomThemes()).toEqual([])
    expect(getTheme('rainbow').name).not.toBe('假的')
  })

  it('重复 id 只留第一条', () => {
    setCustomThemes([theme('a', '第一个'), theme('a', '第二个')])
    expect(getCustomThemes()).toHaveLength(1)
    expect(getCustomThemes()[0].name).toBe('第一个')
  })

  it('listThemes 把自定义排在**内置之后**（选择器里自定义在下半区）', () => {
    setCustomThemes([theme('a')])
    const themes = listThemes()
    expect(themes).toHaveLength(BUILT_IN_THEMES.length + 1)
    expect(themes[themes.length - 1].id).toBe(`${CUSTOM_THEME_ID_PREFIX}a`)
  })

  it('listThemesByFamily 只返回对应分组', () => {
    setCustomThemes([theme('a')])
    expect(listThemesByFamily('custom')).toHaveLength(1)
    expect(listThemesByFamily('classic').every((t) => t.family === 'classic')).toBe(true)
    expect(listThemesByFamily('vivid').every((t) => t.family === 'vivid')).toBe(true)
  })

  it('isThemeResolvable 区分「本机有」与「本机没有」', () => {
    setCustomThemes([theme('a')])
    expect(isThemeResolvable('rainbow')).toBe(true)
    expect(isThemeResolvable(`${CUSTOM_THEME_ID_PREFIX}a`)).toBe(true)
    expect(isThemeResolvable(`${CUSTOM_THEME_ID_PREFIX}ghost`)).toBe(false)
    expect(isThemeResolvable(undefined)).toBe(true)
  })

  it('getCustomThemes 在库不变时返回**同一个引用**（快照稳定是订阅的前提）', () => {
    setCustomThemes([theme('a')])
    expect(getCustomThemes()).toBe(getCustomThemes())
  })

  it('注册表变更时通知订阅者；退订后不再收到', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeCustomThemes(listener)

    setCustomThemes([theme('a')])
    expect(listener).toHaveBeenCalledTimes(1)

    setCustomThemes([theme('a'), theme('b')])
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    setCustomThemes([])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('同一份数据重复写入也会通知（订阅者据此重算，不会读到过期值）', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeCustomThemes(listener)
    setCustomThemes([theme('a')])
    listener.mockClear()
    setCustomThemes([theme('a', '改了名')])
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
