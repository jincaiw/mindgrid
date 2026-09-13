/**
 * 「节点级文本样式」端到端冒烟（字体族 / 斜体 / 删除线 / 大小写）。
 *
 * 链路：样式页点击 B/I/S/Tт 与字体下拉 → 写 topic.styleOverrides → 文档持久化 →
 *       DOM 节点的计算样式真的变化 → 刷新后仍在。
 * 单测覆盖了解析与渲染函数，但"面板 → 命令 → 文档 → DOM 计算样式"这条横跨四层的线
 * 只有真浏览器能验（React 受控控件、撤销栈、持久化都在中间）。
 *
 * 用法：node dev/smoke-text-style.mjs [baseUrl] [outDir]
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:1421/'
const outDir = process.argv[3] ?? 'outputs/native/text-style'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const FONT_SEGMENT = '"Songti SC", SimSun, serif'
const BRANCH_LINE_COLOR = '#ff2d55'

/** 统计所有画布上接近目标色的像素数（用于确认连线真的换了色）。 */
async function countCanvasColor(page, hex) {
  return page.evaluate((target) => {
    const [tr, tg, tb] = [1, 3, 5].map((i) => Number.parseInt(target.slice(i, i + 2), 16))
    let hits = 0
    for (const canvas of document.querySelectorAll('canvas')) {
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      let data
      try {
        data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      } catch {
        continue
      }
      for (let i = 0; i < data.length; i += 4) {
        if (
          data[i + 3] > 128 &&
          Math.abs(data[i] - tr) <= 6 &&
          Math.abs(data[i + 1] - tg) <= 6 &&
          Math.abs(data[i + 2] - tb) <= 6
        ) {
          hits++
        }
      }
    }
    return hits
  }, hex)
}

/** 从恢复快照里找出被改过的主题的样式覆盖。 */
async function readOverrides(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('mindgrid:recovery:v1')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const sheets = parsed.document?.sheets ?? []
    const walk = (topic) => {
      if (topic?.styleOverrides) return topic.styleOverrides
      for (const child of topic?.children ?? []) {
        const hit = walk(child)
        if (hit) return hit
      }
      return null
    }
    return sheets.map((sheet) => walk(sheet.rootTopic)).find(Boolean) ?? null
  })
}

/** 读第一个右侧分支节点的计算样式（文本类覆盖最终都落在内联 style 上）。 */
async function readNodeStyle(page) {
  return page.evaluate(() => {
    // 文本覆盖挂在标题 span 上（.mindmap-node__title），不是外层按钮
    const title = document.querySelector('.mindmap-node--right .mindmap-node__title')
    if (!title) return null
    const style = window.getComputedStyle(title)
    return {
      text: (title.textContent ?? '').trim(),
      fontStyle: style.fontStyle,
      textDecorationLine: style.textDecorationLine,
      textTransform: style.textTransform,
      fontFamily: style.fontFamily,
    }
  })
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  // 选中一个一级分支（右侧分支的第一个），右栏才会出现它的样式覆盖控件
  await page.locator('.mindmap-node--right').first().click()
  await page.waitForTimeout(300)

  await page.getByRole('tab', { name: '样式' }).click()
  await page.waitForTimeout(400)

  // 文本小节在面板下方：滚到底再点
  await page.evaluate(() => {
    const body = document.querySelector('.panel--inspector .panel__tab-body')
    if (body) body.scrollTop = 900
  })
  await page.waitForTimeout(250)

  await page.getByLabel('节点字体族').selectOption({ label: '宋体' })
  await page.getByRole('button', { name: '斜体' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '删除线' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '大小写转换' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(outDir, '01-panel-applied.png') })

  const overrides = await readOverrides(page)
  console.log('文档中的样式覆盖:', overrides)

  const wired =
    overrides?.fontFamily === FONT_SEGMENT &&
    overrides?.italic === true &&
    overrides?.strikethrough === true &&
    overrides?.textTransform === 'uppercase'
  console.log(wired ? 'PASS 四个文本覆盖均已写入文档' : 'FAIL 文本覆盖未正确写入文档')

  const nodeStyle = await readNodeStyle(page)
  console.log('节点计算样式:', nodeStyle)
  const rendered =
    nodeStyle?.fontStyle === 'italic' &&
    nodeStyle?.textDecorationLine.includes('line-through') &&
    nodeStyle?.textTransform === 'uppercase' &&
    (nodeStyle?.fontFamily ?? '').includes('Songti SC')
  console.log(rendered ? 'PASS DOM 计算样式已反映文本覆盖' : 'FAIL DOM 未反映文本覆盖')

  // 刷新后仍在（说明落在文档里，而不是只在组件 state）
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1400)
  const afterReload = await readOverrides(page)
  const persisted =
    afterReload?.italic === true &&
    afterReload?.strikethrough === true &&
    afterReload?.textTransform === 'uppercase'
  console.log(persisted ? 'PASS 刷新后文本覆盖仍在' : 'FAIL 刷新后文本覆盖丢失')

  await page.screenshot({ path: path.join(outDir, '02-after-reload.png') })

  // —— 节点级分支线条颜色：写文档 + 画布上的连线真的换了色 ——
  // 刷新后右栏会回到默认子页，必须先切回「样式」再找控件
  await page.locator('.mindmap-node--right').first().click()
  await page.getByRole('tab', { name: '样式' }).click()
  await page.waitForTimeout(400)

  const linePixelsBefore = await countCanvasColor(page, BRANCH_LINE_COLOR)
  await page.evaluate(() => {
    const body = document.querySelector('.panel--inspector .panel__tab-body')
    if (body) body.scrollTop = 1500
  })
  await page.waitForTimeout(250)
  // input[type=color] 不能走 fill()（Playwright 视为不可编辑）；用原生 value setter
  // + 事件派发，React 的 value tracker 才会认这次变更。
  // 注意不能用 `el.value = x`（React 会忽略），必须借原型上的 setter 绕开 tracker。
  await page.evaluate((color) => {
    const input = document.querySelector('input[aria-label="分支线条颜色"]')
    if (!input) throw new Error('找不到「分支线条颜色」输入框')
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set
    setter.call(input, color)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, BRANCH_LINE_COLOR)
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(outDir, '03-branch-line-color.png') })

  const withLine = await readOverrides(page)
  const lineWired = withLine?.branchColor === BRANCH_LINE_COLOR
  console.log(
    lineWired ? 'PASS 分支线条颜色已写入文档' : `FAIL 分支线条颜色未写入文档（${withLine?.branchColor}）`,
  )

  const linePixelsAfter = await countCanvasColor(page, BRANCH_LINE_COLOR)
  console.log(`画布上该颜色的像素数：${linePixelsBefore} → ${linePixelsAfter}`)
  const lineRendered = linePixelsAfter > linePixelsBefore
  console.log(lineRendered ? 'PASS 画布连线已按新颜色重绘' : 'FAIL 画布连线未换色')

  await browser.close()
  if (!wired || !rendered || !persisted || !lineWired || !lineRendered) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
  // 出错也要退出：否则 Chromium 句柄不释放，调用方的管道一直不关闭
  process.exit(1)
})
