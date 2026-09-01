/**
 * Marker 图标系统：画布与 Inspector 共用的标记定义与渲染。
 *
 * Marker ID 约定（参考 XMind marker 库的子集，足够覆盖 V1 常用场景）：
 * - `priority-1` … `priority-9`：优先级，1-3 红色系 / 4-6 橙黄系 / 7-9 蓝绿系
 * - `progress-0` / `progress-25` / `progress-50` / `progress-75` / `progress-100`：进度环
 * - `star` / `flag` / `people` / `check` / `question`：通用标记
 *
 * 未识别 ID 回退为通用圆点，保证前向兼容（用户/旧文档可能使用自定义 ID）。
 *
 * Inspector 的 MarkerSelector 通过 MARKER_DEFINITIONS 直接使用规范 ID，
 * 与画布 MarkerIcon 共享同一套渲染定义，确保 Inspector → 画布即时可见。
 */

import type { TopicMarker, TopicTask } from '../../lib/document/types'

export type MarkerCategory = 'priority' | 'progress' | 'flag'

export interface MarkerDefinition {
  id: string
  /** 显示名（用于 tooltip / Inspector 选项）。 */
  label: string
  category: MarkerCategory
}

/** 内置 marker 目录，顺序即选择器展示顺序。 */
export const MARKER_DEFINITIONS: readonly MarkerDefinition[] = [
  { id: 'priority-1', label: '优先级 1', category: 'priority' },
  { id: 'priority-2', label: '优先级 2', category: 'priority' },
  { id: 'priority-3', label: '优先级 3', category: 'priority' },
  { id: 'priority-4', label: '优先级 4', category: 'priority' },
  { id: 'priority-5', label: '优先级 5', category: 'priority' },
  { id: 'priority-6', label: '优先级 6', category: 'priority' },
  { id: 'priority-7', label: '优先级 7', category: 'priority' },
  { id: 'priority-8', label: '优先级 8', category: 'priority' },
  { id: 'priority-9', label: '优先级 9', category: 'priority' },
  { id: 'progress-0', label: '进度 0%', category: 'progress' },
  { id: 'progress-25', label: '进度 25%', category: 'progress' },
  { id: 'progress-50', label: '进度 50%', category: 'progress' },
  { id: 'progress-75', label: '进度 75%', category: 'progress' },
  { id: 'progress-100', label: '进度 100%', category: 'progress' },
  { id: 'star', label: '星标', category: 'flag' },
  { id: 'flag', label: '旗帜', category: 'flag' },
  { id: 'people', label: '人员', category: 'flag' },
  { id: 'check', label: '已完成', category: 'flag' },
  { id: 'question', label: '待确认', category: 'flag' },
] as const

const MARKER_LABEL_BY_ID = new Map(MARKER_DEFINITIONS.map((m) => [m.id, m.label]))

/** 取 marker 的显示名（优先 marker.label，回退到内置定义，再回退到 id）。 */
export function getMarkerLabel(marker: TopicMarker): string {
  return marker.label ?? MARKER_LABEL_BY_ID.get(marker.id) ?? marker.id
}

/** 优先级配色表（1-9），DOM 与 SVG 渲染共用。 */
export const PRIORITY_COLORS: readonly string[] = [
  '#e5484d', // 1 红
  '#f5484d', // 2
  '#ff8b3d', // 3 橙
  '#f6be00', // 4 黄
  '#cb9b00', // 5
  '#4cb050', // 6 绿
  '#0ea5e9', // 7 青
  '#5b8cff', // 8 蓝
  '#9b6bff', // 9 紫
]

/**
 * 渲染单个 marker 为内联 SVG（14×14）。
 * 用于 DOM 节点 meta 行；canvas-renderer/svg-renderer 各自有对应的绘制路径。
 */
export function MarkerIcon({ marker, size = 14 }: { marker: TopicMarker; size?: number }) {
  const { id } = marker
  const priorityMatch = /^priority-(\d+)$/.exec(id)
  if (priorityMatch) {
    const n = Math.min(9, Math.max(1, Number(priorityMatch[1])))
    const color = PRIORITY_COLORS[n - 1] ?? '#6b7280'
    return (
      <svg
        className="marker-icon"
        width={size}
        height={size}
        viewBox="0 0 14 14"
        aria-label={getMarkerLabel(marker)}
        role="img"
      >
        <circle cx="7" cy="7" r="6.5" fill={color} />
        <text
          x="7"
          y="7"
          fontSize="8"
          fontWeight="700"
          fill="#fff"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {n}
        </text>
      </svg>
    )
  }

  const progressMatch = /^progress-(\d+)$/.exec(id)
  if (progressMatch) {
    const pct = Math.min(100, Math.max(0, Number(progressMatch[1])))
    const color = pct === 100 ? '#34c759' : '#5b8cff'
    const slice = pct / 100
    return (
      <svg
        className="marker-icon"
        width={size}
        height={size}
        viewBox="0 0 14 14"
        aria-label={getMarkerLabel(marker)}
        role="img"
      >
        <circle cx="7" cy="7" r="6" fill="none" stroke="rgba(15,23,42,0.14)" strokeWidth="2" />
        <ProgressArc pct={slice} color={color} />
      </svg>
    )
  }

  // 通用单色图标：star / flag / people / check / question
  const glyph = GLYPHS[id] ?? GLYPHS.default
  return (
    <svg
      className="marker-icon"
      width={size}
      height={size}
      viewBox="0 0 14 14"
      aria-label={getMarkerLabel(marker)}
      role="img"
    >
      {glyph}
    </svg>
  )
}

/** 进度弧（基于 pct 绘制 0-100% 的扇形描边）。 */
function ProgressArc({ pct, color }: { pct: number; color: string }) {
  if (pct <= 0) return null
  if (pct >= 1) {
    return <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="2" />
  }
  const startAngle = -Math.PI / 2
  const endAngle = startAngle + pct * Math.PI * 2
  const x1 = 7 + 6 * Math.cos(startAngle)
  const y1 = 7 + 6 * Math.sin(startAngle)
  const x2 = 7 + 6 * Math.cos(endAngle)
  const y2 = 7 + 6 * Math.sin(endAngle)
  const largeArc = pct > 0.5 ? 1 : 0
  return (
    <path
      d={`M ${x1} ${y1} A 6 6 0 ${largeArc} 1 ${x2} ${y2}`}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  )
}

const GLYPHS: Record<string, React.ReactNode> = {
  star: (
    <path
      d="M7 1l1.8 3.7 4.1.6-3 2.9.7 4-3.7-1.9-3.7 1.9.7-4-3-2.9 4.1-.6z"
      fill="#f6be00"
    />
  ),
  flag: (
    <g fill="none" stroke="#e5484d" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 1.5v11" />
      <path d="M3.5 2.5h7l-1.5 2 1.5 2h-7" fill="#e5484d" fillOpacity="0.18" />
    </g>
  ),
  people: (
    <g fill="#5b8cff">
      <circle cx="5" cy="4.5" r="2" />
      <path d="M1.5 11.5a3.5 3.5 0 017 0z" />
      <circle cx="9.5" cy="5" r="1.6" fillOpacity="0.7" />
      <path d="M8 11.5a3 3 0 015 0z" fillOpacity="0.7" />
    </g>
  ),
  check: (
    <circle cx="7" cy="7" r="6" fill="#34c759">
      <path
        d="M4.5 7l1.8 1.8 3.2-3.6"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </circle>
  ),
  question: (
    <circle cx="7" cy="7" r="6" fill="#ff9f0a">
      <text
        x="7"
        y="7"
        fontSize="8"
        fontWeight="700"
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="central"
      >
        ?
      </text>
    </circle>
  ),
  default: <circle cx="7" cy="7" r="3" fill="#6b7280" />,
}

/**
 * 通用标记图标的 SVG 字符串（14×14 viewBox 内部元素），
 * 与 GLYPHS (JSX) 保持视觉一致；供 svg-renderer 嵌入导出 SVG。
 */
const GLYPHS_SVG: Record<string, string> = {
  star: '<path d="M7 1l1.8 3.7 4.1.6-3 2.9.7 4-3.7-1.9-3.7 1.9.7-4-3-2.9 4.1-.6z" fill="#f6be00"/>',
  flag: '<path d="M3.5 1.5v11" fill="none" stroke="#e5484d" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 2.5h7l-1.5 2 1.5 2h-7z" fill="#e5484d" fill-opacity="0.18" stroke="#e5484d" stroke-width="1.4" stroke-linejoin="round"/>',
  people: '<circle cx="5" cy="4.5" r="2" fill="#5b8cff"/><path d="M1.5 11.5a3.5 3.5 0 017 0z" fill="#5b8cff"/><circle cx="9.5" cy="5" r="1.6" fill="#5b8cff" fill-opacity="0.7"/><path d="M8 11.5a3 3 0 015 0z" fill="#5b8cff" fill-opacity="0.7"/>',
  check: '<circle cx="7" cy="7" r="6" fill="#34c759"/><path d="M4.5 7l1.8 1.8 3.2-3.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  question: '<circle cx="7" cy="7" r="6" fill="#ff9f0a"/><text x="7" y="7" font-size="8" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">?</text>',
  default: '<circle cx="7" cy="7" r="3" fill="#6b7280"/>',
}

/**
 * 返回单个 marker 的内部 SVG 字符串（14×14 viewBox 内部元素，不含 <svg> 包裹），
 * 供 svg-renderer 嵌入 `<g transform="translate(x,y) scale(s)">` 中。
 * 与 MarkerIcon (JSX) 共享同一套配色与图形定义，保证 DOM 与导出 SVG 视觉一致。
 */
export function markerToSvgInner(marker: TopicMarker): string {
  const { id } = marker
  const priorityMatch = /^priority-(\d+)$/.exec(id)
  if (priorityMatch) {
    const n = Math.min(9, Math.max(1, Number(priorityMatch[1])))
    const color = PRIORITY_COLORS[n - 1] ?? '#6b7280'
    return `<circle cx="7" cy="7" r="6.5" fill="${color}"/><text x="7" y="7" font-size="8" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">${n}</text>`
  }

  const progressMatch = /^progress-(\d+)$/.exec(id)
  if (progressMatch) {
    const pct = Math.min(100, Math.max(0, Number(progressMatch[1])))
    const color = pct === 100 ? '#34c759' : '#5b8cff'
    const track = '<circle cx="7" cy="7" r="6" fill="none" stroke="rgba(15,23,42,0.14)" stroke-width="2"/>'
    if (pct <= 0) return track
    if (pct >= 100) return `${track}<circle cx="7" cy="7" r="6" fill="none" stroke="${color}" stroke-width="2"/>`
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + (pct / 100) * Math.PI * 2
    const x1 = (7 + 6 * Math.cos(startAngle)).toFixed(2)
    const y1 = (7 + 6 * Math.sin(startAngle)).toFixed(2)
    const x2 = (7 + 6 * Math.cos(endAngle)).toFixed(2)
    const y2 = (7 + 6 * Math.sin(endAngle)).toFixed(2)
    const largeArc = pct > 50 ? 1 : 0
    return `${track}<path d="M ${x1} ${y1} A 6 6 0 ${largeArc} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`
  }

  return GLYPHS_SVG[id] ?? GLYPHS_SVG.default
}

/** 任务状态图标 SVG 字符串（14×14），与 TaskStatusIcon JSX 对齐。 */
export function taskStatusToSvgInner(status: TopicTask['status'], priority?: number): string {
  const p = typeof priority === 'number' ? Math.min(9, Math.max(1, priority)) : undefined
  const ringColor = p ? PRIORITY_COLORS[p - 1] ?? '#6b7280' : '#94a3b8'
  switch (status) {
    case 'completed':
      return '<circle cx="7" cy="7" r="6" fill="none" stroke="#34c759" stroke-width="2"/><path d="M4.5 7l1.8 1.8 3.2-3.6" fill="none" stroke="#34c759" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
    case 'started':
      return `<circle cx="7" cy="7" r="6" fill="none" stroke="${ringColor}" stroke-width="2"/><circle cx="7" cy="7" r="2.4" fill="${ringColor}"/>`
    case 'pending':
      return `<circle cx="7" cy="7" r="6" fill="none" stroke="${ringColor}" stroke-width="2"/>`
    default:
      return '<circle cx="7" cy="7" r="6" fill="none" stroke="#94a3b8" stroke-width="2"/>'
  }
}
