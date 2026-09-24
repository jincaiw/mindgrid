/**
 * 方程渲染结果的解析与缓存读取（对应 `topic-image-store` 之于图片）。
 *
 * 与图片那条路的差别：图片的固有尺寸来自**资源索引**（持久化，同步可得），
 * 而方程的尺寸来自**渲染结果**（异步）。所以这里多一个"预热"环节：
 * 文档里的公式先统一渲染进缓存，渲染树再同步地按 `equationKey` 取用。
 *
 * 三条硬约定（改之前先读）：
 * 1. **布局不等渲染**：节点高度由 `estimateNodeSize` 预留固定槽位，与本模块无关 ——
 *    所以首帧"还没渲染出来"只会让槽位暂时空着，不会让节点尺寸跳变。
 * 2. **模板必须懒引用**：`renderer` 里 import 了 1.85 MB 的 vendor 资产
 *    （`tex-svg.js?url`），只有真正用到时才加载（本模块被渲染路径 import，
 *    但引擎加载发生在 `prerenderEquations` / `renderEquation` 里）。
 * 3. **颜色在绘制时替换**：缓存里的 SVG 带 `currentColor`（与主题无关，缓存才能复用），
 *    绘制端用 `colorizeEquationSvg` 换成具体颜色。
 */
import { useEffect, useRef, useState } from 'react'

import { hasTopicEquation, isDisplayEquation, normalizeEquationLatex } from '../../../lib/document/equation'
import type { TopicEquation, TopicSnapshot } from '../../../lib/document/types'
import {
  equationKey,
  getCachedEquation,
  prerenderEquations,
  type EquationRenderResult,
} from '../../../lib/equation/renderer'
import type { TopicEquationRender } from './render-tree'

/** 从渲染结果转成渲染树用的投影。未渲染 = 空对象（不是 undefined）。 */
export function toEquationRender(result: EquationRenderResult | null): TopicEquationRender {
  if (!result) {
    return {}
  }
  return result.status === 'ok'
    ? { svg: result.svg, width: result.width, height: result.height }
    : { error: result.message }
}

/** 某个方程的缓存键；没有方程时返回 null（调用方据此跳过）。 */
export function topicEquationKey(equation: TopicEquation | null | undefined): string | null {
  if (!hasTopicEquation(equation)) {
    return null
  }
  return equationKey(normalizeEquationLatex(equation?.latex), isDisplayEquation(equation))
}

/**
 * 递归收集主题树里的方程（含浮动主题由调用方一并传入）。
 *
 * 与 `collectTopicImageRefs` 同形：导出/预热都需要"文档里有哪些公式"，
 * 多收无害（同一公式按缓存键去重，只渲染一次）。
 */
export function collectTopicEquations(topic: TopicSnapshot): Array<TopicEquation | undefined> {
  const equations: Array<TopicEquation | undefined> = []
  const walk = (node: TopicSnapshot) => {
    equations.push(node.equation)
    for (const child of node.children) {
      walk(child)
    }
  }
  walk(topic)
  return equations
}

/**
 * 收集文档里所有方程的缓存键（去重、保持出现顺序）。
 * 纯函数，便于单测钉住"同一公式只渲染一次"的语义。
 */
export function collectTopicEquationKeys(
  equations: Array<TopicEquation | null | undefined>,
): string[] {
  const seen = new Set<string>()
  for (const equation of equations) {
    const key = topicEquationKey(equation)
    if (key) {
      seen.add(key)
    }
  }
  return [...seen]
}

/**
 * 把缓存里的 SVG 的 `currentColor` 换成具体颜色。
 *
 * 为什么必须做：MathJax 的 SVG 用 `fill="currentColor"` / `stroke="currentColor"`，
 * DOM 里会继承节点的 CSS 颜色 —— **但 Canvas 光栅化时它退化成正黑色**
 * （standalone SVG 没有继承来的 color）。不换的话同一张图在屏幕上跟着主题变色、
 * 在导出的 PNG 里永远黑，三端颜色不一致。
 *
 * 只替换 `fill=` / `stroke=` 属性位置上的关键字，不做全文替换（避免碰到 data-* 属性里的文本）。
 */
export function colorizeEquationSvg(svg: string, color: string): string {
  if (!svg) {
    return svg
  }
  // 颜色来自主题解析器，正常是 #rrggbb / rgb(...)；仍然挡一下能破坏属性值的字符，
  // 否则一个畸形颜色就能把整份导出 SVG 弄成非法 XML。
  const safeColor = color.replace(/["<>]/g, '') || 'currentColor'
  return svg.replace(/(fill|stroke)="currentColor"/g, `$1="${safeColor}"`)
}

/**
 * 把方程 SVG 的根标签尺寸改成**给定的 px 尺寸**（并可选地落定颜色）。
 *
 * ## 为什么 DOM 端也需要它（这是实测出来的一个 P1）
 *
 * `extractEquationSvg` 产出的"独立标记"里，根标签的 `width`/`height` 是 **viewBox 单位**
 * （动辄 800~2400，那是 MathJax 的内部单位，不是 px）。导出端没问题 —— 它会重写根标签
 * （`embedEquationSvg`）。但 **DOM 端如果直接把这段标记塞进节点**，那个 `<svg>` 就真按
 * 800 px 宽渲染：公式会糊满整个画布，而且**只靠单测发现不了**（jsdom 不做布局）。
 *
 * 所以 DOM 也必须重写根标签：填成**该字号下的自然尺寸**，再由 CSS 的
 * `max-width/max-height: 100%` 按比例收紧 —— 对带固有宽高比的替换元素来说，
 * 这就是标准的 "contain" 语义，与 `computeTopicEquationRect` 的「只缩不放 + 居中」等价。
 *
 * `color` 省略时保留 `currentColor`（右栏预览用：让它继承面板文字色）。
 */
export function sizeEquationSvg(
  svg: string,
  size: { width: number; height: number },
  color?: string,
): string {
  const match = /^<svg\b([^>]*)>/.exec(svg)
  if (!match) {
    return ''
  }
  const attrs = match[1].replace(/\s(?:width|height)="[^"]*"/g, '')
  const body = svg.slice(match[0].length)
  const rebuilt = `<svg${attrs}>${body}`
  return (color ? colorizeEquationSvg(rebuilt, color) : rebuilt).replace(
    /^<svg\b/,
    `<svg width="${size.width}" height="${size.height}"`,
  )
}

/**
 * 把**独立**的方程 SVG 改写成可嵌进导出 SVG 的标记：
 * 给定 x/y/width/height，并把 `currentColor` 落成具体颜色。
 *
 * 嵌套 `<svg>` + `preserveAspectRatio="xMidYMid meet"` 与 DOM 的
 * `max-width/max-height` 约束、Canvas 的 `drawImage(rect)` 三者语义等价
 * （等比缩放 + 槽内居中）—— 三端一致就靠这个等价关系。
 *
 * 为什么必须重写根标签上的 width/height：独立标记里的宽高是 MathJax 的 viewBox 单位
 * （动辄上千），直接嵌进去会按那个尺寸摆放，把版面撑坏。
 */
export function embedEquationSvg(
  svg: string,
  rect: { x: number; y: number; width: number; height: number },
  color: string,
): string {
  const match = /^<svg\b([^>]*)>/.exec(svg)
  if (!match) {
    return ''
  }
  const attrs = match[1].replace(/\s(?:x|y|width|height|preserveAspectRatio)="[^"]*"/g, '')
  const body = svg.slice(match[0].length)
  const colored = colorizeEquationSvg(`<svg${attrs}>${body}`, color)
  return colored.replace(
    /^<svg\b/,
    `<svg x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" preserveAspectRatio="xMidYMid meet"`,
  )
}

/**
 * 从「缓存键 → 渲染结果」表里取某个主题的方程（DOM 侧与图片的
 * `pickTopicImageUrl` 同形）。没有方程时返回 null。
 *
 * 注意返回的可能是**空对象**：文档里有方程、但引擎还没渲染好 ——
 * 调用方据此仍然要占住槽位（否则标题会在渲染到达后跳一下），只是内容为空。
 */
export function pickTopicEquationPayload(
  equation: TopicEquation | null | undefined,
  payloads: Record<string, TopicEquationRender>,
): TopicEquationRender | null {
  const key = topicEquationKey(equation)
  if (!key) {
    return null
  }
  return payloads[key] ?? {}
}

/**
 * 预热文档里所有方程，并返回「缓存键 → 渲染结果」。
 * 导出路径用它（导出前必须拿到结果，导出渲染本身是同步的）。
 */
export async function resolveTopicEquations(
  equations: Array<TopicEquation | null | undefined>,
): Promise<Record<string, TopicEquationRender>> {
  const keys = collectTopicEquationKeys(equations)
  if (keys.length === 0) {
    return {}
  }
  await prerenderEquations(
    equations
      .filter((equation) => hasTopicEquation(equation))
      .map((equation) => ({
        latex: normalizeEquationLatex(equation?.latex),
        display: isDisplayEquation(equation),
      })),
  )

  const resolved: Record<string, TopicEquationRender> = {}
  for (const equation of equations) {
    const key = topicEquationKey(equation)
    if (key && !(key in resolved)) {
      const result = getCachedEquation(
        normalizeEquationLatex(equation?.latex),
        isDisplayEquation(equation),
      )
      resolved[key] = toEquationRender(result)
    }
  }
  return resolved
}

/**
 * DOM 侧：把文档里的方程渲染好并缓存，返回「缓存键 → 渲染结果」。
 *
 * 结构与 `useTopicImageUrls` 一致：以**稳定字符串**作为 effect 依赖键，
 * 用 ref 去重，避免调用方每帧新建数组导致无限刷新。
 */
export function useTopicEquations(
  equations: Array<TopicEquation | null | undefined>,
): Record<string, TopicEquationRender> {
  const keys = collectTopicEquationKeys(equations)
  const keySignature = keys.join('|')
  const [payloads, setPayloads] = useState<Record<string, TopicEquationRender>>({})
  const requestedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!keySignature) {
      return
    }
    const requested = requestedRef.current
    const pending = keySignature.split('|').filter((key) => !requested.has(key))
    if (pending.length === 0) {
      return
    }
    for (const key of pending) {
      requested.add(key)
    }

    let cancelled = false
    void (async () => {
      const resolved = await resolveTopicEquations(equations)
      if (cancelled) {
        return
      }
      setPayloads((previous) => ({ ...previous, ...resolved }))
    })()

    return () => {
      cancelled = true
    }
    // 依赖只跟"有哪些公式"走：equations 每帧都是新数组，进依赖会无限刷新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySignature])

  return payloads
}
