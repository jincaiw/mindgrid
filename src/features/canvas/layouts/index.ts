/**
 * 布局调度器：根据图表类型选择对应布局引擎。
 *
 * 所有布局引擎返回统一的 MindMapLayoutResult 结构，
 * 使 Scene Builder / Canvas Renderer 无需感知具体图表类型。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { ChartType } from '../../../lib/document/types'
import type { MindMapLayoutResult } from '../mindmap-layout'
import { computeMindMapLayout } from '../mindmap-layout'
import { computeFishboneLayout } from './fishbone-layout'
import { computeLogicLayout } from './logic-layout'
import { computeOrgLayout } from './org-layout'
import { computeTimelineLayout } from './timeline-layout'
import { computeTreeLayout } from './tree-layout'

/**
 * 根据图表类型计算布局。
 *
 * @param rootTopic 根主题
 * @param chartType 图表类型，缺省为 mindmap
 */
export function computeLayout(
  rootTopic: TopicSnapshot,
  chartType: ChartType | undefined,
): MindMapLayoutResult {
  switch (chartType) {
    case 'logic':
      return computeLogicLayout(rootTopic)
    case 'tree':
      return computeTreeLayout(rootTopic)
    case 'org':
      return computeOrgLayout(rootTopic)
    case 'fishbone':
      return computeFishboneLayout(rootTopic)
    case 'timeline':
      return computeTimelineLayout(rootTopic)
    case 'mindmap':
    default:
      return computeMindMapLayout(rootTopic)
  }
}

export { computeFishboneLayout, computeLogicLayout, computeOrgLayout, computeTimelineLayout, computeTreeLayout }
