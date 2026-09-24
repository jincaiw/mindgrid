/**
 * 无头读取导出对照页的对账结果（`dev/export-parity.html`）。
 *
 * 页面本身是给人看的（三格并排 + 差值叠加），这个脚本只把 `#status` 里的
 * 几何对账行取出来打印，好在 CI/本地一条命令拿到结论。
 *
 * 用法：node dev/measure-export-parity.mjs [baseUrl]
 * 前置：vite dev 已在 baseUrl 上监听（默认 http://127.0.0.1:1421/）
 */

import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:1421/').replace(/\/$/, '')

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })

const consoleErrors = []
page.on('console', (message) => {
  // 忽略 /favicon.ico 的 404：这个 dev 页面没有 <link rel="icon">，
  // 浏览器会自己去要一次。它与渲染无关，混在里面会让"0 错误"这个判据失去意义。
  if (message.type() !== 'error') return
  if (message.location()?.url?.includes('favicon')) return
  consoleErrors.push(message.text())
})
// 记录 4xx/5xx 的具体 URL：只报"有 1 个错误"用处不大，得知道是谁
const failedRequests = []
page.on('response', (response) => {
  if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`)
})

await page.goto(`${baseUrl}/dev/export-parity.html`, { waitUntil: 'load' })
// 页面是异步渲染的（要等图片解码），status 里出现对账标题即视为完成
await page.waitForFunction(
  () => (document.getElementById('status')?.textContent ?? '').includes('几何对账'),
  { timeout: 15000 },
)

const status = await page.locator('#status').textContent()
console.log(status)

/**
 * 页面里的 `✅/❌` 就是判据本身 —— 只打印不算数。
 *
 * 这条是补上的：脚本此前无论如何都退出 0，"跑过"和"通过"分不开，
 * 而这类页面的故障恰恰都是静默的（少画一块、几何偏一点，都不抛异常）。
 */
const failedLines = status.split('\n').filter((line) => line.includes('❌'))

// 顺带存一张并排对照图（Canvas / SVG / 差值三格），便于人工扫一眼
await page.screenshot({ path: 'outputs/native/parity/export-parity.png', fullPage: true })
console.log('\nsaved outputs/native/parity/export-parity.png')
console.log('\nconsole 错误数 =', consoleErrors.length, consoleErrors.slice(0, 3))
console.log('失败请求 =', failedRequests)
console.log('对账失败行数 =', failedLines.length, failedLines.map((line) => line.trim()).slice(0, 4))

await browser.close()
process.exitCode = failedLines.length === 0 && consoleErrors.length === 0 ? 0 : 1
