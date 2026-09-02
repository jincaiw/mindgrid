import type { DocumentSnapshot, TopicSnapshot, TopicTaskStatus } from '../../lib/document/types'

/**
 * 甘特图数据模型（批次 23）。
 *
 * 从文档的全部画布收集带日期的任务，供甘特图视图渲染条形。
 * 日期沿用检查器的提交语义：date input 的 ISO 字符串经 `new Date(...)` 解析，
 * 即 UTC 当日 00:00 的毫秒时间戳；这里统一按"天"（86400000ms）归一化，
 * 与输入路径保持一致，避免本地时区换算引入的偏移。
 */
export interface GanttTask {
  topicId: string
  sheetId: string
  sheetTitle: string
  /** 从画布根主题到该主题的显示路径，如「项目 / 设计 / 原型」。 */
  topicPath: string
  status: TopicTaskStatus
  /** 条形起点（毫秒），归一化后不晚于 dueDateMs。 */
  startDateMs: number
  /** 条形终点（毫秒），归一化后不早于 startDateMs。 */
  dueDateMs: number
  priority?: number
}

const DAY_MS = 86_400_000

/** 按天归一化（UTC 日界），与 date input 的解析语义一致。 */
export function normalizeToDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS
}

function walkTopics(
  root: TopicSnapshot,
  sheetId: string,
  sheetTitle: string,
  parentPath: string,
  out: GanttTask[],
): void {
  const path = parentPath ? `${parentPath} / ${root.text}` : root.text
  const task = root.task
  if (task && (task.dueDateMs != null || task.startDateMs != null)) {
    // 缺省补全：仅有截止 → 单日条；仅有开始 → 单日条；start 晚于 due 时交换。
    const start = task.startDateMs ?? task.dueDateMs
    const due = task.dueDateMs ?? task.startDateMs
    if (start != null && due != null) {
      const startDateMs = Math.min(start, due)
      const dueDateMs = Math.max(start, due)
      out.push({
        topicId: root.id,
        sheetId,
        sheetTitle,
        topicPath: path,
        status: task.status,
        startDateMs: normalizeToDay(startDateMs),
        dueDateMs: normalizeToDay(dueDateMs),
        ...(task.priority != null ? { priority: task.priority } : {}),
      })
    }
  }
  for (const child of root.children) {
    walkTopics(child, sheetId, sheetTitle, path, out)
  }
}

/** 收集全文档（所有画布）中带日期的任务，顺序为画布顺序、主题树先序。 */
export function collectGanttTasks(document: DocumentSnapshot): GanttTask[] {
  const tasks: GanttTask[] = []
  for (const sheet of document.sheets) {
    walkTopics(sheet.rootTopic, sheet.id, sheet.title, '', tasks)
  }
  return tasks
}

/** 甘特图时间轴范围：任务极值向前后各留 2 天；无任务时以今天为中心的 15 天。 */
export function computeGanttRange(
  tasks: GanttTask[],
  todayMs: number,
): { rangeStartMs: number; rangeEndMs: number; totalDays: number } {
  if (tasks.length === 0) {
    const todayDay = normalizeToDay(todayMs)
    const rangeStartMs = todayDay - 7 * DAY_MS
    const rangeEndMs = todayDay + 7 * DAY_MS
    return { rangeStartMs, rangeEndMs, totalDays: 15 }
  }
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const task of tasks) {
    if (task.startDateMs < min) min = task.startDateMs
    if (task.dueDateMs > max) max = task.dueDateMs
  }
  const todayDay = normalizeToDay(todayMs)
  min = Math.min(min, todayDay)
  max = Math.max(max, todayDay)
  const rangeStartMs = min - 2 * DAY_MS
  const rangeEndMs = max + 2 * DAY_MS
  const totalDays = Math.round((rangeEndMs - rangeStartMs) / DAY_MS) + 1
  return { rangeStartMs, rangeEndMs, totalDays }
}

/** 生成时间轴每日信息（dayIndex 从 0 开始）。 */
export function buildGanttDays(rangeStartMs: number, totalDays: number): Date[] {
  const days: Date[] = []
  for (let i = 0; i < totalDays; i += 1) {
    days.push(new Date(rangeStartMs + i * DAY_MS))
  }
  return days
}

/** 甘特图缩放粒度（批次 24）：day=日列、week=周列、month=月列。 */
export type GanttZoom = 'day' | 'week' | 'month'

export interface GanttZoomConfig {
  /** 每天占用的像素宽度。 */
  dayWidth: number
  /** 每隔多少天渲染一个日期标签；0 表示仅在每月 1 日渲染标签。 */
  labelEvery: number
}

export const GANTT_ZOOM_CONFIG: Record<GanttZoom, GanttZoomConfig> = {
  day: { dayWidth: 32, labelEvery: 1 },
  week: { dayWidth: 12, labelEvery: 7 },
  month: { dayWidth: 5, labelEvery: 0 },
}

/** 判断任务是否逾期：未完成且截止日早于今天。 */
export function isTaskOverdue(task: GanttTask, todayMs: number): boolean {
  return task.status !== 'completed' && task.dueDateMs < todayMs
}

/** 拖拽换算：把条形整体平移 deltaDays 天（负值向前），返回新的起止毫秒。 */
export function applyGanttDragDelta(
  task: GanttTask,
  deltaDays: number,
): { startDateMs: number; dueDateMs: number } {
  if (deltaDays === 0) {
    return { startDateMs: task.startDateMs, dueDateMs: task.dueDateMs }
  }
  const offset = deltaDays * DAY_MS
  return { startDateMs: task.startDateMs + offset, dueDateMs: task.dueDateMs + offset }
}

/** 条形两端缩放模式：start=拖左缘改开始日期，end=拖右缘改截止日期。 */
export type GanttResizeMode = 'start' | 'end'

/**
 * 端缘缩放换算：仅改动被拖动的一端，并 clamp 至不越过对端日期。
 */
export function applyGanttResize(
  task: GanttTask,
  mode: GanttResizeMode,
  deltaDays: number,
): { startDateMs: number; dueDateMs: number } {
  if (deltaDays === 0) {
    return { startDateMs: task.startDateMs, dueDateMs: task.dueDateMs }
  }
  if (mode === 'end') {
    const dueDateMs = Math.max(task.dueDateMs + deltaDays * DAY_MS, task.startDateMs)
    return { startDateMs: task.startDateMs, dueDateMs }
  }
  const startDateMs = Math.min(task.startDateMs + deltaDays * DAY_MS, task.dueDateMs)
  return { startDateMs, dueDateMs: task.dueDateMs }
}

/** 依赖连线（批次 25）：复用文档关系线，表示前置 → 后继。 */
export interface GanttDependency {
  fromTopicId: string
  toTopicId: string
}

/** 收集文档中两端都存在的依赖（不过滤，渲染侧再按可见任务匹配）。 */
export function collectGanttDependencies(document: DocumentSnapshot): GanttDependency[] {
  return (document.relationships ?? []).map((rel) => ({
    fromTopicId: rel.fromTopicId,
    toTopicId: rel.toTopicId,
  }))
}

/** 依赖箭头拐弯前的水平伸出量。 */
const DEP_ELBOW_PX = 10

/** 依赖箭头路径：前置条形右缘 → 水平伸出 → 垂直到后继行 → 后继条形左缘。 */
export function buildDependencyPath(
  from: { endX: number; centerY: number },
  to: { startX: number; centerY: number },
): string {
  const elbowX = from.endX + DEP_ELBOW_PX
  const targetX = Math.max(to.startX - 4, elbowX)
  return `M ${from.endX} ${from.centerY} H ${elbowX} V ${to.centerY} H ${targetX}`
}
