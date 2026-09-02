import { describe, expect, it } from 'vitest'
import type { DocumentSnapshot, TopicSnapshot } from '../../lib/document/types'
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
  type GanttTask,
} from './collect-gantt-tasks'

const DAY_MS = 86_400_000

function makeTopic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

function makeDocument(sheets: { id: string; title: string; rootTopic: TopicSnapshot }[]): DocumentSnapshot {
  return {
    schemaVersion: '1.0.0',
    documentId: 'doc_1',
    revision: 1,
    activeSheetId: sheets[0]?.id ?? 'sheet_1',
    sheets,
  }
}

describe('normalizeToDay', () => {
  it('把任意时刻归一化到 UTC 当日 00:00', () => {
    const someTime = Date.UTC(2026, 8, 2, 15, 30, 45)
    expect(normalizeToDay(someTime)).toBe(Date.UTC(2026, 8, 2))
  })
})

describe('collectGanttTasks', () => {
  it('跨画布收集带日期任务并生成主题路径', () => {
    const day1 = Date.UTC(2026, 8, 1)
    const day3 = Date.UTC(2026, 8, 3)
    const doc = makeDocument([
      {
        id: 'sheet_1',
        title: '主画布',
        rootTopic: makeTopic('t_root', '项目', [
          makeTopic('t_design', '设计', [
            {
              ...makeTopic('t_proto', '原型'),
              task: { status: 'started', startDateMs: day1, dueDateMs: day3, priority: 2 },
            },
          ]),
        ]),
      },
      {
        id: 'sheet_2',
        title: '备份画布',
        rootTopic: makeTopic('t_root2', '归档', [
          { ...makeTopic('t_doc', '文档'), task: { status: 'pending', dueDateMs: day3 } },
        ]),
      },
    ])

    const tasks = collectGanttTasks(doc)
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({
      topicId: 't_proto',
      sheetId: 'sheet_1',
      sheetTitle: '主画布',
      topicPath: '项目 / 设计 / 原型',
      status: 'started',
      startDateMs: day1,
      dueDateMs: day3,
      priority: 2,
    })
    // 仅有截止日期：起点回填为截止日（单日条）
    expect(tasks[1]).toMatchObject({
      topicId: 't_doc',
      topicPath: '归档 / 文档',
      startDateMs: day3,
      dueDateMs: day3,
    })
    expect(tasks[1].priority).toBeUndefined()
  })

  it('开始晚于截止时交换起止；无日期任务跳过', () => {
    const day1 = Date.UTC(2026, 8, 1)
    const day5 = Date.UTC(2026, 8, 5)
    const doc = makeDocument([
      {
        id: 'sheet_1',
        title: '主画布',
        rootTopic: makeTopic('t_root', '项目', [
          { ...makeTopic('t_swap', '倒置'), task: { status: 'started', startDateMs: day5, dueDateMs: day1 } },
          { ...makeTopic('t_none', '无日期'), task: { status: 'pending' } },
          makeTopic('t_no_task', '没任务'),
        ]),
      },
    ])

    const tasks = collectGanttTasks(doc)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ topicId: 't_swap', startDateMs: day1, dueDateMs: day5 })
  })
})

describe('computeGanttRange', () => {
  it('无任务时以今天为中心返回 15 天', () => {
    const today = Date.UTC(2026, 8, 2)
    const range = computeGanttRange([], today)
    expect(range.totalDays).toBe(15)
    expect(range.rangeStartMs).toBe(today - 7 * DAY_MS)
  })

  it('有任务时覆盖任务极值并向前后各留 2 天（含今天）', () => {
    const start = Date.UTC(2026, 8, 1)
    const end = Date.UTC(2026, 8, 10)
    const today = Date.UTC(2026, 8, 5)
    const tasks = [
      { startDateMs: start, dueDateMs: end },
    ] as never[]
    const range = computeGanttRange(tasks, today)
    expect(range.rangeStartMs).toBe(start - 2 * DAY_MS)
    expect(range.rangeEndMs).toBe(end + 2 * DAY_MS)
    // 首尾含：8/30 → 9/12 = 14 天
    expect(range.totalDays).toBe(14)
  })

  it('今天超出任务范围时也纳入时间轴', () => {
    const start = Date.UTC(2026, 8, 1)
    const end = Date.UTC(2026, 8, 3)
    const today = Date.UTC(2026, 8, 20)
    const tasks = [{ startDateMs: start, dueDateMs: end }] as never[]
    const range = computeGanttRange(tasks, today)
    expect(range.rangeStartMs).toBe(start - 2 * DAY_MS)
    expect(range.rangeEndMs).toBe(today + 2 * DAY_MS)
  })
})

describe('buildGanttDays', () => {
  it('生成连续递增的日序列', () => {
    const days = buildGanttDays(Date.UTC(2026, 8, 1), 5)
    expect(days).toHaveLength(5)
    expect(days[0].getTime()).toBe(Date.UTC(2026, 8, 1))
    expect(days[4].getTime()).toBe(Date.UTC(2026, 8, 5))
  })
})

describe('GANTT_ZOOM_CONFIG', () => {
  it('三种粒度均有效且日粒度最宽', () => {
    expect(GANTT_ZOOM_CONFIG.day.dayWidth).toBeGreaterThan(GANTT_ZOOM_CONFIG.week.dayWidth)
    expect(GANTT_ZOOM_CONFIG.week.dayWidth).toBeGreaterThan(GANTT_ZOOM_CONFIG.month.dayWidth)
    expect(GANTT_ZOOM_CONFIG.day.labelEvery).toBe(1)
    // month 用 labelEvery=0 表示仅每月 1 日打标签
    expect(GANTT_ZOOM_CONFIG.month.labelEvery).toBe(0)
  })
})

describe('isTaskOverdue', () => {
  const today = Date.UTC(2026, 8, 2)

  it('未完成且截止早于今天 → 逾期', () => {
    const task = { status: 'started', dueDateMs: today - DAY_MS } as GanttTask
    expect(isTaskOverdue(task, today)).toBe(true)
  })

  it('已完成不逾期；截止今天及以后不逾期', () => {
    const done = { status: 'completed', dueDateMs: today - DAY_MS } as GanttTask
    const onTime = { status: 'pending', dueDateMs: today } as GanttTask
    expect(isTaskOverdue(done, today)).toBe(false)
    expect(isTaskOverdue(onTime, today)).toBe(false)
  })
})

describe('applyGanttDragDelta', () => {
  const task = {
    startDateMs: Date.UTC(2026, 8, 1),
    dueDateMs: Date.UTC(2026, 8, 3),
  } as GanttTask

  it('0 天时原样返回', () => {
    expect(applyGanttDragDelta(task, 0)).toEqual({ startDateMs: task.startDateMs, dueDateMs: task.dueDateMs })
  })

  it('整体平移起止日期，保持跨度不变', () => {
    const shifted = applyGanttDragDelta(task, 5)
    expect(shifted.startDateMs).toBe(task.startDateMs + 5 * DAY_MS)
    expect(shifted.dueDateMs).toBe(task.dueDateMs + 5 * DAY_MS)
    expect(shifted.dueDateMs - shifted.startDateMs).toBe(task.dueDateMs - task.startDateMs)
  })

  it('负值向前平移', () => {
    const shifted = applyGanttDragDelta(task, -2)
    expect(shifted.startDateMs).toBe(task.startDateMs - 2 * DAY_MS)
    expect(shifted.dueDateMs).toBe(task.dueDateMs - 2 * DAY_MS)
  })
})

describe('applyGanttResize', () => {
  const task = {
    startDateMs: Date.UTC(2026, 8, 1),
    dueDateMs: Date.UTC(2026, 8, 3),
  } as GanttTask

  it('拖右缘仅改截止日期', () => {
    const shifted = applyGanttResize(task, 'end', 4)
    expect(shifted.startDateMs).toBe(task.startDateMs)
    expect(shifted.dueDateMs).toBe(task.dueDateMs + 4 * DAY_MS)
  })

  it('拖左缘仅改开始日期', () => {
    const shifted = applyGanttResize(task, 'start', -3)
    expect(shifted.startDateMs).toBe(task.startDateMs - 3 * DAY_MS)
    expect(shifted.dueDateMs).toBe(task.dueDateMs)
  })

  it('clamp：右缘不早于开始、左缘不晚于截止', () => {
    const clampedEnd = applyGanttResize(task, 'end', -10)
    expect(clampedEnd.dueDateMs).toBe(task.startDateMs)
    const clampedStart = applyGanttResize(task, 'start', 10)
    expect(clampedStart.startDateMs).toBe(task.dueDateMs)
  })
})

describe('collectGanttDependencies', () => {
  it('映射关系线为依赖对，无关系线时为空', () => {
    const doc: DocumentSnapshot = {
      schemaVersion: '1.0.0',
      documentId: 'doc_1',
      revision: 1,
      activeSheetId: 'sheet_1',
      sheets: [],
      relationships: [
        { id: 'r1', fromTopicId: 'a', toTopicId: 'b' },
        { id: 'r2', fromTopicId: 'b', toTopicId: 'c' },
      ],
    } as DocumentSnapshot
    expect(collectGanttDependencies(doc)).toEqual([
      { fromTopicId: 'a', toTopicId: 'b' },
      { fromTopicId: 'b', toTopicId: 'c' },
    ])
    expect(collectGanttDependencies({ ...doc, relationships: undefined } as DocumentSnapshot)).toEqual([])
  })
})

describe('buildDependencyPath', () => {
  it('生成 前置右缘 → 垂直 → 后继左缘 的肘形路径', () => {
    const d = buildDependencyPath(
      { endX: 100, centerY: 20 },
      { startX: 200, centerY: 60 },
    )
    expect(d).toContain('M 100 20')
    expect(d).toContain('H 110')
    expect(d).toContain('V 60')
    expect(d).toContain('H 196')
  })

  it('后继早于前置结束时目标点不回退到拐点左侧', () => {
    const d = buildDependencyPath(
      { endX: 100, centerY: 20 },
      { startX: 50, centerY: 60 },
    )
    // targetX = max(50-4, 110) = 110
    expect(d).toContain('H 110')
  })
})
