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

import { resolveCanvasSettings } from '../src/lib/document/canvas-settings'
import { NEW_DOCUMENT_THEME_ID } from '../src/lib/document/themes/built-in-themes'
import { resolveEffectiveTheme } from '../src/features/canvas/runtime/effective-theme'
import { computeMindMapLayout } from '../src/features/canvas/mindmap-layout'
import {
  computeTopicImageFittedRect,
  computeTopicImageRect,
} from '../src/features/canvas/runtime/topic-image-constants'
import { getNodePadding } from '../src/features/canvas/runtime/style-constants'
import {
  preloadTopicImages,
  preloadTopicImageSizes,
} from '../src/features/canvas/runtime/png-exporter'
import { renderScene } from '../src/features/canvas/runtime/canvas-renderer'
import { computeNodesBounds } from '../src/features/canvas/runtime/render-tree'
import { buildScene } from '../src/features/canvas/runtime/scene-builder'
import { renderSceneToSvg } from '../src/features/canvas/runtime/svg-renderer'
import type {
  CameraProjection,
  Scene,
  TopicRenderNode,
  Viewport,
} from '../src/features/canvas/runtime/render-tree'
import type { TopicSnapshot } from '../src/lib/document/types'

const DPR = 2

function topic(t: Partial<TopicSnapshot> & { id: string; text: string }): TopicSnapshot {
  return { collapsed: false, children: [], ...t }
}

/** 覆盖富内容的各种组合：任务状态、多标记、超量标签（触发 +N）、备注、链接。 */
/**
 * 主题图片夹具：40×10 纯色（红）的内联 PNG（86 字节）。
 *
 * 刻意用**纯色 + 极端比例（4:1）**：
 * - 纯色 → 可以在 PNG 里按颜色扫出图片的**实际绘制矩形**，圆角裁剪也肉眼可见
 * - 4:1 比槽位（= 内宽 : 88）更宽 → 命中"宽度先顶满"的那一档，
 *   正好是 DOM 与导出端差 2 个世界单位的那一档
 */
const IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAKCAIAAABJ+IsHAAAAHUlEQVR42mO85urIMBCAiWGAwKjFoxaPWjz0LQYAnw0BcB3I7ycAAAAASUVORK5CYII='
const IMAGE_TOPIC_ID = 'with-image'

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
      topic({
        id: IMAGE_TOPIC_ID,
        text: '带图节点（图片在标题上方）',
        image: { assetId: 'parity-image' },
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

/**
 * 把（可能带透明底的）画布合成到**白底**上。
 *
 * 必须这么做的原因：PNG 导出路径 `drawBackground: false` 是**透明底**，
 * 而 SVG 栅格化时会先铺一层白色。直接逐像素比 = 拿"透明 vs 白"比，
 * 结果是满屏差异（实测 70%，最大通道差 255），纯属自欺。
 * 纸面/屏幕上的观感都是压在某个底上的，所以统一压到白底再比才等价。
 */
function compositeOverWhite(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(source, 0, 0)
  return out
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
  // 生效主题现在是 `buildScene` 的**必填项**（v0.4.17 起节点配色与连线配色同源）。
  // 本 harness 长期没跟：页面直接抛 `Cannot read properties of undefined (reading 'branchPalette')`，
  // 而它不在任何门禁里 → 坏了很久没人发现（2026-09-25 修）。
  const theme = resolveEffectiveTheme({
    themeId: NEW_DOCUMENT_THEME_ID,
    branchStyle: undefined,
    canvasSettings: resolveCanvasSettings(undefined),
  })
  const bounds = computeNodesBounds(
    buildScene({
      theme,
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
    theme,
    layout,
    viewport,
    camera,
    // 主题图片要显式喂给场景：scene-builder 只认「这个 id 有没有可用的 URL」，
    // 自己去解码是渲染阶段的事
    topicImageUrls: { [IMAGE_TOPIC_ID]: IMAGE_DATA_URL },
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

  // 两路各自需要的东西：Canvas 要已解码的 <img>，SVG 只要固有尺寸（用来算圆角 clipPath）
  const topicImages = await preloadTopicImages(scene)
  const topicImageSizes = await preloadTopicImageSizes(scene)

  // ---- Canvas（PNG 导出路径）----
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(W * DPR)
  canvas.height = Math.ceil(H * DPR)
  const ctx = canvas.getContext('2d')!
  renderScene(ctx, scene, viewport, camera, DPR, {
    drawBackground: false,
    topicImages,
  })

  const canvasPng = canvas.toDataURL('image/png')

  // ---- SVG ----
  const svgText = renderSceneToSvg(scene, {
    padding: 0,
    drawBackground: false,
    topicImageSizes,
  })
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
  // 底图必须是不透明的白底合成版：透明底配 difference 混合会整片发亮，
  // 之前那版差值图看着"到处都在亮"，就是这个原因（不是渲染差异）
  base.src = compositeOverWhite(canvas).toDataURL('image/png')
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

  // ---- 图片几何三方对账：常量（期望）↔ PNG（扫色）↔ SVG（读属性 + clipPath）----
  const lines = measureImageGeometry({
    scene,
    svgText,
    canvas,
    bounds,
  })
  const imageNode = scene.nodes.find(
    (item): item is TopicRenderNode => item.type === 'topic' && !!item.rich?.image,
  )
  const imageSlot = imageNode
    ? computeTopicImageRect(imageNode.bounds, getNodePadding(imageNode.depth))
    : { x: 0, y: 0, width: 0, height: 0 }
  lines.push(
    ...diffStats(
      compositeOverWhite(canvas),
      compositeOverWhite(svgCanvas),
      bounds,
      imageSlot,
    ),
  )

  status.textContent = [
    `场景节点数: ${scene.nodes.length}`,
    `bounds: x=${bounds.x.toFixed(1)} y=${bounds.y.toFixed(1)} w=${W} h=${H}`,
    `camera: x=${camera.x.toFixed(1)} y=${camera.y.toFixed(1)} zoom=${camera.zoom}`,
    `SVG 长度: ${svgText.length} 字符`,
    '',
    ...lines,
  ].join('\n')
}

const round1 = (value: number) => Math.round(value * 10) / 10
const formatRect = (rect: { x: number; y: number; width: number; height: number }) =>
  `x=${round1(rect.x)} y=${round1(rect.y)} w=${round1(rect.width)} h=${round1(rect.height)}`

/**
 * 夹具 PNG 的主色（见 IMAGE_DATA_URL）：(214, 69, 65)。
 *
 * ⚠️ 光靠颜色**区分不开**它和标记色（priority-1 的 #e5484d = 229,72,77 几乎同色），
 * 所以扫描必须再限定在图片槽位所在的矩形内（见下）。只按颜色扫会把标记也算进来，
 * 实测扫出 574×311 的假区域。
 */
function isFixtureColor(r: number, g: number, b: number, a: number) {
  return a > 200 && r > 180 && g < 120 && b < 120
}

/**
 * 主题图片在三处的几何对账。
 *
 * 为什么要专门量：图片槽位/绘制矩形由 `topic-image-constants` 的纯函数给出，
 * 有单测；但"两路导出**真的**照它画了"和"DOM 是否同口径"没有任何断言。
 * 而历史缺陷正是"常量对、某一端没照做"（DOM 曾把图片与标题并排）。
 *
 * 坐标口径：camera 把世界 bounds 原点搬到屏幕 (0,0)，zoom=1，
 * 所以「屏幕像素 / DPR + bounds 原点」== 世界坐标。
 */
function measureImageGeometry({
  scene,
  svgText,
  canvas,
  bounds,
}: {
  scene: Scene
  svgText: string
  canvas: HTMLCanvasElement
  bounds: { x: number; y: number }
}): string[] {
  const node = scene.nodes.find(
    (item): item is TopicRenderNode => item.type === 'topic' && !!item.rich?.image,
  )
  if (!node) return ['⚠️ 场景里没有带图节点——夹具没接上']

  const padding = getNodePadding(node.depth)
  const slot = computeTopicImageRect(node.bounds, padding)
  const fitted = computeTopicImageFittedRect(node.bounds, padding, {
    width: 40,
    height: 10,
  })

  // SVG：<image> 是槽位（配 preserveAspectRatio="meet"），clipPath 才是实际绘制区域
  const imageMatch = svgText.match(
    /<image x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/,
  )
  const clipMatch = svgText.match(
    /<clipPath[^>]*><rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/,
  )
  const svgSlot = imageMatch
    ? {
        x: +imageMatch[1],
        y: +imageMatch[2],
        width: +imageMatch[3],
        height: +imageMatch[4],
      }
    : null
  const svgClip = clipMatch
    ? {
        x: +clipMatch[1],
        y: +clipMatch[2],
        width: +clipMatch[3],
        height: +clipMatch[4],
      }
    : null

  // PNG：只在图片槽位所在的矩形内按夹具颜色扫，得到实际绘制区域
  const ctx = canvas.getContext('2d')!
  const { data, width } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  // 世界坐标 → 设备像素：camera 把 bounds 原点搬到 (0,0)，zoom=1，再乘 DPR
  const toDeviceX = (worldX: number) => Math.round((worldX - bounds.x) * DPR)
  const toDeviceY = (worldY: number) => Math.round((worldY - bounds.y) * DPR)
  // 图片配 object-fit/meet 只会**内缩**，不会超出槽位；留 2 设备像素给抗锯齿
  const scanStartX = Math.max(0, toDeviceX(slot.x) - 2)
  const scanEndX = Math.min(width - 1, toDeviceX(slot.x + slot.width) + 2)
  const scanStartY = Math.max(0, toDeviceY(slot.y) - 2)
  const scanEndY = Math.min(canvas.height - 1, toDeviceY(slot.y + slot.height) + 2)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = scanStartY; y <= scanEndY; y += 1) {
    for (let x = scanStartX; x <= scanEndX; x += 1) {
      const offset = (y * width + x) * 4
      if (!isFixtureColor(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) {
        continue
      }
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const pngDrawn =
    minX === Infinity
      ? null
      : {
          x: minX / DPR + bounds.x,
          y: minY / DPR + bounds.y,
          width: (maxX - minX + 1) / DPR,
          height: (maxY - minY + 1) / DPR,
        }

  const lines = [
    '—— 主题图片几何对账（世界单位）——',
    `常量 槽位(computeTopicImageRect)   ${formatRect(slot)}`,
    `常量 绘制(computeTopicImageFittedRect) ${formatRect(fitted!)}`,
    `SVG  <image>（槽位）              ${svgSlot ? formatRect(svgSlot) : '未找到'}`,
    `SVG  clipPath（实际绘制）          ${svgClip ? formatRect(svgClip) : '未找到（尺寸缺失？）'}`,
    `PNG  按颜色扫出的绘制区域          ${pngDrawn ? formatRect(pngDrawn) : '未扫到夹具颜色'}`,
    `PNG DPR = ${DPR}（扫描结果已除回世界单位）`,
  ]

  if (svgClip && fitted) {
    const gap = Math.max(
      Math.abs(svgClip.x - fitted.x),
      Math.abs(svgClip.y - fitted.y),
      Math.abs(svgClip.width - fitted.width),
      Math.abs(svgClip.height - fitted.height),
    )
    lines.push(
      gap < 0.6
        ? '✅ SVG clipPath 与常量一致'
        : `❌ SVG clipPath 与常量不符（最大差 ${round1(gap)}）`,
    )
  }
  if (pngDrawn && fitted) {
    // 圆角处会各吃掉约 1 个设备像素，容差放到 1.5 世界单位
    const gap = Math.max(
      Math.abs(pngDrawn.x - fitted.x),
      Math.abs(pngDrawn.y - fitted.y),
      Math.abs(pngDrawn.width - fitted.width),
      Math.abs(pngDrawn.height - fitted.height),
    )
    lines.push(
      gap < 1.5
        ? '✅ PNG 绘制区域与常量一致'
        : `❌ PNG 绘制区域与常量不符（最大差 ${round1(gap)}）`,
    )
  }

  return lines
}

/**
 * 两路逐像素差值统计。
 *
 * 为什么必须算这个而不是靠眼睛看对照图：截图会被缩放着看，
 * 小尺度的差异（本例是 1–2 像素级的抗锯齿）在缩略图上根本判不出来；
 * 反过来说，缩略图上一块"看起来发亮"的区域也可能是抗锯齿而不是结构差异。
 * 数值 + 差异像素的包围盒才能定性。
 */
function diffStats(
  a: HTMLCanvasElement,
  b: HTMLCanvasElement,
  bounds: { x: number; y: number },
  focusRect: { x: number; y: number; width: number; height: number },
): string[] {
  const ca = a.getContext('2d')!.getImageData(0, 0, a.width, a.height).data
  const cb = b.getContext('2d')!.getImageData(0, 0, b.width, b.height).data

  let differing = 0
  let total = 0
  let maxDiff = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const offset = (y * a.width + x) * 4
      total += 1
      const d = Math.max(
        Math.abs(ca[offset] - cb[offset]),
        Math.abs(ca[offset + 1] - cb[offset + 1]),
        Math.abs(ca[offset + 2] - cb[offset + 2]),
      )
      if (d > maxDiff) maxDiff = d
      if (d > 24) {
        differing += 1
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  // 图片槽位内单独统计：图片是纯色块、不含文字，所以它的差异必然来自几何或裁剪，
  // 不会被字体抗锯齿污染——这是"图片在两路导出一致吗"最干净的判据
  const toDeviceX = (worldX: number) => Math.round((worldX - bounds.x) * DPR)
  const toDeviceY = (worldY: number) => Math.round((worldY - bounds.y) * DPR)
  const focus = {
    x0: toDeviceX(focusRect.x),
    y0: toDeviceY(focusRect.y),
    x1: toDeviceX(focusRect.x + focusRect.width),
    y1: toDeviceY(focusRect.y + focusRect.height),
  }
  let focusTotal = 0
  let focusDiffering = 0
  for (let y = Math.max(0, focus.y0); y <= Math.min(a.height - 1, focus.y1); y += 1) {
    for (let x = Math.max(0, focus.x0); x <= Math.min(a.width - 1, focus.x1); x += 1) {
      const offset = (y * a.width + x) * 4
      focusTotal += 1
      const d = Math.max(
        Math.abs(ca[offset] - cb[offset]),
        Math.abs(ca[offset + 1] - cb[offset + 1]),
        Math.abs(ca[offset + 2] - cb[offset + 2]),
      )
      if (d > 24) focusDiffering += 1
    }
  }
  const focusRatio = focusTotal === 0 ? 0 : (focusDiffering / focusTotal) * 100

  const ratio = total === 0 ? 0 : (differing / total) * 100
  const lines = [
    '',
    '—— PNG vs SVG 逐像素差值（阈值 24，两路均已合成到白底）——',
    `像素 ${total}，差异像素 ${differing}（${ratio.toFixed(2)}%），最大通道差 ${maxDiff}`,
  ]
  if (differing > 0 && minX !== Infinity) {
    lines.push(
      `差异包围盒（世界单位） x=${round1(minX / DPR + bounds.x)} y=${round1(minY / DPR + bounds.y)} ` +
        `w=${round1((maxX - minX + 1) / DPR)} h=${round1((maxY - minY + 1) / DPR)}`,
    )
  }
  lines.push(
    `图片槽位内 ${focusTotal} 像素，差异 ${focusDiffering}（${focusRatio.toFixed(2)}%）`,
  )
  // 结论落在**图片槽位**上：全图那 1~2% 是文字抗锯齿（SVG 栅格化 vs Canvas 直接绘制），
  // 属于已知残余；图片是纯色块，它那儿有差异才说明几何/裁剪真的不一致。
  lines.push(
    focusRatio < 0.5
      ? `✅ 图片区域两路一致（全图 ${ratio.toFixed(2)}% 的残余集中在文字抗锯齿）`
      : `❌ 图片区域也有差异（${focusRatio.toFixed(2)}%），需要看图定位`,
  )
  return lines
}

void main().catch((err: unknown) => {
  document.getElementById('status')!.textContent = `渲染失败: ${String(err)}`
  throw err
})
