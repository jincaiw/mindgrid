/**
 * 导出一致性对照工具（临时 dev harness，非应用代码）。
 *
 * 目的：把同一场景分别用 Canvas 渲染器（PNG 导出路径）和 SVG 渲染器渲染，
 * 叠成差值图做视觉比对，用来验证「富内容（标记/标签/备注/链接/任务）」
 * 在两种导出里的位置与形状是否一致——这部分 jsdom 单测覆盖不到。
 *
 * 差值视图中纯黑 = 两端完全一致；任何彩色残留都是差异。
 * 注意：阴影与抗锯齿天然会有少量残余，重点看图标与标签胶囊。
 */

import { computeMindMapLayout } from '../src/features/canvas/mindmap-layout'
import { renderScene } from '../src/features/canvas/runtime/canvas-renderer'
import { computeNodesBounds } from '../src/features/canvas/runtime/render-tree'
import { buildScene } from '../src/features/canvas/runtime/scene-builder'
import { renderSceneToSvg } from '../src/features/canvas/runtime/svg-renderer'
import type { CameraProjection, Viewport } from '../src/features/canvas/runtime/render-tree'
import type { TopicSnapshot } from '../src/lib/document/types'

const DPR = 2

function topic(t: Partial<TopicSnapshot> & { id: string; text: string }): TopicSnapshot {
  return { collapsed: false, children: [], ...t }
}

/** 覆盖富内容的各种组合：任务状态、多标记、超量标签（触发 +N）、备注、链接。 */
function buildRoot(): TopicSnapshot {
  return topic({
    id: 'root',
    text: '导出对照',
    children: [
      topic({
        id: 'all',
        text: '全量富内容',
        markers: [{ id: 'priority-1' }, { id: 'star' }, { id: 'flag' }],
        labels: ['重要', '紧急', '待办', '归档', '第五个'],
        notes: '这是一段备注',
        link: { url: 'https://example.com', title: '示例' },
        task: { status: 'started', priority: 2 },
      }),
      topic({
        id: 'done',
        text: '任务已完成',
        task: { status: 'completed', priority: 5 },
      }),
      topic({
        id: 'pending',
        text: '任务未开始',
        task: { status: 'pending' },
      }),
      topic({
        id: 'labels-only',
        text: '只有标签',
        labels: ['设计', '评审'],
      }),
      topic({
        id: 'markers-only',
        text: '只有标记',
        markers: [{ id: 'progress-50' }, { id: 'people' }, { id: 'check' }],
      }),
      topic({
        id: 'notes-link',
        text: '备注与链接',
        notes: '备注内容',
        link: { url: 'https://example.org', title: '参考' },
      }),
      topic({
        id: 'plain',
        text: '纯文本节点（对照基线）',
      }),
    ],
  })
}

function cell(title: string, body: HTMLElement, extraClass = ''): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = `cell ${extraClass}`.trim()
  const h = document.createElement('h2')
  h.textContent = title
  wrap.append(h, body)
  return wrap
}

function rasterizeSvg(svgText: string, w: number, h: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
    img.onload = () => {
      const out = document.createElement('canvas')
      out.width = Math.ceil(w * DPR)
      out.height = Math.ceil(h * DPR)
      const c = out.getContext('2d')!
      c.fillStyle = '#ffffff'
      c.fillRect(0, 0, out.width, out.height)
      c.drawImage(img, 0, 0, out.width, out.height)
      resolve(out)
    }
    img.onerror = () => reject(new Error('SVG 栅格化失败'))
    img.src = url
  })
}

async function main() {
  const status = document.getElementById('status')!
  const row = document.getElementById('row')!

  const layout = computeMindMapLayout(buildRoot())
  const bounds = computeNodesBounds(
    buildScene({
      layout,
      viewport: { width: 1, height: 1 },
      camera: { x: 0, y: 0, zoom: 1 },
      visualStates: {
        activeTopicId: null,
        selectedTopicIds: new Set(),
        editingTopicId: null,
        searchMatchedTopicIds: new Set(),
        activeSearchTopicId: null,
        historyFocusTopicId: null,
        dropTargetTopicId: null,
        draggingTopicId: null,
      },
      overlays: { selectionBox: null, dragPreview: null, dropIndicator: null },
      enableCulling: false,
    }).nodes,
  )

  const W = Math.ceil(bounds.width)
  const H = Math.ceil(bounds.height)
  const viewport: Viewport = { width: W, height: H }
  // 让世界坐标的 bounds 原点落在屏幕 (0,0)，从而与 SVG 的 viewBox 对齐
  const camera: CameraProjection = { x: -bounds.x, y: -bounds.y, zoom: 1 }

  const scene = buildScene({
    layout,
    viewport,
    camera,
    visualStates: {
      activeTopicId: null,
      selectedTopicIds: new Set(),
      editingTopicId: null,
      searchMatchedTopicIds: new Set(),
      activeSearchTopicId: null,
      historyFocusTopicId: null,
      dropTargetTopicId: null,
      draggingTopicId: null,
    },
    overlays: { selectionBox: null, dragPreview: null, dropIndicator: null },
    enableCulling: false,
  })

  // ---- Canvas（PNG 导出路径）----
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(W * DPR)
  canvas.height = Math.ceil(H * DPR)
  const ctx = canvas.getContext('2d')!
  renderScene(ctx, scene, viewport, camera, DPR, { drawBackground: false })

  const canvasPng = canvas.toDataURL('image/png')

  // ---- SVG ----
  const svgText = renderSceneToSvg(scene, { padding: 0, drawBackground: false })
  const svgHost = document.createElement('div')
  svgHost.innerHTML = svgText
  const svgEl = svgHost.querySelector('svg')!

  const svgCanvas = await rasterizeSvg(svgText, W, H)

  // ---- 展示 ----
  const imgCanvas = document.createElement('img')
  imgCanvas.src = canvasPng
  imgCanvas.style.width = `${W}px`
  imgCanvas.style.height = `${H}px`

  const imgSvg = document.createElement('img')
  imgSvg.src = svgCanvas.toDataURL('image/png')
  imgSvg.style.width = `${W}px`
  imgSvg.style.height = `${H}px`

  const stageA = document.createElement('div')
  stageA.className = 'stage'
  stageA.append(imgCanvas)

  const stageB = document.createElement('div')
  stageB.className = 'stage'
  stageB.append(svgEl)

  const stageC = document.createElement('div')
  stageC.className = 'stage diff'
  stageC.style.width = `${W}px`
  stageC.style.height = `${H}px`
  stageC.style.background = '#fff'
  const base = document.createElement('img')
  base.src = canvasPng
  base.style.width = `${W}px`
  base.style.height = `${H}px`
  const top = document.createElement('img')
  top.className = 'top'
  top.src = imgSvg.src
  top.style.width = `${W}px`
  top.style.height = `${H}px`
  stageC.append(base, top)

  row.append(
    cell(`Canvas（PNG 导出路径）· ${W}×${H} @${DPR}x`, stageA),
    cell('SVG（矢量导出路径）', stageB),
    cell('差值（纯黑 = 完全一致）', stageC),
  )

  status.textContent = [
    `场景节点数: ${scene.nodes.length}`,
    `bounds: x=${bounds.x.toFixed(1)} y=${bounds.y.toFixed(1)} w=${W} h=${H}`,
    `camera: x=${camera.x.toFixed(1)} y=${camera.y.toFixed(1)} zoom=${camera.zoom}`,
    `SVG 长度: ${svgText.length} 字符`,
  ].join('\n')
}

void main().catch((err: unknown) => {
  document.getElementById('status')!.textContent = `渲染失败: ${String(err)}`
  throw err
})
