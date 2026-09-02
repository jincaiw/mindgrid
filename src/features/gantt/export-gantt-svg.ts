import {
  buildGanttDays,
  collectGanttDependencies,
  collectGanttTasks,
  computeGanttRange,
  GANTT_ZOOM_CONFIG,
  isTaskOverdue,
  normalizeToDay,
  type GanttTask,
  type GanttZoom,
} from './collect-gantt-tasks'
import type { DocumentSnapshot, TopicTaskStatus } from '../../lib/document/types'

/**
 * 甘特图 SVG 导出（批次 26，批次 27 支持粒度）。
 *
 * 把甘特图布局序列化为独立 SVG 字符串（粒度可指定，默认日粒度），复用视图同款
 * 纯函数（任务收集/范围/依赖路径），供桌面端「另存为 SVG / PNG」链路使用。
 * 全部几何为确定性计算，可在 Node 环境下直接测试。
 */
export interface GanttSvgMetrics {
  nameColumnWidth: number
  rowHeight: number
  headerHeight: number
}

export const GANTT_SVG_METRICS: GanttSvgMetrics = {
  nameColumnWidth: 240,
  rowHeight: 36,
  headerHeight: 32,
}

const STATUS_LABEL: Record<TopicTaskStatus, string> = {
  none: '任务',
  pending: '待办',
  started: '进行中',
  completed: '已完成',
}

const STATUS_COLOR: Record<TopicTaskStatus, string> = {
  none: '#8a8f98',
  pending: '#d97706',
  started: '#2D7FF9',
  completed: '#16a34a',
}

const COLORS = {
  text: '#1f2329',
  muted: '#8a8f98',
  border: '#e5e7eb',
  grid: '#f0f1f3',
  weekend: '#f3f4f6',
  today: '#2D7FF9',
  overdue: '#dc2626',
}

/** 依赖箭头拐弯前的水平伸出量（与视图一致）。 */
const DEP_ELBOW_PX = 10

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDayLabel(date: Date): string {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

/** 依赖箭头路径：前置右缘 → 水平伸出 → 垂直到后继行 → 后继左缘（时间轴坐标系）。 */
function buildDependencyPath(
  from: { endX: number; centerY: number },
  to: { startX: number; centerY: number },
): string {
  const elbowX = from.endX + DEP_ELBOW_PX
  const targetX = Math.max(to.startX - 4, elbowX)
  return `M ${from.endX} ${from.centerY} H ${elbowX} V ${to.centerY} H ${targetX}`
}

/** 根据粒度判断某天是否渲染日期标签（与视图一致：day 每日、week 每 7 天、month 仅每月 1 日）。 */
function shouldRenderDayLabel(date: Date, index: number, zoom: GanttZoom): boolean {
  const { labelEvery } = GANTT_ZOOM_CONFIG[zoom]
  if (labelEvery === 0) return date.getUTCDate() === 1
  return index % labelEvery === 0
}

/**
 * 把整份文档的甘特图渲染为独立 SVG。今天的时间戳与粒度可注入以便测试。
 * 返回的字符串可直接写入 .svg 文件或经 canvas 转 PNG。
 */
export function buildGanttSvg(
  document: DocumentSnapshot,
  todayMs = normalizeToDay(Date.now()),
  zoom: GanttZoom = 'day',
): string {
  const tasks = collectGanttTasks(document)
  const { nameColumnWidth: NAME_W, rowHeight: ROW_H, headerHeight: HEADER_H } = GANTT_SVG_METRICS
  const { dayWidth: DAY_W } = GANTT_ZOOM_CONFIG[zoom]
  const DAY_MS = 86_400_000

  if (tasks.length === 0) {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">',
      '<text x="24" y="60" font-size="14" fill="' + COLORS.muted + '">暂无可展示的任务</text>',
      '</svg>',
    ].join('\n')
  }

  const { rangeStartMs, totalDays } = computeGanttRange(tasks, todayMs)
  const days = buildGanttDays(rangeStartMs, totalDays)
  const timelineWidth = totalDays * DAY_W
  const dependencies = collectGanttDependencies(document)

  // 按画布分组（与视图一致的排序）
  const groupMap = new Map<string, { sheetId: string; sheetTitle: string; tasks: GanttTask[] }>()
  for (const task of tasks) {
    let group = groupMap.get(task.sheetId)
    if (!group) {
      group = { sheetId: task.sheetId, sheetTitle: task.sheetTitle, tasks: [] }
      groupMap.set(task.sheetId, group)
    }
    group.tasks.push(task)
  }
  const groups = [...groupMap.values()]
  for (const group of groups) {
    group.tasks.sort((a, b) => a.startDateMs - b.startDateMs || a.topicPath.localeCompare(b.topicPath))
  }

  const contentHeight = HEADER_H + groups.reduce((sum, g) => sum + ROW_H + g.tasks.length * ROW_H, 0)
  const totalWidth = NAME_W + timelineWidth
  const todayIndex = Math.round((todayMs - rangeStartMs) / DAY_MS)

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${contentHeight}" viewBox="0 0 ${totalWidth} ${contentHeight}" font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif">`,
  )

  // —— 左侧任务名列 ——
  parts.push(`<rect x="0" y="0" width="${NAME_W}" height="${contentHeight}" fill="#ffffff" />`)
  parts.push(`<text x="12" y="20" font-size="11" font-weight="700" fill="${COLORS.muted}">任务</text>`)

  // —— 时间轴区（整体平移 NAME_W）——
  parts.push(`<g transform="translate(${NAME_W}, 0)">`)

  // 表头：周末底纹 + 日标签 + 底线
  days.forEach((day, index) => {
    const weekday = day.getUTCDay()
    if (weekday === 0 || weekday === 6) {
      parts.push(`<rect x="${index * DAY_W}" y="0" width="${DAY_W}" height="${HEADER_H}" fill="${COLORS.weekend}" />`)
    }
    if (shouldRenderDayLabel(day, index, zoom)) {
      parts.push(
        `<text x="${index * DAY_W + DAY_W / 2}" y="20" font-size="9" text-anchor="middle" fill="${todayIndex === index ? COLORS.today : COLORS.muted}"${todayIndex === index ? ' font-weight="700"' : ''}>${formatDayLabel(day)}</text>`,
      )
    }
  })
  parts.push(`<rect x="0" y="${HEADER_H - 1}" width="${timelineWidth}" height="1" fill="${COLORS.border}" />`)

  // 竖向网格（逐日浅线）
  for (let i = 0; i <= totalDays; i += 1) {
    parts.push(`<rect x="${i * DAY_W}" y="${HEADER_H}" width="1" height="${contentHeight - HEADER_H}" fill="${COLORS.grid}" />`)
  }

  // 行：画布标题 + 任务条形
  const rowPositions = new Map<string, { startX: number; endX: number; centerY: number }>()
  let cursorY = HEADER_H
  for (const group of groups) {
    parts.push(`<text x="-232" y="${cursorY + 22}" font-size="12" font-weight="700" fill="${COLORS.text}">${escapeXml(group.sheetTitle)}</text>`)
    parts.push(`<rect x="0" y="${cursorY + ROW_H - 1}" width="${timelineWidth}" height="1" fill="${COLORS.border}" />`)
    cursorY += ROW_H
    for (const task of group.tasks) {
      const startOffset = Math.round((task.startDateMs - rangeStartMs) / DAY_MS)
      const spanDays = Math.max(1, Math.round((task.dueDateMs - task.startDateMs) / DAY_MS) + 1)
      const barLeft = startOffset * DAY_W + 2
      const barWidth = Math.max(DAY_W, spanDays * DAY_W - 4)
      const barY = cursorY + 9
      const overdue = isTaskOverdue(task, todayMs)

      parts.push(`<text x="-220" y="${cursorY + 23}" font-size="11" fill="${COLORS.text}">${escapeXml(task.topicPath)}</text>`)
      if (overdue) {
        parts.push(`<rect x="${barLeft - 2}" y="${barY - 2}" width="${barWidth + 4}" height="22" rx="11" fill="none" stroke="${COLORS.overdue}" stroke-width="1.5" />`)
      }
      parts.push(
        `<rect x="${barLeft}" y="${barY}" width="${barWidth}" height="18" rx="9" fill="${STATUS_COLOR[task.status]}" />`,
      )
      if (barWidth >= 44) {
        parts.push(
          `<text x="${barLeft + barWidth / 2}" y="${barY + 13}" font-size="10" font-weight="600" text-anchor="middle" fill="#ffffff">${STATUS_LABEL[task.status]}</text>`,
        )
      }

      rowPositions.set(task.topicId, {
        startX: barLeft,
        endX: barLeft + barWidth,
        centerY: cursorY + ROW_H / 2,
      })
      parts.push(`<rect x="0" y="${cursorY + ROW_H - 1}" width="${timelineWidth}" height="1" fill="${COLORS.grid}" />`)
      cursorY += ROW_H
    }
  }

  // 依赖箭头
  if (dependencies.length > 0) {
    parts.push(
      `<defs><marker id="gantt-svg-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="${COLORS.muted}" /></marker></defs>`,
    )
    for (const dep of dependencies) {
      const from = rowPositions.get(dep.fromTopicId)
      const to = rowPositions.get(dep.toTopicId)
      if (!from || !to) continue
      parts.push(
        `<path d="${buildDependencyPath(from, to)}" fill="none" stroke="${COLORS.muted}" stroke-width="1.5" marker-end="url(#gantt-svg-arrow)" />`,
      )
    }
  }

  // 今日标记
  if (todayIndex >= 0 && todayIndex < totalDays) {
    parts.push(
      `<rect x="${todayIndex * DAY_W + DAY_W / 2 - 1}" y="${HEADER_H}" width="2" height="${contentHeight - HEADER_H}" fill="${COLORS.today}" opacity="0.55" />`,
    )
  }

  parts.push('</g>')

  // 左列右侧分隔线 + 表头底线
  parts.push(`<rect x="${NAME_W - 1}" y="0" width="1" height="${contentHeight}" fill="${COLORS.border}" />`)
  parts.push('</svg>')

  return parts.join('\n')
}

/**
 * 把甘特图 SVG 字符串栅格化为 PNG 字节（批次 27）。
 * 浏览器/WebView 环境：Blob URL → Image → canvas（scale 倍采样）→ toBlob。
 * 依赖 DOM API，仅在桌面端运行时调用（与画布导出链路一致）。
 */
export async function renderGanttSvgToPngBytes(svgContent: string, scale = 2): Promise<Uint8Array> {
  const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('甘特图 SVG 渲染失败'))
      img.src = svgUrl
    })

    const width = image.naturalWidth || Number(/width="(\d+)"/.exec(svgContent)?.[1] ?? 0)
    const height = image.naturalHeight || Number(/height="(\d+)"/.exec(svgContent)?.[1] ?? 0)
    if (width <= 0 || height <= 0) {
      throw new Error('甘特图尺寸解析失败')
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法创建画布上下文')
    }
    // 白底填充（时间轴区域外不留透明背景）
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.scale(scale, scale)
    context.drawImage(image, 0, 0)

    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!pngBlob) {
      throw new Error('甘特图 PNG 编码失败')
    }
    return new Uint8Array(await pngBlob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
