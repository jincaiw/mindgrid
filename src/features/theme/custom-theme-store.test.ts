import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CUSTOM_THEME_ID_PREFIX, type CustomTheme, type CustomThemePalette } from '../../lib/document/themes'
import { getCustomThemes, setCustomThemes } from '../../lib/document/themes'
import {
  CUSTOM_THEME_STORAGE_KEY,
  deleteCustomTheme,
  loadCustomThemes,
  persistCustomThemes,
  upsertCustomTheme,
} from './custom-theme-store'

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

beforeEach(() => {
  localStorage.clear()
  setCustomThemes([])
})

afterEach(() => {
  localStorage.clear()
  setCustomThemes([])
})

describe('custom-theme-store', () => {
  it('写入后能读回（含跨实例：模拟重启）', () => {
    persistCustomThemes([theme('a', '品牌色')])
    expect(getCustomThemes()).toHaveLength(1)

    // 模拟"重启"：清空内存里的注册表，再从头加载
    setCustomThemes([])
    expect(getCustomThemes()).toEqual([])

    const loaded = loadCustomThemes()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('品牌色')
    expect(getCustomThemes()).toHaveLength(1)
  })

  it('落盘的是**校验后**的数据（坏数据不进磁盘）', () => {
    persistCustomThemes([theme('a'), { ...theme('b'), palette: { ...palette, background: 'red' } }])
    const raw = JSON.parse(localStorage.getItem(CUSTOM_THEME_STORAGE_KEY) ?? '[]')
    expect(raw).toHaveLength(1)
    expect(raw[0].id).toBe(`${CUSTOM_THEME_ID_PREFIX}a`)
  })

  it('坏 JSON：当作空库，但**不覆写**用户原有的数据', () => {
    // 覆写就等于把用户的数据永久毁掉；留着还有人工抢救的余地
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, '{ this is not json')
    expect(loadCustomThemes()).toEqual([])
    expect(getCustomThemes()).toEqual([])
    expect(localStorage.getItem(CUSTOM_THEME_STORAGE_KEY)).toBe('{ this is not json')
  })

  it('存储里混着坏条目时逐条丢弃、保留好条目', () => {
    localStorage.setItem(
      CUSTOM_THEME_STORAGE_KEY,
      JSON.stringify([theme('a'), 'garbage', { id: 'no-prefix', name: 'x', palette }, theme('b')]),
    )
    const loaded = loadCustomThemes()
    expect(loaded.map((t) => t.id)).toEqual([
      `${CUSTOM_THEME_ID_PREFIX}a`,
      `${CUSTOM_THEME_ID_PREFIX}b`,
    ])
  })

  it('没有存储时是空库（不抛）', () => {
    expect(loadCustomThemes()).toEqual([])
  })

  it('upsert 新增与覆盖各走一条路', () => {
    upsertCustomTheme(theme('a', '第一版'))
    expect(getCustomThemes()[0].name).toBe('第一版')

    upsertCustomTheme(theme('a', '改过名'))
    expect(getCustomThemes()).toHaveLength(1)
    expect(getCustomThemes()[0].name).toBe('改过名')
  })

  it('删除只删指定那条', () => {
    upsertCustomTheme(theme('a'))
    upsertCustomTheme(theme('b'))
    deleteCustomTheme(`${CUSTOM_THEME_ID_PREFIX}a`)
    expect(getCustomThemes().map((t) => t.id)).toEqual([`${CUSTOM_THEME_ID_PREFIX}b`])

    // 存储里也同步删掉了（否则重启会"复活"）
    expect(JSON.parse(localStorage.getItem(CUSTOM_THEME_STORAGE_KEY) ?? '[]')).toHaveLength(1)
  })
})
