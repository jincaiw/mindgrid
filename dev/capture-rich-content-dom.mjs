/**
 * 富内容在**非思维导图骨架**下的版面取证（真引擎 + 真实应用）。
 *
 * ## 为什么必须有这一条
 *
 * 节点的"分配高度"由布局给出（`estimateNodeSize`），而"内容画多高"由三端渲染器各自决定。
 * 两者一旦不一致，内容就会**溢出节点框**。这类不一致在单测里只有一个出口能发现：
 * `node-size.test.ts` 的双实现对照 —— 而它此前**恰好漏了"带图片"那一格**，
 * 于是 `layouts/layout-utils`（服务鱼骨 / 气泡 / 时间轴 / 组织架构 / 矩阵五种骨架）
 * 长期没有给图片预留高度：布局给 41px，三端要 137px → 溢出 96px、压到相邻节点上。
 *
 * 这条脚本从**用户操作**出发把结论量出来：切成鱼骨图 → 给主题加图片 →
 * 量"节点框"与"图片 + 标题"的实际位置关系。
 *
 * ## 验什么
 *
 * 1. 加图片后节点高度正好多出一个图片块（`TOPIC_IMAGE_BLOCK`）；
 * 2. 图片在标题上方、标题**不超出节点下边界**（不发生溢出）；
 * 3. 内容总高（图片顶 → 标题底）落在节点框内。
 *
 * 用法：node dev/capture-rich-content-dom.mjs [baseUrl] [outDir]
 * 前置：vite dev 已在 baseUrl 上监听（**必须 --host 127.0.0.1**）
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:1421').replace(/\/$/, '')
const outDir = process.argv[3] ?? 'outputs/native/v0.4.22'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

/** 与 `topic-image-constants.ts` 对齐（刻意写死：常量被改坏了这里要红）。 */
const EXPECT_IMAGE_BLOCK = 96

const results = []
function check(label, pass, detail = '') {
  results.push({ label, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  —— ${detail}` : ''}`)
}

/** 夹具图片：40×10 纯色 PNG（宽高比极端，能一眼看出是否被压扁）。 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAKCAIAAABJ+IsHAAAAHUlEQVR42mO85urIMBCAiWGAwKjFoxaPWjz0LQYAnw0BcB3I7ycAAAAASUVORK5CYII='
const fixturePath = path.join(tmpdir(), 'mindgrid-rich-content-fixture.png')

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

const consoleErrors = []
page.on('console', (message) => {
  if (message.type() !== 'error') return
  if (message.location()?.url?.includes('favicon')) return
  consoleErrors.push(message.text())
})

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
await page.evaluate(`localStorage.removeItem('mindgrid:recovery:v1')`)
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('.mindmap-node--depth-1', { timeout: 20000 })

/** 读节点几何（原始屏幕像素 + 画布缩放，归一在 Node 侧做）。 */
const READ_NODE = (selector) => `(() => {
  const board = document.querySelector('.mindmap-scene__board')
  let zoom = 1
  if (board) {
    const m = getComputedStyle(board).transform.match(/matrix\\(([^)]+)\\)/)
    if (m) {
      const parts = m[1].split(',').map(Number)
      if (parts[0] > 0) zoom = parts[0]
    }
  }
  const node = document.querySelector(${JSON.stringify(selector)})
  if (!node) return { zoom, missing: true }
  const pick = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, height: r.height, width: r.width, left: r.left }
  }
  const nodeRect = pick(node)
  // ⚠️ 布局**分配**的高度写在内联 min-height 上（组件用的是 minHeight 而不是 height）——
  // 于是内容超高时 DOM 盒子会自己长，"盒子装得下"这条断言恒真、没有鉴别力。
  // 真正要判的是"分配得够不够"，所以必须单独读它。
  const allocated = parseFloat(getComputedStyle(node).minHeight) || 0
  const title = node.querySelector('.mindmap-node__title')
  // ⚠️ mindmap-node__image 这个类**在 <img> 本身上**（不是包装元素）——
  // 写成「.mindmap-node__image img」会永远等不到（实测踩过）。
  // 注意：这段是 page.evaluate 的模板字符串，注释里不能出现反引号（本仓库已知坑）
  const image = node.querySelector('img.mindmap-node__image') ?? node.querySelector('.mindmap-node__image')
  // 全部可见节点的矩形（归一在 Node 侧做）：用于"相邻节点是否重叠"这条用户可见判据
  const all = Array.from(document.querySelectorAll('.mindmap-node')).map((el) => {
    const r = el.getBoundingClientRect()
    return {
      id: el.getAttribute('data-topic-id') || '',
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
    }
  })
  return {
    zoom,
    allocated,
    all,
    className: node.className,
    node: nodeRect,
    title: pick(title),
    image: pick(image),
    imageSrcPrefix: image ? (image.getAttribute('src') || '').slice(0, 24) : null,
    // 内容底 = 标题底与图片底里更靠下的那个
    contentBottom: Math.max(
      title ? pick(title).bottom : nodeRect.top,
      image ? pick(image).bottom : nodeRect.top,
    ),
  }
})()`

const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance
const target = '.mindmap-node--depth-1'

// —— ① 切到鱼骨图（非思维导图骨架，曾经就是在这里溢出的）——
await page.locator('#inspector-tab-canvas').click()
await page.waitForTimeout(300)
await page.locator('.structure-picker__trigger').click()
await page.waitForTimeout(400)
// XMind 式卡片只画缩略图、不带文字（名字在 title / aria-label 上）——
// 按文本选会永远等不到（实测踩过：卡片 textContent 全是空串）
  await page.locator('button[aria-label="鱼骨图"]').first().click()
await page.waitForTimeout(600)
const chartApplied = await page.evaluate(`(() => {
  const trigger = document.querySelector('.structure-picker__trigger')
  return trigger ? trigger.textContent.trim() : ''
})()`)
check('已切到鱼骨图骨架', /鱼骨/.test(chartApplied), `当前骨架按钮文本："${chartApplied}"`)

// —— ② 选中一个一级主题 ——
await page.locator(target).first().click()
await page.waitForTimeout(300)
await page.locator('#inspector-tab-style').click()
await page.waitForTimeout(400)

const before = await page.evaluate(READ_NODE(target))
if (before.missing) {
  console.error('找不到一级主题节点，无法继续')
  process.exit(1)
}
console.log(`（画布缩放 zoom=${before.zoom}）`)
check('基线：节点上没有图片元素', before.image === null, `class="${before.className}"`)

// —— ③ 通过右栏文件输入加图片 ——
await writeFile(fixturePath, Buffer.from(PNG_BASE64, 'base64'))
await page.setInputFiles('input[aria-label="选择主题图片文件"]', fixturePath)
await page.waitForFunction(
  (sel) => !!document.querySelector(`${sel} img.mindmap-node__image`),
  target,
  { timeout: 20000 },
)
await page.waitForTimeout(600)

const after = await page.evaluate(READ_NODE(target))
check(
  '节点上出现图片元素（纵排：图片在标题上方）',
  after.image !== null &&
    after.title !== null &&
    after.image.bottom <= after.title.top + 0.6,
  `图片底 ${after.image?.bottom.toFixed(1)} ≤ 标题顶 ${after.title?.top.toFixed(1)}`,
)

// ① 布局**分配**的高度正好多出一个图片块
const delta = after.allocated - before.allocated
check(
  `加图片后**分配**高度正好多出一个图片块（${EXPECT_IMAGE_BLOCK}px）`,
  near(delta, EXPECT_IMAGE_BLOCK, 0.8),
  `${before.allocated} → ${after.allocated}（Δ=${delta.toFixed(2)}）`,
)

// ② ⭐ 本轮缺陷的判据：分配高度必须装得下内容
//
// ⚠️ 不能判"内容底 ≤ 节点底"：组件用的是 `min-height`，内容超高时 DOM 盒子会**自己长**，
// 那条断言恒真（第一次做负向对照时就是因为这个没红，才回头换了判据）。
// 真正的缺陷是"布局只分配了文字高度"→ 盒子被迫长大 → 占用了相邻节点的空间。
const needed = (after.contentBottom - after.node.top) / after.zoom
check(
  '布局分配的高度装得下内容（缺陷判据：分配高 ≥ 内容高）',
  after.allocated + 0.8 >= needed,
  `分配 ${after.allocated}px vs 需要 ${needed.toFixed(1)}px（差 ${(after.allocated - needed).toFixed(2)}px）`,
)

// ③ DOM 盒子不应被迫超出布局分配的空间
//
// 这条是"分配不足"在 DOM 侧的直接体现：布局只给 41px 时，盒子会长到 137px，
// 多占的 96px 落在相邻节点/骨架轴线上。导出端更直白 —— 三端都按
// `TOPIC_IMAGE_TITLE_OFFSET` 画内容，形状却只画分配的那 41px，内容跑到形状外面。
//
// ⚠️ 刻意**不**断言"节点两两不重叠"：鱼骨图的兄弟主题沿 x 分散，节点长大未必撞上，
// 负向对照里它照样通过（没有鉴别力）。对齐一下：判据要挑"缺陷必然触发"的那个。
// 容差 3px：`.mindmap-node` 是 content-box，布局高度不含那 1px×2 的边框 ——
// 这是**与本次缺陷无关的常数偏移**（实测 1.89px；同类偏移还有"DOM 图片槽宽比导出窄 2 单位"）。
// 而分配不足时的超出量是 96px 量级，两者不会混淆。
const boxOverrun = (after.node.height - after.allocated * after.zoom) / after.zoom
check(
  'DOM 盒子没有被内容撑破分配高度（分配不足时会长大）',
  near(boxOverrun, 0, 3),
  `盒高 ${(after.node.height / after.zoom).toFixed(1)}px vs 分配 ${after.allocated}px（超出 ${boxOverrun.toFixed(2)}px，容差 3）`,
)

// —— ④ 与思维导图对照：同一个主题切回思维导图后高度应当一致 ——
await page.locator('#inspector-tab-canvas').click()
await page.waitForTimeout(300)
await page.locator('.structure-picker__trigger').click()
await page.waitForTimeout(400)
await page.locator('button[aria-label="思维导图"]').first().click()
await page.waitForTimeout(700)
// ⚠️ 必须按**带图的那个节点**定位：思维导图骨架把兄弟主题分到左右两侧，
// 「第一个 .mindmap-node--depth-1」不一定是带图那个（实测踩过，会得出"高度没变"的假结论）
const mindmap = await page.evaluate(READ_NODE('.mindmap-node:has(img.mindmap-node__image)'))
check(
  '同主题切到思维导图后节点高度与鱼骨图一致（两种骨架不再漂移）',
  !mindmap.missing &&
    near(mindmap.node.height / mindmap.zoom, after.node.height / after.zoom, 0.8),
  `鱼骨 ${(after.node.height / after.zoom).toFixed(1)} vs 思维导图 ${(mindmap.node?.height / mindmap.zoom).toFixed(1)}`,
)

await mkdir(outDir, { recursive: true })
await page.screenshot({ path: `${outDir}/rich-content-mindmap.png` })
await page.locator('#inspector-tab-canvas').click()
await page.waitForTimeout(300)
await page.locator('.structure-picker__trigger').click()
await page.waitForTimeout(400)
// XMind 式卡片只画缩略图、不带文字（名字在 title / aria-label 上）——
// 按文本选会永远等不到（实测踩过：卡片 textContent 全是空串）
  await page.locator('button[aria-label="鱼骨图"]').first().click()
await page.waitForTimeout(700)
await page.screenshot({ path: `${outDir}/rich-content-fishbone.png` })

await writeFile(
  `${outDir}/rich-content-dom-evidence.json`,
  JSON.stringify({ baseUrl, before, fishbone: after, mindmap, results }, null, 2),
)

const failed = results.filter((r) => !r.pass)
console.log(`\n共 ${results.length} 条断言，失败 ${failed.length}`)
console.log(`产物：${outDir}/rich-content-fishbone.png、rich-content-mindmap.png、rich-content-dom-evidence.json`)
console.log('console 错误数 =', consoleErrors.length, consoleErrors.slice(0, 3))

await browser.close()
process.exitCode = failed.length === 0 && consoleErrors.length === 0 ? 0 : 1
