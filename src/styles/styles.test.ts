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
import {
  TOPIC_IMAGE_BLOCK,
  TOPIC_IMAGE_GAP,
  TOPIC_IMAGE_MAX_HEIGHT,
  TOPIC_IMAGE_MAX_WIDTH,
  TOPIC_IMAGE_RADIUS,
  TOPIC_IMAGE_TITLE_OFFSET,
} from '../features/canvas/runtime/topic-image-constants'
import globalCssSource from './global.css?raw'
import canvasHostSource from '../features/canvas/canvas-host.tsx?raw'
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

/**
 * 内联编辑态的文字颜色守卫。
 *
 * 背景：`global.css` 曾写死 `.mindmap-node--center .mindmap-node__editor { color: 白 }`，
 * 前提是"内置主题的 root 填充都是深色"。用户把中心主题改成浅色填充后就是白字白底。
 * 节点本身就带着解析好的 `color: resolvedStyle.textColor`（内联在 `.mindmap-node` 上），
 * 所以编辑态**不应该再覆盖颜色**，占位符与编辑提示改用 opacity 跟随 currentColor。
 */
describe('内联编辑态文字色', () => {
  const css = stripComments(globalCssSource)
  const EDITING_SELECTORS =
    /\.mindmap-node__(?:editor|edit-hint)(?:[^{]*)\{[^}]*\}/g

  it('编辑态不再按"中心主题"写死颜色', () => {
    expect(css).not.toMatch(/\.mindmap-node--center[^{]*\.mindmap-node__editor/)
  })

  it('编辑器与编辑提示的 color 只能是 inherit', () => {
    const blocks = css.match(EDITING_SELECTORS) ?? []
    // 至少要能匹配到编辑器与编辑提示两条
    expect(blocks.length).toBeGreaterThanOrEqual(2)

    for (const block of blocks) {
      for (const decl of block.match(/(?<![-\w])color\s*:\s*[^;}]+/g) ?? []) {
        expect(decl.replace(/\s+/g, ' ').trim(), block).toBe('color: inherit')
      }
    }
  })

  it('占位符不写死颜色（否则深色填充上不可见）', () => {
    const placeholder = css.match(/\.mindmap-node__editor::placeholder[^{]*\{[^}]*\}/)?.[0] ?? ''
    expect(placeholder).toContain('opacity')
    expect(placeholder).not.toMatch(/(?<![-\w])color\s*:/)
  })
})

/**
 * 色板浮层的选中态形态守卫。
 *
 * 基准图 11（XMind 配色方案浮层）：**单元格本身没有边框**，
 * 只有选中项的**色带**带一圈强调色描边。早先实现是给每个格子都描边、
 * 选中时把格子边框染成强调色 —— 整片浮层看起来"全是选中态"。
 */
describe('色板浮层选中态', () => {
  const css = stripComments(globalCssSource)

  const blockBodyOf = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
    return css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'))?.[1] ?? ''
  }

  it('单元格不描边', () => {
    const body = blockBodyOf('.swatch-picker__option')
    expect(body).not.toBe('')
    expect(body).toMatch(/border:\s*none/)
  })

  it('选中态描边落在色带上', () => {
    const body = blockBodyOf('.swatch-picker__option--selected .swatch-picker__strip')
    expect(body).not.toBe('')
    expect(body).toMatch(/outline:\s*2px solid var\(--color-accent\)/)
  })

  it('色带高度与基准图的行高节奏一致（约 26px）', () => {
    expect(blockBodyOf('.swatch-picker__strip > span')).toMatch(/height:\s*26px/)
  })
})

/**
 * 主题图片的版面守卫（2026-09-13）。
 *
 * 背景：节点曾用默认的 `display: flex`（row）排图片与标题——图片与标题**并排**，
 * 图片吃掉横向空间后标题被挤成"一列单字"。三端几何常量、单测、jsdom 全都发现不了：
 * DOM 顺序确实是 img 在前，jsdom 又不做布局。只有在真引擎里量/看才暴露出来
 * （见 `dev/capture-topic-image.mjs`）。
 *
 * 所以这里守住两件 CSS 层面的事，数值一律对着 topic-image-constants 的常量：
 *   1. 带图节点必须**纵排**（图片在上、标题在下）
 *   2. 图片槽位必须**固定高**，不能只给 max-height —— 只给上限时图片盒贴合自身
 *      比例（400×100 的宽图盒高只有 29），标题会紧贴图片往上跑，而布局与导出端
 *      恒定按 TOPIC_IMAGE_TITLE_OFFSET=96 下移标题，屏幕与导出就对不上了。
 */
describe('主题图片的版面与槽位几何', () => {
  const css = stripComments(globalCssSource)

  /** 取出某个选择器的声明块（含嵌套的简单情形） */
  function ruleBody(selector: string): string {
    const index = css.indexOf(selector)
    expect(index, `global.css 中未找到选择器 ${selector}`).toBeGreaterThanOrEqual(0)
    const open = css.indexOf('{', index)
    return css.slice(open + 1, css.indexOf('}', open))
  }

  it('带图节点改为纵排：图片在上、标题在下', () => {
    const body = ruleBody('.mindmap-node--with-image')
    expect(body).toMatch(/flex-direction:\s*column/)
    // 内容自顶排布，与导出端"图片落在上内边距"一致（居中会与预留的 96 错开）
    expect(body).toMatch(/justify-content:\s*flex-start/)
  })

  it('图片槽位固定高、宽与圆角都取自常量', () => {
    const body = ruleBody('.mindmap-node--with-image .mindmap-node__image')
    expect(body).toMatch(new RegExp(`height:\\s*${TOPIC_IMAGE_MAX_HEIGHT}px`))
    expect(body).toMatch(new RegExp(`max-width:\\s*${TOPIC_IMAGE_MAX_WIDTH}px`))
    expect(body).toMatch(new RegExp(`margin:[^;]*${TOPIC_IMAGE_GAP}px`))
  })

  it('基础图片规则与常量一致（圆角 / 上限 / 间距）', () => {
    const body = ruleBody('.mindmap-node__image')
    expect(body).toMatch(new RegExp(`border-radius:\\s*${TOPIC_IMAGE_RADIUS}px`))
    expect(body).toMatch(new RegExp(`max-height:\\s*${TOPIC_IMAGE_MAX_HEIGHT}px`))
    expect(body).toMatch(`min(${TOPIC_IMAGE_MAX_WIDTH}px, 100%)`)
    expect(body).toMatch(new RegExp(`margin:[^;]*${TOPIC_IMAGE_GAP}px`))
  })

  it('槽位高 + 间距 = 布局预留（否则不是溢出节点就是留空）', () => {
    expect(TOPIC_IMAGE_MAX_HEIGHT + TOPIC_IMAGE_GAP).toBe(TOPIC_IMAGE_BLOCK)
    expect(TOPIC_IMAGE_TITLE_OFFSET).toBe(TOPIC_IMAGE_BLOCK)
  })
})

/**
 * 画布各层不得自带不透明底色。
 *
 * 画布背景由 `.canvas-host` 的内联 `background`
 * （`resolveThemeBackground(主题背景, 画布级覆盖)`，与 PNG / SVG 导出同源）提供。
 * 任何中间层写死底色都会把它**整片挡掉**，而且后果极隐蔽：
 * 「屏幕是浅的、导出是深的」这个老问题其实一直没被修掉 —— 只因浅色主题的背景
 * （251,251,253）与令牌色（247,247,248）只差几阶，肉眼与对照脚本都看不出来；
 * **选「暗夜」主题才暴露**（`.canvas-host` 算出 rgb(26,26,46)，屏幕却仍是浅灰）。
 *
 * 这条静态守卫能抓的是"又有人加了一层底色"。它抓不到"用别的方式盖住"
 * （伪元素、渐变、更上层的浮层）—— 那类靠真引擎量：
 * `dev/capture-custom-style.mjs` 从 `.mindmap-scene` 往上找第一个不透明背景，
 * 量的是"用户实际看到的颜色"。
 */
describe('画布各层不得遮挡主题背景', () => {
  const css = stripComments(globalCssSource)

  /** 取某条规则的声明体。与文件里另一个同名小工具分开：那个被包在别的 describe 里。 */
  function body(selector: string): string {
    const index = css.indexOf(selector)
    expect(index, `global.css 中未找到选择器 ${selector}`).toBeGreaterThanOrEqual(0)
    const open = css.indexOf('{', index)
    return css.slice(open + 1, css.indexOf('}', open))
  }

  // 这两个是画布区域里"节点之下的所有层"。漏掉任何一层，主题背景就会被挡在它后面。
  for (const selector of ['.mindmap-scene', '.editor-card--scene']) {
    it(`${selector} 不写不透明底色`, () => {
      const declarations = body(selector).match(/background(?:-color)?\s*:\s*[^;]+/g) ?? []
      for (const declaration of declarations) {
        expect(declaration, `${selector} 的底色会盖住 .canvas-host 上的主题背景`).toContain(
          'transparent',
        )
      }
    })
  }

  it('主题背景确实被设在了 .canvas-host 上（不然上一组断言只是在守空）', () => {
    // 没有这一条，把 .canvas-host 的内联样式删掉后上面全绿 —— 背景会彻底没有
    expect(canvasHostSource).toMatch(/style=\{\{ background: canvasBackground \}\}/)
  })
})
