/**
 * 贴纸渲染组件（唯一导出）。
 *
 * 素材数据与查询在 `sticker-definitions.ts`——本文件刻意只导出组件，
 * 让 react-refresh 的 only-export-components 规则保持安静。
 */

import { STICKER_VIEWBOX, findStickerDefinition } from './sticker-definitions'

/**
 * 画布上的贴纸渲染。
 *
 * `size` 是世界单位的边长；节点被缩放时由外层 transform 负责，
 * 这里始终按 viewBox 原尺寸输出，避免三端各自算缩放。
 */
export function StickerIcon({ stickerId, size }: { stickerId: string; size: number }) {
  const definition = findStickerDefinition(stickerId)
  if (!definition) {
    return null
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${STICKER_VIEWBOX} ${STICKER_VIEWBOX}`}
      aria-hidden="true"
      focusable="false"
    >
      {definition.shapes.map((shape, index) => (
        <path
          key={index}
          d={shape.d}
          fill={shape.fill ?? 'none'}
          stroke={shape.stroke ?? 'none'}
          strokeWidth={shape.strokeWidth ?? 0}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
