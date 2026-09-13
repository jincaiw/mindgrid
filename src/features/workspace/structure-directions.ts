import type { ChartType, TopicDirection } from '../../lib/document/types'

export interface DirectionOption {
  /** 空串 = 不指定（自动 / 跟随分支）。 */
  value: TopicDirection | ''
  label: string
}

/**
 * 某种骨架**轴上**的方向选项（不含「不指定」那一项）。
 *
 * 不同骨架的轴不一样，所以选项也不同——这也是 XMind 结构下拉里
 * 「逻辑图（向左）」「组织结构图（向上）」「时间轴（垂直）」的由来：
 * 它们不是新骨架，而是同一骨架的方向变体。
 *
 * 返回空数组表示该骨架没有方向参数（气泡图、鱼骨图是整体版式），
 * 此时面板应把控件置灰并说明，而不是给一组点了没反应的按钮。
 */
export function axisDirectionOptions(
  chartType: ChartType | null | undefined,
): DirectionOption[] {
  switch (chartType) {
    case 'mindmap':
      return [
        { value: 'left', label: '向左' },
        { value: 'right', label: '向右' },
        { value: 'balanced', label: '平衡' },
      ]
    case 'logic':
    case 'brace':
    case 'matrix':
    case 'treetable':
      return [
        { value: 'right', label: '向右' },
        { value: 'left', label: '向左' },
      ]
    case 'org':
    case 'tree':
      return [
        { value: 'down', label: '向下' },
        { value: 'up', label: '向上' },
      ]
    case 'timeline':
      return [
        { value: 'right', label: '水平' },
        { value: 'down', label: '垂直' },
      ]
    default:
      return []
  }
}

/** 该骨架是否支持方向参数。 */
export function supportsDirection(chartType: ChartType | null | undefined): boolean {
  return axisDirectionOptions(chartType).length > 0
}

/** 节点级「子主题方向」选项：首项是「跟随分支」。 */
export function nodeDirectionOptions(
  chartType: ChartType | null | undefined,
): DirectionOption[] {
  return [{ value: '', label: '跟随分支' }, ...axisDirectionOptions(chartType)]
}

/** 画布级「结构方向」选项：首项是「自动」。 */
export function canvasDirectionOptions(
  chartType: ChartType | null | undefined,
): DirectionOption[] {
  return [{ value: '', label: '自动' }, ...axisDirectionOptions(chartType)]
}
