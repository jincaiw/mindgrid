import type { ChartType } from '../../lib/document/types'

/**
 * 骨架的中文名。
 *
 * 单一来源：骨架选择器（画布子页）与样式页的节点级「结构」下拉必须叫同一个名字，
 * 否则同一份文档在两处会显示成两种骨架。
 */
export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  mindmap: '思维导图',
  logic: '逻辑图',
  brace: '括号图',
  org: '组织结构图',
  tree: '树状图',
  timeline: '时间线',
  fishbone: '鱼骨图',
  treetable: '树型表格',
  matrix: '矩阵图',
  bubble: '气泡图',
}
