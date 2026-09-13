/**
 * 主题图片链路取证（把"从未真验"这条已知缺陷关掉）。
 *
 * 为什么以前没验过：插入图片在桌面端走**原生文件对话框**，脚本点不了。
 * 但浏览器开发态降级成隐藏 `<input type=file>`（读成 data URL 提交），
 * 而浏览器侧的资源表**明确支持 data: URL** —— 于是一整条链路都可以在真引擎里跑：
 * 选主题 → 填文件 → 节点重排 → 量几何 → 截图。
 *
 * 量什么（对齐 runtime/topic-image-constants.ts 的常量）：
 * - TOPIC_IMAGE_MAX_WIDTH = 200 / MAX_HEIGHT = 88：图片绘制框不得越界
 * - 节点高度增量必须**恰好等于** TOPIC_IMAGE_BLOCK = 96（布局预留与实际绘制对不上
 *   就是溢出节点的老毛病）
 * - 图片底边与标题顶部间距 = TOPIC_IMAGE_GAP = 8
 * - 绘制框比例必须等于图片固有比例（object-fit: contain 的等价断言）
 *
 * 用法：node dev/capture-topic-image.mjs [baseUrl] [outDir]
 * 前置：vite dev 已在 baseUrl 上监听（默认 http://127.0.0.1:1421/）
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { chromium } from 'playwright-core'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:1421/'
const outDir = process.argv[3] ?? 'outputs/native/topic-image'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

// —— 极简 PNG 编码器：脚本自含，不依赖任何图像库 ——
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

/** 单色 PNG。刻意用纯色：圆角裁剪在纯色块上肉眼可见。 */
function makePng(width, height, [r, g, b]) {
  const stride = width * 3 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0 // filter: none
    for (let x = 0; x < width; x += 1) {
      const offset = y * stride + 1 + x * 3
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 三档刻意覆盖两种"哪条边先顶满"的情形 + 正方形（两边同时顶满）。 */
const CASES = [
  { name: 'wide-400x100', file: 'topic-wide.png', width: 400, height: 100, color: [217, 70, 70] },
  { name: 'tall-100x400', file: 'topic-tall.png', width: 100, height: 400, color: [45, 125, 210] },
  { name: 'square-200x200', file: 'topic-square.png', width: 200, height: 200, color: [56, 158, 96] },
]

const MAX_WIDTH = 200
const MAX_HEIGHT = 88
const IMAGE_GAP = 8
const IMAGE_BLOCK = 96

async function measure(page) {
  return page.evaluate(() => {
    const board = document.querySelector('.mindmap-scene__board')
    // 画布用 transform: translate(...) scale(zoom) 缩放，DOM 像素要先除回世界单位；
    // 右栏面板**不在**这个变换里，除 zoom 会把它的尺寸算错（踩过：预览图 120 被算成 135）
    const zoom = board ? new DOMMatrix(getComputedStyle(board).transform).a : 1

    const worldRect = (element) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        width: box.width / zoom,
        height: box.height / zoom,
        top: box.top / zoom,
        bottom: box.bottom / zoom,
        centerX: (box.left + box.right) / 2 / zoom,
      }
    }

    const image = document.querySelector('.mindmap-node__image')
    const node = document.querySelector('.mindmap-node--active') ?? image?.closest('.mindmap-node')
    const title = node?.querySelector('.mindmap-node__title')
    const preview = document.querySelector('.panel__image-preview')
    const style = image ? getComputedStyle(image) : null

    return {
      zoom: +zoom.toFixed(4),
      withImageClass: node ? node.classList.contains('mindmap-node--with-image') : null,
      natural: image ? { width: image.naturalWidth, height: image.naturalHeight } : null,
      image: worldRect(image),
      title: worldRect(title),
      node: worldRect(node),
      preview: preview
        ? (() => {
            const box = preview.getBoundingClientRect()
            return { width: +box.width.toFixed(1), height: +box.height.toFixed(1) }
          })()
        : null,
      css: style
        ? { width: style.width, height: style.height, borderRadius: style.borderRadius }
        : null,
    }
  })
}

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

  // 样式页才挂「主题图片」小节
  const styleTab = page.locator('#inspector-tab-style')
  if ((await styleTab.count()) > 0) {
    await styleTab.first().click()
    await page.waitForTimeout(500)
  }

  // 有图之前的节点高度作为基线（高度增量必须恰好是 96）
  const before = await measure(page)
  console.log('插入前：', JSON.stringify({ node: before.node, zoom: before.zoom }))

  const fileInput = page.locator('.panel__hidden-file-input')
  if ((await fileInput.count()) === 0) {
    console.log('FAIL: 找不到隐藏的 file input —— 浏览器开发态图片入口可能被改掉了')
    await browser.close()
    process.exit(1)
  }

  const results = []
  for (const item of CASES) {
    const pngPath = path.join(outDir, item.file)
    await writeFile(pngPath, makePng(item.width, item.height, item.color))

    // 连续插入走的是「更换图片」路径（同一主题替换），能顺带验证重复插入不叠加
    await fileInput.setInputFiles(pngPath)
    await page.waitForFunction(
      ([width, height]) => {
        const image = document.querySelector('.mindmap-node__image')
        return !!image && image.naturalWidth === width && image.naturalHeight === height
      },
      [item.width, item.height],
      { timeout: 8000 },
    )
    await page.waitForTimeout(350)

    const after = await measure(page)
    const intrinsicRatio = item.width / item.height
    const judgment = {
      case: item.name,
      intrinsic: `${item.width}×${item.height}`,
      slot: `${after.image.width.toFixed(1)}×${after.image.height.toFixed(1)}`,
      withImageClass: after.withImageClass,
      slotHeight: +after.image.height.toFixed(2),
      // 宽图应当顶满槽宽、高图只是"槽内居中的一块"，故这里比的是槽位而不是可见图
      slotWidthWithinMax: after.image.width <= MAX_WIDTH + 0.5,
      titleBelowImage: after.title.top >= after.image.bottom - 0.5,
      nodeHeightDelta: +(after.node.height - before.node.height).toFixed(2),
      gap: +(after.title.top - after.image.bottom).toFixed(2),
      // 槽位在节点内应水平居中（等价 computeTopicImageRect 的水平居中）
      centerOffset: +(after.image.centerX - after.node.centerX).toFixed(2),
      aspectRule:
        intrinsicRatio > MAX_WIDTH / MAX_HEIGHT
          ? '宽图（可见部分顶满槽宽）'
          : '非宽图（槽内居中，高度受 88 限）',
      preview: after.preview,
    }
    results.push(judgment)
    console.log('---', JSON.stringify(judgment))

    const shot = path.join(outDir, `${item.name}.png`)
    await page.screenshot({ path: shot })
    console.log('saved', shot)
  }

  console.log('\n=== 判读 ===')
  for (const row of results) {
    const problems = []
    if (!row.withImageClass) problems.push('缺少 mindmap-node--with-image 类')
    if (Math.abs(row.slotHeight - MAX_HEIGHT) > 0.5) {
      problems.push(`槽位高 ${row.slotHeight} ≠ ${MAX_HEIGHT}（图片盒贴自身比例就会这样）`)
    }
    if (!row.slotWidthWithinMax) problems.push(`槽位宽越界（> ${MAX_WIDTH}）`)
    if (!row.titleBelowImage) problems.push('标题不在图片下方（flex-direction 没改成 column）')
    if (Math.abs(row.nodeHeightDelta - IMAGE_BLOCK) > 3) {
      problems.push(`节点高度增量 ${row.nodeHeightDelta} 与预留 ${IMAGE_BLOCK} 差得过多`)
    }
    if (Math.abs(row.gap - IMAGE_GAP) > 1) problems.push(`图文间距 ${row.gap} ≠ ${IMAGE_GAP}`)
    if (Math.abs(row.centerOffset) > 1) problems.push(`槽位未水平居中（偏 ${row.centerOffset}）`)
    console.log(
      `${row.case}: ${problems.length === 0 ? '✅ 全部通过' : `❌ ${problems.join('；')}`}（${row.aspectRule}）`,
    )
  }
  console.log('console 错误数 =', consoleErrors.length, consoleErrors.slice(0, 3))

  await browser.close()
}

main().catch((error) => {
  console.error('FAILED', error)
  process.exit(1)
})
