/**
 * 画布级插画（illustration）的真引擎取证：走**真实 UI 链路**。
 *
 * 打开应用 → 切到格式面板「画布」子页 → 点素材加一张插画 → 换尺寸 → 拖动 →
 * **逐次比对画布像素**，证明三件事：
 *   ① 插画真的画到了 canvas 上（不是只写进了文档）；
 *   ② 尺寸档位真的作用到了像素（宽高比 = 两档之比）；
 *   ③ 拖动的位移真的作用到了像素（像素位移 = 鼠标位移）。
 *
 * 为什么必须这么做：插画**没有 DOM 元素**（画在 Canvas 2D 层，与导出端同源），
 * 所以"它到底画在哪、画多大"没有任何 DOM 可以查——jsdom 单测只能验场景里
 * 有个节点，验不了它的位置与大小。像素是唯一的证据。
 *
 * 断言刻意做成**与缩放/DPR 无关**的形式（用比值与位移，而不是绝对坐标），
 * 这样不依赖相机当时的缩放级别。
 *
 * 用法：node dev/capture-illustration.mjs [baseUrl] [outDir]
 * 前置：vite dev 已在 baseUrl 上监听（用 --host 127.0.0.1，否则只监听 IPv6）
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:1421').replace(/\/$/, '')
const outDir = process.argv[3] ?? 'outputs/native/illustration'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

/** 取画布的非透明像素掩码（存到页面全局，避免把几百万个数搬回 Node）。 */
const GRAB_MASK = `(() => {
  const canvas = document.querySelector('.mindmap-scene__canvas')
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = data[i * 4 + 3] > 8 ? 1 : 0
  }
  return { width, height, mask }
})()`

const DIFF_MASK = (name) => `(() => {
  const before = window.${name}
  const after = ${GRAB_MASK}
  if (!before || before.width !== after.width || before.height !== after.height) {
    return { error: 'canvas size changed between captures' }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let changed = 0
  let beforeCount = 0
  let afterCount = 0
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < after.mask.length; i += 1) {
    if (before.mask[i]) beforeCount += 1
    if (after.mask[i]) afterCount += 1
    if (before.mask[i] !== after.mask[i]) {
      changed += 1
      const x = i % after.width
      const y = (i - x) / after.width
      sumX += x
      sumY += y
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  const dpr = window.devicePixelRatio || 1
  return {
    changed,
    beforeCount,
    afterCount,
    // 换算成 CSS 像素：鼠标坐标与 DOM rect 都是 CSS 像素。
    //
    // 位置一律用**质心**而不是外接框中心：差异像素里偶尔会混进几个零星像素
    // （抗锯齿、以及插画盖住连线后合成结果的变化），足以把外接框拉宽几十像素，
    // 但对质心的影响可以忽略。真引擎实测：外接框被拉到 288px，实际只有约 130px。
    bbox: changed
      ? {
          left: minX / dpr,
          top: minY / dpr,
          width: (maxX - minX + 1) / dpr,
          height: (maxY - minY + 1) / dpr,
          centerX: minX / dpr,
          centerY: minY / dpr,
          centroidX: sumX / changed / dpr,
          centroidY: sumY / changed / dpr,
        }
      : null,
  }
})()`

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })

const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error' && !message.location()?.url?.includes('favicon')) {
    consoleErrors.push(message.text())
  }
})
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

const problems = []
const notes = []

function round(value) {
  return Math.round(value * 10) / 10
}

await page.goto(baseUrl, { waitUntil: 'load' })
await page.waitForTimeout(2000)

// 插画是画布级对象 → 入口在「画布」子页
const canvasTab = page.locator('#inspector-tab-canvas')
if ((await canvasTab.count()) === 0) {
  console.log('FAIL: 找不到「画布」子页（检查器没渲染？）')
  await browser.close()
  process.exit(1)
}
await canvasTab.first().click()
await page.waitForTimeout(500)

const grid = page.locator('.illustration-grid__item')
const gridCount = await grid.count()
if (gridCount === 0) {
  console.log('FAIL: 「画布」子页里没有出现插画素材网格')
  await browser.close()
  process.exit(1)
}
notes.push(`素材网格 ${gridCount} 张`)

/** 场景容器的 rect：命中测试与鼠标坐标都以它为参照。 */
async function sceneRect() {
  return page.evaluate(() => {
    const el = document.querySelector('.mindmap-scene')
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  })
}

await page.evaluate(`window.__mgBase = ${GRAB_MASK}`)
const rect = await sceneRect()

// ---- ① 加一张插画：像素上应当多出一块 ——
await grid.first().click()
await page.waitForTimeout(600)
const added = await page.evaluate(DIFF_MASK('__mgBase'))
if (added.error || !added.bbox || added.changed === 0) {
  problems.push(
    `点「添加」之后画布像素没有任何变化（changed=${added.changed ?? 'n/a'}）——插画没画到 canvas 上`,
  )
} else {
  notes.push(
    `① 加一张：新增像素 ${added.changed}（前 ${added.beforeCount} / 后 ${added.afterCount}），外接框 ${round(added.bbox.width)}×${round(added.bbox.height)} CSS px`,
  )
  // 正方形素材：宽高应当接近（容 25% 余量，抗锯齿与相邻连线像素会带来零头）
  const ratio = added.bbox.width / added.bbox.height
  if (ratio < 0.75 || ratio > 1.33) {
    problems.push(
      `插画外接框不是接近正方形（${round(added.bbox.width)}×${round(added.bbox.height)}）——可能画歪了或混进了别的像素`,
    )
  }
  // 落点应当在地图内容**下方**、且**完整落在可见范围内**。
  // 这条是"坐标空间没对齐"的守门人：真引擎实测过漏减 layout.offset 的版本，
  // 插画会跑到画面右边缘、还被裁掉一半（外接框越界即可判定）。
  notes.push(
    `   落点质心在场景内 (${round(added.bbox.centroidX)},${round(added.bbox.centroidY)})，` +
      `场景 ${round(rect.width)}×${round(rect.height)} CSS px`,
  )
  if (
    added.bbox.left < 0 ||
    added.bbox.top < 0 ||
    added.bbox.left + added.bbox.width > rect.width ||
    added.bbox.top + added.bbox.height > rect.height
  ) {
    problems.push(
      `新插画超出了可见范围（外接框 ${round(added.bbox.left)},${round(added.bbox.top)} ` +
        `${round(added.bbox.width)}×${round(added.bbox.height)}，场景 ${round(rect.width)}×${round(rect.height)}）` +
        `——插入落点的坐标换算可能漏了 layout.offset`,
    )
  }
  // 也不该压在中心主题上：主题是 DOM、叠在画布之上，落在那里等于看不见
  if (Math.abs(added.bbox.centroidY - rect.height / 2) < 60) {
    problems.push('新插画落在画面正中央——那里是中心主题（DOM）的位置，插画会被它盖住')
  }
}

const bbox1 = added.bbox

// ---- ② 换尺寸档位：像素宽度应当按档位之比变化 ——
const bigButton = page.locator('.illustration-list__row .panel__seg').filter({ hasText: '大' })
if ((await bigButton.count()) === 0) {
  problems.push('「已添加」列表里找不到尺寸档位按钮')
} else {
  await bigButton.first().click()
  await page.waitForTimeout(600)
  const resized = await page.evaluate(DIFF_MASK('__mgBase'))
  if (!resized.bbox) {
    problems.push('换尺寸之后画布像素没有变化')
  } else {
    const areaGrowth = bbox1 ? resized.changed / added.changed : 0
    notes.push(
      `② 换「大」：差异像素 ${resized.changed}，是「中」的 ${round(areaGrowth)} 倍`,
    )
    // 小 72 / 中 120 / 大 192：加进来默认是「中」→ 面积比应为 (192/120)² = 2.56。
    // 用**面积比**而不是宽高比：宽高比会被零星像素拉宽的外接框毁掉（实测过）。
    if (areaGrowth < 2.2 || areaGrowth > 2.9) {
      problems.push(`换到「大」之后面积只变成 ${round(areaGrowth)} 倍（期望约 2.56 倍）`)
    }
  }
}

// ---- ③ 拖动：像素位移应当等于鼠标位移 ——
const dragSource = await page.evaluate(DIFF_MASK('__mgBase'))
if (!dragSource.bbox) {
  problems.push('拖动前拿不到插画的像素外接框')
} else {
  const startX = rect.left + dragSource.bbox.centroidX
  const startY = rect.top + dragSource.bbox.centroidY
  const DELTA_X = 80
  const DELTA_Y = 40

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + DELTA_X / 2, startY + DELTA_Y / 2, { steps: 4 })
  // 中途也采一次：证明"预览"确实在动（而不是松手才跳过去）
  const midDrag = await page.evaluate(DIFF_MASK('__mgBase'))
  await page.mouse.move(startX + DELTA_X, startY + DELTA_Y, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(600)

  const dragged = await page.evaluate(DIFF_MASK('__mgBase'))
  if (!dragged.bbox) {
    problems.push('拖动之后画布像素没有变化')
  } else {
    const shiftX = dragged.bbox.centroidX - dragSource.bbox.centroidX
    const shiftY = dragged.bbox.centroidY - dragSource.bbox.centroidY
    notes.push(
      `③ 拖动 (${DELTA_X},${DELTA_Y})：像素位移 (${round(shiftX)},${round(shiftY)})` +
        (midDrag.bbox
          ? `；拖到一半时质心已移动 (${round(midDrag.bbox.centroidX - dragSource.bbox.centroidX)},${round(midDrag.bbox.centroidY - dragSource.bbox.centroidY)})`
          : ''),
    )
    if (Math.abs(shiftX - DELTA_X) > 3 || Math.abs(shiftY - DELTA_Y) > 3) {
      problems.push(
        `像素位移 (${round(shiftX)},${round(shiftY)}) 与鼠标位移 (${DELTA_X},${DELTA_Y}) 不一致——拖动的坐标换算有问题`,
      )
    }
    if (midDrag.bbox) {
      const midX = midDrag.bbox.centroidX - dragSource.bbox.centroidX
      if (Math.abs(midX - DELTA_X / 2) > 3) {
        problems.push(`拖动中途预览没跟上（中心只移动了 ${round(midX)}，期望约 ${DELTA_X / 2}）`)
      }
    }
  }
}

// ---- 截图留证 ----
await mkdir(outDir, { recursive: true })
await page.screenshot({ path: path.join(outDir, 'illustration-on-canvas.png') })
await page.locator('.mindmap-scene').screenshot({ path: path.join(outDir, 'illustration-scene.png') })
await page.locator('.panel__tab-panel').last().screenshot({ path: path.join(outDir, 'illustration-panel.png') })

console.log('')
console.log('=== 实测 ===')
for (const note of notes) {
  console.log('  ' + note)
}
console.log(`console 错误：${consoleErrors.length}`)
for (const error of consoleErrors.slice(0, 5)) {
  console.log('  ! ' + error)
}

console.log('')
console.log('=== 判读 ===')
if (problems.length === 0) {
  console.log('✅ 插画画到了画布上；尺寸档位与拖动都作用到了像素')
} else {
  for (const problem of problems) {
    console.log('❌ ' + problem)
  }
}
console.log(`截图：${outDir}/illustration-canvas.png`)

await browser.close()
process.exit(problems.length === 0 ? 0 : 1)
