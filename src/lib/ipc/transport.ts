import { invoke } from '@tauri-apps/api/core'
import { invokeBrowserCommand } from './browser-session'

export function hasTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * 把 payload 的**顶层**键转成 Tauri 期望的 lowerCamelCase。
 *
 * 为什么需要这一步（2026-09-25 真机实测）：
 * `#[tauri::command]` 的默认参数命名是 `ArgumentCase::Camel`
 * （`tauri-macros` 的 `WrapperAttributes` 默认值），运行时用
 * `CommandItem::deserialize_json` 里的 `v.get(self.key)` 取值 —— 也就是说
 * **Rust 参数 `topic_id` 必须由 JS 以 `topicId` 传入**。
 * 而本项目 `commands.ts` 的顶层键一直写的是 snake_case（与 Rust 参数一一对应，
 * 读起来更接近源码），于是真机上 40 多个命令全部报
 * `invalid args \`topicId\` for command \`select_topic\`: command select_topic missing required key topicId`。
 * 浏览器降级链路（`invokeBrowserCommand`）是自己读 payload 的，按 snake_case 工作正常，
 * 所以此前所有自动化验证（Chromium + jsdom）都没发现。
 *
 * 只转顶层键：嵌套对象进的是 serde 结构体，它们已经带
 * `#[serde(rename_all = "camelCase")]`，深转会把 `positions: [{ topicId }]` 这类改坏。
 */
export function toTauriCommandArgs(payload?: Record<string, unknown>) {
  if (!payload) {
    return undefined
  }
  const converted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    converted[toLowerCamelCase(key)] = value
  }
  return converted
}

function toLowerCamelCase(key: string) {
  if (!key.includes('_')) {
    return key
  }
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

export async function invokeCommand<TResult>(
  command: string,
  payload?: Record<string, unknown>,
) {
  if (!hasTauriRuntime()) {
    return invokeBrowserCommand<TResult>(command, payload)
  }

  return invoke<TResult>(command, toTauriCommandArgs(payload))
}
