/**
 * 方程三端一致性对照（dev harness，非应用代码）。
 *
 * ## 为什么需要它
 *
 * 方程的几何由 `computeTopicEquationRect` 一个函数给出，但那只是个**约定**：
 * "两路导出真的照它画了"没有任何单测能覆盖（`renderScene` 要真 canvas，
 * SVG 光栅化要真 `<img>`）。而历史缺陷恰恰是"常量对、某一端没照做"。
 *
 * 这里把**同一条 LaTeX** 分别交给：① Canvas（PNG 导出路径）② SVG（矢量导出路径），
 * 然后做三件事：
 *
 * 1. **几何对账**：从 SVG 里读出嵌套 `<svg x y width height>`，与常量的输出逐个比对；
 *    PNG 侧则在方程槽位内按**夹具专用文字色**扫出实际绘制区域，两边都必须落在槽位里。
 * 2. **颜色对账**：扫描线用的是节点文字色 —— 只要某一路把公式画成了黑色（MathJax 的
 *    `currentColor` 在 standalone SVG 里会退化成黑），这一条就会红。
 * 3. **布局对账**：同一份文档去掉方程后再建一次场景，节点高度必须正好少
 *    `TOPIC_EQUATION_BLOCK`，而**没有方程的主题高度必须一模一样**。
 *
 * 差值图给人工看，结论在 `#status` 里（`dev/measure-equation-parity.mjs` 负责读）。
 */

import { renderScene } from '../src/features/canvas/runtime/canvas-renderer'
import { preloadTopicEquations } from '../src/features/canvas/runtime/png-exporter'
import {
  computeNodesBounds,
  type CameraProjection,
  type Scene,
  type TopicRenderNode,
  type Viewport,
} from '../src/features/canvas/runtime/render-tree'
import { getNodePadding } from '../src/features/canvas/runtime/style-constants'
import { renderSceneToSvg } from '../src/features/canvas/runtime/svg-renderer'
import {
  TOPIC_EQUATION_BLOCK,
  computeTopicEquationRect,
} from '../src/features/canvas/runtime/topic-equation-constants'
import { buildExportScene } from '../src/features/document/export-scene'
import { createId } from '../src/lib/document/default-document'
import { NEW_DOCUMENT_THEME_ID } from '../src/lib/document/themes/built-in-themes'
import type { DocumentSnapshot, TopicSnapshot } from '../src/lib/document/types'

const DPR = 2

/** 夹具专用的节点文字色。仓库别处不用这个值，于是"扫到它"就等于"公式画在这里"。 */
const ACCENT_TEXT_COLOR = '#c81e5a'
/** 同样的值，供逐通道比对用 */
const ACCENT_RGB = [0xc8, 0x1e, 0x5a]

const LATEX_INLINE = 'a^2+b^2=c^2'
/** 分式：对"只缩不放"最敏感的形态（高瘦，通常是高度先顶满） */
const LATEX_FRAC = '\\frac{a}{b}'
/** display 形态：与 inline 的排版明显不同（上下限在正上方/正下方） */
const LATEX_SUM = '\\sum_{i=1}^{n} i^2'
/** 语法错：节点仍要占住槽位，但不画东西 */
const LATEX_BROKEN = '\\frac{a}{'

const EQ_FRAC = 'eq-frac'
const EQ_INLINE = 'eq-inline'
const EQ_DISPLAY = 'eq-display'
const EQ_ONLY = 'eq-only'
const EQ_BROKEN = 'eq-broken'
const PLAIN = 'plain'

function topic(t: Partial<TopicSnapshot> & { id: string; text: string }): TopicSnapshot {
  return { collapsed: false, children: [], ...t }
}

function buildRoot(withEquations: boolean): TopicSnapshot {
  const eq = (latex: string, display = false) =>
    withEquations ? (display ? { latex, display: true } : { latex }) : undefined

  return topic({
    id: 'root',
    text: '方程一致性对照',
    children: [
      topic({
        id: EQ_FRAC,
        text: '分式',
        equation: eq(LATEX_FRAC),
        // 只给要扫色的节点上夹具色；其余节点用主题默认色（证明默认路径也正常）
        styleOverrides: { textColor: ACCENT_TEXT_COLOR },
      }),
      topic({
        id: EQ_INLINE,
        text: '行内公式',
        equation: eq(LATEX_INLINE),
        styleOverrides: { textColor: ACCENT_TEXT_COLOR },
      }),
      topic({
        id: EQ_DISPLAY,
        text: 'display 公式',
        equation: eq(LATEX_SUM, true),
        styleOverrides: { textColor: ACCENT_TEXT_COLOR },
      }),
      // 关键夹具：这个主题**只有方程**，没有任何别的富内容。
      // `hasRichContent` 漏掉方程这一支的话，它在屏幕上和导出里都会彻底消失。
      topic({ id: EQ_ONLY, text: '只有方程', equation: eq(LATEX_INLINE) }),
      // 语法错：占位但不画；用于确认"错误不会把布局搞坏"
      topic({ id: EQ_BROKEN, text: '语法错', equation: eq(LATEX_BROKEN) }),
      topic({ id: PLAIN, text: '对照组（无方程）' }),
    ],
  })
}

function buildDocument(withEquations: boolean): DocumentSnapshot {
  const sheetId = createId('sheet')
  return {
    schemaVersion: '1.1.0',
    documentId: createId('doc'),
    revision: 1,
    activeSheetId: sheetId,
    sheets: [{ id: sheetId, title: '主画布', rootTopic: buildRoot(withEquations) }],
    theme: { id: NEW_DOCUMENT_THEME_ID },
  }
}

const round1 = (value: number) => Math.round(value * 10) / 10
const formatRect = (r: { x: number; y: number; width: number; height: number }) =>
  `x=${round1(r.x)} y=${round1(r.y)} w=${round1(r.width)} h=${round1(r.height)}`

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

const results: Array<{ label: string; pass: boolean; detail: string }> = []
function check(label: string, pass: boolean, detail = '') {
  results.push({ label, pass, detail })
}
function lines() {
  return results.map((r) => `${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ` —— ${r.detail}` : ''}`)
}

/** 在给定世界矩形内扫"夹具色"像素，返回世界坐标下的包围盒与像素数。 */
function scanAccent(
  canvas: HTMLCanvasElement,
  bounds: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
) {
  const ctx = canvas.getContext('2d')!
  const { data, width } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const toX = (worldX: number) => Math.round((worldX - bounds.x) * DPR)
  const toY = (worldY: number) => Math.round((worldY - bounds.y) * DPR)
  // 槽位内的抗锯齿不会溢出槽位；留 2 设备像素余量
  const x0 = Math.max(0, toX(rect.x) - 2)
  const x1 = Math.min(width - 1, toX(rect.x + rect.width) + 2)
  const y0 = Math.max(0, toY(rect.y) - 2)
  const y1 = Math.min(canvas.height - 1, toY(rect.y + rect.height) + 2)

  let count = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const o = (y * width + x) * 4
      if (data[o + 3] < 200) continue
      // 抗锯齿会把颜色往白底上混，所以按"通道差"判，且要求明显偏向夹具色
      if (
        Math.abs(data[o] - ACCENT_RGB[0]) > 26 ||
        Math.abs(data[o + 1] - ACCENT_RGB[1]) > 26 ||
        Math.abs(data[o + 2] - ACCENT_RGB[2]) > 26
      ) {
        continue
      }
      count += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (count === 0) return { count: 0, box: null as null | { x: number; y: number; width: number; height: number } }
  return {
    count,
    box: {
      x: minX / DPR + bounds.x,
      y: minY / DPR + bounds.y,
      width: (maxX - minX + 1) / DPR,
      height: (maxY - minY + 1) / DPR,
    },
  }
}

/** 两路在某个世界矩形内的逐像素差异比例（%）。 */
function diffRatioInRect(
  a: HTMLCanvasElement,
  b: HTMLCanvasElement,
  bounds: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
): number {
  const da = a.getContext('2d')!.getImageData(0, 0, a.width, a.height).data
  const db = b.getContext('2d')!.getImageData(0, 0, b.width, b.height).data
  const toX = (worldX: number) => Math.round((worldX - bounds.x) * DPR)
  const toY = (worldY: number) => Math.round((worldY - bounds.y) * DPR)
  const x0 = Math.max(0, toX(rect.x))
  const x1 = Math.min(a.width - 1, toX(rect.x + rect.width))
  const y0 = Math.max(0, toY(rect.y))
  const y1 = Math.min(a.height - 1, toY(rect.y + rect.height))
  let total = 0
  let differing = 0
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const o = (y * a.width + x) * 4
      total += 1
      const d = Math.max(
        Math.abs(da[o] - db[o]),
        Math.abs(da[o + 1] - db[o + 1]),
        Math.abs(da[o + 2] - db[o + 2]),
      )
      if (d > 24) differing += 1
    }
  }
  return total === 0 ? 0 : (differing / total) * 100
}

/** 从导出 SVG 里抽出所有嵌套 `<svg x y width height ...>`（方程就是用它嵌进去的）。 */
function extractEmbeddedSvgs(svgText: string) {
  const out: Array<{ x: number; y: number; width: number; height: number; meet: boolean }> = []
  const re = /<svg x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"([^>]*)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(svgText))) {
    out.push({
      x: +m[1],
      y: +m[2],
      width: +m[3],
      height: +m[4],
      meet: m[5].includes('xMidYMid meet'),
    })
  }
  return out
}

function cell(title: string, body: HTMLElement, extraClass = ''): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = `cell ${extraClass}`.trim()
  const h = document.createElement('h2')
  h.textContent = title
  wrap.append(h, body)
  return wrap
}

async function main() {
  const row = document.getElementById('row')!

  // ---- 场景 A：带方程（走真实导出入口，方程由它自己预热渲染）----
  const scene = await buildExportScene(buildDocument(true))
  // ---- 场景 B：同一份文档去掉方程，用来量"方程让节点长高了多少"----
  const sceneNoEq = await buildExportScene(buildDocument(false))

  const equationNodes = scene.nodes.filter(
    (n): n is TopicRenderNode => n.type === 'topic' && n.id.startsWith('eq-'),
  )
  const header = document.createElement('div')
  header.id = 'parity-header'
  header.style.display = 'none'
  header.textContent =
    `EQUATION-PARITY 实体：场景节点 ${scene.nodes.length}，带方程主题 ${equationNodes.length}`
  document.body.append(header)

  // ---- 断言 1：渲染结果真的进了渲染树 ----
  for (const id of [EQ_FRAC, EQ_INLINE, EQ_DISPLAY]) {
    const node = equationNodes.find((n) => n.id === id)
    const hasSvg = !!node?.rich?.equation?.svg
    check(
      `渲染树携带 SVG（${id}）`,
      hasSvg,
      hasSvg
        ? `${node!.rich!.equation!.width}×${node!.rich!.equation!.height} 单位`
        : '缺 rich.equation.svg',
    )
  }

  // ---- 断言 2：只有方程的主题也必须生成 rich ----
  const onlyEqNode = equationNodes.find((n) => n.id === EQ_ONLY)
  check(
    '只有方程的主题也生成 rich（hasRichContent 必须算上方程）',
    !!onlyEqNode?.rich,
    onlyEqNode?.rich ? 'rich 存在' : 'rich 缺失 —— 屏幕上会什么都没有',
  )

  // ---- 断言 3：语法错的主题占位但不画 ----
  const brokenNode = equationNodes.find((n) => n.id === EQ_BROKEN)
  check(
    '语法错的方程：有 rich.equation、没有 svg、有可读的 error',
    !!brokenNode?.rich?.equation &&
      !brokenNode.rich.equation.svg &&
      !!brokenNode.rich.equation.error,
    brokenNode?.rich?.equation?.error ?? '（无 error）',
  )

  // ---- 渲染两路 ----
  const bounds = computeNodesBounds(scene.nodes)
  const W = Math.ceil(bounds.width)
  const H = Math.ceil(bounds.height)
  const viewport: Viewport = { width: W, height: H }
  const camera: CameraProjection = { x: -bounds.x, y: -bounds.y, zoom: 1 }

  const topicEquations = await preloadTopicEquations(scene)

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(W * DPR)
  canvas.height = Math.ceil(H * DPR)
  const ctx = canvas.getContext('2d')!
  renderScene(ctx, scene, viewport, camera, DPR, {
    drawBackground: false,
    topicEquations,
  })
  const canvasPng = canvas.toDataURL('image/png')

  const svgText = renderSceneToSvg(scene, { padding: 0, drawBackground: false })
  const svgHost = document.createElement('div')
  svgHost.innerHTML = svgText
  const svgEl = svgHost.querySelector('svg')!
  const svgCanvas = await rasterizeSvg(svgText, W, H)

  // ---- 断言 4：SVG 里的嵌套 <svg> 与常量逐个对上 ----
  const embedded = extractEmbeddedSvgs(svgText)
  // 4 个：分式 / 行内 / display / 只有方程。**语法错与对照组不该有**——
  // 「只有方程」那个主题是最容易漏的（它就是 hasRichContent 那一支的哨兵）。
  check(
    'SVG 里嵌入了与方程数相同的 <svg> 片段',
    embedded.length === 4,
    `实际 ${embedded.length} 个（期望 4：分式 / 行内 / display / 只有方程；语法错与对照组不该有）`,
  )
  for (const node of equationNodes) {
    const equation = node.rich?.equation
    if (!equation?.svg || !equation.width || !equation.height) continue
    const expected = computeTopicEquationRect(
      node.bounds,
      getNodePadding(node.depth),
      { width: equation.width, height: equation.height },
      node.style.fontSize,
    )
    if (!expected) {
      check(`常量能算出槽位（${node.id}）`, false, 'computeTopicEquationRect 返回 null')
      continue
    }
    const match = embedded.find(
      (e) => Math.abs(e.x - expected.x) < 0.6 && Math.abs(e.y - expected.y) < 0.6,
    )
    const gap = match
      ? Math.max(
          Math.abs(match.width - expected.width),
          Math.abs(match.height - expected.height),
        )
      : Infinity
    check(
      `SVG 嵌入矩形的 x/y/宽高与常量一致（${node.id}）`,
      !!match && gap < 0.6 && match.meet,
      match
        ? `SVG ${formatRect(match)} ↔ 常量 ${formatRect(expected)}（最大差 ${round1(gap)}，meet=${match.meet}）`
        : `未找到匹配片段 —— 常量 ${formatRect(expected)}`,
    )
  }

  // ---- 断言 5/6：两路都在槽位里画出了"节点文字色"的公式 ----
  const accentNodes = [EQ_FRAC, EQ_INLINE, EQ_DISPLAY]
  for (const id of accentNodes) {
    const node = equationNodes.find((n) => n.id === id)
    const equation = node?.rich?.equation
    if (!node || !equation?.svg || !equation.width || !equation.height) {
      check(
        `槽位内画出文字色的公式（${id}）`,
        false,
        '渲染树里没有可用的方程 —— 后面的几何/颜色断言无从谈起',
      )
      continue
    }
    const slot = computeTopicEquationRect(
      node.bounds,
      getNodePadding(node.depth),
      { width: equation.width, height: equation.height },
      node.style.fontSize,
    )
    if (!slot) {
      check(`常量能算出槽位（${id}）`, false, 'computeTopicEquationRect 返回 null')
      continue
    }
    const png = scanAccent(canvas, bounds, slot)
    const render = scanAccent(svgCanvas, bounds, slot)
    check(
      `PNG 在槽位内画出文字色的公式（${id}）`,
      png.count > 0,
      png.count > 0
        ? `${png.count} 像素，包围盒 ${formatRect(png.box!)}`
        : '槽位内扫不到节点文字色 —— 公式没画出来，或画成了黑色',
    )
    check(
      `SVG 在槽位内画出文字色的公式（${id}）`,
      render.count > 0,
      render.count > 0 ? `${render.count} 像素` : '槽位内扫不到节点文字色',
    )
    if (png.box) {
      // 公式不允许溢出槽位（"只缩不放" + 槽内居中）
      const overflow = Math.max(
        slot.x - png.box.x,
        slot.y - png.box.y,
        png.box.x + png.box.width - (slot.x + slot.width),
        png.box.y + png.box.height - (slot.y + slot.height),
      )
      check(
        `PNG 绘制的公式不溢出槽位（${id}）`,
        overflow < 1.5,
        `最大溢出 ${round1(overflow)} 世界单位`,
      )
    }
    const ratio = diffRatioInRect(canvas, svgCanvas, bounds, slot)
    check(`槽位内两路逐像素一致（${id}）`, ratio < 1.5, `差异 ${ratio.toFixed(2)}%`)
  }

  // ---- 断言 7：布局对账（方程参与节点尺寸、且不影响别的主题）----
  const heightOf = (target: Scene, id: string) => target.nodes.find((n) => n.id === id)?.bounds.height
  const withEq = heightOf(scene, EQ_FRAC)
  const withoutEq = heightOf(sceneNoEq, EQ_FRAC)
  const delta = withEq !== undefined && withoutEq !== undefined ? withEq - withoutEq : NaN
  check(
    '有方程的主题正好高出一个方程块',
    Math.abs(delta - TOPIC_EQUATION_BLOCK) < 0.01,
    `带方程 ${withEq} − 无方程 ${withoutEq} = ${round1(delta)}（期望 ${TOPIC_EQUATION_BLOCK}）`,
  )
  const plainWith = heightOf(scene, PLAIN)
  const plainWithout = heightOf(sceneNoEq, PLAIN)
  check(
    '没有方程的主题高度不受影响',
    plainWith === plainWithout,
    `${plainWith} vs ${plainWithout}`,
  )
  const brokenWith = heightOf(scene, EQ_BROKEN)
  const brokenWithout = heightOf(sceneNoEq, EQ_BROKEN)
  check(
    '语法错的主题照样占住槽位（布局不因渲染失败而变）',
    brokenWith !== undefined &&
      brokenWithout !== undefined &&
      Math.abs(brokenWith - brokenWithout - TOPIC_EQUATION_BLOCK) < 0.01,
    `带方程 ${brokenWith} − 无方程 ${brokenWithout}`,
  )

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

  finish()
}

/**
 * 写结论。
 *
 * ⚠️ 出错路径也要调它：对照台是**用来发现缺陷的**，而缺陷常常会让脚本自身踩空
 * （实测：把 `hasRichContent` 里的方程去掉后，节点连 `rich` 都没有了，
 * 后面写 `node.rich!.equation!` 的地方直接抛异常）。
 * 一旦抛异常就走不到"写结论"那一步 —— 20 条已经量到的结论全被吞掉，
 * 只留下一个 TypeError，看上去像对照台自己坏了。
 */
function finish(error?: unknown) {
  const status = document.getElementById('status')!
  const header = document.getElementById('parity-header')?.textContent ?? ''
  const failed = results.filter((r) => !r.pass)
  status.textContent = [
    header,
    '',
    ...lines(),
    '',
    error === undefined
      ? failed.length === 0
        ? `EQUATION-PARITY OK 共 ${results.length} 条断言全部通过`
        : `EQUATION-PARITY FAIL 共 ${results.length} 条，失败 ${failed.length}`
      : `EQUATION-PARITY ERROR ${String(error)}（已收集的结论见上）`,
  ].join('\n')
}

void main().catch((error: unknown) => {
  // 不重新抛：抛了会让 Playwright 只看到页面报错，拿不到已经量到的结论
  finish(error)
})
