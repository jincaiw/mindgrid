/**
 * 开发期 UI 状态截图工具（不属于产物，dev/ 目录不参与构建与 lint）。
 *
 * 用途：把 Web 端可渲染的面板状态批量截成图，供 XMind 对标视觉复查留档。
 * 原生窗口独有状态（macOS 菜单栏、ZEN、放映）无法在浏览器里复现，必须在
 * Tauri 原生窗口里单独取证——本脚本只负责 DOM 面板，不替代原生签收。
 *
 * 用法：
 *   node dev/capture-ui-states.mjs [baseUrl] [outDir]
 * 依赖：playwright-core + 已缓存的 chromium（与本仓库无依赖关系）。
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:1421/'
const outDir = process.argv[3] ?? 'outputs/native/ui-states'

// Playwright 缓存里的完整 Chromium（Chrome for Testing 包名），headless 与有头共用同一个二进制
const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`)
  await page.screenshot({ path: file })
  console.log('saved', file)
}

async function main() {
  await mkdir(outDir, { recursive: true })

  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  await shot(page, '01-default-shell')

  const inspectorTab = async (name, file) => {
    const tab = page.getByRole('tab', { name })
    if ((await tab.count()) > 0) {
      await tab.first().click()
      await page.waitForTimeout(500)
      await shot(page, file)
    } else {
      console.log('skip (tab missing):', name)
    }
  }

  await inspectorTab('画布', '02-inspector-canvas')

  // 骨架选择器浮层（用类名定位，避免中文全角冒号在可访问名里的匹配差异）
  const picker = page.locator('.structure-picker__trigger')
  if ((await picker.count()) > 0) {
    await picker.first().click()
    await page.waitForTimeout(400)
    await shot(page, '05-structure-picker')

    const scroll = page.locator('.structure-picker__scroll')
    if ((await scroll.count()) > 0) {
      await scroll.first().evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await page.waitForTimeout(300)
      await shot(page, '06-structure-picker-bottom')
    }

    // 切到树型表格，验证新布局引擎的真实渲染
    const treeTable = page.locator('.structure-picker__card', { hasText: '树型表格' })
    if ((await treeTable.count()) > 0) {
      await treeTable.first().click()
      await page.waitForTimeout(700)
      await shot(page, '07-treetable-layout')
    } else {
      console.log('skip: tree table card missing')
    }
  } else {
    console.log('skip: structure picker trigger missing')
  }

  // 色板浮层（背景颜色 / 分支色板）
  for (const [triggerLabel, file] of [
    ['背景颜色', '08-background-swatches'],
    ['分支色板', '09-branch-palette'],
  ]) {
    const trigger = page.locator(`.swatch-picker__trigger[aria-label="${triggerLabel}"]`)
    if ((await trigger.count()) > 0) {
      await trigger.first().click()
      await page.waitForTimeout(350)
      await shot(page, file)
      await page.keyboard.press('Escape')
    } else {
      console.log('skip: swatch trigger missing', triggerLabel)
    }
  }

  // 骨架浮层只在「画布」子页挂载，切页顺序必须把它放在画布页之后
  await inspectorTab('演说', '03-inspector-pitch')
  await inspectorTab('样式', '04-inspector-style')

  // 演说 / 简报放映（会接管整屏，最后做）
  await inspectorTab('演说', '03-inspector-pitch')
  for (const [buttonName, file] of [
    ['开始放映', '12-presentation'],
    ['开始简报', '13-pitch-brief'],
  ]) {
    const button = page.getByRole('button', { name: buttonName })
    if ((await button.count()) > 0) {
      await button.first().click()
      await page.waitForTimeout(800)
      await shot(page, file)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    } else {
      console.log('skip (button missing):', buttonName)
    }
  }

  // 换成逻辑图骨架：导图样式 / 高级布局里只对思维导图生效的项应置灰
  // 骨架只在「画布」子页挂载，先切回去（否则这一段会被静默跳过）
  await inspectorTab('画布', '02-inspector-canvas')
  const picker2 = page.locator('.structure-picker__trigger')
  if ((await picker2.count()) > 0) {
    await picker2.first().click()
    await page.waitForTimeout(300)
    const logicCard = page.locator('.structure-picker__card', { hasText: '逻辑图' })
    if ((await logicCard.count()) > 0) {
      await logicCard.first().click()
      await page.waitForTimeout(700)
      await shot(page, '15-logic-structure-greyed-options')

      // 置灰的布局选项在面板下方，需要滚到可见位置再拍
      await page.evaluate(() => {
        const panel = document.querySelector('.panel--inspector')
        const scrollable = panel?.querySelector('.panel__tab-body')
        if (scrollable) scrollable.scrollTop = scrollable.scrollHeight
        // 兜底：不同版本的面板可能把 overflow 放在 panel 自身上
        if (panel) panel.scrollTop = panel.scrollHeight
      })
      await page.waitForTimeout(400)
      await shot(page, '15b-logic-greyed-scrolled')
    }
    // 切回思维导图，后面的截图保持默认骨架
    await picker2.first().click()
    await page.waitForTimeout(300)
    const mindmapCard = page.locator('.structure-picker__card', { hasText: '思维导图' })
    if ((await mindmapCard.count()) > 0) {
      await mindmapCard.first().click()
      await page.waitForTimeout(600)
    }
  } else {
    console.log('skip: 画布页里没有骨架选择器')
  }

  // 深度分级：给一级分支加两个子主题，看二级是否呈"淡底 + 深字"
  const branch = page.locator('.mindmap-node', { hasText: '关键洞察' }).first()
  if ((await branch.count()) > 0) {
    await branch.click()
    await page.waitForTimeout(200)
    const childButton = page.getByRole('button', { name: '子主题' })
    if ((await childButton.count()) > 0) {
      await childButton.first().click()
      await page.waitForTimeout(250)
      await page.keyboard.press('Escape')
      await childButton.first().click()
      await page.waitForTimeout(250)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      await shot(page, '14-depth-hierarchy')
    }
  }

  // 模式视图：ZEN 与大纲（工具栏 / 状态条入口）
  for (const [buttonName, file] of [
    ['ZEN', '10-zen-mode'],
    ['大纲', '11-outline-mode'],
  ]) {
    const button = page.getByRole('button', { name: buttonName, exact: false })
    if ((await button.count()) > 0) {
      await button.first().click()
      await page.waitForTimeout(500)
      await shot(page, file)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    } else {
      console.log('skip (button missing):', buttonName)
    }
  }

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
