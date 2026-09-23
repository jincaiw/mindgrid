/**
 * 「工具 → 创建自定义风格」的真引擎取证：走**真实 UI 链路**，量真实像素与真实 DOM 颜色。
 *
 * 验的是四件事（单测都覆盖不到的那部分）：
 * 1. 面板按钮 → 编辑器 → 保存 → 出现在「文档主题」列表（这条链路通不通）
 * 2. 改「画布背景」后，**.canvas-host 的计算背景色**真的变成新颜色（不是只在状态里变了）
 * 3. 改「分支主题背景」后，主题节点的**真实计算样式**里出现这个颜色
 *    —— 这条同时验证了"改分支配色会自动清空色板"这条规则真的走到了渲染
 *    （基准 rainbow 带色板，色板优先；不清掉的话节点不会变这个色）
 * 4. 刷新页面后重新选中该风格，配色**原样回来**（存的是一整份配色，不只是名字）
 *
 * 用法：node dev/capture-custom-style.mjs [baseUrl] [outDir]
 * 前置：vite dev 已在 baseUrl 上监听（用 --host 127.0.0.1，否则只监听 IPv6）
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:1421').replace(/\/$/, '')
const outDir = process.argv[3] ?? 'outputs/native/custom-style'

const BG_COLOR = '#102030'
const BRANCH_COLOR = '#123456'
const EXPECTED_BG_RGB = 'rgb(16, 32, 48)'
const EXPECTED_BRANCH_RGB = 'rgb(18, 52, 86)'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

/**
 * 主题背景色：读**浏览器自己算出来的**计算值（不是我们算的）。
 *
 * ⚠️ 不要在 `.mindmap-scene__canvas` 的像素里找背景色：**背景不画在 canvas 上**，
 * 它是 `.canvas-host` 的 CSS 背景（canvas 大部分像素是透明的，
 * 取它的"主色"只会得到 #000000 —— 本轮实测踩过）。
 */
const THEME_BACKGROUND = `(() => {
  // 量"画布区域**透出来的**底色"：从 .mindmap-scene 自身开始，自下而上找到
  // 第一个**不透明**的背景色。
  //
  // 为什么不直接读 .canvas-host 的计算背景色：那只是"某一层设了什么"，
  // 不等于"用户看到什么"。本轮实测踩到——.mindmap-scene 自己有一条
  // UI 令牌底色，把 .canvas-host 的主题背景整片盖住：.canvas-host 算出
  // rgb(26,26,46)，屏幕上一直是浅灰。这个写法对"哪一层挡住"完全免疫：
  // 旧代码会停在 .mindmap-scene 上报出令牌色，修好后才会走到 .canvas-host。
  //
  // 也**不要**用 elementFromPoint：画布底部会命中状态条之类的浮层，
  // 量到的是浮层颜色（本轮先踩了这个，误判成"修复无效"）。
  const parse = (value) => {
    const open = value.indexOf('(')
    const close = value.indexOf(')')
    if (open < 0 || close < 0) return null
    const parts = value.slice(open + 1, close).split(',').map((part) => Number(part.trim()))
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }

  let el = document.querySelector('.mindmap-scene')
  if (!el) return { error: 'mindmap-scene not found' }
  const chain = []
  while (el) {
    const value = getComputedStyle(el).backgroundColor
    const parsed = parse(value)
    chain.push((el.className || el.tagName) + '=' + value)
    if (parsed && parsed.a > 0.01) {
      const hex =
        '#' + [parsed.r, parsed.g, parsed.b].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
      return {
        hex,
        rgb: 'rgb(' + parsed.r + ', ' + parsed.g + ', ' + parsed.b + ')',
        paintedBy: String(el.className || el.tagName),
        chain,
      }
    }
    el = el.parentElement
  }
  return { error: 'no opaque background found', chain }
})()`

/** 第 2 个主题节点子树里出现的所有背景色（节点配色画在 DOM 上，不在 canvas 上）。 */
const NODE_COLORS = `(() => {
  const nodes = document.querySelectorAll('.mindmap-node')
  if (nodes.length < 2) return { error: 'less than 2 topic nodes', count: nodes.length }
  const node = nodes[1]
  const elements = [node, ...node.querySelectorAll('*')]
  return { count: nodes.length, colors: elements.map((el) => getComputedStyle(el).backgroundColor) }
})()`

/** 直接改 React 受控的 color input：必须用原生 setter，否则 React 的值追踪不认。 */
async function setColorInput(page, ariaLabel, value) {
  await page.locator(`input[aria-label="${ariaLabel}"]`).evaluate((element, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(element, next)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

const problems = []
const notes = []

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })

const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error' && !message.location()?.url?.includes('favicon')) {
    consoleErrors.push(message.text())
  }
})
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

await page.goto(baseUrl, { waitUntil: 'load' })
await page.waitForTimeout(2200)

// —— ① 打开编辑器 ——
const openButton = page.getByRole('button', { name: '新建自定义风格…' })
if ((await openButton.count()) === 0) {
  console.log('FAIL: 检查器里没有「新建自定义风格…」按钮（面板链路不通）')
  await browser.close()
  process.exit(1)
}

const beforeBackground = await page.evaluate(THEME_BACKGROUND)
const beforeNodes = await page.evaluate(NODE_COLORS)
if (beforeNodes.error) {
  problems.push(`取初始节点颜色失败：${beforeNodes.error}`)
}

await openButton.first().click()
await page.waitForTimeout(400)

const dialog = page.locator('.style-editor')
if ((await dialog.count()) === 0) {
  problems.push('点了按钮但编辑器没有出现')
}

// —— ② 改画布背景：看预览是否跟着走 + 保存后画布像素是否真的变 ——
const previewBefore = await page.evaluate(
  `document.querySelector('.style-editor__thumb rect')?.getAttribute('fill')`,
)
await setColorInput(page, '画布背景', BG_COLOR)
await page.waitForTimeout(150)
const previewAfter = await page.evaluate(
  `document.querySelector('.style-editor__thumb rect')?.getAttribute('fill')`,
)
notes.push(`预览背景：${previewBefore} → ${previewAfter}`)
if (previewAfter !== BG_COLOR) {
  problems.push(`预览没有跟着草稿走（期望 ${BG_COLOR}，实际 ${previewAfter}）`)
}

// —— ③ 改分支主题背景：应当清空色板并给出提示 ——
await setColorInput(page, '分支主题背景', BRANCH_COLOR)
await page.waitForTimeout(150)
const notice = await page.evaluate(
  `document.querySelector('.style-editor__notice')?.textContent ?? ''`,
)
notes.push(`清空色板提示：${notice ? '有' : '无'}`)
if (!notice.includes('已清空分支色板')) {
  problems.push('改分支配色没有给出"已清空色板"的提示（用户会不知道为什么分支变了）')
}

const paletteRows = await page.locator('.style-editor__palette-row').count()
notes.push(`提示出现后色板行数：${paletteRows}`)
if (paletteRows !== 0) {
  problems.push(`改分支配色后色板仍在（${paletteRows} 行）——那个输入框就成了死控件`)
}

await page.locator('.style-editor__thumb').screenshot({ path: path.join(outDir, 'editor.png') })

// —— ④ 保存 ——
await page.getByRole('button', { name: '保存', exact: true }).click()
await page.waitForTimeout(900)

const savedName = '我的风格 1'
const savedSwatch = page.locator('.panel__theme-swatch', { hasText: savedName })
if ((await savedSwatch.count()) === 0) {
  problems.push(`保存后「文档主题」里没有出现「${savedName}」`)
} else {
  const active = await savedSwatch.first().evaluate((el) => el.getAttribute('aria-checked'))
  notes.push(`新风格在列表里，aria-checked=${active}`)
  if (active !== 'true') {
    problems.push('保存后新风格没有被选中（用户会以为没生效）')
  }
}

const afterBackground = await page.evaluate(THEME_BACKGROUND)
notes.push(`画布背景：${beforeBackground.hex} → ${afterBackground.hex}`)
if (afterBackground.rgb !== EXPECTED_BG_RGB) {
  problems.push(
    `画布背景没有真的变成 ${BG_COLOR}（实测 ${afterBackground.hex}）——配色没走到渲染`,
  )
}

const afterNodes = await page.evaluate(NODE_COLORS)
if (afterNodes.error) {
  problems.push(`取保存后节点颜色失败：${afterNodes.error}`)
} else if (!afterNodes.colors.includes(EXPECTED_BRANCH_RGB)) {
  problems.push(
    `主题节点的计算样式里没有出现 ${BRANCH_COLOR} —— 要么分支配色没生效，要么色板没被清掉（色板优先）`,
  )
} else {
  notes.push(`第 2 个主题节点子树里出现了 ${EXPECTED_BRANCH_RGB}`)
}

const stored = await page.evaluate(`localStorage.getItem('mindgrid:custom-themes')`)
const storedList = stored ? JSON.parse(stored) : []
notes.push(`磁盘（localStorage）里的风格数：${storedList.length}`)
if (storedList.length !== 1 || storedList[0].palette.background !== BG_COLOR) {
  problems.push('落盘的配色与界面上的改动不一致')
}

await page.screenshot({ path: path.join(outDir, 'saved.png') })

// —— ⑤ 刷新后仍在，且配色原样回来 ——
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(2200)

const reloadedSwatch = page.locator('.panel__theme-swatch', { hasText: savedName })
if ((await reloadedSwatch.count()) === 0) {
  problems.push('刷新后自定义风格不见了（没真正落盘）')
} else {
  await reloadedSwatch.first().click()
  await page.waitForTimeout(700)
  const restored = await page.evaluate(THEME_BACKGROUND)
  notes.push(`刷新后重新选中该风格，画布背景：${restored.hex}`)
  if (restored.rgb !== EXPECTED_BG_RGB) {
    problems.push(`刷新后配色没有原样回来（实测 ${restored.hex}，期望 ${BG_COLOR}）`)
  }
  const restoredNodes = await page.evaluate(NODE_COLORS)
  if (!restoredNodes.error && !restoredNodes.colors.includes(EXPECTED_BRANCH_RGB)) {
    problems.push('刷新后分支配色没有恢复')
  }
}

await page.screenshot({ path: path.join(outDir, 'reloaded.png') })

if (consoleErrors.length > 0) {
  problems.push(`console 报错 ${consoleErrors.length} 条：${consoleErrors[0]}`)
}

console.log('\n=== 观察 ===')
for (const note of notes) console.log('  ' + note)
console.log('\n=== 判读 ===')
if (problems.length === 0) {
  console.log('✅ 面板→编辑器→保存→渲染→重载 全链路通过（画布像素与节点计算样式都变了）')
} else {
  for (const problem of problems) console.log('❌ ' + problem)
}

await writeFile(
  path.join(outDir, 'report.json'),
  JSON.stringify({ notes, problems, beforeBackground, afterBackground }, null, 2),
)

await browser.close()
process.exit(problems.length === 0 ? 0 : 1)
