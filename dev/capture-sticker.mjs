/**
 * 贴纸链路的真引擎取证（屏幕端）。
 *
 * 为什么必须有这一步：jsdom 不做布局也不画 SVG，所以"贴纸真的画在节点上、
 * 三张排开、尺寸正确"在单测里只能验证**元素存在与 style 值**，
 * 验证不了它渲染出来是什么样、也没法看出"两张完全重叠"这种视觉缺陷。
 *
 * 做法：在真实浏览器里打开应用 → 选中主题 → 在面板上连点三张不同贴纸 →
 * 量每个贴纸的实际矩形与相对节点中心的位置 → 截图人工可查。
 *
 * 用法：node dev/capture-sticker.mjs [baseUrl] [outDir]
 * 前置：vite dev 已在 baseUrl 上监听（默认 http://127.0.0.1:1421/）
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

// 注意用 localhost：vite 默认只监听 IPv6（[::1]），写 127.0.0.1 会 ERR_CONNECTION_REFUSED
const baseUrl = (process.argv[2] ?? 'http://localhost:1421/').replace(/\/$/, '')
const outDir = process.argv[3] ?? 'outputs/native/sticker'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

/** 与 runtime/topic-sticker-constants.ts 对齐的期望值。 */
const EXPECTED_SIZE = 28
const EXPECTED_STRIDE = 22

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

// 样式页才有「贴纸」小节
const styleTab = page.locator('#inspector-tab-style')
if ((await styleTab.count()) > 0) {
  await styleTab.first().click()
  await page.waitForTimeout(400)
}

const gridItems = page.locator('.sticker-grid__item')
const gridCount = await gridItems.count()
console.log('面板里的贴纸数 =', gridCount)
if (gridCount < 3) {
  console.log('FAIL: 贴纸选择器没有渲染出来')
  await browser.close()
  process.exit(1)
}

// 连点三张不同的贴纸
for (const index of [0, 1, 2]) {
  await gridItems.nth(index).click()
  await page.waitForTimeout(250)
}

await page.waitForFunction(() => document.querySelectorAll('.mindmap-node__sticker').length >= 3, {
  timeout: 5000,
})
await page.waitForTimeout(300)

const measured = await page.evaluate(() => {
  const board = document.querySelector('.mindmap-scene__board')
  const zoom = board ? new DOMMatrix(getComputedStyle(board).transform).a : 1
  const node = document.querySelector('.mindmap-node--active') ?? document.querySelector('.mindmap-node')
  const nodeBox = node.getBoundingClientRect()
  const nodeCenter = {
    x: (nodeBox.left + nodeBox.right) / 2,
    y: (nodeBox.top + nodeBox.bottom) / 2,
  }

  const stickers = [...document.querySelectorAll('.mindmap-node__sticker')].map((element) => {
    const box = element.getBoundingClientRect()
    return {
      stickerId: element.getAttribute('data-sticker-id'),
      title: element.getAttribute('title'),
      // 世界单位
      width: box.width / zoom,
      height: box.height / zoom,
      // 相对节点中心的世界偏移
      offsetX: (box.left + box.right) / 2 / zoom - nodeCenter.x / zoom,
      offsetY: (box.top + box.bottom) / 2 / zoom - nodeCenter.y / zoom,
      paths: element.querySelectorAll('path').length,
    }
  })

  return {
    zoom: +zoom.toFixed(4),
    nodeSize: { width: nodeBox.width / zoom, height: nodeBox.height / zoom },
    stickers,
  }
})

console.log('实测：', JSON.stringify(measured, null, 1))

const problems = []
if (measured.stickers.length !== 3) {
  problems.push(`贴纸数量 ${measured.stickers.length} ≠ 3`)
}
for (const sticker of measured.stickers) {
  if (Math.abs(sticker.width - EXPECTED_SIZE) > 1) {
    problems.push(`${sticker.title} 宽 ${sticker.width.toFixed(1)} ≠ ${EXPECTED_SIZE}`)
  }
  if (sticker.paths === 0) {
    problems.push(`${sticker.title} 没有画出任何图元`)
  }
}

// 相邻步距：默认位置应向右依次排开
const sorted = [...measured.stickers].sort((a, b) => a.offsetX - b.offsetX)
for (let i = 1; i < sorted.length; i += 1) {
  const step = sorted[i].offsetX - sorted[i - 1].offsetX
  if (Math.abs(step - EXPECTED_STRIDE) > 1) {
    problems.push(`第 ${i + 1} 张与前一张的步距 ${step.toFixed(1)} ≠ ${EXPECTED_STRIDE}`)
  }
}
// 同一排 → 纵向偏移应相同
const offsetsY = new Set(measured.stickers.map((item) => Math.round(item.offsetY)))
if (offsetsY.size !== 1) {
  problems.push(`三张贴纸不在同一排：纵向偏移 ${[...offsetsY].join(', ')}`)
}

await mkdir(outDir, { recursive: true })
const shot = path.join(outDir, 'stickers-on-node.png')
await page.screenshot({ path: shot })
console.log('\nsaved', shot)

console.log('\n=== 判读 ===')
console.log(problems.length === 0 ? '✅ 贴纸渲染正确（尺寸 / 步距 / 同排）' : `❌ ${problems.join('；')}`)
console.log('console 错误数 =', consoleErrors.length, consoleErrors.slice(0, 3))

await browser.close()
