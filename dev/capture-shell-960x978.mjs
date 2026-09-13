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

  // 用**页签 id** 定位，不能用文字匹配：工具栏里也有一个「演说」按钮
  // （点了会直接进入放映），按名字取会点到它，并且随后的模态会挡住一切点击。
  for (const [tabId, file] of [
    ['#inspector-tab-canvas', 'canvas'],
    ['#inspector-tab-style', 'style'],
    ['#inspector-tab-pitch', 'present'],
  ]) {
    const button = page.locator(tabId)
    if ((await button.count()) === 0) {
      console.log('skip (tab missing):', tabId)
      continue
    }
    await button.first().click()
    await page.waitForTimeout(600)
    const out = path.join(outDir, `shell-${file}.png`)
    await page.screenshot({ path: out })
    console.log(`saved ${out} (${WIDTH}×${HEIGHT} 逻辑, 2×)`)
  }

  // 回到样式页：浮层取景需要样式页挂载（循环最后一页是「演说」）

  // 颜色浮层展开态：验证 portal 到 body 的浮层没被右栏裁切
  // （右栏是滚动容器，挂在触发器内部的浮层会被裁到 280px 以内——踩过）
  // 保险：万一前面留下了模态（如放映），先退出再取景
  await page.keyboard.press('Escape')
  const styleTab = page.locator('#inspector-tab-style')
  if ((await styleTab.count()) > 0) {
    await styleTab.first().click()
    await page.waitForTimeout(400)
  }

  const fillTrigger = page.getByRole('button', { name: '填充色' })
  if ((await fillTrigger.count()) > 0) {
    await fillTrigger.first().click()
    await page.waitForTimeout(400)
    const out = path.join(outDir, 'shell-style-fill-popover.png')
    await page.screenshot({ path: out })
    console.log(`saved ${out}`)
    await page.keyboard.press('Escape')
  } else {
    console.log('skip: 填充色触发器未找到（样式页可能未挂载）')
  }

  await browser.close()
}

await main()
