/**
 * 截取右栏「样式」子页的中段（形状 / 文本小节），用于与 XMind 样式页对照留档。
 *
 * 单独成脚本的原因：样式页很长，需要先切页、再滚动到指定小节才拍得到控件形态。
 * 用法：node dev/capture-style-page.mjs [baseUrl] [outDir]
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:1421/'
const outDir = process.argv[3] ?? 'outputs/native/ui-states'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(baseUrl, { waitUntil: 'load' })
await page.waitForTimeout(1200)

await page.getByRole('tab', { name: '样式' }).click()
await page.waitForTimeout(400)

for (const [scrollTop, name] of [
  [0, '16-style-page-top'],
  [640, '17-style-shape-text'],
  [1240, '18-style-branch-numbering'],
]) {
  await page.evaluate((top) => {
    const body = document.querySelector('.panel--inspector .panel__tab-body')
    if (body) body.scrollTop = top
  }, scrollTop)
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(outDir, `${name}.png`) })
  console.log('saved', name)
}

await browser.close()
