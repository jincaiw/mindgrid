/**
 * 标题大小写转换（对齐 XMind 文本工具条的 Tт）。
 *
 * 转换只发生在渲染层：**不改写主题文本**，屏幕 DOM / Canvas / SVG 三端
 * 必须调用同一个函数，否则屏幕与导出的文字会不一致。
 *
 * 注意：转换**不改变字符数**（uppercase/lowercase/capitalize 都是等长替换），
 * 因此布局用的 `textLength` 估算不受影响，无需改动 `estimateNodeSize`。
 */

import type { TopicTextTransform } from '../../../lib/document/types'

/**
 * 按大小写转换规则变换文本。
 *
 * 必须是纯函数：同一输入恒得同一输出，便于三端复用与单测。
 * 空文本、未知规则一律原样返回，避免把损坏的文档设置放大成渲染异常。
 */
export function applyTextTransform(
  text: string,
  transform: TopicTextTransform | undefined,
): string {
  if (!transform || transform === 'none' || text.length === 0) {
    return text
  }

  switch (transform) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'capitalize':
      // 逐单词首字母大写：以空白为词边界（与 CSS text-transform: capitalize 同语义）
      return text.replace(/(^|\s)(\S)/g, (_match, boundary: string, first: string) =>
        `${boundary}${first.toUpperCase()}`,
      )
    default:
      return text
  }
}

/** Tт 按钮的循环顺序（点击一次推进一格），与 XMind 的循环一致。 */
export const TEXT_TRANSFORM_CYCLE: readonly TopicTextTransform[] = [
  'none',
  'uppercase',
  'lowercase',
  'capitalize',
]

/** 取下一个大小写状态；未知值从 none 重新开始。 */
export function nextTextTransform(current: TopicTextTransform | undefined): TopicTextTransform {
  const index = TEXT_TRANSFORM_CYCLE.indexOf(current ?? 'none')
  if (index < 0) return 'none'
  return TEXT_TRANSFORM_CYCLE[(index + 1) % TEXT_TRANSFORM_CYCLE.length]
}
