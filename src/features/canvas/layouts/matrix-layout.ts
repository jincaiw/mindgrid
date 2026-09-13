/**
 * Matrix Chart（矩阵图）布局引擎。
 *
 * 根主题作为左侧表头，一级子主题作为各列表头，
 * 其后代在对应列下纵向堆叠；列宽取该列所有节点最大宽度。
 */

import type { TopicSnapshot } from '../../../lib/document/types'
import type { MindMapLayoutOptions, MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'
import { computeLayoutBounds, estimateNodeSize } from './layout-utils'
import { footprintHalfHeight, type SubtreeFootprintResolver } from './mixed-structure'

const HEADER_GAP = 100
const ROW_GAP = 20
const COLUMN_GAP = 48
const SCENE_PADDING_X = 220
const SCENE_PADDING_Y = 140

/** 布局上下文：深度基准 + 子树足迹查询（见 layouts/mixed-structure）。 */
interface MatrixContext {
  depthBase: number
  footprint?: SubtreeFootprintResolver
}

interface ColumnCell {
  node: MindMapNodeLayout
  height: number
}

interface ColumnLayout {
  header: MindMapNodeLayout
  headerHeight: number
  columnWidth: number
  cells: ColumnCell[]
}

/** 深度优先收集某列下的所有后代节点（纵向平铺）。 */
function collectColumnCells(
  topic: TopicSnapshot,
  columnX: number,
  cells: ColumnCell[],
  ctx: MatrixContext,
) {
  for (const child of topic.children) {
    if (child.collapsed) {
      const size = estimateNodeSize(child, 2 + ctx.depthBase)
      cells.push({
        node: makeNode(child, 2 + ctx.depthBase, columnX, 0, size),
        height: size.height,
      })
      continue
    }

    appendSubtreeFlat(child, 2, columnX, cells, ctx)
  }
}

/** 将整个子树平铺进同一列（深度优先顺序）。 */
function appendSubtreeFlat(
  topic: TopicSnapshot,
  depth: number,
  columnX: number,
  cells: ColumnCell[],
  ctx: MatrixContext,
) {
  const size = estimateNodeSize(topic, depth + ctx.depthBase)
  cells.push({ node: makeNode(topic, depth + ctx.depthBase, columnX, 0, size), height: size.height })

  // 换过骨架的子树：占一格但按真实占地撑高，不再往下平铺
  // （更深的层级由那份子布局自己排，平铺进去会与它的坐标系冲突）
  const footprint = ctx.footprint?.(topic.id)
  if (footprint) {
    cells[cells.length - 1].height = footprintHalfHeight(footprint) * 2
    return
  }

  if (topic.collapsed) {
    return
  }

  for (const child of topic.children) {
    appendSubtreeFlat(child, depth + 1, columnX, cells, ctx)
  }
}

function makeNode(
  topic: TopicSnapshot,
  depth: number,
  x: number,
  y: number,
  size: { width: number; height: number },
): MindMapNodeLayout {
  return {
    id: topic.id,
    topic,
    depth,
    side: 'center',
    x,
    y,
    width: size.width,
    height: size.height,
  }
}

export function computeMatrixLayout(
  rootTopic: TopicSnapshot,
  options: MindMapLayoutOptions = {},
): MindMapLayoutResult {
  const ctx: MatrixContext = {
    depthBase: options.depthBase ?? 0,
    footprint: options.subtreeFootprint,
  }
  const rootSize = estimateNodeSize(rootTopic, ctx.depthBase)
  const rootNode = makeNode(rootTopic, ctx.depthBase, 0, 0, rootSize)
  const nodes: MindMapNodeLayout[] = [rootNode]
  const edges: MindMapLayoutResult['edges'] = []

  // 根节点折叠时仅呈现根主题（与其他布局引擎保持一致的边界行为）。
  if (rootTopic.collapsed) {
    const collapsedBounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
    return { nodes, edges, ...collapsedBounds }
  }

  const columns: ColumnLayout[] = []
  let cursorX = rootNode.width / 2 + HEADER_GAP

  for (const child of rootTopic.children) {
    const headerSize = estimateNodeSize(child, 1 + ctx.depthBase)
    const header = makeNode(child, 1 + ctx.depthBase, 0, 0, headerSize)
    const cells: ColumnCell[] = []

    if (!child.collapsed) {
      collectColumnCells(child, 0, cells, ctx)
    }

    // 列宽：表头与所有单元格的最大宽度
    let columnWidth = headerSize.width
    for (const cell of cells) {
      columnWidth = Math.max(columnWidth, cell.node.width)
    }

    // 统一列内所有节点的中心 x 与宽度（ XMind 矩阵列为等宽单元格块）
    header.x = cursorX + columnWidth / 2
    for (const cell of cells) {
      cell.node.x = cursorX + columnWidth / 2
      cell.node.width = columnWidth
    }

    columns.push({ header, headerHeight: headerSize.height, columnWidth, cells })
    cursorX += columnWidth + COLUMN_GAP
  }

  // 纵向排布：表头行 + 各列单元格堆叠
  const headerRowHeight = columns.reduce(
    (max, column) => Math.max(max, column.headerHeight),
    rootSize.height,
  )
  const headerY = 0
  rootNode.y = headerY
  for (const column of columns) {
    column.header.y = headerY
  }

  // 单元格从表头下方开始堆叠，取各列最大高度
  const cellsTop = headerY + headerRowHeight / 2 + ROW_GAP * 3
  let maxColumnBottom = cellsTop
  for (const column of columns) {
    let cursorY = cellsTop
    for (const cell of column.cells) {
      cell.node.y = cursorY + cell.height / 2
      cursorY += cell.height + ROW_GAP
    }
    maxColumnBottom = Math.max(maxColumnBottom, cursorY - ROW_GAP)
  }

  // 根节点垂直居中于整个内容区
  const contentCenterY = (headerY - headerRowHeight / 2 + maxColumnBottom) / 2
  rootNode.y = contentCenterY

  for (const column of columns) {
    nodes.push(column.header)

    // 根 → 列表头：水平直线
    edges.push({
      id: `${rootNode.id}-${column.header.id}`,
      parentId: rootNode.id,
      childId: column.header.id,
      side: 'right',
      path: `M ${rootNode.x + rootNode.width / 2} ${rootNode.y} L ${column.header.x - column.header.width / 2} ${column.header.y}`,
      start: { x: rootNode.x + rootNode.width / 2, y: rootNode.y },
      end: { x: column.header.x - column.header.width / 2, y: column.header.y },
      control1: { x: rootNode.x + rootNode.width / 2, y: rootNode.y },
      control2: { x: column.header.x - column.header.width / 2, y: column.header.y },
    })

    // 表头/单元格 → 下一单元格：垂直连线
    let previous = column.header
    for (const cell of column.cells) {
      nodes.push(cell.node)
      edges.push({
        id: `${previous.id}-${cell.node.id}`,
        parentId: previous.id,
        childId: cell.node.id,
        side: 'right',
        path: `M ${previous.x} ${previous.y + previous.height / 2} L ${cell.node.x} ${cell.node.y - cell.node.height / 2}`,
        start: { x: previous.x, y: previous.y + previous.height / 2 },
        end: { x: cell.node.x, y: cell.node.y - cell.node.height / 2 },
        control1: { x: previous.x, y: previous.y + previous.height / 2 },
        control2: { x: cell.node.x, y: cell.node.y - cell.node.height / 2 },
      })
      previous = cell.node
    }
  }

  const bounds = computeLayoutBounds(nodes, SCENE_PADDING_X, SCENE_PADDING_Y)
  return { nodes, edges, ...bounds }
}
