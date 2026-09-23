/**
 * 自定义风格编辑器测试。
 *
 * 三条重点（都是"错了也不会报错、只会静默不对"的那类）：
 * 1. **每个可改的颜色都必须渲染出来**——字段表加了字段而界面忘了渲染，
 *    就会变成"规则能改、用户改不到"的隐藏字段。
 * 2. **改分支配色要清掉色板并说出来**——色板优先级高于单色配色，
 *    否则那个输入框是个死控件（点了没反应）。
 * 3. **预览必须跟着草稿走**——预览不跟草稿，用户就是照着一张假图在调色。
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  CUSTOM_THEME_ID_PREFIX,
  THEME_COLOR_FIELDS,
  THEME_COLOR_GROUPS,
  getTheme,
  type CustomTheme,
  type CustomThemePalette,
} from '../../lib/document/themes'
import { StyleEditor } from './style-editor'

const palette: CustomThemePalette = {
  background: '#ffffff',
  gridLine: '#eeeeee',
  root: { fill: '#111111', textColor: '#ffffff', borderColor: '#111111' },
  branch: { fill: '#222222', textColor: '#ffffff', borderColor: '#222222' },
  edge: '#333333',
  edgeActive: '#444444',
}

const existingTheme: CustomTheme = {
  id: `${CUSTOM_THEME_ID_PREFIX}alpha`,
  name: '品牌色',
  palette,
}

/**
 * 渲染编辑器并把三个 spy 单独返回。
 *
 * **不要**把它们塞进一个 `props` 对象再取用：那样类型会退化成联合类型，
 * `onSave.mock` 通不过类型检查（就得靠 as 断言糊过去）。
 */
function renderEditor(overrides: Partial<Parameters<typeof StyleEditor>[0]> = {}) {
  const onCancel = vi.fn()
  const onSave = vi.fn()
  const onDelete = vi.fn()
  render(
    <StyleEditor
      theme={null}
      baseThemeId="rainbow"
      existing={[]}
      onCancel={onCancel}
      onSave={onSave}
      onDelete={onDelete}
      {...overrides}
    />,
  )
  return { onCancel, onSave, onDelete }
}

describe('StyleEditor', () => {
  it('字段表里的每个颜色都有对应输入框（不可能有改不到的字段）', () => {
    renderEditor()
    const inputs = document.querySelectorAll('.style-editor__color input[type="color"]')
    expect(inputs).toHaveLength(THEME_COLOR_FIELDS.length)

    for (const group of THEME_COLOR_GROUPS) {
      for (const field of THEME_COLOR_FIELDS.filter((item) => item.group === group.id)) {
        expect(screen.getByLabelText(`${group.title}${field.label}`)).toBeTruthy()
      }
    }
  })

  it('预览的背景跟着草稿走（预览不是一张固定的装饰图）', () => {
    renderEditor()
    const thumb = document.querySelector('.style-editor__thumb')!
    const backgroundOf = () => thumb.querySelector('rect')?.getAttribute('fill')

    // 起点是基准主题的背景（不手写色值：基准一改测试不该跟着红）
    expect(backgroundOf()).toBe(getTheme('rainbow').background)
    fireEvent.change(screen.getByLabelText('画布背景'), { target: { value: '#102030' } })
    expect(backgroundOf()).toBe('#102030')
  })

  it('预览里的分支颜色来自**色板**而不是单色分支配色（真实解析器的深度分级行为）', () => {
    renderEditor()
    const thumb = document.querySelector('.style-editor__thumb')!
    const rainbow = getTheme('rainbow')
    const expected = [0, 1, 2].map(
      (index) => rainbow.branchPalette![index % rainbow.branchPalette!.length],
    )
    const fills = Array.from(thumb.querySelectorAll('rect')).map((rect) =>
      rect.getAttribute('fill'),
    )
    for (const color of expected) {
      expect(fills).toContain(color)
    }
    // 单色分支配色**不该**出现：出现了就说明预览没走色板那条分支
    expect(fills).not.toContain(rainbow.branch.fill)
  })

  it('基准带色板时改分支配色 → 清空色板并显式提示', () => {
    renderEditor()
    expect(screen.queryByRole('status')).toBeNull()

    fireEvent.change(screen.getByLabelText('分支主题背景'), { target: { value: '#123456' } })

    expect(screen.getByRole('status').textContent).toContain('已清空分支色板')
    // 界面随之切到「单色分支」那一支（不再有色板行）
    expect(document.querySelectorAll('.style-editor__palette-row')).toHaveLength(0)
  })

  it('保存时把清空后的配色写出去（一次点击就该得到确定结果）', () => {
    const { onSave } = renderEditor()
    fireEvent.change(screen.getByLabelText('分支主题背景'), { target: { value: '#123456' } })
    fireEvent.click(screen.getByText('保存'))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0] as CustomTheme
    expect(saved.palette.branchPalette).toBeUndefined()
    expect(saved.palette.branch.fill).toBe('#123456')
    expect(saved.id.startsWith(CUSTOM_THEME_ID_PREFIX)).toBe(true)
  })

  it('没碰分支配色时，色板会被**完整保留**（清空不能平白触发）', () => {
    const { onSave } = renderEditor()
    fireEvent.change(screen.getByLabelText('画布背景'), { target: { value: '#102030' } })
    fireEvent.click(screen.getByText('保存'))

    const saved = onSave.mock.calls[0][0] as CustomTheme
    expect(saved.palette.branchPalette?.length ?? 0).toBeGreaterThan(0)
    expect(saved.palette.background).toBe('#102030')
  })

  // 注：「非法颜色不进草稿」这条**只能单测覆盖**（见 custom-themes.test.ts 的
  // `applyThemeColor > 非法颜色不改任何东西`）：`input[type=color]` 会把非法值
  // 净化成 #000000，界面上根本造不出非法颜色，写在这里的用例测的是 jsdom 而不是产品。
  it('清空色板后能再加回来（一次误改不该让用户永久失去缤纷分支）', () => {
    renderEditor()
    fireEvent.change(screen.getByLabelText('分支主题背景'), { target: { value: '#123456' } })
    expect(screen.getByRole('status').textContent).toContain('已清空分支色板')

    fireEvent.click(screen.getByText('使用缤纷分支色板'))

    expect(screen.queryByRole('status')).toBeNull()
    expect(document.querySelectorAll('.style-editor__palette-row').length).toBeGreaterThan(0)
  })

  it('名称为空时不能保存（否则库里会出现一条没名字的记录）', () => {
    renderEditor()
    fireEvent.change(screen.getByLabelText('风格名称'), { target: { value: '   ' } })
    const save = screen.getByText('保存') as HTMLButtonElement
    expect(save.disabled).toBe(true)
  })

  it('新建时默认给一个不重名的名字', () => {
    renderEditor({ existing: [{ ...existingTheme, name: '我的风格 1' }] })
    const input = screen.getByLabelText('风格名称') as HTMLInputElement
    expect(input.value).toBe('我的风格 2')
  })

  it('编辑既有风格：预填名称与配色，且出现删除按钮', () => {
    const { onDelete } = renderEditor({ theme: existingTheme })
    expect((screen.getByLabelText('风格名称') as HTMLInputElement).value).toBe('品牌色')
    expect((screen.getByLabelText('画布背景') as HTMLInputElement).value).toBe('#ffffff')

    fireEvent.click(screen.getByText('删除'))
    expect(onDelete).toHaveBeenCalledWith(existingTheme.id)
  })

  it('新建时不显示删除（没有可删的东西）', () => {
    renderEditor()
    expect(screen.queryByText('删除')).toBeNull()
  })

  it('Esc 与关闭按钮都只回调 onCancel', () => {
    const { onCancel, onSave } = renderEditor()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('关闭'))
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('换基准会把配色重置成该基准的样子', () => {
    const { onSave } = renderEditor()
    fireEvent.change(screen.getByLabelText('基准配色'), { target: { value: 'dark' } })
    fireEvent.click(screen.getByText('保存'))

    const saved = onSave.mock.calls[0][0] as CustomTheme
    // dark 是内置经典主题：背景是深色
    expect(saved.palette.background).toBe('#1a1a2e')
  })

  it('色板颜色数到下限时不能再删（不留 1 色的"色板"）', () => {
    renderEditor()
    // 基准 rainbow 的色板 ≥5 色，一路删到下限
    let guard = 0
    while (document.querySelectorAll('.style-editor__palette-row').length > 2 && guard < 40) {
      const buttons = document.querySelectorAll<HTMLButtonElement>('.style-editor__remove')
      const enabled = Array.from(buttons).find((button) => !button.disabled)
      if (!enabled) break
      fireEvent.click(enabled)
      guard += 1
    }
    expect(document.querySelectorAll('.style-editor__palette-row')).toHaveLength(2)
    expect(
      Array.from(document.querySelectorAll<HTMLButtonElement>('.style-editor__remove')).every(
        (button) => button.disabled,
      ),
    ).toBe(true)
  })
})
