/**
 * 缩放快捷键映射的守卫。
 *
 * 为什么要有这层单测：这段映射原先写在画布 keydown 的一串 if 里，
 * 而**它在 jsdom 中无法用行为断言守住**——测试视口没有真实布局，
 * `fitToView()` 与"复位到 100%"产出的缩放标签一样。
 *
 * 实测过：把 ⌘0 / ⌘1 对调后，写好的行为测试（放大两步再按 ⌘0 断言回到 100%）
 * **仍然通过**——那种"两种实现都通过"的测试比没有更糟，会制造假信心。
 * 所以把映射抽成纯函数，在这里直接钉住映射表。
 */

import { describe, expect, it } from 'vitest'
import { resolveZoomShortcut } from './zoom-shortcut'

const mod = { metaKey: true }
const ctrl = { ctrlKey: true }

describe('resolveZoomShortcut', () => {
  it('⌘0 = 实际大小、⌘1 = 适应画布（对齐 XMind 基准图与平台通例）', () => {
    expect(resolveZoomShortcut({ key: '0', ...mod })).toBe('actual')
    expect(resolveZoomShortcut({ key: '1', ...mod })).toBe('fit')
  })

  it('⌘= 与 ⌘+ 都是放大，⌘- 是缩小', () => {
    expect(resolveZoomShortcut({ key: '=', ...mod })).toBe('in')
    expect(resolveZoomShortcut({ key: '+', ...mod })).toBe('in')
    expect(resolveZoomShortcut({ key: '-', ...mod })).toBe('out')
  })

  it('Ctrl 同样生效（跨平台归一）', () => {
    expect(resolveZoomShortcut({ key: '0', ...ctrl })).toBe('actual')
    expect(resolveZoomShortcut({ key: '1', ...ctrl })).toBe('fit')
  })

  it('没有 Cmd/Ctrl 时一律不算缩放组合', () => {
    for (const key of ['0', '1', '=', '+', '-']) {
      expect(resolveZoomShortcut({ key }), key).toBeNull()
    }
  })

  it('排除 Alt：⌥⌘0 是「重设样式」、⌥⌘C/V 是样式复制粘贴，不能同时触发缩放', () => {
    expect(resolveZoomShortcut({ key: '0', ...mod, altKey: true })).toBeNull()
    expect(resolveZoomShortcut({ key: '1', ...mod, altKey: true })).toBeNull()
    expect(resolveZoomShortcut({ key: '=', ...mod, altKey: true })).toBeNull()
    expect(resolveZoomShortcut({ key: '-', ...mod, altKey: true })).toBeNull()
  })

  it('其它按键不是缩放组合', () => {
    expect(resolveZoomShortcut({ key: 's', ...mod })).toBeNull()
    expect(resolveZoomShortcut({ key: '2', ...mod })).toBeNull()
    expect(resolveZoomShortcut({ key: '', ...mod })).toBeNull()
    expect(resolveZoomShortcut({ key: 'ArrowUp', ...mod })).toBeNull()
  })
})
