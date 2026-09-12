/**
 * 颜色混合工具（纯函数，三端共用）。
 *
 * 用在「深度分级配色」上：XMind 的一级分支是饱和实色 + 白字，二级及更深则用
 * **同一个分支色的淡色底 + 深色字**。这需要把分支色与白/黑按比例混合。
 *
 * 只接受 `#rrggbb`；拿不到合法颜色时原样返回，让调用方保持可见结果而不是变黑。
 */

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff }
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** 与白色混合：ratio=0 原色，ratio=1 纯白。 */
export function mixWithWhite(color: string, ratio: number): string {
  const rgb = parseHex(color)
  if (!rgb) return color
  const t = Math.max(0, Math.min(1, ratio))
  return toHex(
    rgb.r + (255 - rgb.r) * t,
    rgb.g + (255 - rgb.g) * t,
    rgb.b + (255 - rgb.b) * t,
  )
}

/** 与黑色混合：ratio=0 原色，ratio=1 纯黑。 */
export function mixWithBlack(color: string, ratio: number): string {
  const rgb = parseHex(color)
  if (!rgb) return color
  const t = Math.max(0, Math.min(1, ratio))
  return toHex(rgb.r * (1 - t), rgb.g * (1 - t), rgb.b * (1 - t))
}
