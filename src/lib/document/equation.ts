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

/**
 * 把界面上的"输入框 + 开关"整理成要写进文档的值。
 *
 * 两条规则集中在这里，界面只负责调用：
 * - 空 LaTeX → `null`（= 移除方程），与 Rust 命令层、`hasTopicEquation` 同一口径；
 * - `display: false` → **省略字段**而不是存 `false`：`.mgd` 里少一个键，与"从未设过"
 *   完全同形，避免同一种文档状态出现两种写法（否则"比较是否变化"要写两套判据）。
 */
export function toTopicEquation(
  latex: string | null | undefined,
  display: boolean,
): TopicEquation | null {
  const normalized = normalizeEquationLatex(latex)
  if (!normalized) {
    return null
  }
  return display ? { latex: normalized, display: true } : { latex: normalized }
}

/**
 * 两个方程在**文档语义**上是否相同（忽略 `display` 的 `false` 与缺省之别）。
 *
 * 用它判断"要不要写一条撤销记录"：没变就不写，否则点一下输入框都会多出一条。
 */
export function isSameTopicEquation(
  a: TopicEquation | null | undefined,
  b: TopicEquation | null | undefined,
): boolean {
  const left = toTopicEquation(a?.latex, isDisplayEquation(a))
  const right = toTopicEquation(b?.latex, isDisplayEquation(b))
  if (left === null || right === null) {
    return left === right
  }
  return left.latex === right.latex && isDisplayEquation(left) === isDisplayEquation(right)
}
