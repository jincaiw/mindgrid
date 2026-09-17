/**
 * 标注（callout）的真引擎取证：走**真实的 UI 链路。
 *
 * 打开应用 → 选中一个主题 → 在格式面板里「添加标注」→ 填文本 → 失焦提交 →
 * 量画布上标注框的位置，并截图。
 *
 * 为什么要走 UI：标注画在**节点之外**（靠溢出显示），jsdom 不做布局，
 * 只有真引擎能证明它真的出现在节点旁边且没被裁剪。
 * 面板到画布的这条链路也只有走一遍才知道通不通（面板按钮 → session → 画布渲染）。
 *
 * 用法：node dev/capture-callout.mjs [baseUrl] [outDir]
 * 前置：vite dev 已在 baseUrl 上监听（用 --host 127.0.0.1，否则只监听 IPv6）
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:1421').replace(/\/$/, '')
const outDir = process.argv[3] ?? 'outputs/native/callout'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

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
await page.waitForTimeout(2000)

// 样式页才有「标注」小节
const styleTab = page.locator('#inspector-tab-style')
if ((await styleTab.count()) > 0) {
  await styleTab.first().click()
  await page.waitForTimeout(400)
}

// 选中一个分支主题（画布节点）
const node = page.locator('.mindmap-node').nth(1)
await node.click()
await page.waitForTimeout(300)

const addButton = page.getByRole('button', { name: '添加标注' })
if ((await addButton.count()) === 0) {
  console.log('FAIL: 面板里没有出现「添加标注」按钮（面板 → 画布链路不通）')
  await browser.close()
  process.exit(1)
}
await addButton.first().click()
await page.waitForTimeout(300)

const textarea = page.getByLabel('标注文本')
if ((await textarea.count()) === 0) {
  console.log('FAIL: 点「添加标注」之后没有出现文本框')
  await browser.close()
  process.exit(1)
}
await textarea.first().fill(
  '这是一段说明：标注应挂在节点外侧、且不会被裁剪；这一句刻意写长一点，用来验证换行之后框会变高。',
)
await textarea.first().blur()
await page.waitForTimeout(500)

const callout = page.locator('.mindmap-node__callout').first()
if ((await callout.count()) === 0) {
  console.log('FAIL: 提交之后画布上没有渲染标注框')
  await browser.close()
  process.exit(1)
}

const measured = await page.evaluate(() => {
  const box = document.querySelector('.mindmap-node__callout')
  const node = box.closest('.mindmap-node')
  const rect = box.getBoundingClientRect()
  const nodeRect = node.getBoundingClientRect()
  return {
    calloutLeft: rect.left,
    calloutRight: rect.right,
    nodeLeft: nodeRect.left,
    nodeRight: nodeRect.right,
    // 节点在中心主题的哪一侧：左侧分支的标注应当挂在**左**外侧（否则会压住子主题）
    side: node.classList.contains('mindmap-node--left') ? 'left' : 'right',
    height: rect.height,
    lineCount: box.querySelectorAll('.mindmap-node__callout-line').length,
    text: box.getAttribute('title'),
  }
})

console.log('实测：', JSON.stringify(measured, null, 1))

await mkdir(outDir, { recursive: true })
const shot = path.join(outDir, 'callout-on-node.png')
await page.screenshot({ path: shot })
console.log('\nsaved', shot)

const problems = []
// 挂在节点**外侧**（不压住节点）：右侧分支看左边缘、左侧分支看右边缘
const gap =
  measured.side === 'left'
    ? measured.nodeLeft - measured.calloutRight
    : measured.calloutLeft - measured.nodeRight

if (gap < 1) {
  problems.push(
    `标注框没挂在节点${measured.side === 'left' ? '左' : '右'}侧（实际与节点重叠 ${(-gap).toFixed(1)}px）`,
  )
}
if (measured.lineCount < 2) {
  problems.push(`文本没有换行（只有 ${measured.lineCount} 行）`)
}
if (measured.height < 20) {
  problems.push(`框高 ${measured.height} 太小（没随行数增高）`)
}

console.log('\n=== 判读 ===')
const summary = '(' + measured.lineCount + ' 行、高 ' + measured.height.toFixed(1) + ')'
if (problems.length === 0) {
  console.log('✅ 标注挂在节点外侧、按文本行数增高 ' + summary)
} else {
  console.log('❌ ' + problems.join('; '))
}
console.log('console 错误数 =', consoleErrors.length, consoleErrors.slice(0, 3))

await browser.close()
