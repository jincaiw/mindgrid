/**
 * 「分支自由布局」端到端冒烟：真实鼠标拖拽一级分支 → 位置落到 layoutHints → 刷新后仍在。
 *
 * 为什么要这个脚本：这个功能的链路横跨 设置 → 拖拽判定 → IPC 命令 → 布局消费 → 三端渲染，
 * 单测只能覆盖首尾两端；中间"拖了但没写进去""写进去了但布局不认"这两类问题只有真浏览器能暴露。
 *
 * 用法：node dev/smoke-free-branch.mjs [baseUrl] [outDir]
 * 依赖：playwright-core + 本地缓存的 Chromium（与本仓库无依赖关系）。
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:1421/'
const outDir = process.argv[3] ?? 'outputs/native/free-branch'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

async function branchBox(page, label) {
  const node = page.locator('.mindmap-node', { hasText: label }).first()
  await node.waitFor({ state: 'visible', timeout: 5000 })
  return node.boundingBox()
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  // 1) 打开「分支自由布局」开关（画布页 → 高级布局）
  const toggle = page.getByLabel('分支自由布局')
  if ((await toggle.count()) === 0) {
    throw new Error('未找到「分支自由布局」开关')
  }
  await toggle.first().check()
  await page.waitForTimeout(400)

  const before = await branchBox(page, '关键洞察')
  await page.screenshot({ path: path.join(outDir, '01-before-drag.png') })
  console.log('before:', before && { x: Math.round(before.x), y: Math.round(before.y) })

  // 2) 真实拖拽：按下 → 移动 → 松开
  const from = { x: before.x + before.width / 2, y: before.y + before.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 200, from.y - 160, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(600)

  const after = await branchBox(page, '关键洞察')
  await page.screenshot({ path: path.join(outDir, '02-after-drag.png') })
  console.log('after :', after && { x: Math.round(after.x), y: Math.round(after.y) })

  const moved =
    after && before && (Math.abs(after.x - before.x) > 40 || Math.abs(after.y - before.y) > 40)
  console.log(moved ? 'PASS 拖拽改变了分支位置' : 'FAIL 拖拽后分支位置几乎没变')

  // 2b) 关掉「主题层叠」后，把两个分支叠在一起应自动让开
  const stackToggle = page.getByLabel('主题层叠', { exact: true })
  if ((await stackToggle.count()) > 0) {
    await stackToggle.first().uncheck()
    await page.waitForTimeout(300)

    const target = await branchBox(page, '行动项')
    const dragFrom = await branchBox(page, '关键洞察')
    await page.mouse.move(
      dragFrom.x + dragFrom.width / 2,
      dragFrom.y + dragFrom.height / 2,
    )
    await page.mouse.down()
    // 直接拖到另一个分支的正中间，制造重叠
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
      steps: 12,
    })
    await page.mouse.up()
    await page.waitForTimeout(600)

    const a = await branchBox(page, '行动项')
    const b = await branchBox(page, '关键洞察')
    const [upper, lower] = a.y <= b.y ? [a, b] : [b, a]
    const verticalGap = lower.y - (upper.y + upper.height)
    await page.screenshot({ path: path.join(outDir, '04-stacking-off.png') })
    console.log('层叠关闭后两条分支的纵向间隙:', Math.round(verticalGap))
    console.log(
      verticalGap > -2 ? 'PASS 层叠关闭时自动让开（不再重叠）' : 'FAIL 仍然重叠',
    )
  } else {
    console.log('skip: 未找到「主题层叠」开关')
  }

  // 3) 刷新后位置是否持久化（说明确实写进了文档并落盘到恢复快照）
  // 注意基准要取"刷新前一刻"的坐标：中间若又拖过，用更早的 after 比会假失败
  const beforeReload = await branchBox(page, '关键洞察')
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const reloaded = await branchBox(page, '关键洞察')
  await page.screenshot({ path: path.join(outDir, '03-after-reload.png') })
  console.log('reload:', reloaded && { x: Math.round(reloaded.x), y: Math.round(reloaded.y) })
  const persisted =
    reloaded &&
    beforeReload &&
    Math.abs(reloaded.x - beforeReload.x) < 6 &&
    Math.abs(reloaded.y - beforeReload.y) < 6
  console.log(persisted ? 'PASS 刷新后位置保持' : 'FAIL 刷新后位置丢失')

  await browser.close()
  if (!moved || !persisted) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
