/**
 * 样式层防回归（批次 B1）。
 *
 * 背景：global.css 里曾有 40 处硬编码 rgba(45, 127, 249, α)。这些值在暗色主题下
 * 仍是浅蓝，是长期未被发现的主题失效问题；且每次新增控件都倾向于"再抄一个相近的
 * alpha"，导致同一语义出现 0.08 / 0.09 / 0.1 / 0.12 四种写法。
 *
 * 本文件用 Vite 的 ?raw 把 CSS 读成字符串做静态断言，守住三条不变式：
 *   1. UI 外壳不得再硬编码 accent 颜色（必须在 tokens.css 里走令牌）
 *   2. global.css 引用的每一个 --color-accent-NN 阶梯档位都必须真实存在
 *   3. 阶梯档位在三个主题块（浅色 / [data-theme=dark] / prefers-color-scheme）里
 *      必须成套定义——只加一处会让暗色主题静默缺色
 *
 * 说明：gantt 导出用的 #2D7FF9（src/features/gantt/export-gantt-svg.ts）属于
 * 图表内容配色，不是 UI 外壳，不在本文件管辖范围内。
 */
import { describe, expect, it } from 'vitest'
import { COLORS } from '../features/canvas/runtime/style-constants'
import globalCssSource from './global.css?raw'
import tokensCssSource from './tokens.css?raw'

/** 硬编码 accent：rgb / rgba / hex 三种写法一网打尽 */
const HARDCODED_ACCENT = /rgba?\(\s*45\s*,\s*127\s*,\s*249|#2d7ff9/gi

/** 阶梯令牌的引用，如 var(--color-accent-24) */
const LADDER_USAGE = /var\(--color-accent-(\d+)\)/g

/** 阶梯令牌的定义，如 --color-accent-24: rgba(...) */
const LADDER_DEFINITION = /--color-accent-(\d+)\s*:/g

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 去掉 var(--token, fallback) 的 fallback 部分。
 *
 * 例外是刻意的：像 `background: var(--color-accent, #2d7ff9)` 这类写法，硬编码值
 * 只在令牌缺失时兜底，写死成与令牌同值反而是**保证屏幕与导出同色**的手段
 * （屏幕甘特图的 started 色必须等于 export-gantt-svg.ts 的 #2D7FF9）。
 * 要禁止的是绕过令牌直接生效的硬编码，不是这种兜底。
 */
function stripVarFallbacks(css: string): string {
  return css.replace(/var\(\s*--[\w-]+\s*,[^()]*\)/g, 'var()')
}

/** 取出 tokens.css 中指定块的花括号内容 */
function blockBody(css: string, selector: string): string {
  const index = css.indexOf(selector)
  expect(index, `tokens.css 中未找到块 ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', index)
  expect(open).toBeGreaterThan(index)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`tokens.css 中块 ${selector} 的花括号未闭合`)
}

function ladderSet(body: string): Set<string> {
  return new Set([...body.matchAll(LADDER_DEFINITION)].map((m) => m[1]))
}

/** 取出块内全部自定义属性定义，返回 名称 -> 取值（已归一化空白） */
function tokenMap(body: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(name, value.replace(/\s+/g, ' ').trim())
  }
  return map
}

describe('accent 颜色令牌化', () => {
  it('global.css 不再硬编码 accent 颜色', () => {
    const violations = stripVarFallbacks(stripComments(globalCssSource)).match(HARDCODED_ACCENT)
    expect(violations).toBeNull()
  })

  it('硬编码 accent 只出现在 tokens.css 的 --color-accent 定义处', () => {
    const body = stripComments(tokensCssSource)
    const violations = [...body.matchAll(HARDCODED_ACCENT)]
    // 浅色块定义 1 处（#2d7ff9），其余 rgba(45,127,249,…) 为阶梯本身的值
    expect(violations.length).toBeGreaterThan(0)
    for (const [value] of violations) {
      expect(value.toLowerCase()).toMatch(/^(#2d7ff9|rgba?\(\s*45\s*,\s*127\s*,\s*249)/)
    }
    // hex 只允许用来定义 --color-accent 本体，不允许散落别处
    expect(body.toLowerCase().split('#2d7ff9').length - 1).toBe(1)
  })

  it('global.css 引用的阶梯档位都已在 tokens.css 中定义', () => {
    const defined = ladderSet(stripComments(tokensCssSource))
    const used = new Set(
      [...globalCssSource.matchAll(LADDER_USAGE)].map((m) => m[1]),
    )
    expect(used.size).toBeGreaterThan(0)
    for (const step of used) {
      expect(defined, `global.css 使用了未定义的档位 --color-accent-${step}`).toContain(step)
    }
  })

  it('三个主题块定义的阶梯档位完全一致', () => {
    const css = stripComments(tokensCssSource)
    const light = ladderSet(blockBody(css, ':root {'))
    const dark = ladderSet(blockBody(css, ':root[data-theme="dark"]'))
    const system = ladderSet(blockBody(css, ':root:not([data-theme="light"]):not([data-theme="dark"])'))

    expect([...light].sort()).toEqual([...dark].sort())
    expect([...light].sort()).toEqual([...system].sort())
  })
})

/**
 * 批次 B4 的边界：UI 外壳的旧蓝统一到 accent，但**用户内容配色一律不动**——
 * 标记语义色（markers.tsx）、文档主题色板（built-in-themes.ts）、甘特图导出色
 * （export-gantt-svg.ts）、三端共用的富内容常量（rich-content-constants.ts）
 * 都会随 .mgd 落盘或进入导出文件，改了会静默改变既有文档外观且不可逆。
 */
describe('Canvas 状态色与 accent 同步（批次 B4）', () => {
  it('交互态蓝镜像 tokens.css 的 --color-accent', () => {
    const accent = tokenMap(blockBody(stripComments(tokensCssSource), ':root {')).get(
      '--color-accent',
    )
    expect(accent).toBe('#2d7ff9')

    // 实心描边必须与 accent 完全相同（DOM 侧用的是 var(--color-accent)）
    for (const key of ['activeOutline', 'selectedOutline', 'historyFocusOutline'] as const) {
      expect(COLORS[key], `COLORS.${key} 与 --color-accent 不同步`).toBe(accent)
    }
    // 半透明态必须使用 accent 的 RGB 分量
    for (const key of [
      'activeBorder',
      'historyFocusBorder',
      'selectionBorder',
      'selectionFill',
    ] as const) {
      expect(COLORS[key], `COLORS.${key} 未使用 accent 的 RGB 分量`).toContain('45, 127, 249')
    }
  })

  it('edgeActive 保持与默认主题一致（不随 accent 改动）', () => {
    // 连线色是文档主题的一部分，落盘于 .mgd；改这里会改变既有文档的连线颜色
    expect(COLORS.edgeActive).toBe('rgba(59, 130, 246, 0.74)')
  })

  it('global.css 不再出现旧蓝 #3b82f6 / #2563eb', () => {
    const body = stripComments(globalCssSource)
    expect(body).not.toMatch(/#3b82f6/i)
    expect(body).not.toMatch(/#2563eb/i)
  })
})

/**
 * 批次 B5：硬编码中性色（rgba(0,0,0,α)）在暗色主题下不会翻转，浅色里"若隐若现"的
 * 底纹/分隔线到了暗色就彻底消失。必须走 --color-surface-* / --color-border-* 令牌。
 *
 * 只拦 alpha < 0.08 的低透明度值——那正是"底纹/分隔线"的取值区间。
 * 阴影（box-shadow 里的 rgba(0,0,0,0.08) 及以上）与模态遮罩（0.5）不在此列：
 * 阴影在明暗两色下都该是黑的，遮罩本就是压暗用途，硬编码是正确表达。
 */
describe('中性色令牌化（批次 B5）', () => {
  it('底纹与分隔线不再硬编码低透明度黑色', () => {
    const offenders = stripComments(globalCssSource)
      .split('\n')
      .map((line, index) => ({ line, no: index + 1 }))
      .filter(({ line }) => !line.includes('box-shadow'))
      .filter(({ line }) => /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.0[0-7]/.test(line))
      .map(({ line, no }) => `${no}: ${line.trim()}`)

    expect(offenders).toEqual([])
  })

  it('三个主题块都定义了 surface-active', () => {
    const css = stripComments(tokensCssSource)
    for (const selector of [
      ':root {',
      ':root[data-theme="dark"]',
      ':root:not([data-theme="light"]):not([data-theme="dark"])',
    ]) {
      expect(
        tokenMap(blockBody(css, selector)).has('--color-surface-active'),
        `${selector} 缺少 --color-surface-active`,
      ).toBe(true)
    }
  })
})

describe('外壳无毛玻璃（批次 B3）', () => {
  it('global.css 不再出现 backdrop-filter: blur(...)', () => {
    const body = stripComments(globalCssSource)
    expect(body).not.toMatch(/backdrop-filter:\s*blur\(/)
    // 唯一允许的形式是外壳重置块里的显式 none
    expect(body).toMatch(/backdrop-filter:\s*none/)
  })

  it('两个暗色块的令牌逐项相同（含取值）', () => {
    const css = stripComments(tokensCssSource)
    const dark = tokenMap(blockBody(css, ':root[data-theme="dark"]'))
    const system = tokenMap(
      blockBody(css, ':root:not([data-theme="light"]):not([data-theme="dark"])'),
    )

    expect(dark.size).toBeGreaterThan(10)
    expect([...dark.keys()].sort()).toEqual([...system.keys()].sort())
    for (const [name, value] of dark) {
      expect(system.get(name), `暗色块 ${name} 取值不一致：${value} vs ${system.get(name)}`).toBe(
        value,
      )
    }
  })
})
