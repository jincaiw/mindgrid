/**
 * 方程渲染内核：LaTeX → 独立 SVG 标记。
 *
 * ## 为什么是"vendor 一个第三方文件 + 同步 API"
 *
 * - `src/vendor/mathjax/tex-svg.js` 是**原样搬运**的 MathJax 4.1.0 产物（Apache-2.0，
 *   来源与 sha256 见同目录 README）。本沙箱的包管理器通道被拦，但直连 CDN 可行。
 * - 字体数据已内联，字形是 `<path>` 轮廓 → **导出（Canvas/PNG、SVG/PDF）不需要字体文件**，
 *   这是"三端渲染一致"能成立的前提。
 * - ⚠️ 只能用**同步**的 `MathJax.tex2svg()`：包里含无障碍 SRE 扩展，会去请求
 *   `<base>/sre/speech-worker.js`；我们不提供它 → `tex2svgPromise` / `typesetPromise`
 *   **会永久挂起**（而 DOM 其实已经渲染出来了）。详见 vendor README。
 *
 * ## 这个模块负责什么 / 不负责什么
 *
 * 负责：懒加载引擎、渲染、**按 `latex|display` 缓存**、产出可直接消费的 SVG 标记与尺寸、
 * 识别语法错误并给出可读信息。
 * 不负责：几何（在哪画、画多大 → `features/canvas/runtime/topic-equation-constants`）、
 * 三端各自的绘制。
 *
 * ## 同步接口的必要性
 *
 * 布局/渲染树是**纯同步**的，所以这里对外给的是
 * `getCachedEquation()`（取缓存，没有就返回 null）+ `prerenderEquations()`（预热缓存）。
 * 调用方在文档变化后预热一次，之后所有渲染路径都能同步拿到结果 —— 与主题图片
 * "资源索引里带固有尺寸"是同一个思路，只是尺寸的来源从资源表换成了渲染结果。
 */
import { normalizeEquationLatex } from '../document/equation'
import texSvgUrl from '../../vendor/mathjax/tex-svg.js?url'

/** MathJax 4 暴露给我们用到的那部分接口（其它字段不承诺稳定，不要依赖）。 */
interface MathJaxGlobal {
  startup?: { promise?: Promise<unknown> }
  tex2svg?: (latex: string, options?: { display?: boolean }) => Element | null
}

export type EquationRenderResult =
  | { status: 'ok'; svg: string; width: number; height: number }
  | { status: 'error'; message: string }

/** 缓存键：显示模式会影响排版（分式大小、上下限位置），必须一起进键。 */
export function equationKey(latex: string, display: boolean) {
  return `${display ? 'display' : 'inline'}:${latex}`
}

/** 口径来自文档层（`lib/document/equation`）—— 渲染、布局、三端必须同一份。 */
export { normalizeEquationLatex as normalizeLatex } from '../document/equation'

function mathJaxGlobal(): MathJaxGlobal | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return (window as { MathJax?: MathJaxGlobal }).MathJax
}

let enginePromise: Promise<boolean> | null = null

/**
 * 懒加载引擎（只加载一次）。返回是否可用；不可用时不抛，由调用方决定怎么降级。
 *
 * 用 `<script src>`（`?url` 资产）而不是动态 `import()`：`tex-svg.js` 是第三方
 * webpack 产物，走 bundler 转换既慢又可能被改写；`?url` 原样输出、按需加载。
 */
export function loadEquationEngine(): Promise<boolean> {
  if (enginePromise) {
    return enginePromise
  }

  enginePromise = new Promise<boolean>((resolve) => {
    const existing = mathJaxGlobal()
    if (existing?.tex2svg) {
      resolve(true)
      return
    }
    if (typeof document === 'undefined') {
      resolve(false)
      return
    }

    const settle = () => {
      const started = mathJaxGlobal()?.startup?.promise
      if (!started) {
        resolve(false)
        return
      }
      void started.then(
        () => resolve(!!mathJaxGlobal()?.tex2svg),
        () => resolve(false),
      )
    }

    const script = document.createElement('script')
    script.src = texSvgUrl
    script.async = true
    script.addEventListener('load', settle)
    script.addEventListener('error', () => resolve(false))
    document.head.appendChild(script)
  })

  return enginePromise
}

/** 仅测试与失败重试用：把加载状态清零（生产调用方不需要）。 */
export function resetEquationEngineForTests() {
  enginePromise = null
  cache.clear()
}

const cache = new Map<string, EquationRenderResult>()

/** 取已缓存的结果；没有就返回 null（**不触发加载、不阻塞**）。 */
export function getCachedEquation(latex: string, display = false): EquationRenderResult | null {
  const normalized = normalizeEquationLatex(latex)
  if (!normalized) {
    return null
  }
  return cache.get(equationKey(normalized, display)) ?? null
}

/**
 * 从 MathJax 返回的节点里取出"独立的 SVG 标记"。
 *
 * 做的事：拿到内层 `<svg>`、补 `xmlns`、把 `width/height` 从 `ex` 单位换成
 * **与 viewBox 同量纲的 px**（1 单位 = 1px）—— 这样：
 * - 导出的 SVG 用嵌套 `<svg width height viewBox>` 摆放，`preserveAspectRatio` 语义即"contain"；
 * - Canvas/PNG 把同一串喂给 `Image` 再 `drawImage` 时尺寸是确定的（`ex` 单位在光栅化时会退化）。
 * 几何量（`width`/`height`）取 viewBox 的第 3、4 个数，与字号无关，可安全跨字号复用。
 */
export function extractEquationSvg(container: Element): EquationRenderResult {
  const errorNode = container.querySelector('mjx-error, [data-mjx-error]')
  if (errorNode) {
    const message =
      container.getAttribute('data-mjx-error') ??
      errorNode.getAttribute('data-mjx-error') ??
      errorNode.textContent ??
      '公式语法有误'
    return { status: 'error', message: message.trim().slice(0, 200) || '公式语法有误' }
  }

  const svg = container.tagName?.toLowerCase() === 'svg' ? container : container.querySelector('svg')
  if (!svg) {
    return { status: 'error', message: '渲染结果里没有 SVG' }
  }

  const viewBox = svg.getAttribute('viewBox')
  const parsed = viewBox ? viewBox.trim().split(/[\s,]+/).map(Number) : []
  const width = parsed.length === 4 && Number.isFinite(parsed[2]) ? Math.abs(parsed[2]) : 0
  const height = parsed.length === 4 && Number.isFinite(parsed[3]) ? Math.abs(parsed[3]) : 0
  if (!(width > 0) || !(height > 0)) {
    return { status: 'error', message: '渲染结果缺 viewBox，无法确定尺寸' }
  }

  const clone = svg.cloneNode(true) as Element
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  return { status: 'ok', svg: clone.outerHTML, width, height }
}

/**
 * 渲染一条公式（同步；引擎没就绪或公式为空时返回 null）。
 * 结果进缓存，因此同一 `latex|display` 只渲染一次。
 */
export function renderEquationSync(latex: string, display = false): EquationRenderResult | null {
  const normalized = normalizeEquationLatex(latex)
  if (!normalized) {
    return null
  }
  const key = equationKey(normalized, display)
  const cached = cache.get(key)
  if (cached) {
    return cached
  }
  const tex2svg = mathJaxGlobal()?.tex2svg
  if (typeof tex2svg !== 'function') {
    return null
  }

  let result: EquationRenderResult
  try {
    const container = tex2svg(normalized, { display })
    result = container
      ? extractEquationSvg(container)
      : { status: 'error', message: '渲染失败' }
  } catch (error) {
    result = { status: 'error', message: String((error as Error)?.message ?? error).slice(0, 200) }
  }

  cache.set(key, result)
  return result
}

/** 等引擎就绪后渲染（首屏预热、面板预览用）。 */
export async function renderEquation(
  latex: string,
  display = false,
): Promise<EquationRenderResult | null> {
  const ready = await loadEquationEngine()
  if (!ready) {
    return null
  }
  return renderEquationSync(latex, display)
}

/**
 * 预热一批公式（文档加载/变更后调一次），返回任务完成。
 *
 * 刻意**串行**渲染：单条是同步阻塞的（小公式 <1ms，实测），并发没有收益，
 * 串行还能保证缓存写入顺序可预期。
 */
export async function prerenderEquations(
  entries: Array<{ latex: string; display?: boolean }>,
): Promise<void> {
  const unique = new Map<string, boolean>()
  for (const entry of entries) {
    const normalized = normalizeEquationLatex(entry.latex)
    if (normalized) {
      unique.set(normalized, entry.display ?? false)
    }
  }
  if (unique.size === 0) {
    return
  }
  const ready = await loadEquationEngine()
  if (!ready) {
    return
  }
  for (const [latex, display] of unique) {
    renderEquationSync(latex, display)
  }
}
