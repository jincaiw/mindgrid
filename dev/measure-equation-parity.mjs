/**
 * 读 `dev/equation-parity.html` 的对账结果（方程三端一致性）。
 *
 * 用法：node dev/measure-equation-parity.mjs [baseUrl]
 * 前置：vite dev 已在 baseUrl 上监听（**必须 --host 127.0.0.1**）
 *
 * 退出码：0 = 全部断言通过；1 = 有失败（或页面报错）。
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:1421').replace(/\/$/, '')
const outDir = process.argv[3] ?? 'outputs/native/v0.4.21'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1800, height: 1400 } })

const consoleErrors = []
page.on('console', (message) => {
  if (message.type() !== 'error') return
  if (message.location()?.url?.includes('favicon')) return
  consoleErrors.push(message.text())
})
const failedRequests = []
page.on('response', (response) => {
  if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`)
})

await page.goto(`${baseUrl}/dev/equation-parity.html`, { waitUntil: 'load' })
await page.waitForFunction(
  () => /EQUATION-PARITY (OK|FAIL|ERROR)/.test(document.getElementById('status')?.textContent ?? ''),
  { timeout: 60000 },
)

const status = await page.locator('#status').textContent()
console.log(status ?? '')

await mkdir(outDir, { recursive: true })
await page.screenshot({ path: `${outDir}/equation-parity.png`, fullPage: true })
console.log(`\nsaved ${outDir}/equation-parity.png`)
// MathJax 4 内含无障碍(SRE)扩展，会去取 <base>/sre/speech-worker.js。
// 我们刻意不提供它（提供它会引入 worker 与额外的资源路径），代价是那条 404 永远在。
// 它**不影响渲染**（同步 API 照常可用），所以单独列出、不计入失败判据 ——
// 否则"失败请求"这个信号会被一条已知噪声淹没。
const KNOWN_NOISE = /\/src\/vendor\/mathjax\/sre\/speech-worker\.js$/
const unexpected = failedRequests.filter((item) => !KNOWN_NOISE.test(item))
const known = failedRequests.filter((item) => KNOWN_NOISE.test(item))
console.log('console 错误数 =', consoleErrors.length, consoleErrors.slice(0, 3))
console.log('已知噪声请求（无障碍 worker，不影响渲染）=', known.length)
console.log('非预期失败请求 =', unexpected)

const failed = /^EQUATION-PARITY FAIL/m.test(status ?? '')
const errored = /^EQUATION-PARITY ERROR/m.test(status ?? '')
if (failed || errored || consoleErrors.length > 0 || unexpected.length > 0) {
  process.exitCode = 1
}

await browser.close()
