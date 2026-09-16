/**
 * 贴纸素材库：**数据驱动的 SVG 图元**，DOM / Canvas(PNG) / SVG 三端共用同一份定义。
 *
 * 为什么不是 React 组件：导出端（canvas 2d、SVG 字符串）也要画同一张贴纸。
 * 如果画布用组件、导出各写一遍路径，就会立刻出现"屏幕上对、导出里歪"的老问题
 * （本项目在图片、连线、文字上都踩过）。这里统一成 `{ d, fill, stroke }` 图元：
 * - DOM：`<path d=... />`（见 stickers.tsx 的 StickerIcon）
 * - SVG 导出：同一个 `<path>`
 * - Canvas：`ctx.fill(new Path2D(d))`
 *
 * 坐标一律画在 0..32 的 viewBox 里，渲染端按 `size / STICKER_VIEWBOX` 缩放——
 * 于是"多大"只有一个来源（见 runtime/topic-sticker-constants.ts）。
 *
 * 与组件分文件的理由：本文件只导出数据与查询函数，`stickers.tsx` 只导出组件。
 * 混在一起会触发 react-refresh 的 only-export-components 规则（本项目把 lint 警告数
 * 当基线不变式，多一条就是自己引入的）。
 */

/** 贴纸图元的坐标系边长。所有 path 都画在这个正方形里。 */
export const STICKER_VIEWBOX = 32

export type StickerCategory = 'expression' | 'symbol' | 'decoration'

/** 一个绘制图元。`d` 是 SVG path 的 d，三端都能吃。 */
export interface StickerShape {
  d: string
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface StickerDefinition {
  id: string
  label: string
  category: StickerCategory
  shapes: readonly StickerShape[]
}

/** 内置贴纸目录，顺序即选择器展示顺序。 */
export const STICKER_DEFINITIONS: readonly StickerDefinition[] = [
  {
    id: 'star',
    label: '星星',
    category: 'decoration',
    shapes: [
      { d: 'M16.00 3.50 L19.29 12.47 L28.84 12.83 L21.33 18.73 L23.94 27.92 L16.00 22.60 L8.06 27.92 L10.67 18.73 L3.16 12.83 L12.71 12.47 Z', fill: '#f6be00' },
    ],
  },
  {
    id: 'heart',
    label: '爱心',
    category: 'expression',
    shapes: [
      { d: 'M16.00 12.40 L16.01 12.27 L16.07 11.90 L16.23 11.32 L16.52 10.59 L16.99 9.76 L17.64 8.91 L18.48 8.12 L19.48 7.46 L20.64 6.98 L21.90 6.75 L23.21 6.77 L24.52 7.07 L25.77 7.63 L26.89 8.44 L27.82 9.44 L28.53 10.60 L28.97 11.88 L29.12 13.22 L28.97 14.59 L28.53 15.95 L27.82 17.28 L26.89 18.57 L25.77 19.81 L24.52 21.01 L23.21 22.17 L21.90 23.29 L20.64 24.38 L19.48 25.43 L18.48 26.43 L17.64 27.37 L16.99 28.23 L16.52 28.98 L16.23 29.60 L16.07 30.06 L16.01 30.34 L16.00 30.44 L15.99 30.34 L15.93 30.06 L15.77 29.60 L15.48 28.98 L15.01 28.23 L14.36 27.37 L13.52 26.43 L12.52 25.43 L11.36 24.38 L10.10 23.29 L8.79 22.17 L7.48 21.01 L6.23 19.81 L5.11 18.57 L4.18 17.28 L3.47 15.95 L3.03 14.59 L2.88 13.22 L3.03 11.88 L3.47 10.60 L4.18 9.44 L5.11 8.44 L6.23 7.63 L7.48 7.07 L8.79 6.77 L10.10 6.75 L11.36 6.98 L12.52 7.46 L13.52 8.12 L14.36 8.91 L15.01 9.76 L15.48 10.59 L15.77 11.32 L15.93 11.90 L15.99 12.27 L16.00 12.40 Z', fill: '#e5484d' },
    ],
  },
  {
    id: 'smile',
    label: '笑脸',
    category: 'expression',
    shapes: [
      { d: 'M3.00 16.00 A13.00 13.00 0 1 0 29.00 16.00 A13.00 13.00 0 1 0 3.00 16.00 Z', fill: '#f6be00' },
      { d: 'M10.30 12.80 A1.70 1.70 0 1 0 13.70 12.80 A1.70 1.70 0 1 0 10.30 12.80 Z', fill: '#3f2d00' },
      { d: 'M18.30 12.80 A1.70 1.70 0 1 0 21.70 12.80 A1.70 1.70 0 1 0 18.30 12.80 Z', fill: '#3f2d00' },
      { d: 'M10.5 19.5 Q16 24.5 21.5 19.5', stroke: '#3f2d00', strokeWidth: 2.2 },
    ],
  },
  {
    id: 'thumb-up',
    label: '点赞',
    category: 'expression',
    shapes: [
      { d: 'M12.5 14.5 L12.5 26.5 L7.5 26.5 L7.5 14.5 Z', fill: '#4cb050' },
      { d: 'M14.5 14.5 L14.5 12.2 Q14.5 6 18.6 6 Q21.6 6 21.6 9.6 Q21.6 12 20.6 14.5 L25.4 14.5 Q27.5 14.5 27.5 17.4 Q27.5 20 26.6 22.4 Q25.4 26.5 22.4 26.5 L14.5 26.5 Z', fill: '#4cb050' },
    ],
  },
  {
    id: 'fire',
    label: '火焰',
    category: 'decoration',
    shapes: [
      { d: 'M16 3.5 Q21 11 24 15 Q27.5 20 25.2 23.6 Q23 27.5 16 27.5 Q9 27.5 6.8 23.6 Q4.5 20 8 15 Q11 11 16 3.5 Z', fill: '#ff8b3d' },
      { d: 'M16 14 Q18.4 17.6 19.6 19.6 Q20.9 22 19.6 23.8 Q18.3 25.8 16 25.8 Q13.7 25.8 12.4 23.8 Q11.1 22 12.4 19.6 Q13.6 17.6 16 14 Z', fill: '#ffd166' },
    ],
  },
  {
    id: 'bulb',
    label: '灯泡',
    category: 'decoration',
    shapes: [
      { d: 'M6.50 14.00 A9.50 9.50 0 1 0 25.50 14.00 A9.50 9.50 0 1 0 6.50 14.00 Z', fill: '#f6be00' },
      { d: 'M12 23.5 L20 23.5 L19 26.5 L13 26.5 Z', fill: '#9aa4b2' },
      { d: 'M13 27.5 L19 27.5', stroke: '#9aa4b2', strokeWidth: 2 },
    ],
  },
  {
    id: 'check',
    label: '完成',
    category: 'symbol',
    shapes: [
      { d: 'M8 17.5 L13.8 23.5 L24.5 9.5', stroke: '#4cb050', strokeWidth: 4.2 },
    ],
  },
  {
    id: 'cross',
    label: '不通过',
    category: 'symbol',
    shapes: [
      { d: 'M10 10 L22.5 22.5 M22.5 10 L10 22.5', stroke: '#e5484d', strokeWidth: 4.2 },
    ],
  },
  {
    id: 'question',
    label: '疑问',
    category: 'symbol',
    shapes: [
      { d: 'M3.00 16.00 A13.00 13.00 0 1 0 29.00 16.00 A13.00 13.00 0 1 0 3.00 16.00 Z', fill: '#5b8cff' },
      { d: 'M12 12.7 Q12 8.8 16 8.8 Q20 8.8 20 12.4 Q20 15.4 16.4 16.6 L16.4 19.4', stroke: '#ffffff', strokeWidth: 2.6 },
      { d: 'M14.55 23.20 A1.75 1.75 0 1 0 18.05 23.20 A1.75 1.75 0 1 0 14.55 23.20 Z', fill: '#ffffff' },
    ],
  },
  {
    id: 'exclamation',
    label: '注意',
    category: 'symbol',
    shapes: [
      { d: 'M3.00 16.00 A13.00 13.00 0 1 0 29.00 16.00 A13.00 13.00 0 1 0 3.00 16.00 Z', fill: '#ff8b3d' },
      { d: 'M14.4 8.6 L17.6 8.6 L16.9 19.2 L15.1 19.2 Z', fill: '#ffffff' },
      { d: 'M14.25 23.30 A1.75 1.75 0 1 0 17.75 23.30 A1.75 1.75 0 1 0 14.25 23.30 Z', fill: '#ffffff' },
    ],
  },
  {
    id: 'crown',
    label: '皇冠',
    category: 'decoration',
    shapes: [
      { d: 'M5 24 L5 11 L10.5 15.5 L16 7 L21.5 15.5 L27 11 L27 24 Z', fill: '#f6be00' },
    ],
  },
  {
    id: 'gift',
    label: '礼物',
    category: 'decoration',
    shapes: [
      { d: 'M5.5 14 L26.5 14 L26.5 27 L5.5 27 Z', fill: '#e5484d' },
      { d: 'M14.4 14 L17.6 14 L17.6 27 L14.4 27 Z', fill: '#ffffff' },
      { d: 'M15.8 13 L9 13 Q6 13 7 10.2 Q8 7.6 11 9 Q14 10.4 15.8 13 Z', fill: '#f6be00' },
      { d: 'M16.2 13 L23 13 Q26 13 25 10.2 Q24 7.6 21 9 Q18 10.4 16.2 13 Z', fill: '#f6be00' },
    ],
  },]

/** 目录索引：id → 定义。未识别 id 返回 undefined（调用方据此跳过绘制）。 */
const STICKER_BY_ID = new Map(STICKER_DEFINITIONS.map((item) => [item.id, item]))

export function findStickerDefinition(stickerId: string): StickerDefinition | undefined {
  return STICKER_BY_ID.get(stickerId)
}
