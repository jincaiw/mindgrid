import { describe, expect, it } from 'vitest'
import {
  CUSTOM_THEME_ID_PREFIX,
  CUSTOM_THEME_MAX_COUNT,
  CUSTOM_THEME_MAX_PALETTE_COLORS,
  CUSTOM_THEME_NAME_MAX_LENGTH,
  THEME_COLOR_FIELDS,
  THEME_COLOR_GROUPS,
  applyThemeColor,
  createCustomTheme,
  defaultCustomThemeName,
  draftPaletteFrom,
  isThemeColor,
  makeCustomThemeId,
  materializeTheme,
  normalizeThemeName,
  readCustomThemes,
  readThemeColor,
  toOpaqueHex,
  toRgba,
  type CustomTheme,
  type CustomThemePalette,
} from './custom-themes'
import { BUILT_IN_THEMES, getBuiltInTheme } from './built-in-themes'

const validPalette: CustomThemePalette = {
  background: '#ffffff',
  gridLine: '#eeeeee',
  root: { fill: '#111111', textColor: '#ffffff', borderColor: '#111111' },
  branch: { fill: '#222222', textColor: '#ffffff', borderColor: '#222222' },
  edge: '#333333',
  edgeActive: '#444444',
}

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `${CUSTOM_THEME_ID_PREFIX}alpha`,
    name: '我的风格',
    palette: validPalette,
    ...overrides,
  }
}

describe('isThemeColor', () => {
  it('只认 #rrggbb（大小写均可）', () => {
    expect(isThemeColor('#5b8def')).toBe(true)
    expect(isThemeColor('#5B8DEF')).toBe(true)
    expect(isThemeColor('  #5b8def  ')).toBe(true)
  })

  it('拒绝其它一切写法', () => {
    // 颜色会进 CSS/canvas。放行任意字符串等于把"渲染会怎么坏"交给输入方决定。
    for (const value of ['red', '#abc', '#12345', '#1234567', 'rgb(1,2,3)', 'rgba(1,2,3,0.5)', '', ' ', null, 42, {}]) {
      expect(isThemeColor(value)).toBe(false)
    }
  })
})

describe('toRgba', () => {
  it('把 hex 转成 rgba', () => {
    expect(toRgba('#5b8def', 0.62)).toBe('rgba(91, 141, 239, 0.62)')
  })

  it('非法输入原样返回（不返回一个会被当成合法色的黑）', () => {
    expect(toRgba('nope', 0.5)).toBe('nope')
  })

  it('透明度夹在 0..1', () => {
    expect(toRgba('#000000', 5)).toBe('rgba(0, 0, 0, 1)')
    expect(toRgba('#000000', -1)).toBe('rgba(0, 0, 0, 0)')
  })
})

describe('normalizeThemeName', () => {
  it('去空白并截断到上限', () => {
    expect(normalizeThemeName('  品牌色  ')).toBe('品牌色')
    expect(normalizeThemeName('x'.repeat(100))?.length).toBe(CUSTOM_THEME_NAME_MAX_LENGTH)
  })

  it('空名 / 非字符串 → null', () => {
    expect(normalizeThemeName('   ')).toBeNull()
    expect(normalizeThemeName(undefined)).toBeNull()
    expect(normalizeThemeName(7)).toBeNull()
  })
})

describe('readCustomThemes', () => {
  it('接受一条合法记录', () => {
    const themes = readCustomThemes([record()])
    expect(themes).toHaveLength(1)
    expect(themes[0].id).toBe(`${CUSTOM_THEME_ID_PREFIX}alpha`)
    expect(themes[0].name).toBe('我的风格')
    expect(themes[0].palette.background).toBe('#ffffff')
  })

  it('非数组 → 空库', () => {
    for (const raw of [undefined, null, 'x', 42, {}]) {
      expect(readCustomThemes(raw)).toEqual([])
    }
  })

  it('丢弃 id 不带前缀的记录', () => {
    // 没前缀就可能与内置 id 撞车
    expect(readCustomThemes([record({ id: 'rainbow' })])).toEqual([])
  })

  it('丢弃与内置主题同 id 的记录', () => {
    expect(readCustomThemes([record({ id: `rainbow` })])).toEqual([])
    expect(readCustomThemes([record({ id: `rainbow` })])).toHaveLength(0)
  })

  it('丢弃颜色非法的记录', () => {
    const bad = { ...validPalette, background: 'red' }
    expect(readCustomThemes([record({ palette: bad })])).toEqual([])
  })

  it('丢弃缺字段的层级配色', () => {
    const bad = { ...validPalette, root: { fill: '#111111', textColor: '#ffffff' } }
    expect(readCustomThemes([record({ palette: bad })])).toEqual([])
  })

  it('丢弃空名 / 缺配色的记录', () => {
    expect(readCustomThemes([record({ name: '   ' })])).toEqual([])
    expect(readCustomThemes([record({ palette: null })])).toEqual([])
  })

  it('坏 id 重复时只留第一条', () => {
    const themes = readCustomThemes([record(), record({ name: '另一个' })])
    expect(themes).toHaveLength(1)
    expect(themes[0].name).toBe('我的风格')
  })

  it('色板坏掉只丢色板，不丢整条风格', () => {
    // 色板是可选增强：为它丢掉用户整份风格是不成比例的
    const themes = readCustomThemes([record({ palette: { ...validPalette, branchPalette: ['red'] } })])
    expect(themes).toHaveLength(1)
    expect(themes[0].palette.branchPalette).toBeUndefined()
  })

  it('色板合法时保留，并裁到上限', () => {
    const many = Array.from({ length: 30 }, (_, i) => `#${i.toString(16).padStart(2, '0')}0000`)
    const themes = readCustomThemes([record({ palette: { ...validPalette, branchPalette: many } })])
    expect(themes[0].palette.branchPalette).toHaveLength(CUSTOM_THEME_MAX_PALETTE_COLORS)
  })

  it('条数超上限时截断', () => {
    const list = Array.from({ length: CUSTOM_THEME_MAX_COUNT + 5 }, (_, i) =>
      record({ id: `${CUSTOM_THEME_ID_PREFIX}${i}`, name: `风格 ${i}` }),
    )
    expect(readCustomThemes(list)).toHaveLength(CUSTOM_THEME_MAX_COUNT)
  })

  it('逐条丢弃坏项、保留好项（一条坏数据不带走路整份库）', () => {
    const themes = readCustomThemes([
      record(),
      'garbage',
      record({ id: `${CUSTOM_THEME_ID_PREFIX}bad`, palette: { ...validPalette, edge: 'x' } }),
      record({ id: `${CUSTOM_THEME_ID_PREFIX}beta`, name: '第二个' }),
    ])
    expect(themes.map((t) => t.name)).toEqual(['我的风格', '第二个'])
  })
})

describe('defaultCustomThemeName / makeCustomThemeId', () => {
  const make = (name: string, id = `${CUSTOM_THEME_ID_PREFIX}${name}`): CustomTheme => ({
    id,
    name,
    palette: validPalette,
  })

  it('默认名从 1 开始，跳过已占用的', () => {
    expect(defaultCustomThemeName([])).toBe('我的风格 1')
    expect(defaultCustomThemeName([make('我的风格 1')])).toBe('我的风格 2')
    expect(defaultCustomThemeName([make('我的风格 1'), make('我的风格 2')])).toBe('我的风格 3')
  })

  it('id 同 seed 且不撞车时是确定值', () => {
    expect(makeCustomThemeId([], 'abc')).toBe(`${CUSTOM_THEME_ID_PREFIX}abc`)
  })

  it('id 撞车时递增后缀', () => {
    const existing = [make('a', `${CUSTOM_THEME_ID_PREFIX}abc`)]
    expect(makeCustomThemeId(existing, 'abc')).toBe(`${CUSTOM_THEME_ID_PREFIX}abc-2`)
  })
})

describe('materializeTheme', () => {
  it('补上派生的元信息色与分组（元信息色 = 文字色 62%）', () => {
    const palette = materializeTheme({ id: `${CUSTOM_THEME_ID_PREFIX}x`, name: 'X', palette: validPalette })
    expect(palette.family).toBe('custom')
    expect(palette.root.metaTextColor).toBe(toRgba('#ffffff', 0.62))
    expect(palette.branch.metaTextColor).toBe(toRgba('#ffffff', 0.62))
    expect(palette.edgeActive).toBe('#444444')
  })

  it('不把色板数组的引用直接交出去（外部改了不该影响注册表）', () => {
    const source: CustomTheme = {
      id: `${CUSTOM_THEME_ID_PREFIX}x`,
      name: 'X',
      palette: { ...validPalette, branchPalette: ['#111111', '#222222'] },
    }
    const palette = materializeTheme(source)
    expect(palette.branchPalette).toEqual(['#111111', '#222222'])
    expect(palette.branchPalette).not.toBe(source.palette.branchPalette)
  })

  it('draftPaletteFrom 能往返（内置主题 → 草稿 → 物化后色值不变）', () => {
    const draft = draftPaletteFrom(getBuiltInTheme('rainbow'))
    const back = materializeTheme({ id: `${CUSTOM_THEME_ID_PREFIX}r`, name: 'R', palette: draft })
    const original = getBuiltInTheme('rainbow')
    expect(back.background).toBe(original.background)
    expect(back.root.fill).toBe(original.root.fill)
    expect(back.branch.fill).toBe(original.branch.fill)
    expect(back.branchPalette).toEqual(original.branchPalette)
  })

  it('草稿里不带 metaTextColor（它由文字色派生，不单独存）', () => {
    const draft = draftPaletteFrom(getBuiltInTheme('classic-blue'))
    expect('metaTextColor' in draft.root).toBe(false)
  })

  it('**每个内置主题**转成草稿后，所有颜色都是不透明 hex', () => {
    // 这条守的是本轮真实踩到的坑：内置主题里 95 处 rgba + 25 处 transparent，
    // 直接塞进取色控件会显示成黑色，保存时还会被风格库的校验整条丢掉
    // （用户看到的是"点了保存什么都没发生"）。
    for (const theme of BUILT_IN_THEMES) {
      const draft = draftPaletteFrom(theme)
      for (const field of THEME_COLOR_FIELDS) {
        expect(isThemeColor(readThemeColor(draft, field.path)), `${theme.id} / ${field.path}`).toBe(true)
      }
      for (const color of draft.branchPalette ?? []) {
        expect(isThemeColor(color), `${theme.id} / 色板`).toBe(true)
      }
    }
  })

  it('转成草稿后能被风格库接受（"保存"不会静默丢弃）', () => {
    for (const theme of BUILT_IN_THEMES) {
      const record = { id: `${CUSTOM_THEME_ID_PREFIX}${theme.id}`, name: theme.name, palette: draftPaletteFrom(theme) }
      expect(readCustomThemes([record]), theme.id).toHaveLength(1)
    }
  })
})

describe('toOpaqueHex', () => {
  it('hex 原样（统一小写）', () => {
    expect(toOpaqueHex('#5B8DEF', '#ffffff')).toBe('#5b8def')
  })

  it('rgba 按不透明度与底色合成', () => {
    // 0.5 的黑压在白底上 = 中灰
    expect(toOpaqueHex('rgba(0, 0, 0, 0.5)', '#ffffff')).toBe('#808080')
    // 不透明的 rgba 就是它自己（不受底色影响）
    expect(toOpaqueHex('rgba(10, 20, 30, 1)', '#ffffff')).toBe('#0a141e')
  })

  it('rgb() 也认', () => {
    expect(toOpaqueHex('rgb(10, 20, 30)', '#ffffff')).toBe('#0a141e')
  })

  it('transparent 退化成底色（内置里它只用于"无边框"，合成后仍是"看不出边框"）', () => {
    expect(toOpaqueHex('transparent', '#fbfbfd')).toBe('#fbfbfd')
    expect(toOpaqueHex('none', '#fbfbfd')).toBe('#fbfbfd')
  })

  it('认不出来的一律回落到底色（永远给出一个合法 hex）', () => {
    for (const value of ['', 'totally-bogus', 'url(x)', 'var(--x)']) {
      expect(isThemeColor(toOpaqueHex(value, '#123456'))).toBe(true)
      expect(toOpaqueHex(value, '#123456')).toBe('#123456')
    }
  })

  it('底色本身非法时以白为底', () => {
    expect(toOpaqueHex('rgba(0, 0, 0, 0)', 'nope')).toBe('#ffffff')
  })

  it('透明度超范围会夹住（不产生越界通道）', () => {
    expect(toOpaqueHex('rgba(0, 0, 0, 5)', '#ffffff')).toBe('#000000')
    expect(toOpaqueHex('rgba(0, 0, 0, -1)', '#ffffff')).toBe('#ffffff')
  })
})

describe('THEME_COLOR_FIELDS 的结构守卫', () => {
  it('每个分组都至少有一个字段', () => {
    for (const group of THEME_COLOR_GROUPS) {
      expect(THEME_COLOR_FIELDS.filter((field) => field.group === group.id).length).toBeGreaterThan(0)
    }
  })

  it('所有字段都能被某个分组覆盖（否则界面上永远改不到它）', () => {
    // 界面按 group 分组渲染。若某字段的 group 不在 THEME_COLOR_GROUPS 里，
    // 它就成了"规则能改、界面没有"的隐藏字段——这条断言把它挡在门外。
    const rendered = THEME_COLOR_GROUPS.flatMap((group) =>
      THEME_COLOR_FIELDS.filter((field) => field.group === group.id),
    )
    expect(rendered).toHaveLength(THEME_COLOR_FIELDS.length)
  })

  it('路径唯一（两条字段指向同一处会互相覆盖）', () => {
    const paths = THEME_COLOR_FIELDS.map((field) => field.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('每个路径都能从配色板读出合法颜色', () => {
    for (const field of THEME_COLOR_FIELDS) {
      expect(isThemeColor(readThemeColor(validPalette, field.path))).toBe(true)
    }
  })
})

describe('applyThemeColor', () => {
  const withPalette: CustomThemePalette = { ...validPalette, branchPalette: ['#111111', '#222222'] }

  it('改画布背景只动背景', () => {
    const result = applyThemeColor(validPalette, 'background', '#abcdef')
    expect(result.palette.background).toBe('#abcdef')
    expect(result.palette.root).toEqual(validPalette.root)
    expect(result.clearedBranchPalette).toBe(false)
  })

  it('改根主题不会清掉分支色板', () => {
    const result = applyThemeColor(withPalette, 'root.fill', '#abcdef')
    expect(result.clearedBranchPalette).toBe(false)
    expect(result.palette.branchPalette).toEqual(['#111111', '#222222'])
  })

  it('改分支配色会清空色板，并如实报告', () => {
    // 色板的渲染优先级高于单色 branch 配色：不清掉的话这个输入框改了也不生效（死控件）
    for (const path of ['branch.fill', 'branch.textColor', 'branch.borderColor'] as const) {
      const result = applyThemeColor(withPalette, path, '#abcdef')
      expect(result.clearedBranchPalette).toBe(true)
      expect(result.palette.branchPalette).toBeUndefined()
    }
  })

  it('本来就没有色板时，清空标记为 false（不该平白弹一条提示）', () => {
    const result = applyThemeColor(validPalette, 'branch.fill', '#abcdef')
    expect(result.palette.branchPalette).toBeUndefined()
    expect(result.clearedBranchPalette).toBe(false)
  })

  it('非法颜色不改任何东西', () => {
    const result = applyThemeColor(withPalette, 'background', 'red')
    expect(result.palette).toBe(withPalette)
    expect(result.clearedBranchPalette).toBe(false)
  })

  it('写入的颜色统一小写（避免同一色两种写法造成"看着一样但不相等"）', () => {
    expect(applyThemeColor(validPalette, 'edge', '#ABCDEF').palette.edge).toBe('#abcdef')
  })

  it('不改原对象（配色板不可变）', () => {
    const source: CustomThemePalette = { ...validPalette }
    applyThemeColor(source, 'background', '#000000')
    expect(source.background).toBe('#ffffff')
  })
})

describe('createCustomTheme', () => {
  it('盖章 id 并规范化名称', () => {
    const theme = createCustomTheme({ name: '  品牌  ', palette: validPalette }, `${CUSTOM_THEME_ID_PREFIX}z`)
    expect(theme.id).toBe(`${CUSTOM_THEME_ID_PREFIX}z`)
    expect(theme.name).toBe('品牌')
  })

  it('名称为空时兜底而不是产出一条空名记录', () => {
    const theme = createCustomTheme({ name: '   ', palette: validPalette }, `${CUSTOM_THEME_ID_PREFIX}z`)
    expect(theme.name.length).toBeGreaterThan(0)
  })
})
