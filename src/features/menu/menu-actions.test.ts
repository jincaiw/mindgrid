import { isMenuActionId, MENU_ACTION_IDS, toCanvasCommand } from './menu-actions'
// 用 Vite 的 ?raw 直接把 Rust 源码读成字符串，避免依赖 node:fs
// （测试跑在 jsdom 环境，没有 node 类型与 import.meta.url 的 file: 语义）。
import menuRsSource from '../../../src-tauri/src/app/menu.rs?raw'

it('has no duplicated action ids', () => {
  expect(new Set(MENU_ACTION_IDS).size).toBe(MENU_ACTION_IDS.length)
})

it('accepts known ids and rejects unknown ones', () => {
  expect(isMenuActionId('file.save')).toBe(true)
  expect(isMenuActionId('format.chart.fishbone')).toBe(true)
  expect(isMenuActionId('file.delete-everything')).toBe(false)
  expect(isMenuActionId('')).toBe(false)
  expect(isMenuActionId(null)).toBe(false)
  expect(isMenuActionId(42)).toBe(false)
})

/**
 * 契约测试：TS 侧的 id 清单必须与 Rust 侧 menu.rs 里注册的一致。
 *
 * 这是整个菜单栏最容易悄悄坏掉的地方——任一侧改了 id 而另一侧没跟，
 * 菜单项点击后会静默失效（Rust 转发了 id，前端 isMenuActionId 判否后直接丢弃），
 * 且没有任何编译期信号：两侧语言不同，谁也约束不了谁。
 */
it('stays in sync with the ids registered in src-tauri/src/app/menu.rs', () => {
  // 匹配 item(handle, "id", …) 这个辅助函数的调用点。
  // 不直接匹配 MenuItem::with_id —— 那里拿到的是变量名而非字面量。
  // PredefinedMenuItem::about 不经过 item()，天然被排除。
  const rustIds = [...menuRsSource.matchAll(/\bitem\(\s*handle\s*,\s*"([^"]+)"/g)].map(
    (match) => match[1],
  )

  expect(rustIds.length).toBeGreaterThan(30)
  expect(new Set(rustIds).size).toBe(rustIds.length)
  expect([...rustIds].sort()).toEqual([...MENU_ACTION_IDS].sort())
})

it('routes only clipboard and camera commands to the canvas host', () => {
  expect(toCanvasCommand('edit.copy')).toBe('edit.copy')
  expect(toCanvasCommand('edit.cut')).toBe('edit.cut')
  expect(toCanvasCommand('edit.paste')).toBe('edit.paste')
  expect(toCanvasCommand('view.recenter')).toBe('view.recenter')

  // 其余动作外层直接执行，不该转发
  expect(toCanvasCommand('edit.select-all')).toBeNull()
  expect(toCanvasCommand('insert.child')).toBeNull()
  expect(toCanvasCommand('view.collapse')).toBeNull()
})
