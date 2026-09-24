import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn(async () => 'tauri-ok')
const browserMock = vi.fn(async () => 'browser-ok')

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...(args as [])),
}))
vi.mock('./browser-session', () => ({
  invokeBrowserCommand: (...args: unknown[]) => browserMock(...(args as [])),
}))

import { invokeCommand, toTauriCommandArgs } from './transport'
import commandsRsSource from '../../../src-tauri/src/app/commands.rs?raw'
import commandsTsSource from './commands.ts?raw'

describe('toTauriCommandArgs', () => {
  it('把顶层 snake_case 键转成 Tauri 期望的 lowerCamelCase', () => {
    expect(toTauriCommandArgs({ topic_id: 'a' })).toEqual({ topicId: 'a' })
    expect(toTauriCommandArgs({ target_parent_id: 'p', action_label: '移动' })).toEqual({
      targetParentId: 'p',
      actionLabel: '移动',
    })
    expect(toTauriCommandArgs({ duration_ms: 1200 })).toEqual({ durationMs: 1200 })
  })

  it('单词键原样保留（不改动、不丢失）', () => {
    expect(toTauriCommandArgs({ path: '/tmp/a.mgd', index: 2, value: null })).toEqual({
      path: '/tmp/a.mgd',
      index: 2,
      value: null,
    })
  })

  it('已经是 camelCase 的键保持幂等', () => {
    expect(toTauriCommandArgs({ topicId: 'a' })).toEqual({ topicId: 'a' })
  })

  it('只转顶层：嵌套结构与数组里的键必须原样（它们进的是 serde 结构体）', () => {
    // `positions` 进的是 `TopicPositionPayload`，那个结构体**没有** rename_all，
    // 字段就是 snake_case（见 commands.rs 里它的定义与注释）。深转会把它们改坏。
    const payload = {
      positions: [{ topic_id: 't1', offset_x: 1, offset_y: 2 }],
      action_label: '对齐',
    }
    expect(toTauriCommandArgs(payload)).toEqual({
      positions: [{ topic_id: 't1', offset_x: 1, offset_y: 2 }],
      actionLabel: '对齐',
    })
  })

  it('无 payload 时返回 undefined（不是空对象）', () => {
    expect(toTauriCommandArgs()).toBeUndefined()
  })
})

describe('invokeCommand 的两个分支', () => {
  beforeEach(() => {
    invokeMock.mockClear()
    browserMock.mockClear()
  })
  afterEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  })

  it('Tauri 运行时：payload 以 camelCase 交给 invoke', async () => {
    ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    await invokeCommand('select_topic', { topic_id: 'topic_1' })
    expect(invokeMock).toHaveBeenCalledWith('select_topic', { topicId: 'topic_1' })
    expect(browserMock).not.toHaveBeenCalled()
  })

  it('浏览器降级：payload 原样（snake_case）交给降级实现', async () => {
    await invokeCommand('select_topic', { topic_id: 'topic_1' })
    expect(browserMock).toHaveBeenCalledWith('select_topic', { topic_id: 'topic_1' })
    expect(invokeMock).not.toHaveBeenCalled()
  })
})

/**
 * 漂移守卫：`commands.ts` 的每个 `invokeCommand` 调用与 Rust `#[tauri::command]`
 * 的参数**双向**对得上。
 *
 * 为什么必须有它：Tauri 2 用 `CommandItem::deserialize_json` 的 `v.get(self.key)` 取参，
 * key 是 Rust 参数名的 lowerCamelCase 形式（`tauri-macros` 的 `ArgumentCase::Camel` 默认值）。
 * 一旦某个键写错（少一个、拼错、多一个），真机上是**运行时报错**
 * （`invalid args ... missing required key ...`），而所有自动化验证都跑在
 * jsdom / Chromium 的浏览器降级链路上 —— 那条链路自己读 payload，根本发现不了。
 * 2026-09-25 就是靠一次真机探测才发现「顶层键写成 snake_case」这件事的。
 */
describe('IPC 参数漂移守卫', () => {
  /** 去掉注释：签名里的注释会被误当成参数名 */
  function stripComments(text: string) {
    return text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  }

  /** 从 `start` 处的开括号找到配对的闭括号下标 */
  function balanced(text: string, start: number, open: string, close: string) {
    let depth = 0
    for (let i = start; i < text.length; i += 1) {
      if (text[i] === open) depth += 1
      else if (text[i] === close) {
        depth -= 1
        if (depth === 0) return i
      }
    }
    throw new Error('括号未配平')
  }

  /** 按顶层分隔符切分，忽略括号/花括号里的分隔符 */
  function splitTopLevel(text: string, separator: string) {
    const parts: string[] = []
    let depth = 0
    let current = ''
    for (const char of text) {
      if ('([{'.includes(char)) depth += 1
      else if (')]}'.includes(char)) depth -= 1
      if (char === separator && depth === 0) {
        parts.push(current)
        current = ''
      } else {
        current += char
      }
    }
    parts.push(current)
    return parts
  }

  function toLowerCamelCase(key: string) {
    const [head, ...rest] = key.split('_')
    return head + rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')
  }

  /** 注入类型（框架把句柄作为参数传进来，不是 IPC 参数） */
  const HANDLE_PARAMS = new Set([
    'app',
    'state',
    'window',
    'webview',
    'invoke',
    'request',
    'resource',
  ])

  function readRustCommands(): Map<string, string[]> {
    const source = stripComments(commandsRsSource)
    const commands = new Map<string, string[]>()
    const pattern = /#\[tauri::command[^\]]*\]\s*pub\s+(?:async\s+)?fn\s+(\w+)\s*\(/g
    for (const match of source.matchAll(pattern)) {
      const name = match[1]
      const openIndex = source.indexOf('(', match.index + match[0].length - 1)
      const closeIndex = balanced(source, openIndex, '(', ')')
      const params: string[] = []
      for (const part of splitTopLevel(source.slice(openIndex + 1, closeIndex), ',')) {
        const trimmed = part.trim()
        if (!trimmed.includes(':')) continue
        const paramName = trimmed.split(':')[0].trim()
        if (HANDLE_PARAMS.has(paramName)) continue
        params.push(paramName)
      }
      commands.set(name, params)
    }
    return commands
  }

  function readFrontendCalls(): Map<string, string[]> {
    const source = stripComments(commandsTsSource)
    const calls = new Map<string, string[]>()
    const pattern = /invokeCommand<[^>]*>\(\s*['"](\w+)['"]/g
    for (const match of source.matchAll(pattern)) {
      const command = match[1]
      const after = source.slice(match.index + match[0].length)
      const braceOffset = after.indexOf('{')
      const parenOffset = after.indexOf(')')
      // 没有 payload，或者 `{` 出现在 `)` 之后（说明是别的调用）
      if (braceOffset === -1 || (parenOffset !== -1 && braceOffset > parenOffset)) {
        calls.set(command, [])
        continue
      }
      const start = match.index + match[0].length + braceOffset
      const body = source.slice(start + 1, balanced(source, start, '{', '}'))
      const keys: string[] = []
      for (const part of splitTopLevel(body, ',')) {
        const trimmed = part.trim()
        if (!trimmed) continue
        // 两种写法都要认：`key: value` 与简写 `key`
        const match2 = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(trimmed)
        keys.push(match2 ? match2[1] : trimmed)
      }
      calls.set(command, keys)
    }
    return calls
  }

  const rustCommands = readRustCommands()
  const frontendCalls = readFrontendCalls()

  it('解析器本身有鉴别力（否则守卫会静默失效）', () => {
    // 命令数量：少了解析器就是漏读，守卫会变成空转
    expect(rustCommands.size).toBeGreaterThanOrEqual(75)
    expect(frontendCalls.size).toBeGreaterThanOrEqual(75)
    // 抽查一个多词参数的命令，确保两侧都真的读到了参数/键
    expect(rustCommands.get('select_topic')).toEqual(['topic_id'])
    expect(frontendCalls.get('select_topic')).toEqual(['topic_id'])
    expect(rustCommands.get('move_topic')).toContain('target_parent_id')
  })

  it('每个 TS 调用的顶层键都能在 Rust 找到同名参数（camel 化后）', () => {
    const problems: string[] = []
    for (const [command, keys] of frontendCalls) {
      const expected = new Set((rustCommands.get(command) ?? []).map(toLowerCamelCase))
      if (!rustCommands.has(command)) {
        problems.push(`${command}: Rust 侧没有这个命令`)
        continue
      }
      for (const key of keys) {
        if (!expected.has(toLowerCamelCase(key))) {
          problems.push(`${command}: 键 ${key} 在 Rust 里没有对应参数`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('每个 Rust 参数都被前端提供（漏传在真机上同样是运行时错误）', () => {
    const problems: string[] = []
    for (const [command, params] of rustCommands) {
      if (!frontendCalls.has(command)) {
        problems.push(`${command}: 前端没有调用（命令已废弃？）`)
        continue
      }
      const provided = new Set(frontendCalls.get(command)!.map(toLowerCamelCase))
      for (const param of params) {
        if (!provided.has(toLowerCamelCase(param))) {
          problems.push(`${command}: 缺少参数 ${param}`)
        }
      }
    }
    expect(problems).toEqual([])
  })
})
