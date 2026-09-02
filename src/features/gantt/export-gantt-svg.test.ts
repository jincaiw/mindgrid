import { describe, expect, it } from 'vitest'
import type { DocumentSnapshot, TopicSnapshot } from '../../lib/document/types'
import { buildGanttSvg, GANTT_SVG_METRICS } from './export-gantt-svg'
import { computeGanttRange, collectGanttTasks, normalizeToDay } from './collect-gantt-tasks'

const DAY_MS = 86_400_000

function makeTopic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

const TODAY = Date.UTC(2026, 8, 2)

function makeDocument(
  rootTopic: TopicSnapshot,
  relationships?: DocumentSnapshot['relationships'],
): DocumentSnapshot {
  return {
    schemaVersion: '1.0.0',
    documentId: 'doc_1',
    revision: 1,
    activeSheetId: 'sheet_1',
    sheets: [{ id: 'sheet_1', title: '主画布', rootTopic }],
    ...(relationships ? { relationships } : {}),
  } as DocumentSnapshot
}

describe('buildGanttSvg', () => {
  it('无任务时输出占位 SVG', () => {
    const doc = makeDocument(makeTopic('t_root', '项目'))
    const svg = buildGanttSvg(doc, TODAY)
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('暂无可展示的任务')
  })

  it('按日粒度输出任务名、条形与状态标签', () => {
    const day1 = Date.UTC(2026, 8, 1)
    const day3 = Date.UTC(2026, 8, 3)
    const doc = makeDocument(
      makeTopic('t_root', '项目', [
        { ...makeTopic('t_a', '设计'), task: { status: 'started', startDateMs: day1, dueDateMs: day3 } },
      ]),
    )
    const svg = buildGanttSvg(doc, TODAY)

    const tasks = collectGanttTasks(doc)
    const { totalDays } = computeGanttRange(tasks, TODAY)
    const expectedWidth = GANTT_SVG_METRICS.nameColumnWidth + totalDays * 32 // 日粒度 dayWidth=32
    expect(svg).toContain(`width="${expectedWidth}"`)

    expect(svg).toContain('>项目 / 设计<')
    expect(svg).toContain('fill="#2D7FF9"') // started 状态条形
    expect(svg).toContain('>进行中<')
    expect(svg).toContain('>主画布<')
    // 今日标记（今天在任务范围内）
    expect(svg).toContain('opacity="0.55"')
  })

  it('逾期任务带红色描边；关系线渲染依赖箭头', () => {
    const doc = makeDocument(
      makeTopic('t_root', '项目', [
        {
          ...makeTopic('t_a', '逾期'),
          task: { status: 'pending', startDateMs: TODAY - 5 * DAY_MS, dueDateMs: TODAY - DAY_MS },
        },
        {
          ...makeTopic('t_b', '后继'),
          task: { status: 'pending', startDateMs: TODAY, dueDateMs: TODAY + 2 * DAY_MS },
        },
      ]),
      [{ id: 'r1', fromTopicId: 't_a', toTopicId: 't_b' }],
    )
    const svg = buildGanttSvg(doc, TODAY)
    expect(svg).toContain(`stroke="${'#dc2626'}"`)
    expect(svg).toContain('marker-end="url(#gantt-svg-arrow)"')
    expect(svg).toContain('M ')
  })

  it('文本经 XML 转义，防止特殊字符破坏结构', () => {
    const day = Date.UTC(2026, 8, 1)
    const doc = makeDocument(
      makeTopic('t_root', '项目', [
        { ...makeTopic('t_a', 'A<B>&"C"'), task: { status: 'started', startDateMs: day, dueDateMs: day } },
      ]),
    )
    const svg = buildGanttSvg(doc, TODAY)
    expect(svg).toContain('A&lt;B&gt;&amp;&quot;C&quot;')
    expect(svg).not.toContain('A<B>')
  })

  it('todayMs 缺省时取当前时间', () => {
    const today = normalizeToDay(Date.now())
    const doc = makeDocument(
      makeTopic('t_root', '项目', [
        { ...makeTopic('t_a', '任务'), task: { status: 'started', startDateMs: today, dueDateMs: today } },
      ]),
    )
    const svg = buildGanttSvg(doc)
    expect(svg).toContain('<svg')
    expect(svg).toContain('>任务<')
  })

  it('周/月粒度使用对应 dayWidth，月粒度仅每月 1 日打标签', () => {
    const day1 = Date.UTC(2026, 8, 1)
    const day20 = Date.UTC(2026, 8, 20)
    const doc = makeDocument(
      makeTopic('t_root', '项目', [
        { ...makeTopic('t_a', '任务'), task: { status: 'started', startDateMs: day1, dueDateMs: day20 } },
      ]),
    )
    const tasks = collectGanttTasks(doc)
    const { totalDays } = computeGanttRange(tasks, TODAY)

    const weekSvg = buildGanttSvg(doc, TODAY, 'week')
    expect(weekSvg).toContain(`width="${GANTT_SVG_METRICS.nameColumnWidth + totalDays * 12}"`)

    const monthSvg = buildGanttSvg(doc, TODAY, 'month')
    expect(monthSvg).toContain(`width="${GANTT_SVG_METRICS.nameColumnWidth + totalDays * 5}"`)
    // 9 月 1 日有标签，9 月 2 日无标签
    expect(monthSvg).toContain('>9/1<')
    expect(monthSvg).not.toContain('>9/2<')
  })
})
