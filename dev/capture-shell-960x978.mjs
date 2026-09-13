/**
 * 对标截图：把界面截成与 XMind 基准图**完全相同的逻辑尺寸**（960×978，2×）。
 *
 * 为什么单独写一个：默认的 capture-ui-states.mjs 用 1440×900，与基准图的 960×978
 * 不是同一尺度，并排看会得出"宽度不一致"这类错结论（踩过）。
 *
 * 用法：node dev/capture-shell-960x978.mjs [baseUrl] [outDir]
 * 产出：canvas.png / style.png / present.png —— 格式侧边栏的三个子页各一张整窗图。
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:1421/'
const outDir = process.argv[3] ?? 'outputs/native/parity'

// 与基准图一致的窗口（逻辑尺寸）
const WIDTH = 960
const HEIGHT = 978

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

async function main() {
  await mkdir(outDir, { recursive: true })

  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
  })

  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForTimeout(1800)

  for (const [tab, file] of [
    ['画布', 'canvas'],
    ['样式', 'style'],
    ['演说', 'present'],
  ]) {
    const button = page.getByRole('tab', { name: tab }).or(page.getByRole('button', { name: tab }))
    if ((await button.count()) === 0) {
      console.log('skip (tab missing):', tab)
      continue
    }
    await button.first().click()
    await page.waitForTimeout(600)
    const out = path.join(outDir, `shell-${file}.png`)
    await page.screenshot({ path: out })
    console.log(`saved ${out} (${WIDTH}×${HEIGHT} 逻辑, 2×)`)
  }

  await browser.close()
}

await main()
