/**
 * 布局调度器：根据图表类型选择对应布局引擎。
 *
 * 所有布局引擎返回统一的 MindMapLayoutResult 结构，
 * 使 Scene Builder / Canvas Renderer 无需感知具体图表类型。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { ChartType, TopicDirection } from '../../../lib/document/types'
import type { MindMapLayoutOptions, MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import { computeMindMapLayout, estimateNodeSize, resolveRootSideMap } from '../mindmap-layout'
import { computeLayoutBounds } from './layout-utils'
import {
  footprintAroundRoot,
  graftSubtreeLayout,
  mirrorLayoutHorizontally,
  type SubtreeFootprint,
} from './mixed-structure'
import { computeBraceLayout } from './brace-layout'
import { computeBubbleLayout } from './bubble-layout'
import { computeFishboneLayout } from './fishbone-layout'
import { computeLogicLayout } from './logic-layout'
import { computeMatrixLayout } from './matrix-layout'
import { computeOrgLayout } from './org-layout'
import { computeTimelineLayout } from './timeline-layout'
import { computeTreeLayout } from './tree-layout'
import { computeTreeTableLayout } from './tree-table-layout'

/** 单一骨架的引擎分派（不含混合骨架编排，供子布局复用）。 */
function runEngine(
  rootTopic: TopicSnapshot,
  chartType: ChartType | undefined,
  options: MindMapLayoutOptions,
): MindMapLayoutResult {
  switch (chartType) {
    case 'logic':
      return computeLogicLayout(rootTopic, options)
    case 'tree':
      return computeTreeLayout(rootTopic, options)
    case 'org':
      return computeOrgLayout(rootTopic, options)
    case 'fishbone':
      return computeFishboneLayout(rootTopic, options)
    case 'timeline':
      return computeTimelineLayout(rootTopic, options)
    case 'brace':
      return computeBraceLayout(rootTopic, options)
    case 'matrix':
      return computeMatrixLayout(rootTopic, options)
    case 'bubble':
      return computeBubbleLayout(rootTopic, options)
    case 'treetable':
      return computeTreeTableLayout(rootTopic, options)
    case 'mindmap':
    default:
      return computeMindMapLayout(rootTopic, options)
  }
}

/**
 * 一处节点级骨架覆盖：该主题的**子主题**改用 `chartType` 排布。
 */
interface OverrideSite {
  topic: TopicSnapshot
  chartType: ChartType
  /** 该主题在整幅图里的真实层级（子布局的深度基准）。 */
  depth: number
  /**
   * 最近的、包住它的覆盖站点 id。
   *
   * 用来决定这份子布局该嫁接进哪一层：有包住它的站点就嫁进那一层，
   * 没有就嫁进顶层布局。少了这个关系，嵌在另一处覆盖里的站点会被嫁到错误的坐标系里。
   */
  parentSiteId: string | null
}

/**
 * 收集全部节点级骨架覆盖站点（自顶向下，`chartType` 沿树继承）。
 *
 * 只在**有效骨架发生变化**的地方记为站点；同一种骨架继续往下不算新站点。
 */
function collectOverrideSites(
  topic: TopicSnapshot,
  inheritedType: ChartType,
  depth: number,
  enclosingSiteId: string | null,
  out: OverrideSite[],
): void {
  for (const child of topic.children) {
    const declared = child.structure?.chartType
    const own = declared ?? inheritedType
    if (declared && declared !== inheritedType) {
      out.push({ topic: child, chartType: own, depth: depth + 1, parentSiteId: enclosingSiteId })
      collectOverrideSites(child, own, depth + 1, child.id, out)
    } else {
      collectOverrideSites(child, own, depth + 1, enclosingSiteId, out)
    }
  }
}

/**
 * 子布局的脑图方向。
 *
 * 子布局是一个**独立坐标系**，脑图骨架里它的子主题会被左右平分——那会让分支
 * 越过中心主题长到另一侧去。所以要显式钉住朝向：
 * 1. 该主题自己声明了左右 → 听它的；
 * 2. 否则取它在父布局里所在分支的朝向（画布是脑图时由根分支分配规则决定）；
 * 3. 再否则向右（其它骨架都是左→右 / 上→下流动）。
 */
function resolveSubLayoutDirection(
  site: OverrideSite,
  rootTopic: TopicSnapshot,
  rootSideMap: Map<string, 'left' | 'right'> | null,
): TopicDirection {
  if (site.topic.structure?.direction) {
    return site.topic.structure.direction
  }
  if (!rootSideMap) {
    return 'right'
  }

  // 沿祖先链找最近的显式方向；没有就取一级分支的朝向
  const chain: TopicSnapshot[] = []
  const walk = (topic: TopicSnapshot): boolean => {
    chain.push(topic)
    for (const child of topic.children) {
      if (child.id === site.topic.id) {
        // 命中时也要把该主题本身放进链里，否则链里只剩祖先，
        // 一级分支的朝向就查不到了（会一律回落到"向右"）
        chain.push(child)
        return true
      }
      if (walk(child)) return true
    }
    chain.pop()
    return false
  }
  walk(rootTopic)

  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const declared = chain[i].structure?.direction
    if (declared === 'left' || declared === 'right') return declared
  }
  const branch = chain.find((topic) => rootSideMap.has(topic.id))
  return branch ? (rootSideMap.get(branch.id) as 'left' | 'right') : 'right'
}

/**
 * 根据图表类型计算布局。
 *
 * 除按骨架分派外，还负责**混合骨架**：任何主题都可以通过 `structure.chartType`
 * 把自己的子树换成另一种骨架（对齐 XMind 的节点级「结构」）。做法是自底向上：
 * 先把最深的覆盖子树单独算一遍，把它的**真实占地**登记为足迹，让外层骨架按足迹
 * 留白（否则会和兄弟分支重叠），算完再把子布局按「子根中心对齐」嫁接进去。
 *
 * @param rootTopic 根主题
 * @param chartType 图表类型，缺省为 mindmap
 * @param floatingTopics 浮动主题列表（可选）。浮动主题不参与树布局，
 *   坐标由 layoutHints.offsetX/offsetY 提供（根主题相对坐标）。
 */
export function computeLayout(
  rootTopic: TopicSnapshot,
  chartType: ChartType | undefined,
  floatingTopics?: TopicSnapshot[],
  options: MindMapLayoutOptions = {},
): MindMapLayoutResult {
  const effectiveType: ChartType = chartType ?? 'mindmap'

  const sites: OverrideSite[] = []
  collectOverrideSites(rootTopic, effectiveType, 0, null, sites)

  if (sites.length === 0) {
    // 无覆盖：与原行为逐像素一致（不注入足迹查询，减少无谓分支）
    return mergeFloatingTopics(runEngine(rootTopic, chartType, options), floatingTopics)
  }

  // 子布局的脑图方向要按「该分支在父布局里朝哪边」定；画布不是脑图时无此概念。
  const rootSideMap =
    effectiveType === 'mindmap' ? resolveRootSideMap(rootTopic, options, {}) : null

  const layouts = new Map<string, MindMapLayoutResult>()
  const footprints = new Map<string, SubtreeFootprint>()
  const resolveFootprint = (topicId: string) => footprints.get(topicId) ?? null

  // 自底向上：深的先算，父站点嫁接时需要子站点的布局已就绪
  for (const site of [...sites].sort((a, b) => b.depth - a.depth)) {
    if (site.topic.collapsed) continue

    const direction = resolveSubLayoutDirection(site, rootTopic, rootSideMap)
    const base = runEngine(site.topic, site.chartType, {
      ...options,
      depthBase: site.depth,
      direction,
      subtreeFootprint: resolveFootprint,
    })

    // 挂在左侧分支上的「向右/向下流动」骨架要镜像，否则子主题会朝中心主题生长。
    // 脑图骨架不需要：它的朝向已经由显式 direction 钉住了。
    if (direction === 'left' && site.chartType !== 'mindmap') {
      mirrorLayoutHorizontally(base)
    }

    // 嫁接本站点直接包住的那些子站点
    for (const child of sites) {
      if (child.parentSiteId !== site.topic.id) continue
      const sub = layouts.get(child.topic.id)
      if (sub) graftSubtreeLayout(base, sub, child.topic.id)
    }

    layouts.set(site.topic.id, base)
    const footprint = footprintAroundRoot(base, site.topic.id)
    if (footprint) footprints.set(site.topic.id, footprint)
  }

  const base = runEngine(rootTopic, chartType, {
    ...options,
    depthBase: 0,
    subtreeFootprint: resolveFootprint,
  })

  // 顶层只嫁接「没有被别的站点包住」的那些
  for (const site of sites) {
    if (site.parentSiteId !== null) continue
    const sub = layouts.get(site.topic.id)
    if (sub) graftSubtreeLayout(base, sub, site.topic.id)
  }

  return mergeFloatingTopics(base, floatingTopics)
}

/**
 * 将浮动主题合并到布局结果中。
 *
 * 浮动主题作为独立节点追加到 nodes 列表，不产生边（无父子连线）。
 * 坐标取自 layoutHints.offsetX/offsetY（根主题相对坐标系）。
 * 布局包围盒重新计算以包含浮动主题，保持与原布局相同的 padding。
 */
function mergeFloatingTopics(
  base: MindMapLayoutResult,
  floatingTopics?: TopicSnapshot[],
): MindMapLayoutResult {
  if (!floatingTopics || floatingTopics.length === 0) {
    return base
  }

  // 从原布局反推 padding：offsetX = paddingX - minX → paddingX = offsetX + minX
  let origMinX = Infinity
  let origMinY = Infinity
  for (const node of base.nodes) {
    origMinX = Math.min(origMinX, node.x - node.width / 2)
    origMinY = Math.min(origMinY, node.y - node.height / 2)
  }
  // 退化保护：空布局时使用经验值
  const paddingX = origMinX === Infinity ? 220 : base.offsetX + origMinX
  const paddingY = origMinY === Infinity ? 140 : base.offsetY + origMinY

  const floatingNodes: MindMapNodeLayout[] = floatingTopics.map((topic) => {
    const size = estimateNodeSize(topic, 0)
    return {
      id: topic.id,
      topic,
      depth: 0,
      side: 'center' as const,
      x: topic.layoutHints?.offsetX ?? 0,
      y: topic.layoutHints?.offsetY ?? 0,
      width: size.width,
      height: size.height,
    }
  })

  const allNodes = [...base.nodes, ...floatingNodes]
  const bounds = computeLayoutBounds(allNodes, paddingX, paddingY)

  return {
    nodes: allNodes,
    edges: base.edges,
    width: bounds.width,
    height: bounds.height,
    offsetX: bounds.offsetX,
    offsetY: bounds.offsetY,
  }
}

export { computeBraceLayout, computeBubbleLayout, computeFishboneLayout, computeLogicLayout, computeMatrixLayout, computeOrgLayout, computeTimelineLayout, computeTreeLayout }
