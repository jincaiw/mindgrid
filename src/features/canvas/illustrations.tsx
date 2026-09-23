/**
 * 插画渲染组件（唯一导出）。
 *
 * 素材数据与查询在 `illustration-definitions.ts`——本文件刻意只导出组件，
 * 让 react-refresh 的 only-export-components 规则保持安静。
 *
 * 注意：**画布上的插画不用这个组件**（画布层是 Canvas 2D，与导出端同源）。
 * 这里只服务格式面板里的缩略图与素材选择器。
 */

import { findIllustrationDefinition } from './illustration-definitions'
import { ILLUSTRATION_VIEWBOX } from './runtime/canvas-illustration-constants'

export function IllustrationIcon({
  illustrationId,
  size,
}: {
  illustrationId: string
  size: number
}) {
  const definition = findIllustrationDefinition(illustrationId)
  if (!definition) {
    return null
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ILLUSTRATION_VIEWBOX} ${ILLUSTRATION_VIEWBOX}`}
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
