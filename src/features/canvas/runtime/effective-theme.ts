/**
 * 「当前生效的主题」的唯一解析。
 *
 * ## 为什么要有这个模块（这个模块存在的全部理由）
 *
 * 配色有**两个来源**：
 * - **文档主题**（`document.theme.id` → 内置 / 用户自建风格）
 * - **画布级分支色板**（`canvas.rainbowBranch` + `canvas.branchPalette` / 画布样式页的 `colorPalette`）
 *
 * 原先只有**连线**会去解析"画布级色板"，**节点配色只读主题**（`theme.branchPalette`）。
 * 主题自带色板时两者恰好一致，所以这个不一致长期没被看见；一旦换成
 * 不带色板的主题（「暗夜」、本文档这种单色自定义风格），立刻变成
 * **节点单色、连线彩虹** —— 而那个控件就叫「分支色板」，等于没生效。
 *
 * 更糟的是它散落在多处：屏幕的连线、导出场景的连线、屏幕的节点（DOM）、
 * 导出场景的节点、放映两处、检查器预览条 —— 各自决定自己那一份。
 *
 * 所以这里做两件事：
 * 1. **把优先级阶梯收到一处**（`resolveEffectiveTheme`）；
 * 2. 让所有渲染端都消费**同一个 ThemePalette 对象**：调色板已经被叠加进主题里，
 *    下游不再需要知道"色板是从哪来的"。
 *
 * ## 优先级（从高到低）
 *
 * ```
 * 1. 彩虹分支显式关闭（rainbowBranch === false） → 无调色板（单色分支）
 * 2. 画布/样式页的自定义色板（branchStyle.colorPalette 非空）
 * 3. 彩虹分支显式开启（rainbowBranch === true） → 文档选中的预设/自定义方案
 * 4. 主题自带的色板（缤纷主题）
 * 5. 都没有 → 无调色板（单色分支，连线用主题连线色）
 * ```
 *
 * 第 1 条必须排最前：否则关掉彩虹分支后，缤纷主题的 `branchPalette` 会接手，
 * 用户取消了却仍是彩色的。
 *
 * ⚠️ **第 5 条曾是一个硬编码的 8 色循环**（`BRANCH_COLORS`）。那条兜底让
 * "主题的连线色"变成死数据（5 套经典主题的 `edge` 从来没用上），也让
 * 连线和节点永远对不上。现在改为"无调色板" —— 主题说什么就是什么。
 */

import {
  resolveBranchPalette,
  type DocumentCanvasSettings,
} from '../../../lib/document/canvas-settings'
import { getTheme, type ThemePalette } from '../../../lib/document/themes'
import type { SheetBranchStyle } from '../../../lib/document/types'

export interface EffectiveThemeInput {
  /** 文档主题 id（undefined → 内置默认主题）。 */
  themeId: string | undefined
  /** 画布级分支样式（连线类型/粗细/色板）——取自当前画布的 `branchStyle`。 */
  branchStyle?: SheetBranchStyle | undefined
  /** 画布设置（含 rainbowBranch / branchPalette / customPalettes）。 */
  canvasSettings?: DocumentCanvasSettings | undefined
}

/** 解析当前生效的分支调色板；`null` = 单色分支（不按分支取色）。 */
export function resolveEffectiveBranchPalette(
  input: EffectiveThemeInput,
): string[] | null {
  const canvasSettings = input.canvasSettings
  const customPalette = input.branchStyle?.colorPalette

  // 1. 显式关闭 → 单色
  if (canvasSettings?.rainbowBranch === false) {
    return null
  }
  // 2. 画布/样式页的自定义色板
  if (customPalette && customPalette.length > 0) {
    return customPalette
  }
  // 3. 显式开启 → 文档选中的预设
  if (canvasSettings?.rainbowBranch === true) {
    return resolveBranchPalette(canvasSettings.branchPalette, canvasSettings.customPalettes)
  }
  // 4. 主题自带色板
  const themePalette = getTheme(input.themeId).branchPalette
  if (themePalette && themePalette.length > 0) {
    return themePalette
  }
  // 5. 都没有 → 单色
  return null
}

/**
 * 解析"当前生效的主题"：**调色板已叠加进去**。
 *
 * 下游（连线取色、节点配色、导出、放映、面板预览）拿到的就是同一份，
 * 于是"节点填充色 == 该分支的连线色"成为**结构上成立**的事实，
 * 而不是靠每处各自记得用同一个来源。
 *
 * 调色板与主题自带的相同时**原样返回入参对象**（引用稳定）：
 * 这些值会进 `useMemo` 依赖，每次新建对象会让下游每帧重算。
 */
export function resolveEffectiveTheme(input: EffectiveThemeInput): ThemePalette {
  const theme = getTheme(input.themeId)
  const palette = resolveEffectiveBranchPalette(input)

  if (!palette) {
    if (!theme.branchPalette) return theme
    // 显式去掉色板：**不能只把属性设成 undefined 就完事**——
    // 下游判的是"有没有色板"，而 `{...theme, branchPalette: undefined}` 仍然
    // 带着这个键。这里构造一个真没有该键的对象，语义更干净。
    const { branchPalette: _dropped, ...rest } = theme
    return rest
  }

  if (theme.branchPalette === palette) return theme
  return { ...theme, branchPalette: palette }
}

/** 该主题当前是否按分支多色（供界面提示用）。 */
export function hasEffectiveBranchPalette(input: EffectiveThemeInput): boolean {
  return resolveEffectiveBranchPalette(input) !== null
}
