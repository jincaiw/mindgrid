/**
 * 打印链路取证（文件 → 打印 ⌘P）。
 *
 * 在真实浏览器里跑一遍「⌘P → 整幅导图位图 → 打印页」，再用 print 媒体模拟
 * 核对纸张上到底剩下了什么。
 *
 * 为什么非来这一步不可：jsdom 没有 canvas 实现（`getContext` 返回 null），
 * 「位图真的把整幅导图画出来了」在单测里**验证不了**；而"打印页挂在 body 上
 * 且只有它可见"这类事又是纯 DOM/CSS 行为，只有真引擎能给出结论。
 *
 * 用法：node dev/capture-print-sheet.mjs [baseUrl] [outDir]
 * 前置：vite dev 已在 baseUrl 上监听（默认 http://127.0.0.1:1421/）
 * 产出：<outDir>/print-sheet.png（print 媒体下的整页）+ 控制台判读行
 */
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:1421/'
const outDir = process.argv[3] ?? 'outputs/native/print'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  })

  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForTimeout(2000)

  // 拦下 window.print：浏览器里这是「打印本页」，会弹对话框卡住脚本
  await page.evaluate(() => {
    window.__printCalls = 0
    window.print = () => {
      window.__printCalls += 1
    }
  })

  await page.keyboard.press('Meta+p')
  // 必须用 attached 而不是默认的 visible：打印页在**屏幕媒体下是 display:none**
  // （这正是设计），等 visible 会一直等到超时——而元素其实早就在了。
  await page.waitForSelector('.print-sheet', { state: 'attached', timeout: 15000 })

  const info = await page.evaluate(() => {
    const image = document.querySelector('.print-sheet__image')
    return {
      printCalls: window.__printCalls,
      title: document.querySelector('.print-sheet__title')?.textContent ?? '',
      srcScheme: (image?.getAttribute('src') ?? '').split(':')[0],
      naturalWidth: image?.naturalWidth ?? 0,
      naturalHeight: image?.naturalHeight ?? 0,
      parentIsBody: document.querySelector('.print-sheet')?.parentElement === document.body,
    }
  })
  console.log('打印页信息:', JSON.stringify(info))

  // 屏幕上：打印页不该出现（display:none）
  const screenVisible = await page.evaluate(() => {
    const sheet = document.querySelector('.print-sheet')
    return sheet ? getComputedStyle(sheet).display : 'missing'
  })
  console.log('屏幕媒体下 .print-sheet 的 display =', screenVisible)

  // 位图内容抽查：真正把导图画出来了才会有点状深色像素，全白说明只画了背景
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(300)

  const printLayout = await page.evaluate(() => {
    const root = document.getElementById('root')
    const sheet = document.querySelector('.print-sheet')
    const image = document.querySelector('.print-sheet__image')
    return {
      rootDisplay: root ? getComputedStyle(root).display : 'missing',
      sheetDisplay: sheet ? getComputedStyle(sheet).display : 'missing',
      imageRendered: image ? image.getBoundingClientRect().width : 0,
    }
  })
  console.log('打印媒体下:', JSON.stringify(printLayout))

  const ink = await page.evaluate(() => {
    const image = document.querySelector('.print-sheet__image')
    if (!image || !image.naturalWidth) return null
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    let dark = 0
    let colored = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r < 200 || g < 200 || b < 200) dark += 1
      if (Math.max(r, g, b) - Math.min(r, g, b) > 30) colored += 1
    }
    const total = data.length / 4
    return { total, darkRatio: +(dark / total).toFixed(4), coloredRatio: +(colored / total).toFixed(4) }
  })
  console.log('位图像素抽查:', JSON.stringify(ink))

  const out = path.join(outDir, 'print-sheet.png')
  await page.screenshot({ path: out, fullPage: true })
  console.log('saved', out)

  console.log('console 错误数 =', consoleErrors.length, consoleErrors.slice(0, 3))
  await browser.close()
}

main().catch((error) => {
  console.error('FAILED', error)
  process.exit(1)
})
