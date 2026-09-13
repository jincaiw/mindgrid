/**
 * 「节点级结构 / 方向」端到端冒烟。
 *
 * 链路：样式页选「子主题结构 = 组织结构图」→ 写 topic.structure → 文档持久化 →
 *       画布上该分支的子主题真的按新骨架重排（位置发生变化、且落在父节点下方）。
 * 单测覆盖了布局引擎的几何，但"面板 → 命令 → 文档 → 真实渲染位置"这条横跨四层的线
 * 只有真浏览器能验。
 *
 * 用法：node dev/smoke-mixed-structure.mjs [baseUrl] [outDir]
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:1421/'
const outDir = process.argv[3] ?? 'outputs/native/mixed-structure'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

/** 从恢复快照里读出活动画布的根主题。 */
async function readRootTopic(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('mindgrid:recovery:v1')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const doc = parsed.document
    const sheet = doc?.sheets?.find((s) => s.id === doc.activeSheetId) ?? doc?.sheets?.[0]
    return sheet?.rootTopic ?? null
  })
}

/** 某个主题节点在屏幕上的位置（世界坐标系的渲染结果）。 */
async function nodeBox(page, topicId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-topic-id="${id}"]`)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  }, topicId)
}

async function selectTopic(page, topicId) {
  await page.locator(`[data-topic-id="${topicId}"]`).click()
  await page.waitForTimeout(250)
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  // —— 准备一个"有子主题的分支"：选右侧分支 → 加两个子主题 ——
  const branchId = await page.evaluate(() => {
    const raw = window.localStorage.getItem('mindgrid:recovery:v1')
    const doc = JSON.parse(raw ?? '{}').document
    const sheet = doc?.sheets?.find((s) => s.id === doc.activeSheetId) ?? doc?.sheets?.[0]
    // 取一个有子主题的一级分支；没有就用第一个分支
    const children = sheet?.rootTopic?.children ?? []
    return (children.find((c) => (c.children ?? []).length > 0) ?? children[0])?.id ?? null
  })
  if (!branchId) throw new Error('找不到可用的分支主题')

  const addChild = page.getByRole('button', { name: /子主题/ }).first()
  for (let i = 0; i < 2; i += 1) {
    await selectTopic(page, branchId)
    await addChild.click()
    await page.waitForTimeout(400)
  }
  await selectTopic(page, branchId)

  const root = await readRootTopic(page)
  const branch = root.children.find((c) => c.id === branchId)
  const childIds = (branch.children ?? []).map((c) => c.id)
  console.log('分支', branchId, '子主题', childIds)
  if (childIds.length < 2) throw new Error('没能为该分支添加子主题')

  const before = {
    branch: await nodeBox(page, branchId),
    children: await Promise.all(childIds.map((id) => nodeBox(page, id))),
  }
  await page.screenshot({ path: path.join(outDir, '01-before.png') })

  // —— 切到样式页，把该分支的子主题结构改成组织结构图 ——
  await page.getByRole('tab', { name: '样式' }).click()
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const body = document.querySelector('.panel--inspector .panel__tab-body')
    if (body) body.scrollTop = 1500
  })
  await page.waitForTimeout(250)

  await page.getByLabel('子主题结构').selectOption({ value: 'org' })
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(outDir, '02-after-org.png') })

  const after = {
    branch: await nodeBox(page, branchId),
    children: await Promise.all(childIds.map((id) => nodeBox(page, id))),
  }

  const docAfter = await readRootTopic(page)
  const stored = docAfter.children.find((c) => c.id === branchId)?.structure
  console.log('写入文档的 structure:', stored)
  const wired = stored?.chartType === 'org'
  console.log(wired ? 'PASS 结构覆盖已写入文档' : 'FAIL 结构覆盖未写入文档')

  // 组织结构图：子主题应在父节点**下方**，且彼此横向排开
  const first = after.children[0]
  const second = after.children[1]
  const below = first.y > after.branch.y + 20 && second.y > after.branch.y + 20
  const spread = Math.abs(first.x - second.x) > 10
  const moved = Math.abs(first.y - before.children[0].y) > 1
  console.log('子主题位置（前）:', before.children)
  console.log('子主题位置（后）:', after.children)
  console.log(below ? 'PASS 子主题落在父节点下方' : 'FAIL 子主题未按组织结构图下移')
  console.log(spread ? 'PASS 子主题横向排开' : 'FAIL 子主题未横向排开')
  console.log(moved ? 'PASS 画布真的重排了' : 'FAIL 画布未变化（覆盖没生效）')

  // —— 刷新后仍在 ——
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1400)
  const afterReload = await readRootTopic(page)
  const persisted = afterReload.children.find((c) => c.id === branchId)?.structure?.chartType
  console.log(
    persisted === 'org' ? 'PASS 刷新后结构覆盖仍在' : `FAIL 刷新后结构覆盖丢失（${persisted}）`,
  )

  await page.screenshot({ path: path.join(outDir, '03-after-reload.png') })

  // —— 画布级骨架变体：整幅图换成组织结构图，再切「向上」 ——
  await page.getByRole('tab', { name: '画布' }).click()
  await page.waitForTimeout(400)
  await page.locator('.structure-picker__trigger').first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: '组织结构图' }).click()
  await page.waitForTimeout(700)

  await page.getByRole('tab', { name: '样式' }).click()
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const body = document.querySelector('.panel--inspector .panel__tab-body')
    if (body) body.scrollTop = 1700
  })
  await page.waitForTimeout(250)

  const rootId = (await readRootTopic(page)).id
  const beforeUp = { root: await nodeBox(page, rootId), branch: await nodeBox(page, branchId) }
  await page
    .locator('[role="group"][aria-label="分支方向"]')
    .getByRole('button', { name: '向上' })
    .click()
  await page.waitForTimeout(800)
  const afterUp = { root: await nodeBox(page, rootId), branch: await nodeBox(page, branchId) }
  await page.screenshot({ path: path.join(outDir, '04-org-up.png') })

  const sheetDirection = await page.evaluate(() => {
    const doc = JSON.parse(window.localStorage.getItem('mindgrid:recovery:v1') ?? '{}').document
    const sheet = doc?.sheets?.find((s) => s.id === doc.activeSheetId) ?? doc?.sheets?.[0]
    return { chartType: sheet?.chartType, direction: sheet?.layoutConfig?.direction }
  })
  console.log('画布骨架与方向:', sheetDirection)

  const variantWired = sheetDirection.direction === 'up'
  console.log(variantWired ? 'PASS 画布方向「向上」已写入文档' : 'FAIL 画布方向未写入文档')

  // 组织结构图向上：分支应跑到根主题**上方**（y 更小）
  const flipped = afterUp.branch.y < afterUp.root.y
  const moved2 = Math.abs(afterUp.branch.y - beforeUp.branch.y) > 1
  console.log('根/分支位置（切向上前后）:', beforeUp, afterUp)
  console.log(flipped ? 'PASS 整幅图已垂直镜像（分支在根上方）' : 'FAIL 未垂直镜像')
  console.log(moved2 ? 'PASS 画布真的重排了' : 'FAIL 画布未变化')

  await browser.close()
  if (
    !wired ||
    !below ||
    !spread ||
    !moved ||
    persisted !== 'org' ||
    !variantWired ||
    !flipped ||
    !moved2
  ) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
  // 出错也要退出：否则 Chromium 句柄不释放，调用方的管道一直不关闭
  process.exit(1)
})
