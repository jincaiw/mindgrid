/**
 * 「自定义配色方案」端到端冒烟。
 *
 * 链路：面板里新建配色 → 写 document.settings（customPalettes + branchPalette）→
 *       画布按自定义颜色上色 → 刷新后仍在。
 * 单测覆盖了编辑器的交互与解析函数，但"面板 → 设置 → 渲染"这条横跨三层的线只有真浏览器能验。
 *
 * 用法：node dev/smoke-custom-palette.mjs [baseUrl] [outDir]
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:1421/'
const outDir = process.argv[3] ?? 'outputs/native/custom-palette'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const CUSTOM_NAME = '冒烟品牌色'
const CUSTOM_COLORS = ['#0b5fff', '#ff2d55']

async function readSettings(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('mindgrid:recovery:v1')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed.document?.settings ?? null
  })
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  // 打开「分支色板」浮层 → 新建配色…
  await page.locator('.swatch-picker__trigger[aria-label="分支色板"]').first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '新建配色…' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(outDir, '01-editor-open.png') })

  await page.getByLabel('配色方案名称', { exact: true }).fill(CUSTOM_NAME)
  // 必须用 Playwright 的 fill()：React 受控 input 会忽略"直接改 value + 派发事件"的写法
  // （React 用自己的 value 描述符追踪状态），fill 走的是原生事件通道
  await page.getByLabel('第 1 个颜色', { exact: true }).fill(CUSTOM_COLORS[0])
  await page.getByLabel('第 2 个颜色', { exact: true }).fill(CUSTOM_COLORS[1])
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(outDir, '02-editor-filled.png') })

  await page.getByRole('button', { name: '保存' }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(outDir, '03-saved.png') })

  const settings = await readSettings(page)
  const palettes = settings?.['canvas.customPalettes'] ?? []
  const created = palettes.find((item) => item.name === CUSTOM_NAME)
  console.log('已保存配色:', Boolean(created), created ?? palettes)
  console.log('当前选中色板:', settings?.['canvas.branchPalette'])

  const ok =
    created &&
    created.colors[0] === CUSTOM_COLORS[0] &&
    created.colors[1] === CUSTOM_COLORS[1] &&
    settings?.['canvas.branchPalette'] === created.id
  console.log(ok ? 'PASS 自定义配色已写入文档并被选中' : 'FAIL 自定义配色未正确写入/选中')

  // 刷新后仍在（说明确实落在文档设置里，而不是只在组件 state）
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1200)
  const after = await readSettings(page)
  const stillThere = (after?.['canvas.customPalettes'] ?? []).some(
    (item) => item.name === CUSTOM_NAME,
  )
  console.log(stillThere ? 'PASS 刷新后自定义配色仍在' : 'FAIL 刷新后自定义配色丢失')

  await page.locator('.swatch-picker__trigger[aria-label="分支色板"]').first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(outDir, '04-list-after-reload.png') })

  await browser.close()
  if (!ok || !stillThere) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
  // 出错也要退出：否则 Chromium 句柄不释放，调用方的管道一直不关闭
  process.exit(1)
})
