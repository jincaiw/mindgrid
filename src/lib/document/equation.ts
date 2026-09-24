/**
 * 方程的**文档级**口径（纯函数，不碰 MathJax）。
 *
 * 单独拎出来是为了让"空串算不算有方程"只有一个出处：渲染内核
 * （`lib/equation/renderer`）、布局（`estimateNodeSize`）、DOM 与三端导出
 * 都必须用同一口径，否则会出现"布局留了位置但画不出来"或反过来的空洞。
 *
 * Rust 侧同名口径写在 `set_topic_equation` 命令里（空串一律存成 `None`）。
 */
import type { TopicEquation } from './types'

/** 去掉首尾空白（TeX 里首尾空白无语义）。 */
export function normalizeEquationLatex(latex: string | null | undefined) {
  return (latex ?? '').trim()
}

/** 该主题是否真的带方程 —— 空 LaTeX / 缺字段都不算。 */
export function hasTopicEquation(equation: TopicEquation | null | undefined): boolean {
  return normalizeEquationLatex(equation?.latex).length > 0
}

/** 显示模式：缺省等同 inline。 */
export function isDisplayEquation(equation: TopicEquation | null | undefined): boolean {
  return equation?.display === true
}
