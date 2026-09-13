/**
 * Tree Table（树型表格）布局引擎。
 *
 * 版式：**列 = 层级，行 = 叶子**。
 * - 每一层占一列，从左到右依次是中心主题、一级分支、二级分支……
 * - 每个叶子主题独占一行；有子节点的主题纵向**跨行合并**，高度覆盖其全部后代行。
 * - 边为单元格之间的水平连接线（父单元格右缘 → 子单元格左缘）。
 *
 * 这与 XMind 的「树型表格」一致：本质是「大纲 + 层级列」的可视化，
 * 适合把长文本、字段化的内容按层级排成表格阅读，而不是发散式导图。
 *
 * 折叠的分支按叶子处理（占一行，不展开后代），与其它布局引擎一致。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { MindMapLayoutOptions, MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import { computeLayoutBounds, estimateNodeSize } from './layout-utils'
import { footprintHalfHeight, type SubtreeFootprintResolver } from './mixed-structure'

/** 单元格统一宽度：表格需要列对齐，不能用内容自适应宽度。 */
const CELL_WIDTH = 200
const ROOT_CELL_WIDTH = 220
/** 列间距。 */
const COLUMN_GAP = 48
/** 行间距；单行高度由主题自身文本决定（见 MIN_CELL_HEIGHT）。 */
const ROW_GAP = 8
/** 单元格最小高度，也是单行叶子的基准高度。 */
const MIN_CELL_HEIGHT = 40
const SCENE_PADDING_X = 220
const SCENE_PADDING_Y = 140

/** 某一列的单元格宽度（中心主题列略宽）。 */
function cellWidthAt(depth: number): number {
  return depth === 0 ? ROOT_CELL_WIDTH : CELL_WIDTH
}

/** 各列中心的 x 坐标：由列宽与列间距累加得出，保证同列严格对齐。 */
function computeColumnCenters(maxDepth: number): number[] {
  const centers: number[] = []
  let cursor = 0
  for (let depth = 0; depth <= maxDepth; depth++) {
    const width = cellWidthAt(depth)
    centers.push(cursor + width / 2)
    cursor += width + COLUMN_GAP
  }
  return centers
}

interface RowSpan {
  /** 该子树在纵向上的顶边（世界坐标 y）。 */
  top: number
  /** 该子树在纵向上的底边。 */
  bottom: number
}

/**
 * 计算可见层级深度：折叠分支不展开，因此深度由可见路径决定。
 */
function visibleDepth(topic: TopicSnapshot, depth = 0): number {
  if (topic.collapsed || topic.children.length === 0) {
    return depth
  }
  return topic.children.reduce(
    (max, child) => Math.max(max, visibleDepth(child, depth + 1)),
    depth,
  )
}

export function computeTreeTableLayout(
  rootTopic: TopicSnapshot,
  options: MindMapLayoutOptions = {},
): MindMapLayoutResult {
  /** 该子树在整幅图里的真实层级（子树单独布局时由调用方给出）。 */
  const depthBase = options.depthBase ?? 0
  const footprint: SubtreeFootprintResolver | undefined = options.subtreeFootprint
  const maxDepth = visibleDepth(rootTopic)
  const columnCenters = computeColumnCenters(maxDepth)

  const nodes: MindMapNodeLayout[] = []
  const edges: MindMapLayoutResult['edges'] = []
  const nodeById = new Map<string, MindMapNodeLayout>()
  /**
   * 纵向游标。
   *
   * 行高不固定：一个叶子的高度由文本行数决定，所以单元格高度必须**自底向上**从子节点
   * 的真实顶/底边推导，而不是用「行号 × 固定行距」算。否则多行文本的叶子会溢出
   * 自己的行槽，父单元格的跨行高度覆盖不到它（曾因此让父底边短于子底边）。
   */
  let cursorY = 0

  /** 递归排布：先排完后代得到顶/底边，再让当前主题精确覆盖这段纵向区间。 */
  const place = (topic: TopicSnapshot, depth: number): RowSpan => {
    const override = footprint?.(topic.id)
    // 换过骨架的子树：按真实占地占一段行区间，**不再往下排**
    // （更深的层级由那份子布局自己排，塞进表格坐标系会错位）
    const children = topic.collapsed || override ? [] : topic.children
    const estimated = estimateNodeSize(topic, depth + depthBase)

    let top: number
    let bottom: number

    if (children.length === 0) {
      top = cursorY
      const contentHeight = override
        ? Math.max(estimated.height, footprintHalfHeight(override) * 2)
        : estimated.height
      bottom = cursorY + Math.max(MIN_CELL_HEIGHT, contentHeight)
      cursorY = bottom + ROW_GAP
    } else {
      const childSpans = children.map((child) => place(child, depth + 1))
      top = childSpans[0].top
      bottom = childSpans[childSpans.length - 1].bottom
      // 父主题自身文本过长时向下扩展，子区间仍被完整覆盖
      if (bottom - top < estimated.height) {
        bottom = top + estimated.height
      }
    }

    const height = bottom - top
    const node: MindMapNodeLayout = {
      id: topic.id,
      topic,
      depth: depth + depthBase,
      side: 'center',
      x: columnCenters[Math.min(depth, columnCenters.length - 1)],
      y: (top + bottom) / 2,
      width: cellWidthAt(depth),
      height,
    }

    nodes.push(node)
    nodeById.set(topic.id, node)

    for (const child of children) {
      const childNode = nodeById.get(child.id)
      if (!childNode) continue
      const startX = node.x + node.width / 2
      const endX = childNode.x - childNode.width / 2
      edges.push({
        id: `${node.id}-${childNode.id}`,
        parentId: node.id,
        childId: childNode.id,
        side: 'right',
        // 控制点取起止点 → 贝塞尔退化为直线，表格中呈现为干净的横线
        path: `M ${startX} ${node.y} L ${endX} ${childNode.y}`,
        start: { x: startX, y: node.y },
        end: { x: endX, y: childNode.y },
        control1: { x: startX, y: node.y },
        control2: { x: endX, y: childNode.y },
      })
    }

    return { top, bottom }
  }

  place(rootTopic, 0)

  const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
  return { nodes, edges, ...bounds }
}
