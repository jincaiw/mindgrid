import { useMemo, useRef, useState } from 'react'
import {
  applyGanttDragDelta,
  applyGanttResize,
  buildDependencyPath,
  buildGanttDays,
  collectGanttDependencies,
  collectGanttTasks,
  computeGanttRange,
  GANTT_ZOOM_CONFIG,
  isTaskOverdue,
  normalizeToDay,
  type GanttResizeMode,
  type GanttTask,
  type GanttZoom,
} from './collect-gantt-tasks'
import type { DocumentSession } from '../document/use-document-session'
import type { TopicTaskStatus } from '../../lib/document/types'

/**
 * 甘特图全屏视图（批次 23，批次 24/25 增强）。
 *
 * 对标 XMind 的 Gantt 视图：汇总全文档所有画布中带日期的任务，
 * 按画布分组展示 start→due 条形，支持今日标记、状态配色、逾期标记、
 * 日/周/月粒度切换、条形拖拽整体平移与两端缩放改时长（提交走 setTopicTask，可撤销），
 * 并按文档关系线绘制前置 → 后继依赖箭头。
 * 点击行选中对应主题，Esc 返回画布。
 */
interface GanttViewProps {
  session: DocumentSession
  selectedTopicIds: string[]
  onSelectedTopicIdsChange: (topicIds: string[]) => void
  onExit: () => void
}

const DAY_MS = 86_400_000
const ROW_HEIGHT = 36
const HEADER_HEIGHT = 32
/** 指针位移超过该像素才视为拖拽（区分点击选中）。 */
const DRAG_THRESHOLD_PX = 4

type DragMode = 'move' | GanttResizeMode

const STATUS_LABEL: Record<TopicTaskStatus, string> = {
  none: '任务',
  pending: '待办',
  started: '进行中',
  completed: '已完成',
}

const ZOOM_OPTIONS: { zoom: GanttZoom; label: string }[] = [
  { zoom: 'day', label: '日' },
  { zoom: 'week', label: '周' },
  { zoom: 'month', label: '月' },
]

function formatDayLabel(date: Date): string {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

/** 根据缩放粒度判断某天是否渲染日期标签。 */
function shouldRenderDayLabel(date: Date, index: number, zoom: GanttZoom): boolean {
  const { labelEvery } = GANTT_ZOOM_CONFIG[zoom]
  if (labelEvery === 0) return date.getUTCDate() === 1
  return index % labelEvery === 0
}

export function GanttView({ session, selectedTopicIds, onSelectedTopicIdsChange, onExit }: GanttViewProps) {
  const tasks = useMemo(
    () => (session.document ? collectGanttTasks(session.document) : []),
    [session.document],
  )
  // 固定“今天”，避免渲染期间跨日抖动
  const todayMs = useMemo(() => normalizeToDay(Date.now()), [])
  // 批次 24：日/周/月粒度切换
  const [zoom, setZoom] = useState<GanttZoom>('day')
  const { dayWidth } = GANTT_ZOOM_CONFIG[zoom]

  // 批次 24/25：条形拖拽（move=整体平移，start/end=端缘缩放）。
  const dragRef = useRef<{ topicId: string; startX: number; moved: boolean; mode: DragMode } | null>(null)
  const suppressClickRef = useRef(false)
  const [drag, setDrag] = useState<{ topicId: string; mode: DragMode; deltaDays: number } | null>(null)

  const { rangeStartMs, totalDays } = useMemo(() => computeGanttRange(tasks, todayMs), [tasks, todayMs])
  const days = useMemo(() => buildGanttDays(rangeStartMs, totalDays), [rangeStartMs, totalDays])

  // 批次 25：依赖连线（复用文档关系线）
  const dependencies = useMemo(
    () => (session.document ? collectGanttDependencies(session.document) : []),
    [session.document],
  )

  // 按画布分组（保持画布顺序），任务按开始日期排序
  const groups = useMemo(() => {
    const map = new Map<string, { sheetId: string; sheetTitle: string; tasks: GanttTask[] }>()
    for (const task of tasks) {
      let group = map.get(task.sheetId)
      if (!group) {
        group = { sheetId: task.sheetId, sheetTitle: task.sheetTitle, tasks: [] }
        map.set(task.sheetId, group)
      }
      group.tasks.push(task)
    }
    for (const group of map.values()) {
      group.tasks.sort((a, b) => a.startDateMs - b.startDateMs || a.topicPath.localeCompare(b.topicPath))
    }
    return [...map.values()]
  }, [tasks])

  const todayIndex = Math.round((todayMs - rangeStartMs) / DAY_MS)
  const timelineWidth = totalDays * dayWidth

  function handleSelect(task: GanttTask) {
    onSelectedTopicIdsChange([task.topicId])
    void session.selectTopic(task.topicId)
  }

  function beginDrag(event: React.PointerEvent<HTMLElement>, task: GanttTask, mode: DragMode) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { topicId: task.topicId, startX: event.clientX, moved: false, mode }
  }

  function handleDragMove(event: React.PointerEvent<HTMLElement>, task: GanttTask) {
    const current = dragRef.current
    if (!current || current.topicId !== task.topicId) return
    const deltaPx = event.clientX - current.startX
    if (Math.abs(deltaPx) < DRAG_THRESHOLD_PX) return
    current.moved = true
    const deltaDays = Math.round(deltaPx / dayWidth)
    setDrag((prev) =>
      prev && prev.topicId === task.topicId && prev.mode === current.mode && prev.deltaDays === deltaDays
        ? prev
        : { topicId: task.topicId, mode: current.mode, deltaDays },
    )
  }

  function handleDragUp(task: GanttTask) {
    const current = dragRef.current
    dragRef.current = null
    // pointerUp 已完成选中/提交，抑制随后的合成 click，避免双重触发
    suppressClickRef.current = true
    if (!current || current.topicId !== task.topicId) return
    const pending = drag
    setDrag(null)
    if (!current.moved || !pending || pending.deltaDays === 0) {
      // 未超过阈值：按点击选中处理
      handleSelect(task)
      return
    }
    const shifted =
      current.mode === 'move'
        ? applyGanttDragDelta(task, pending.deltaDays)
        : applyGanttResize(task, current.mode, pending.deltaDays)
    void session.setTopicTask(task.topicId, {
      status: task.status,
      ...(task.priority != null ? { priority: task.priority } : {}),
      startDateMs: shifted.startDateMs,
      dueDateMs: shifted.dueDateMs,
    })
  }

  if (!session.document || tasks.length === 0) {
    return (
      <div className="gantt-view gantt-view--empty" role="region" aria-label="甘特图视图">
        <div className="gantt-view__header">
          <div className="gantt-view__heading">
            <span className="gantt-view__badge">甘特图</span>
            <strong>暂无可展示的任务</strong>
          </div>
          <button type="button" className="gantt-view__exit" onClick={onExit}>
            返回画布（Esc）
          </button>
        </div>
        <p className="gantt-view__empty">
          在检查器「任务」区为主题设置开始/截止日期后，即可在此查看时间轴。
        </p>
      </div>
    )
  }

  // —— 渲染期计算：条形几何 + 行位置表（供依赖箭头使用）——
  const rowPositions = new Map<string, { startX: number; endX: number; centerY: number }>()
  let contentHeight = HEADER_HEIGHT
  for (const group of groups) {
    contentHeight += ROW_HEIGHT + group.tasks.length * ROW_HEIGHT
  }

  const renderBar = (task: GanttTask) => {
    const preview = drag && drag.topicId === task.topicId ? drag : null
    const shifted = preview
      ? preview.mode === 'move'
        ? applyGanttDragDelta(task, preview.deltaDays)
        : applyGanttResize(task, preview.mode, preview.deltaDays)
      : { startDateMs: task.startDateMs, dueDateMs: task.dueDateMs }
    const startOffset = Math.round((shifted.startDateMs - rangeStartMs) / DAY_MS)
    const spanDays = Math.max(1, Math.round((shifted.dueDateMs - shifted.startDateMs) / DAY_MS) + 1)
    const isSelected = selectedTopicIds.includes(task.topicId)
    const overdue = isTaskOverdue(task, todayMs)
    const barLeft = startOffset * dayWidth
    const barWidth = Math.max(dayWidth, spanDays * dayWidth - 4)
    rowPositions.set(task.topicId, {
      startX: barLeft,
      endX: barLeft + barWidth,
      // centerY 在行渲染时填充（此处尚未知行序），先占位
      centerY: 0,
    })
    return { shifted, isSelected, overdue, barLeft, barWidth, startOffset, spanDays }
  }

  return (
    <section
      className="gantt-view"
      role="region"
      aria-label="甘特图全屏视图"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onExit()
        }
      }}
    >
      <header className="gantt-view__header">
        <div className="gantt-view__heading">
          <span className="gantt-view__badge">甘特图</span>
          <strong>{groups.length} 个画布</strong>
          <span className="gantt-view__count">{tasks.length} 个任务</span>
        </div>
        <div className="gantt-view__legend" aria-hidden="true">
          <span className="gantt-view__legend-item"><i className="gantt-view__bar gantt-view__bar--pending" /> 待办</span>
          <span className="gantt-view__legend-item"><i className="gantt-view__bar gantt-view__bar--started" /> 进行中</span>
          <span className="gantt-view__legend-item"><i className="gantt-view__bar gantt-view__bar--completed" /> 已完成</span>
        </div>
        <div className="gantt-view__zoom" role="group" aria-label="时间轴粒度">
          {ZOOM_OPTIONS.map((option) => (
            <button
              key={option.zoom}
              type="button"
              className={`gantt-view__zoom-btn${zoom === option.zoom ? ' gantt-view__zoom-btn--active' : ''}`}
              onClick={() => setZoom(option.zoom)}
              aria-pressed={zoom === option.zoom}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="gantt-view__export"
          onClick={() => void session.exportGanttImage(zoom)}
          title="把甘特图另存为 SVG 矢量图（跟随当前粒度）"
        >
          导出 SVG
        </button>
        <button
          type="button"
          className="gantt-view__export"
          onClick={() => void session.exportGanttPng(zoom)}
          title="把甘特图另存为 PNG 图片（跟随当前粒度）"
        >
          导出 PNG
        </button>
        <button type="button" className="gantt-view__exit" onClick={onExit} title="返回画布（Esc）">
          返回画布
        </button>
      </header>

      <div className="gantt-view__body">
        <div className="gantt-view__names" style={{ width: 240 }}>
          <div className="gantt-view__names-header" style={{ height: HEADER_HEIGHT }}>任务</div>
          {groups.map((group) => (
            <div key={group.sheetId} className="gantt-view__sheet">
              <div className="gantt-view__sheet-title" style={{ height: ROW_HEIGHT }}>{group.sheetTitle}</div>
              {group.tasks.map((task) => {
                const isSelected = selectedTopicIds.includes(task.topicId)
                return (
                  <button
                    key={task.topicId}
                    type="button"
                    className={`gantt-view__task-name${isSelected ? ' gantt-view__task-name--selected' : ''}`}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => handleSelect(task)}
                    title={task.topicPath}
                  >
                    {task.topicPath}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="gantt-view__timeline-scroll">
          <div
            className={`gantt-view__timeline${drag ? ' gantt-view__timeline--dragging' : ''}`}
            style={{ width: timelineWidth }}
          >
            <div className="gantt-view__days" style={{ height: HEADER_HEIGHT }}>
              {days.map((day, index) => (
                <span
                  key={index}
                  className={`gantt-view__day${index === todayIndex ? ' gantt-view__day--today' : ''}${day.getUTCDay() === 0 || day.getUTCDay() === 6 ? ' gantt-view__day--weekend' : ''}`}
                  style={{ width: dayWidth }}
                >
                  {shouldRenderDayLabel(day, index, zoom) ? formatDayLabel(day) : ''}
                </span>
              ))}
            </div>
            {groups.map((group) => (
              <div key={group.sheetId} className="gantt-view__sheet">
                <div className="gantt-view__sheet-track" style={{ height: ROW_HEIGHT }} />
                {group.tasks.map((task) => {
                  const { isSelected, overdue, barLeft, barWidth } = renderBar(task)
                  return (
                    <div
                      key={task.topicId}
                      className={`gantt-view__row${isSelected ? ' gantt-view__row--selected' : ''}`}
                      style={{ height: ROW_HEIGHT }}
                    >
                      <button
                        type="button"
                        className={`gantt-view__bar gantt-view__bar--${task.status}${overdue ? ' gantt-view__bar--overdue' : ''}`}
                        style={{ left: barLeft, width: barWidth }}
                        onPointerDown={(e) => beginDrag(e, task, 'move')}
                        onPointerMove={(e) => handleDragMove(e, task)}
                        onPointerUp={() => handleDragUp(task)}
                        onClick={() => {
                          // 拖拽/点击已在 pointerUp 内处理；这里仅兜底键盘触发
                          if (suppressClickRef.current) {
                            suppressClickRef.current = false
                            return
                          }
                          handleSelect(task)
                        }}
                        title={`${task.topicPath} · ${STATUS_LABEL[task.status]} · ${formatDayLabel(new Date(task.startDateMs))} – ${formatDayLabel(new Date(task.dueDateMs))}${overdue ? ' · 已逾期' : ''}`}
                        aria-label={`${task.topicPath} ${STATUS_LABEL[task.status]}${overdue ? ' 已逾期' : ''}`}
                      >
                        {STATUS_LABEL[task.status]}
                      </button>
                      {/* 批次 25：两端缩放手柄（拖左缘改开始、拖右缘改截止） */}
                      <div
                        className="gantt-view__handle gantt-view__handle--start"
                        style={{ left: barLeft - 3 }}
                        onPointerDown={(e) => beginDrag(e, task, 'start')}
                        onPointerMove={(e) => handleDragMove(e, task)}
                        onPointerUp={() => handleDragUp(task)}
                        title="拖动调整开始日期"
                      />
                      <div
                        className="gantt-view__handle gantt-view__handle--end"
                        style={{ left: barLeft + barWidth - 5 }}
                        onPointerDown={(e) => beginDrag(e, task, 'end')}
                        onPointerMove={(e) => handleDragMove(e, task)}
                        onPointerUp={() => handleDragUp(task)}
                        title="拖动调整截止日期"
                      />
                    </div>
                  )
                })}
              </div>
            ))}
            {todayIndex >= 0 && todayIndex < totalDays ? (
              <div
                className="gantt-view__today-marker"
                style={{ left: todayIndex * dayWidth + dayWidth / 2, top: HEADER_HEIGHT }}
                aria-hidden="true"
              />
            ) : null}
            {/* 批次 25：依赖箭头（前置右缘 → 后继左缘的肘形折线） */}
            <svg
              className="gantt-view__deps"
              width={timelineWidth}
              height={contentHeight}
              aria-hidden="true"
            >
              <defs>
                <marker id="gantt-arrow-head" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0 0 L6 3 L0 6 z" className="gantt-view__dep-arrow-head" />
                </marker>
              </defs>
              {(() => {
                // 行位置：遍历顺序与上方渲染一致，可复用 rowPositions 的 startX/endX 并补 centerY
                let cursorY = HEADER_HEIGHT
                const paths: string[] = []
                for (const group of groups) {
                  cursorY += ROW_HEIGHT
                  for (const task of group.tasks) {
                    const pos = rowPositions.get(task.topicId)
                    if (pos) pos.centerY = cursorY + ROW_HEIGHT / 2
                    cursorY += ROW_HEIGHT
                  }
                }
                for (const dep of dependencies) {
                  const from = rowPositions.get(dep.fromTopicId)
                  const to = rowPositions.get(dep.toTopicId)
                  if (!from || !to || from.centerY === 0 || to.centerY === 0) continue
                  paths.push(buildDependencyPath(
                    { endX: from.endX, centerY: from.centerY },
                    { startX: to.startX, centerY: to.centerY },
                  ))
                }
                return paths.map((d, index) => (
                  <path
                    key={index}
                    d={d}
                    className="gantt-view__dep-path"
                    markerEnd="url(#gantt-arrow-head)"
                  />
                ))
              })()}
            </svg>
          </div>
        </div>
      </div>
    </section>
  )
}
