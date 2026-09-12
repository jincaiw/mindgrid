import { describe, expect, it } from 'vitest'
import {
  BRANCH_PALETTE_PRESETS,
  BRANCH_THICKNESS_OPTIONS,
  CANVAS_SETTINGS_KEYS,
  DEFAULT_CANVAS_SETTINGS,
  GLOBAL_FONT_OPTIONS,
  branchThicknessMultiplier,
  buildFontStack,
  listBranchPaletteOptions,
  readCustomPalettes,
  resolveBranchPalette,
  resolveCanvasSettings,
} from './canvas-settings'

describe('resolveCanvasSettings', () => {
  it('无设置时全部回落到默认值', () => {
    expect(resolveCanvasSettings(undefined)).toEqual(DEFAULT_CANVAS_SETTINGS)
    expect(resolveCanvasSettings({})).toEqual(DEFAULT_CANVAS_SETTINGS)
  })

  it('读取布尔设置', () => {
    const settings = resolveCanvasSettings({
      [CANVAS_SETTINGS_KEYS.showGrid]: true,
      [CANVAS_SETTINGS_KEYS.balance]: true,
      [CANVAS_SETTINGS_KEYS.compact]: true,
      [CANVAS_SETTINGS_KEYS.alignSiblings]: true,
    })
    expect(settings.showGrid).toBe(true)
    expect(settings.balance).toBe(true)
    expect(settings.compact).toBe(true)
    expect(settings.alignSiblings).toBe(true)
  })

  it('解析自定义配色：逐条丢弃损坏项，保留合法项', () => {
    const settings = {
      [CANVAS_SETTINGS_KEYS.customPalettes]: [
        { id: 'custom-brand', name: '品牌色', colors: ['#112233', '#445566'] },
        // 缺前缀 → 丢弃（避免与内置预设 id 撞车）
        { id: 'brand', name: '无前缀', colors: ['#112233', '#445566'] },
        // 颜色不足两项 → 丢弃
        { id: 'custom-one', name: '单色', colors: ['#112233'] },
        // 非法颜色被过滤后不足两项 → 丢弃
        { id: 'custom-bad', name: '坏色', colors: ['#112233', 'red'] },
        { id: 'custom-ok', name: '第二套', colors: ['#112233', 'red', '#445566'] },
        'not-an-object',
      ],
    }

    expect(readCustomPalettes(settings)).toEqual([
      { id: 'custom-brand', name: '品牌色', colors: ['#112233', '#445566'] },
      { id: 'custom-ok', name: '第二套', colors: ['#112233', '#445566'] },
    ])
    expect(resolveCanvasSettings(settings).customPalettes).toHaveLength(2)
  })

  it('自定义色板 id 能被选中，不因内置枚举校验被回落成彩虹', () => {
    const settings = {
      [CANVAS_SETTINGS_KEYS.customPalettes]: [
        { id: 'custom-brand', name: '品牌色', colors: ['#112233', '#445566'] },
      ],
      [CANVAS_SETTINGS_KEYS.branchPalette]: 'custom-brand',
    }

    expect(resolveCanvasSettings(settings).branchPalette).toBe('custom-brand')

    // 方案被删掉之后，这个 id 就非法了 → 回落彩虹，不会留下"选了个不存在的方案"
    const removed = { ...settings, [CANVAS_SETTINGS_KEYS.customPalettes]: [] }
    expect(resolveCanvasSettings(removed).branchPalette).toBe('rainbow')
  })

  it('解析色板时优先自定义，再回落内置', () => {
    const custom = [{ id: 'custom-brand', name: '品牌色', colors: ['#112233', '#445566'] }]

    expect(resolveBranchPalette('custom-brand', custom)).toEqual(['#112233', '#445566'])
    expect(resolveBranchPalette('ocean', custom)).toEqual(
      BRANCH_PALETTE_PRESETS.find((preset) => preset.id === 'ocean')!.colors,
    )
    // 未知 id 回落到内置首套，不返回空数组（空数组会让所有分支同色）
    expect(resolveBranchPalette('nope', custom).length).toBeGreaterThan(0)
  })

  it('选择器列表把自定义配色排在内置之后', () => {
    const options = listBranchPaletteOptions([
      { id: 'custom-brand', name: '品牌色', colors: ['#112233', '#445566'] },
    ])

    expect(options.slice(0, BRANCH_PALETTE_PRESETS.length)).toEqual([...BRANCH_PALETTE_PRESETS])
    expect(options[options.length - 1]).toEqual({
      id: 'custom-brand',
      label: '品牌色',
      colors: ['#112233', '#445566'],
    })
  })

  it('分支自由布局默认关闭，可显式打开', () => {
    expect(DEFAULT_CANVAS_SETTINGS.freeBranchLayout).toBe(false)
    expect(
      resolveCanvasSettings({ [CANVAS_SETTINGS_KEYS.freeBranchLayout]: true })
        .freeBranchLayout,
    ).toBe(true)
  })

  it('关闭自由主题后 freeTopic 为 false（默认 true）', () => {
    expect(DEFAULT_CANVAS_SETTINGS.freeTopic).toBe(true)
    expect(
      resolveCanvasSettings({ [CANVAS_SETTINGS_KEYS.freeTopic]: false }).freeTopic,
    ).toBe(false)
  })

  it('彩虹分支是三态：未设置时为 null，交给主题决定', () => {
    expect(resolveCanvasSettings({}).rainbowBranch).toBeNull()
    expect(resolveCanvasSettings({ [CANVAS_SETTINGS_KEYS.rainbowBranch]: true }).rainbowBranch)
      .toBe(true)
    expect(resolveCanvasSettings({ [CANVAS_SETTINGS_KEYS.rainbowBranch]: false }).rainbowBranch)
      .toBe(false)
  })

  it('背景色非法值一律当作"跟随主题"', () => {
    const cases: unknown[] = ['red', '#12345', 'rgb(1,2,3)', 123, {}, [], null]
    for (const value of cases) {
      const settings = resolveCanvasSettings({ [CANVAS_SETTINGS_KEYS.background]: value })
      expect(settings.background).toBeNull()
    }
  })

  it('背景色 #rgb 与 #rrggbb 都接受', () => {
    expect(
      resolveCanvasSettings({ [CANVAS_SETTINGS_KEYS.background]: '#f0a' }).background,
    ).toBe('#f0a')
    expect(
      resolveCanvasSettings({ [CANVAS_SETTINGS_KEYS.background]: '#FF0088' }).background,
    ).toBe('#FF0088')
  })

  it('枚举字段存了未知值时回落默认，不影响其他字段', () => {
    const settings = resolveCanvasSettings({
      [CANVAS_SETTINGS_KEYS.fontFamily]: 'not-a-font',
      [CANVAS_SETTINGS_KEYS.cjkFont]: 'not-a-cjk',
      [CANVAS_SETTINGS_KEYS.branchThickness]: 'enormous',
      [CANVAS_SETTINGS_KEYS.branchPalette]: 'not-a-palette',
      [CANVAS_SETTINGS_KEYS.showGrid]: true,
    })
    expect(settings.fontFamily).toBe('default')
    expect(settings.cjkFont).toBe('default')
    expect(settings.branchThickness).toBe('default')
    expect(settings.branchPalette).toBe('rainbow')
    // 相邻字段不受污染
    expect(settings.showGrid).toBe(true)
  })

  it('枚举字段存了非字符串时回落默认', () => {
    const settings = resolveCanvasSettings({
      [CANVAS_SETTINGS_KEYS.fontFamily]: 42,
      [CANVAS_SETTINGS_KEYS.branchThickness]: { heavy: true },
    })
    expect(settings.fontFamily).toBe('default')
    expect(settings.branchThickness).toBe('default')
  })

  it('合法枚举值被原样读出', () => {
    const settings = resolveCanvasSettings({
      [CANVAS_SETTINGS_KEYS.fontFamily]: 'mono',
      [CANVAS_SETTINGS_KEYS.cjkFont]: 'optimized',
      [CANVAS_SETTINGS_KEYS.branchThickness]: 'thick',
      [CANVAS_SETTINGS_KEYS.branchPalette]: 'ocean',
    })
    expect(settings.fontFamily).toBe('mono')
    expect(settings.cjkFont).toBe('optimized')
    expect(settings.branchThickness).toBe('thick')
    expect(settings.branchPalette).toBe('ocean')
  })
})

describe('buildFontStack', () => {
  it('每个字体选项都能拼出非空字体栈', () => {
    for (const option of GLOBAL_FONT_OPTIONS) {
      const stack = buildFontStack(option.id, 'default')
      expect(stack.startsWith(option.segment)).toBe(true)
      expect(stack).not.toBe('')
    }
  })

  it('CJK 段随 cjkFont 设置变化', () => {
    const plain = buildFontStack('default', 'default')
    const optimized = buildFontStack('default', 'optimized')
    expect(optimized).not.toBe(plain)
    expect(optimized).toContain('Source Han Sans SC')
    expect(plain).not.toContain('Source Han Sans SC')
  })

  it('字体栈始终以西文回退结尾', () => {
    expect(buildFontStack('mono', 'default').endsWith('sans-serif')).toBe(true)
  })
})

describe('分支线粗细与色板', () => {
  it('粗细档位与乘数一一对应，且单调递增', () => {
    const multipliers = BRANCH_THICKNESS_OPTIONS.map((option) => option.multiplier)
    expect(multipliers).toEqual([1, 0.75, 1.5, 2])
    // 默认档在第一位，其余按细→粗
    expect(BRANCH_THICKNESS_OPTIONS[0].id).toBe('default')
  })

  it('未知粗细 id 回落乘数 1', () => {
    expect(branchThicknessMultiplier('nonexistent' as 'default')).toBe(1)
  })

  it('色板预设至少有 5 色且无重复色', () => {
    for (const preset of BRANCH_PALETTE_PRESETS) {
      expect(preset.colors.length).toBeGreaterThanOrEqual(5)
      expect(new Set(preset.colors).size).toBe(preset.colors.length)
    }
  })

  it('未知色板 id 回落第一套', () => {
    expect(resolveBranchPalette('nonexistent')).toBe(BRANCH_PALETTE_PRESETS[0].colors)
    expect(resolveBranchPalette('ocean')).toBe(BRANCH_PALETTE_PRESETS[1].colors)
  })
})
