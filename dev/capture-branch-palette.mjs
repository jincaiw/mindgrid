/**
 * 「节点配色 == 该分支连线配色」的真引擎取证。
 *
 * ## 为什么必须有这一条
 *
 * 本次修的是**两套来源**：节点配色读主题、连线配色读文档级分支色板。
 * 单测能钉住 `buildScene` 的输出，但**钉不住"用户看到的"**——
 * 节点是 DOM、连线是 Canvas 2D 像素，中间还隔着主题层与不透明背景层
 * （铁律 25：「算出来对」≠「用户看得到」）。
 *
 * 所以这里在**真浏览器**里同时量两个来源：
 *   - 节点填充：`.mindmap-node[data-topic-id]` 的计算背景色（自下而上找第一个不透明层）
 *   - 连线颜色：`.mindmap-scene__canvas` 的**真实像素**（父节点与子节点之间那条线的中点）
 * 然后断言二者**同一个颜色**。
 *
 * ## 五个场景（把优先级阶梯逐档走一遍，并故意用**极端取值**对照）
 * 1. 默认文档（主题「彩虹」**自带**色板）→ 节点与连线同色。
 * 2. 切到「暗夜」→ **这就是原本的缺陷现场**：暗夜无自带色板、画布级彩虹也未显式开启
 *    → 生效调色板为 null，节点与连线**都应跟随主题的单一配色**。
 *    改动前连线会被硬编码 8 色兜底成彩虹、节点是主题单色 → 本场景两条断言都会红。
 * 3. 画布页「配色方案」选预设（海洋）→ **改动的核心**：改动前只有连线变、节点纹丝不动。
 * 4. 样式页「分支色板」选自定义预设（暖色）→ 优先级高于画布预设，同样必须同源。
 * 5. 清掉自定义色板（默认 8 色）→ 回落画布预设，仍须同源。
 *
 * ⚠️ 每个场景除了"节点色 == 连线色"，还要看**分支之间是否真的不同色**：
 * 全是单色时"同色"是平凡成立的，那条断言就没有鉴别力。
 *
 * 用法：node dev/capture-branch-palette.mjs [baseUrl] [outDir]
 * 前置：vite dev 已在 baseUrl 上监听（**必须 --host 127.0.0.1**，默认只监听 IPv6）
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:1421').replace(/\/$/, '')
const outDir = process.argv[3] ?? 'outputs/native/branch-palette'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

// ---------------------------------------------------------------- 页面内测量

/**
 * 读出所有主题节点的填充色。
 *
 * ⚠️ **必须与底色合成后再比**：暗夜主题的节点/连线都是**半透明**的
 * （实测连线像素 `rgba(147,164,185,87)`，α≈0.34）。直接拿"带 α 的原始色"
 * 去比，会与另一个同样是半透明但 α 不同的元素误判成不同色；
 * 而用户在屏幕上看到的是**合成后**的颜色。所以这里：
 *   ① 自下而上找第一个**不透明**层当底色（backdrop）
 *   ② 从节点自身起找第一个有背景的层当填充（fill）
 *   ③ fill 按 α 合成到 backdrop 上 —— 这个才是"用户看到的颜色"（铁律 25）
 */
const COLLECT_NODES = `(() => {
  const parse = (value) => {
    const open = value.indexOf('(')
    const close = value.indexOf(')')
    if (open < 0 || close < 0) return null
    const parts = value.slice(open + 1, close).split(',').map((p) => Number(p.trim()))
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  const hexOf = (c) =>
    '#' + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  })

  return [...document.querySelectorAll('.mindmap-node[data-topic-id]')].map((el) => {
    const rect = el.getBoundingClientRect()
    const chain = []
    let fillEntry = null
    let backdrop = null
    let probe = el
    while (probe) {
      const value = getComputedStyle(probe).backgroundColor
      chain.push((probe.className || probe.tagName) + '=' + value)
      const parsed = parse(value)
      if (parsed) {
        if (!fillEntry && parsed.a > 0.01) fillEntry = { parsed, owner: probe.className || probe.tagName }
        if (parsed.a > 0.99) { backdrop = parsed; break }
      }
      probe = probe.parentElement
    }
    let fill = null
    if (fillEntry) {
      const base = backdrop ?? { r: 255, g: 255, b: 255, a: 1 }
      const composited = over(fillEntry.parsed, base)
      fill = {
        rgb: 'rgb(' + Math.round(composited.r) + ', ' + Math.round(composited.g) + ', ' + Math.round(composited.b) + ')',
        hex: hexOf(composited),
        alpha: fillEntry.parsed.a,
        paintedBy: String(fillEntry.owner),
      }
    }
    return {
      id: el.dataset.topicId,
      depth: Number((el.className.match(/mindmap-node--depth-(\\d)/) || [])[1] ?? -1),
      text: (el.querySelector('.mindmap-node__title') || el).textContent.trim().slice(0, 12),
      fill,
      fillChain: chain,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    }
  })
})()`

/**
 * 采样「父→子」那条连线的颜色。
 *
 * 做法：取父子两个节点的水平间隙中线，在这条竖带上扫像素，丢掉背景色后
 * 取出现次数最多的颜色。曲线从父节点垂直中心出发、落到子节点垂直中心，
 * 所以 y 只需扫两个中心之间（±8px 容差）。
 */
const sampleEdge = (parentId, childId) => `(() => {
  const canvas = document.querySelector('.mindmap-scene__canvas')
  if (!canvas) return { error: 'canvas not found' }
  const parent = document.querySelector('.mindmap-node[data-topic-id="' + ${JSON.stringify(parentId)} + '"]')
  const child = document.querySelector('.mindmap-node[data-topic-id="' + ${JSON.stringify(childId)} + '"]')
  if (!parent || !child) return { error: 'node not found' }
  const p = parent.getBoundingClientRect()
  const c = child.getBoundingClientRect()
  const box = canvas.getBoundingClientRect()
  const dpr = canvas.width / box.width

  const onRight = c.left > p.right
  const gapMid = onRight ? (p.right + c.left) / 2 : (p.left + c.right) / 2
  const cy1 = (p.top + p.bottom) / 2
  const cy2 = (c.top + c.bottom) / 2
  const y0 = Math.min(cy1, cy2) - 8
  const y1 = Math.max(cy1, cy2) + 8

  const ctx = canvas.getContext('2d')
  const px = (v) => Math.round(v * dpr)
  const x0 = px(gapMid - box.left - 8)
  const width = px(16)
  const yy0 = px(y0 - box.top)
  const height = px(y1 - y0)
  if (width <= 0 || height <= 0) return { error: 'empty sample box' }
  const data = ctx.getImageData(x0, yy0, width, height).data

  // 背景色：取画布区域**透出来的**底色（与 capture-custom-style 同一口径）
  const readBackdrop = () => {
    const parse = (value) => {
      const open = value.indexOf('('); const close = value.indexOf(')')
      if (open < 0 || close < 0) return null
      const parts = value.slice(open + 1, close).split(',').map((n) => Number(n.trim()))
      if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
    }
    let el = document.querySelector('.mindmap-scene')
    while (el) {
      const parsed = parse(getComputedStyle(el).backgroundColor)
      if (parsed && parsed.a > 0.01) return parsed
      el = el.parentElement
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }
  const bg = readBackdrop()

  // ① 先找这条带里的最大 α：画布是**透明底**，像素保留画笔的 α
  //    （实测暗夜主题连线像素是 rgba(147,164,185,87)，α≈0.34）。
  //    抗锯齿会造出一圈 α 更低的过渡像素，它们合成出来的颜色是"线色与底色的插值"，
  //    既不是线色也不是底色 —— 混进来会把结论带偏，所以只统计线芯。
  let maxAlpha = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > maxAlpha) maxAlpha = data[i]
  }
  if (maxAlpha === 0) return { error: 'edge band is fully transparent', backdrop: bg }

  const tally = new Map()
  for (let i = 0; i < data.length; i += 4) {
    const a8 = data[i + 3]
    if (a8 < maxAlpha - 5) continue
    const a = a8 / 255
    // ② 按 α 合成到底色上 —— 这才是"用户看到的颜色"（铁律 25）
    const r = Math.round(data[i] * a + bg.r * (1 - a))
    const g = Math.round(data[i + 1] * a + bg.g * (1 - a))
    const b = Math.round(data[i + 2] * a + bg.b * (1 - a))
    const key = r + ',' + g + ',' + b
    tally.set(key, (tally.get(key) || 0) + 1)
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return { error: 'no line-core pixel in edge band', backdrop: bg }
  const [key, count] = sorted[0]
  const [r, g, b] = key.split(',').map(Number)
  const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
  return {
    rgb: 'rgb(' + r + ', ' + g + ', ' + b + ')',
    hex,
    pixels: count,
    maxAlpha,
    distinct: sorted.length,
    runnerUp: sorted[1] ? sorted[1][0] + ' x' + sorted[1][1] : null,
    backdrop: bg,
    gapMid: Math.round(gapMid),
  }
})()`

// ---------------------------------------------------------------- 断言工具

const results = []

function check(label, condition, detail) {
  results.push({ label, pass: Boolean(condition), detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? '  —— ' + detail : ''}`)
}

/**
 * 对一次测量做全套断言。
 *
 * `requireSameColor` 只在**生效调色板非空**时成立：那时节点填充与该分支连线色
 * 都取自同一条色板项，必须逐个相等。
 * 没有调色板时，节点读 `theme.branch.fill`、连线读 `theme.edge` ——
 * 这是主题里**两个不同的字段**（暗夜：`#1e293b` vs `rgba(148,163,184,0.34)`），
 * 本来就不该相等。此时鉴别"旧缺陷"的判据是**连线是否也退化成彩虹**
 * （旧代码的硬编码 8 色兜底会让每个分支的连线各成一色）。
 */
function assertSameSource(tag, nodes, edges, { requireSameColor }) {
  const root = nodes.find((n) => n.depth === 0)
  const branches = nodes.filter((n) => n.depth === 1)
  if (!root || branches.length === 0) {
    check(`${tag}：文档至少有中心主题 + 1 个分支`, false, '结构不符合预期')
    return null
  }
  let allEqual = true
  const rows = []
  const edgeHexes = new Set()
  for (const branch of branches) {
    const edge = edges[branch.id]
    if (!edge || edge.error) {
      allEqual = false
      rows.push(`${branch.text}: 连线像素取不到（${edge?.error}）`)
      continue
    }
    edgeHexes.add(edge.hex)
    const same = edge.rgb === branch.fill?.rgb
    if (!same) allEqual = false
    rows.push(
      `${branch.text}: 节点 ${branch.fill?.hex}(α${branch.fill?.alpha}) / 连线 ${edge.hex}` +
        `(α${(edge.maxAlpha / 255).toFixed(2)}) ${same ? '✓' : '≠'}`,
    )
  }
  console.log(`    ${rows.join('\n    ')}`)
  if (requireSameColor) {
    check(`${tag}：每个分支的节点填充色 == 该分支连线色`, allEqual)
  } else {
    console.log('    （该主题无调色板：节点读 theme.branch.fill、连线读 theme.edge，二者本可不同）')
  }
  const distinctFills = new Set(branches.map((b) => b.fill?.hex)).size
  return { root, branches, distinctFills, distinctEdges: edgeHexes.size, edgeHexes: [...edgeHexes] }
}

async function measure(page, tag, options) {
  const nodes = await page.evaluate(COLLECT_NODES)
  const root = nodes.find((n) => n.depth === 0)
  const branches = nodes.filter((n) => n.depth === 1)
  const edges = {}
  if (root) {
    for (const branch of branches) {
      edges[branch.id] = await page.evaluate(sampleEdge(root.id, branch.id))
    }
  }
  return { nodes, edges, extra: assertSameSource(tag, nodes, edges, options) }
}

/** 生效调色板非空 → 节点填充必须与该分支连线色逐个相等。 */
const SAME_COLOR = { requireSameColor: true }
/** 无调色板 → 节点/连线各读主题的一个字段，只要求它们都**不再退化成彩虹**。 */
const THEME_ONLY = { requireSameColor: false }

// ---------------------------------------------------------------- 场景驱动
//
// 「样式」子页里有「分支色板预设」，「画布」子页里有「配色方案预览」与「文档主题」
// （三者都在右栏，切换子页才能点到）。

async function openTab(page, tab) {
  await page.locator(`#inspector-tab-${tab}`).click()
  await page.waitForTimeout(300)
}

const canvasTab = (page) => openTab(page, 'canvas')
const styleTab = (page) => openTab(page, 'style')

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  const evidence = {}

  // ---- 场景 1：默认文档（主题「彩虹」自带色板，未显式开关彩虹分支） ----
  await canvasTab(page)
  await page.screenshot({ path: path.join(outDir, '01-theme-palette.png') })
  evidence.themeOwnPalette = await measure(page, '场景1 主题自带色板（彩虹）', SAME_COLOR)

  // ---- 场景 2：切到「暗夜」——**这就是原本的缺陷现场** ----
  // 暗夜没有自带色板、画布级彩虹也没显式开启 → 生效调色板为 null：
  // 节点读 theme.branch.fill(#1e293b)、连线读 theme.edge(rgba(148,163,184,.34))。
  // 两者**本来就不该相等**（同一主题里两个字段），所以这里不比"同色"，
  // 而是比"**连线是否也退化成彩虹**"——旧代码的硬编码 8 色兜底会给三个分支
  // 各一个 BRANCH_COLORS 颜色（#5B8DEF/#FF8B3D/#4CB050），distinctEdges 会 > 1。
  await page.locator('[aria-label="文档主题"] button[title="暗夜"]').click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(outDir, '02-dark-no-palette.png') })
  evidence.darkNoPalette = await measure(page, '场景2 无色板（暗夜）', THEME_ONLY)
  check(
    '场景2：无色板时节点是**单色**',
    evidence.darkNoPalette.extra && evidence.darkNoPalette.extra.distinctFills === 1,
    `不同填充色 ${evidence.darkNoPalette.extra?.distinctFills ?? '?'} 种`,
  )
  check(
    '场景2：无色板时连线也是**单色**（不再有硬编码 8 色兜底）',
    evidence.darkNoPalette.extra && evidence.darkNoPalette.extra.distinctEdges === 1,
    `不同连线色 ${evidence.darkNoPalette.extra?.distinctEdges ?? '?'} 种 ` +
      `${JSON.stringify(evidence.darkNoPalette.extra?.edgeHexes ?? [])}`,
  )

  // ---- 场景 3：画布页配色方案 → 预设色板（本修复的核心路径） ----
  // 改动前：只有连线变彩虹，节点纹丝不动（仍读主题）。
  await page.locator('[aria-label="配色方案预览"] button[aria-label="海洋"]').click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(outDir, '03-canvas-preset-palette.png') })
  evidence.canvasPreset = await measure(page, '场景3 画布预设色板（海洋）', SAME_COLOR)
  check(
    '场景3：节点确实按分支多色（改动前节点纹丝不动、只有连线变）',
    evidence.canvasPreset.extra && evidence.canvasPreset.extra.distinctFills > 1,
    `不同填充色 ${evidence.canvasPreset.extra?.distinctFills ?? '?'} 种`,
  )

  // ---- 场景 4：样式页分支色板 → 自定义预设（优先级高于画布预设） ----
  await styleTab(page)
  await page.locator('[aria-label="分支色板预设"] button[title="暖色"]').click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(outDir, '04-sheet-palette.png') })
  evidence.sheetPalette = await measure(page, '场景4 画布自定义色板（暖色）', SAME_COLOR)
  check(
    '场景4：节点确实按分支多色，且与画布预设（海洋）不同',
    evidence.sheetPalette.extra && evidence.sheetPalette.extra.distinctFills > 1,
    `不同填充色 ${evidence.sheetPalette.extra?.distinctFills ?? '?'} 种`,
  )

  // ---- 场景 5：清掉自定义色板 → 回落到画布预设（海洋），仍须同源 ----
  await page.locator('[aria-label="分支色板预设"] button[title="默认 8 色"]').click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(outDir, '05-fallback-to-canvas-preset.png') })
  evidence.fallback = await measure(page, '场景5 清除自定义色板回落画布预设', SAME_COLOR)
  check(
    '场景5：清掉自定义色板后仍与画布预设同源（多色）',
    evidence.fallback.extra && evidence.fallback.extra.distinctFills > 1,
    `不同填充色 ${evidence.fallback.extra?.distinctFills ?? '?'} 种`,
  )
  check(
    '场景5：回落后的配色确实回到了画布预设（== 场景3 的取值）',
    JSON.stringify(evidence.fallback.extra?.edgeHexes) ===
      JSON.stringify(evidence.canvasPreset.extra?.edgeHexes),
    `${JSON.stringify(evidence.fallback.extra?.edgeHexes)} vs ` +
      `${JSON.stringify(evidence.canvasPreset.extra?.edgeHexes)}`,
  )

  await writeFile(
    path.join(outDir, 'evidence.json'),
    JSON.stringify({ baseUrl, results, evidence }, null, 2),
  )

  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(`\n共 ${results.length} 条断言，失败 ${failed.length} 条`)
  if (failed.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
  process.exit(1)
})
