/**
 * 「插入 → 方程」的真引擎取证：**DOM 侧**（真实应用 + 真实面板输入）。
 *
 * ## 为什么必须单独有一条
 *
 * `dev/measure-equation-parity.mjs` 量的是**两条导出路径**之间的一致性，它绕过了
 * 整个界面（自己拼 DocumentSnapshot、直接调 buildScene）。DOM 侧是**第三条实现**：
 * `canvas-host.tsx` 里用「固定槽位 + flex 居中 + 内联 SVG 自然尺寸 + CSS max-*」复刻
 * 同一套几何。jsdom 不做布局（`getBoundingClientRect` 全是 0），所以只能在真引擎里量。
 *
 * ## 量测口径（每次都要按这两条归一，否则会得出假结论）
 *
 * 1. **所有屏幕像素要除以画布 zoom**：节点挂在
 *    `.mindmap-scene__board`（`transform: translate(...) scale(camera.zoom)`）上，
 *    `getBoundingClientRect` 返回的是**缩放后**的屏幕像素。实测默认 zoom=1.21 时，
 *    40px 的槽位量出来是 48.4px —— 不归一就会把正确的实现判成错的。
 * 2. **节点字号在标题上**，不在 `.mindmap-node` 上：后者的 computed font-size 是继承来的
 *    16px，而节点真正的字号（14px）写在 `.mindmap-node__title` 的行内样式里。
 *    公式的自然尺寸按**节点字号**折算，读错元素会让所有尺寸断言全线假红。
 *
 * ## 验什么
 *
 * 1. 面板 → 文档 → 画布整条链：右栏输入 LaTeX、失焦提交后节点上真的出现公式。
 * 2. DOM 的几何与契约一致：槽位高 = `TOPIC_EQUATION_MAX_HEIGHT`；
 *    行内 SVG 的自然尺寸 = `viewBox / 1000 × 节点字号`（**独立复算**，不信 data-* 属性）；
 *    实际尺寸 = 自然尺寸缩进槽位（只缩不放 + 居中）；公式不溢出槽位。
 * 3. 版面顺序：公式在标题上方。
 * 4. 布局对账：加方程后节点正好高一个方程块；移除后回到基线。
 * 5. 颜色已落定：行内 SVG 里**不允许**残留 currentColor。
 * 6. 语法错：面板给渲染器原文，节点给可读提示且仍占位。
 *
 * 用法：node dev/capture-equation-dom.mjs [baseUrl] [outDir]
 * 前置：vite dev 已在 baseUrl 上监听（**必须 --host 127.0.0.1**）
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:1421').replace(/\/$/, '')
const outDir = process.argv[3] ?? 'outputs/native/v0.4.21'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

/** 与 `topic-equation-constants.ts` 对齐的期望值（刻意写死：常量被改坏了这里要红）。 */
const EXPECT_MAX_HEIGHT = 40
const EXPECT_BLOCK = 48
/** 1em = 1000 MathJax 单位（由 viewBox 与自报 ex 高度实测推导，见常量文件注释） */
const EQUATION_UNITS_PER_EM = 1000

const LATEX = '\\frac{a}{b}'
const LATEX_DISPLAY = '\\sum_{i=1}^{n} i^2'
const LATEX_BROKEN = '\\frac{a}{'

const results = []
function check(label, pass, detail = '') {
  results.push({ label, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  —— ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

const consoleErrors = []
page.on('console', (message) => {
  if (message.type() !== 'error') return
  if (message.location()?.url?.includes('favicon')) return
  consoleErrors.push(message.text())
})

// 清掉上一次运行留下的恢复快照，保证从默认文档开始
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
await page.evaluate(`localStorage.removeItem('mindgrid:recovery:v1')`)
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('.mindmap-node--depth-1', { timeout: 20000 })

/** 读一个节点的几何（原始屏幕像素 + 画布缩放，归一在 Node 侧做）。 */
const READ_NODE = (selector) => `(() => {
  const board = document.querySelector('.mindmap-scene__board')
  let zoom = 1
  if (board) {
    const m = getComputedStyle(board).transform.match(/matrix\\(([^)]+)\\)/)
    if (m) {
      const parts = m[1].split(',').map(Number)
      if (parts[0] > 0) zoom = parts[0]
    }
  }
  const node = document.querySelector(${JSON.stringify(selector)})
  if (!node) return { zoom, missing: true }
  const nodeRect = node.getBoundingClientRect()
  const slot = node.querySelector('.mindmap-node__equation')
  const inner = node.querySelector('.mindmap-node__equation-svg')
  const svg = inner ? inner.querySelector('svg') : null
  const title = node.querySelector('.mindmap-node__title')
  const innerRect = inner ? inner.getBoundingClientRect() : null
  const svgRect = svg ? svg.getBoundingClientRect() : null
  const slotRect = slot ? slot.getBoundingClientRect() : null
  const titleRect = title ? title.getBoundingClientRect() : null
  const viewBox = svg ? (svg.getAttribute('viewBox') || '') : ''
  // svg 根标签上的 width/height：必须是**自然尺寸 px**，不能是 viewBox 单位
  const svgAttrs = svg
    ? { width: svg.getAttribute('width'), height: svg.getAttribute('height') }
    : null
  const currentColor = inner ? (inner.innerHTML.match(/currentColor/g) || []).length : 0
  const fills = []
  if (svg) {
    // ⚠️ 必须带 'g'：MathJax 把 fill/stroke 挂在 <g stroke="currentColor"
    // fill="currentColor" ...> 上，而 path 自己**不带** fill。
    // 只查 path/use 会得到空集合 → "填充色就是文字色"这条恒假（实测踩过）。
    for (const el of svg.querySelectorAll('path,use,g')) {
      const fill = el.getAttribute('fill')
      if (fill && fill !== 'none') fills.push(fill)
    }
  }
  return {
    zoom,
    nodeHeight: nodeRect.height,
    nodeWidth: nodeRect.width,
    // ⚠️ 节点字号在**标题**上（.mindmap-node 自己是继承来的 16px）
    titleFontSize: title ? getComputedStyle(title).fontSize : null,
    textColor: getComputedStyle(node).color,
    hasSlot: !!slot,
    hasInner: !!inner,
    hasSvg: !!svg,
    slotHeight: slotRect ? slotRect.height : null,
    slotBottom: slotRect ? slotRect.bottom : null,
    innerRect: innerRect
      ? { x: innerRect.x, y: innerRect.y, width: innerRect.width, height: innerRect.height }
      : null,
    svgRect: svgRect ? { width: svgRect.width, height: svgRect.height } : null,
    svgAttrs,
    titleTop: titleRect ? titleRect.top : null,
    viewBox,
    currentColorCount: currentColor,
    uniqueFills: [...new Set(fills)],
    errorText: (node.querySelector('.mindmap-node__equation-error')?.textContent || '').trim(),
    dataWidth: inner ? inner.getAttribute('data-equation-width') : null,
    dataHeight: inner ? inner.getAttribute('data-equation-height') : null,
  }
})()`

const READ_PANEL_ERROR = `(() => {
  const el = document.querySelector('.panel__equation-error')
  return el ? el.textContent.trim() : ''
})()`

/**
 * 公式的自然尺寸（**独立复算**，刻意不看 data-* 属性）。
 * 判据就是契约本身：`viewBox 数值 / 1000 × 节点字号`。
 */
function expectedNatural(viewBox, fontSizePx) {
  const parts = viewBox.trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4) return null
  const size = Number.parseFloat(fontSizePx)
  if (!Number.isFinite(size) || size <= 0) return null
  return {
    width: (parts[2] / EQUATION_UNITS_PER_EM) * size,
    height: (parts[3] / EQUATION_UNITS_PER_EM) * size,
  }
}

/** contain + 只缩不放：DOM 端应当呈现的尺寸。 */
function expectedFitted(natural, slotWidth, slotHeight) {
  const scale = Math.min(1, slotWidth / natural.width, slotHeight / natural.height)
  return { width: natural.width * scale, height: natural.height * scale }
}

const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance
/** 把 #rrggbb / rgb(...) 归一成 `rgb(r,g,b)`，否则颜色比较会假红。 */
function normalizeColor(value) {
  const text = (value ?? '').trim().toLowerCase()
  if (text.startsWith('#')) {
    const hex = text.slice(1)
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
    return `rgb(${parseInt(full.slice(0, 2), 16)},${parseInt(full.slice(2, 4), 16)},${parseInt(full.slice(4, 6), 16)})`
  }
  const m = text.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(',').map((p) => Number.parseFloat(p))
    return `rgb(${Math.round(parts[0])},${Math.round(parts[1])},${Math.round(parts[2])})`
  }
  return text
}

// —— 选一个一级主题，切到「样式」子页 ——
const target = '.mindmap-node--depth-1'
await page.locator(target).first().click()
await page.waitForTimeout(300)
await page.locator('#inspector-tab-style').click()
await page.waitForTimeout(400)

const before = await page.evaluate(READ_NODE(target))
if (before.missing) {
  console.error('找不到一级主题节点，无法继续')
  process.exit(1)
}
console.log(`（画布缩放 zoom=${before.zoom}，节点字号取自标题 = ${before.titleFontSize}）`)
check('基线（未加方程）：节点上没有方程元素', !before.hasSlot && !before.hasInner)

const textarea = page.locator('textarea[aria-label="方程 LaTeX 源码"]')
check('右栏「方程」小节的 LaTeX 输入框存在', (await textarea.count()) === 1)

// —— 输入 LaTeX 并失焦提交 ——
await textarea.fill(LATEX)
await textarea.blur()
await page.waitForFunction(
  (sel) => !!document.querySelector(`${sel} .mindmap-node__equation-svg svg`),
  target,
  { timeout: 20000 },
)
await page.waitForTimeout(300)

const inline = await page.evaluate(READ_NODE(target))
check('节点上出现方程元素与内联 SVG', inline.hasSlot && inline.hasInner && inline.hasSvg)

// ① 槽位高固定为常量
check(
  `槽位高 = ${EXPECT_MAX_HEIGHT}px（与 computeTopicEquationRect 的槽位一致）`,
  inline.slotHeight !== null && near(inline.slotHeight / inline.zoom, EXPECT_MAX_HEIGHT, 0.6),
  `实测 ${(inline.slotHeight / inline.zoom).toFixed(2)}px（原始 ${inline.slotHeight?.toFixed(1)} / zoom ${inline.zoom}）`,
)

// ② 自然尺寸与公式一致（独立复算）
const natural = expectedNatural(inline.viewBox, inline.titleFontSize)
check(
  '能从 viewBox 与节点字号复算出自然尺寸',
  !!natural,
  `viewBox=${inline.viewBox} 节点字号=${inline.titleFontSize}`,
)
if (natural) {
  check(
    '内联 SVG 根标签的 width/height = 自然尺寸 px（不是 viewBox 单位）',
    inline.svgAttrs !== null &&
      near(Number(inline.svgAttrs.width), natural.width, 0.2) &&
      near(Number(inline.svgAttrs.height), natural.height, 0.2),
    `svg width/height = ${inline.svgAttrs?.width}×${inline.svgAttrs?.height} ↔ 复算 ${natural.width.toFixed(2)}×${natural.height.toFixed(2)}`,
  )
  check(
    'data-equation-* 记录的自然尺寸与独立复算一致',
    near(Number(inline.dataWidth), natural.width, 0.2) &&
      near(Number(inline.dataHeight), natural.height, 0.2),
    `data=${inline.dataWidth}×${inline.dataHeight}`,
  )

  // ③ 实际渲染尺寸 = 自然尺寸缩进槽位（只缩不放 + 居中）
  // 槽位宽要另取一次：它随节点内容宽变化（上限 220），不能从常量推。
  const slotWidth = await page.evaluate(
    (sel) => {
      const slot = document.querySelector(`${sel} .mindmap-node__equation`)
      if (!slot) return null
      const board = document.querySelector('.mindmap-scene__board')
      let zoom = 1
      const m = board ? getComputedStyle(board).transform.match(/matrix\(([^)]+)\)/) : null
      if (m) {
        const parts = m[1].split(',').map(Number)
        if (parts[0] > 0) zoom = parts[0]
      }
      return slot.getBoundingClientRect().width / zoom
    },
    target,
  )
  const fitted = expectedFitted(natural, slotWidth ?? 0, EXPECT_MAX_HEIGHT)
  const rendered = {
    width: (inline.svgRect?.width ?? 0) / inline.zoom,
    height: (inline.svgRect?.height ?? 0) / inline.zoom,
  }
  check(
    '实际渲染尺寸 = 自然尺寸按比例缩进槽位（只缩不放）',
    near(rendered.width, fitted.width, 0.6) && near(rendered.height, fitted.height, 0.6),
    `实测 ${rendered.width.toFixed(2)}×${rendered.height.toFixed(2)} ↔ 期望 ${fitted.width.toFixed(2)}×${fitted.height.toFixed(2)}（槽位宽 ${slotWidth?.toFixed(1)}）`,
  )
  // ⚠️ 这条**不能**写成"只要不超出槽位就行"：CSS 的 max-width/max-height 兜住了边界，
  // 于是"内联尺寸写错"时它照样成立（实测：把尺寸换回 viewBox 单位后，
  // 90×40 的槽位里塞着一个被双向压缩到 90×40 的公式 —— 边界没破，比例全毁）。
  // 真正有鉴别力的是**比例**：contain 必须保持宽高比。
  check(
    '渲染比例与公式一致（contain 而非拉伸）',
    rendered.height > 0 && near(rendered.width / rendered.height, natural.width / natural.height, 0.02),
    `实测 ${rendered.width.toFixed(1)}×${rendered.height.toFixed(1)}（比例 ${(rendered.width / rendered.height).toFixed(3)}）↔ 公式比例 ${(natural.width / natural.height).toFixed(3)}；槽位 ${(slotWidth ?? 0).toFixed(1)}×${EXPECT_MAX_HEIGHT}`,
  )
}

// ④ 版面顺序：公式在标题上方
check(
  '公式在标题上方（槽位底 ≤ 标题顶）',
  inline.slotBottom !== null && inline.titleTop !== null && inline.slotBottom <= inline.titleTop + 0.6,
  `槽位底 ${inline.slotBottom?.toFixed(1)} ≤ 标题顶 ${inline.titleTop?.toFixed(1)}（屏幕像素，同一坐标系）`,
)

// ⑤ 布局对账：节点正好长高一个方程块
const delta = (inline.nodeHeight - before.nodeHeight) / inline.zoom
check(
  `加方程后节点正好高出一个方程块（${EXPECT_BLOCK}px）`,
  near(delta, EXPECT_BLOCK, 0.6),
  `${(before.nodeHeight / before.zoom).toFixed(1)} → ${(inline.nodeHeight / inline.zoom).toFixed(1)}（Δ=${delta.toFixed(2)}）`,
)

// ⑥ 颜色已落定
check(
  '行内 SVG 里没有残留 currentColor（残留会让导出画成黑色）',
  inline.currentColorCount === 0,
  `残留 ${inline.currentColorCount} 处`,
)
check(
  '公式的填充色就是节点文字色',
  inline.uniqueFills.length > 0 &&
    inline.uniqueFills.every(
      (fill) => normalizeColor(fill) === normalizeColor(inline.textColor),
    ),
  `fill=${inline.uniqueFills.join(',')} ↔ color=${inline.textColor}`,
)

// —— display 开关：几何契约不变，但排版换了一套 ——
await page.locator('input[aria-label="方程独立成行"]').check()
await page.waitForTimeout(600)
const display = await page.evaluate(READ_NODE(target))
check(
  '切到 display：排版真的换了（viewBox 变化）',
  display.hasSvg && display.viewBox !== inline.viewBox,
  `inline viewBox=${inline.viewBox} → display viewBox=${display.viewBox}`,
)
check(
  '切到 display：节点高度仍是一个方程块（槽位固定，不随公式大小变）',
  near((display.nodeHeight - before.nodeHeight) / display.zoom, EXPECT_BLOCK, 0.6),
  `Δ=${((display.nodeHeight - before.nodeHeight) / display.zoom).toFixed(2)}`,
)

// —— 语法错：面板给原文，节点给可读提示 ——
await textarea.fill(LATEX_BROKEN)
await textarea.blur()
await page.waitForSelector('.panel__equation-error', { timeout: 20000 })
const panelError = await page.evaluate(READ_PANEL_ERROR)
await page.waitForTimeout(500)
const broken = await page.evaluate(READ_NODE(target))
check(
  '语法错：面板显示渲染器给的原因（不是一句泛泛的"公式有误"）',
  panelError.length > 0 && /brace|Missing|Extra|Unknown|Undefined|^\\$/i.test(panelError),
  `面板："${panelError}"`,
)
check(
  '语法错：节点给可读提示、且**仍占住槽位**（布局不跳）',
  broken.errorText.length > 0 &&
    broken.hasSlot &&
    near((broken.nodeHeight - before.nodeHeight) / broken.zoom, EXPECT_BLOCK, 0.6),
  `节点提示="${broken.errorText}"，槽位=${broken.hasSlot}，Δ=${((broken.nodeHeight - before.nodeHeight) / broken.zoom).toFixed(2)}`,
)

// —— 移除：回到基线 ——
await page.locator('button[aria-label="移除方程"]').click()
await page.waitForTimeout(600)
const removed = await page.evaluate(READ_NODE(target))
check(
  '移除方程后：元素消失、高度回到基线',
  !removed.hasSlot &&
    !removed.hasInner &&
    near(removed.nodeHeight / removed.zoom, before.nodeHeight / before.zoom, 0.6),
  `高度 ${(removed.nodeHeight / removed.zoom).toFixed(1)}（基线 ${(before.nodeHeight / before.zoom).toFixed(1)}）`,
)

// —— 留存取证 ——
await mkdir(outDir, { recursive: true })
await page.locator('textarea[aria-label="方程 LaTeX 源码"]').fill(LATEX_DISPLAY)
await page.locator('textarea[aria-label="方程 LaTeX 源码"]').blur()
await page.waitForFunction(
  (sel) => !!document.querySelector(`${sel} .mindmap-node__equation-svg svg`),
  target,
  { timeout: 20000 },
)
await page.waitForTimeout(400)
await page.screenshot({ path: `${outDir}/equation-dom.png` })
await page.locator(target).first().click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${outDir}/equation-panel.png` })

await writeFile(
  `${outDir}/equation-dom-evidence.json`,
  JSON.stringify(
    { baseUrl, latex: LATEX, before, inline, display, broken, removed, results },
    null,
    2,
  ),
)

const failed = results.filter((r) => !r.pass)
console.log(`\n共 ${results.length} 条断言，失败 ${failed.length}`)
console.log(
  `产物：${outDir}/equation-dom.png、${outDir}/equation-panel.png、${outDir}/equation-dom-evidence.json`,
)
console.log('console 错误数 =', consoleErrors.length, consoleErrors.slice(0, 3))

await browser.close()
process.exitCode = failed.length === 0 && consoleErrors.length === 0 ? 0 : 1
