/**
 * PDF Exporter：将 Scene（Render Tree）渲染为矢量 PDF 字节。
 *
 * 复用 SVG Renderer 的 renderSceneToSvg，将 SVG 嵌入 jsPDF 文档（通过 svg2pdf.js）。
 * 输出为单页 PDF，页面尺寸 = SVG 内容尺寸（按 pt = px @ 72 DPI 计），
 * 保留矢量与文本可选择性（与 XMind 导出 PDF 行为对齐）。
 *
 * 导出流程：
 * 1. renderSceneToSvg 生成 SVG 字符串（含 width/height/viewBox）
 * 2. 解析 SVG 字符串为 DOM 元素（jsdom 与 Tauri WebView 均可）
 * 3. 创建 jsPDF，页面尺寸 = SVG 尺寸（pt 单位）
 * 4. pdf.svg(svgElement) 将 SVG 矢量嵌入 PDF
 * 5. pdf.output('arraybuffer') → Uint8Array
 *
 * 注意：svg2pdf.js 需要一个真实的 SVG DOM 元素，不能直接传字符串。
 * 在 SSR / 无 DOM 环境（如纯 Node 测试）下，调用方应跳过 PDF 导出。
 */

import { jsPDF } from 'jspdf'
import 'svg2pdf.js'
import { renderSceneToSvg, type SvgRenderOptions } from './svg-renderer'
import type { Scene } from './render-tree'

export interface PdfExportOptions extends SvgRenderOptions {
  /** PDF 页面外边距（pt，默认 0，因 SVG 已含 padding）。 */
  pagePadding?: number
}

const DEFAULT_PAGE_PADDING = 0

/**
 * 将场景渲染为 PDF 字节。
 *
 * @param scene 场景（建议用 enableCulling: false 构建全量场景）
 * @param options 导出选项
 * @returns PDF 二进制数据
 */
export async function renderSceneToPdfBytes(
  scene: Scene,
  options: PdfExportOptions = {},
): Promise<Uint8Array> {
  const { pagePadding = DEFAULT_PAGE_PADDING, ...svgOptions } = options

  // 默认绘制背景（PDF 期望不透明页面）
  if (svgOptions.drawBackground === undefined) {
    svgOptions.drawBackground = true
  }

  // 1. 渲染 SVG 字符串
  const svgString = renderSceneToSvg(scene, svgOptions)

  // 2. 解析 SVG 字符串为 DOM 元素
  const svgElement = parseSvgElement(svgString)
  if (!svgElement) {
    throw new Error('无法解析 SVG 字符串，PDF 导出失败')
  }

  // 3. 读取 SVG 的 width/height（pt = px @ 72 DPI）
  const width = parseFloat(svgElement.getAttribute('width') ?? '0')
  const height = parseFloat(svgElement.getAttribute('height') ?? '0')
  if (!width || !height) {
    throw new Error('SVG 尺寸无效，PDF 导出失败')
  }

  // 4. 创建 jsPDF（pt 单位，自定义页面尺寸含 pagePadding）
  const pageWidth = width + pagePadding * 2
  const pageHeight = height + pagePadding * 2
  const pdf = new jsPDF({
    orientation: pageWidth > pageHeight ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [pageWidth, pageHeight],
  })

  // 5. 嵌入 SVG（矢量 + 文本）
  await pdf.svg(svgElement, {
    x: pagePadding,
    y: pagePadding,
    width,
    height,
  })

  // 6. 输出为 Uint8Array
  const arrayBuffer = pdf.output('arraybuffer')
  return new Uint8Array(arrayBuffer)
}

/**
 * 将 SVG 字符串解析为 DOM 元素。
 *
 * 使用 DOMParser（浏览器 / jsdom 均提供）。若环境无 DOMParser 则返回 null。
 */
function parseSvgElement(svgString: string): SVGElement | null {
  if (typeof DOMParser === 'undefined') {
    return null
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svg = doc.documentElement
  // 解析失败时 parser 仍返回文档（含 <parsererror>），检测之
  if (!svg || svg.localName !== 'svg') {
    return null
  }
  return svg as unknown as SVGElement
}
