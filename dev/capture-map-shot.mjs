/**
 * 「导出选中主题为图片」的真引擎取证。
 *
 * 为什么需要：裁剪逻辑虽然有单测（export-scene.test.ts 断言场景里只剩选中的节点），
 * 但"渲染成位图之后确实是裁过的那一块"没有任何证据——单测不画像素。
 * 而这条链路在**浏览器里就能跑通**：`buildExportScene` 与 `renderSceneToPngBytes`
 * 都是纯前端（只有"弹保存对话框写文件"那一步需要 Tauri）。
 *
 * 做法：在应用页面里动态 import 这两个模块，构造文档 → 分别渲染整幅与裁剪版 →
 * 量位图尺寸与像素分布。若裁剪没生效，两者会一模一样。
 *
 * 用法：node dev/capture-map-shot.mjs [baseUrl] [outDir]
 * 前置：vite dev 已在 baseUrl 上监听（用 --host 127.0.0.1，否则只监听 IPv6）
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:1421').replace(/\/$/, '')
const outDir = process.argv[3] ?? 'outputs/native/map-shot'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error' && !message.location()?.url?.includes('favicon')) {
    consoleErrors.push(message.text())
  }
})
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

await page.goto(baseUrl, { waitUntil: 'load' })
await page.waitForTimeout(1500)

const result = await page.evaluate(async () => {
  const { buildExportScene } = await import('/src/features/document/export-scene.ts')
  const { renderSceneToPngBytes } = await import('/src/features/canvas/runtime/png-exporter.ts')

  /** root → [A → [A1], B]；B 只用来"被裁掉" */
  const doc = {
    schemaVersion: '1.0.0',
    documentId: 'doc_mapshot',
    revision: 1,
    activeSheetId: 'sheet_1',
    sheets: [
      {
        id: 'sheet_1',
        title: '主画布',
        rootTopic: {
          id: 'root',
          text: '中心主题',
          collapsed: false,
          children: [
            {
              id: 'a',
              text: '要导出的分支',
              collapsed: false,
              children: [{ id: 'a1', text: '它的子主题', collapsed: false, children: [] }],
            },
            { id: 'b', text: '不该出现在导出里', collapsed: false, children: [] },
          ],
        },
      },
    ],
  }

  const measure = async (scene) => {
    const bytes = await renderSceneToPngBytes(scene, { scale: 1 })
    // 量位图：解码后取尺寸，并统计非背景像素的横向范围
    const blob = new Blob([bytes], { type: 'image/png' })
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let minX = Infinity
    let maxX = -Infinity
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4
        // 任意"非全透明"像素都算内容
        if (data[offset + 3] > 8) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
        }
      }
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      bytes: bytes.length,
      contentRight: maxX === -Infinity ? null : maxX,
    }
  }

  const full = await measure(await buildExportScene(doc))
  const cropped = await measure(
    await buildExportScene(doc, new Set(['root', 'a', 'a1'])),
  )

  return { full, cropped }
})

console.log('整幅：', JSON.stringify(result.full))
console.log('裁剪：', JSON.stringify(result.cropped))

await mkdir(outDir, { recursive: true })

const problems = []
if (!(result.cropped.width < result.full.width)) {
  problems.push(`裁剪后的宽度 ${result.cropped.width} 没有小于整幅 ${result.full.width}（裁剪没生效？）`)
}
if (!(result.cropped.contentRight !== null && result.cropped.contentRight < result.full.contentRight)) {
  problems.push('裁剪后内容右边界没有左移（被裁的主题可能还在图里）')
}
if (result.cropped.bytes >= result.full.bytes) {
  problems.push('裁剪后的 PNG 字节数没有变小')
}

console.log('\n=== 判读 ===')
console.log(
  problems.length === 0
    ? `✅ 裁剪生效：宽度 ${result.full.width} → ${result.cropped.width}，内容右边界 ${result.full.contentRight} → ${result.cropped.contentRight}`
    : `❌ ${problems.join('；')}`,
)
console.log('console 错误数 =', consoleErrors.length, consoleErrors.slice(0, 3))

await browser.close()
