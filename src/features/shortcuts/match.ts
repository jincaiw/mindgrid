/**
 * 快捷键匹配工具（批次 20）。
 *
 * 将 metaKey（macOS ⌘）/ ctrlKey（Windows/Linux）归一为统一的 mod 修饰键，
 * 精确匹配主键与全部修饰键，避免 Cmd+S 误匹配 Cmd+Shift+S 等。
 *
 * 用于替换散落在各组件里的手写 `e.metaKey || e.ctrlKey && e.key === ...` 判断。
 */

import type { KeyCombo } from './registry'

/** React 与原生 KeyboardEvent 共有的修饰键/键字段。 */
interface KeyboardLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * 判断事件是否精确匹配某个键组合。
 *
 * 修饰键全部参与精确比对（未声明的修饰键必须未按下）：
 * - mod：metaKey || ctrlKey（跨平台归一）
 * - shift：shiftKey
 * - alt：altKey
 *
 * 主键大小写不敏感（'a' 匹配 'A'），与浏览器对字母键的行为一致。
 */
export function matchesShortcut(event: KeyboardLike, combo: KeyCombo): boolean {
  const wantMod = combo.mod ?? false
  const hasMod = event.metaKey || event.ctrlKey
  if (wantMod !== hasMod) return false
  if ((combo.shift ?? false) !== event.shiftKey) return false
  if ((combo.alt ?? false) !== event.altKey) return false
  return event.key.toLowerCase() === combo.key.toLowerCase()
}

/** 判断事件是否匹配注册表中任一快捷键（按 id 精确查找）。 */
export function matchesShortcutId(
  event: KeyboardLike,
  id: string,
  combos: ReadonlyArray<{ id: string; combo: KeyCombo }>,
): boolean {
  const def = combos.find((c) => c.id === id)
  return def ? matchesShortcut(event, def.combo) : false
}
