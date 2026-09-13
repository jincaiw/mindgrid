/**
 * 混合骨架：让「单个分支换一种骨架」落到几何上。
 *
 * XMind 允许整幅图是思维导图、而某个分支是组织结构图/逻辑图/括号图……
 * 实现分两步：
 *
 * 1. **留白**：父骨架在给某个子树分配空间时，用它的**真实占地**（足迹）而不是自己的
 *    估算——否则嫁接进来的子树会和兄弟分支叠在一起。
 * 2. **嫁接**：把子树用目标骨架单独算一遍，再把结果按「子根节点中心对齐到父布局中
 *    该主题的位置」平移后替换掉父骨架算出来的那部分后代。
 *
 * 这里只放纯几何工具；编排（谁换骨架、递归顺序）在 `layouts/index.ts`。
 * 这样 `layout-utils` 与各引擎可以自由引用本模块，不会和调度器形成循环依赖。
 */

import type { ChartType, TopicDirection, TopicSnapshot } from '../../../lib/document/types'
import type { MindMapLayoutResult, MindMapNodeLayout } from '../mindmap-layout'

/**
 * 子树相对「子根节点中心」的四向最大延伸（px）。
 *
 * 必须记四向而不是宽高：子根通常在子树的左上/顶部，内容并不对称。
 * 父骨架的槽位是**以子根中心为中心的对称块**，所以用量取大的一侧
 * （`max(up, down)` / `max(left, right)`）当半高/半宽，保证内容一定落在槽位内；
 * 代价是不对称子树会多留一点空白——比让邻居重叠好。
 */
export interface SubtreeFootprint {
  left: number
  right: number
  up: number
  down: number
}

/** 子树足迹查询：返回 null 表示该子树没有换骨架，父骨架按自己的估算走。 */
export type SubtreeFootprintResolver = (topicId: string) => SubtreeFootprint | null

/** 足迹的纵向半高（对称槽位用）。 */
export function footprintHalfHeight(footprint: SubtreeFootprint): number {
  return Math.max(footprint.up, footprint.down)
}

/** 足迹的横向半宽（对称槽位用）。 */
export function footprintHalfWidth(footprint: SubtreeFootprint): number {
  return Math.max(footprint.left, footprint.right)
}

/**
 * 把足迹折算成「叶子块」数（按纵向/横向两种口径）。
 *
 * 块状排布的骨架（思维导图 / 逻辑图 / 气泡图）用 `叶子数 × 块高` 留白，
 * 这里把真实占地换算成等价块数并按需取整；`Math.max(1, …)` 保证至少一块。
 */
export function footprintBlocks(halfExtent: number, blockSize: number): number {
  if (!Number.isFinite(halfExtent) || halfExtent <= 0) return 1
  return Math.max(1, Math.ceil((halfExtent * 2) / blockSize))
}

/**
 * 计算子布局中、以 `rootId` 节点中心为原点的四向延伸。
 *
 * 忽略场景 padding（只取节点包围盒），否则子布局的边距会被当成内容算进去，
 * 槽位会被无谓撑大。
 */
export function footprintAroundRoot(
  layout: MindMapLayoutResult,
  rootId: string,
): SubtreeFootprint | null {
  const root = layout.nodes.find((node) => node.id === rootId)
  if (!root) return null

  let left = 0
  let right = 0
  let up = 0
  let down = 0

  for (const node of layout.nodes) {
    if (node.id === root.id) continue
    left = Math.max(left, root.x - (node.x - node.width / 2))
    right = Math.max(right, node.x + node.width / 2 - root.x)
    up = Math.max(up, root.y - (node.y - node.height / 2))
    down = Math.max(down, node.y + node.height / 2 - root.y)
  }

  return { left, right, up, down }
}

/** 收集某主题子树下的全部主题 id（含自身）。 */
export function collectSubtreeIds(topic: TopicSnapshot, out = new Set<string>()): Set<string> {
  out.add(topic.id)
  for (const child of topic.children) {
    collectSubtreeIds(child, out)
  }
  return out
}

/**
 * 水平镜像一份布局（原地修改）。
 *
 * 逻辑图/括号图/矩阵图/树型表格/时间线都是**向右（或向下）流动**的骨架，
 * 把它们原样挂在左侧分支上，子主题会朝中心主题的方向生长、直接压到中心主题。
 * 镜像后它们朝左生长，也就是"朝外"，与所在分支一致。
 *
 * 节点坐标取反即可；连线的四个端点同样取反；`side` 一并交换，
 * 否则端点装饰（圆点/箭头）会落在错误的一端。
 */
export function mirrorLayoutHorizontally(layout: MindMapLayoutResult): void {
  for (const node of layout.nodes) {
    node.x = -node.x
    if (node.side === 'left') node.side = 'right'
    else if (node.side === 'right') node.side = 'left'
  }

  for (const edge of layout.edges) {
    edge.start = { x: -edge.start.x, y: edge.start.y }
    edge.end = { x: -edge.end.x, y: edge.end.y }
    edge.control1 = { x: -edge.control1.x, y: edge.control1.y }
    edge.control2 = { x: -edge.control2.x, y: edge.control2.y }
    edge.side = edge.side === 'left' ? 'right' : 'left'
  }
}

/**
 * 垂直镜像一份布局（原地修改）：组织结构图/树形图的「向上」变体。
 *
 * `side` 不动——上下方向不改变节点在左右意义上的归属，
 * 改了反而会让折叠按钮跳到错误的一边。
 */
export function mirrorLayoutVertically(layout: MindMapLayoutResult): void {
  for (const node of layout.nodes) {
    node.y = -node.y
  }

  for (const edge of layout.edges) {
    edge.start = { x: edge.start.x, y: -edge.start.y }
    edge.end = { x: edge.end.x, y: -edge.end.y }
    edge.control1 = { x: edge.control1.x, y: -edge.control1.y }
    edge.control2 = { x: edge.control2.x, y: -edge.control2.y }
  }
}

/**
 * 转置一份布局（原地修改）：时间线的「垂直」变体。
 *
 * 时间线本来是「根在左、事件沿水平轴向右排、子事件挂在下边」，
 * 交换 X/Y 之后就变成「根在上、事件沿垂直轴向下排、子事件挂在右边」，
 * 正是竖直时间轴。节点宽高要一起换，否则方块会变成竖条。
 *
 * `side` 统一落到 `center`：转置后"左/右分支"不再有左右含义，
 * 保留原值会让折叠按钮贴在错误的边（`center` 是贴下缘，符合上下流动）。
 */
export function transposeLayout(layout: MindMapLayoutResult): void {
  for (const node of layout.nodes) {
    const x = node.x
    node.x = node.y
    node.y = x
    const width = node.width
    node.width = node.height
    node.height = width
    node.side = 'center'
  }

  const swap = (point: { x: number; y: number }) => ({ x: point.y, y: point.x })
  for (const edge of layout.edges) {
    edge.start = swap(edge.start)
    edge.end = swap(edge.end)
    edge.control1 = swap(edge.control1)
    edge.control2 = swap(edge.control2)
  }
}

/** 方向 → 几何变换。 */
export type LayoutVariantTransform = 'mirror-x' | 'mirror-y' | 'transpose'

/**
 * 某种骨架对某个方向该做哪种变换（不该做就返回 null）。
 *
 * 各骨架只认自己轴上的方向，别的方向**安静忽略**而不是报错——
 * 用户在一张脑图上把某个组织结构图分支的方向设成"向左"时，
 * 合理的表现是"这个参数对它没意义"，不是弹错。
 *
 * 脑图不在表内：它的左右由布局引擎自己处理（要按行分配左右两侧），
 * 事后镜像会把两侧一起翻过去，反而错。
 */
export function resolveVariantTransform(
  chartType: ChartType,
  direction: TopicDirection | undefined,
): LayoutVariantTransform | null {
  if (!direction || direction === 'balanced') return null

  switch (chartType) {
    case 'logic':
    case 'brace':
    case 'matrix':
    case 'treetable':
      return direction === 'left' ? 'mirror-x' : null
    case 'timeline':
      if (direction === 'left') return 'mirror-x'
      return direction === 'down' ? 'transpose' : null
    case 'org':
    case 'tree':
      return direction === 'up' ? 'mirror-y' : null
    default:
      return null
  }
}

/** 按方向应用骨架变体变换（无对应变换时原样返回）。 */
export function applyDirectionVariant(
  layout: MindMapLayoutResult,
  chartType: ChartType,
  direction: TopicDirection | undefined,
): void {
  const transform = resolveVariantTransform(chartType, direction)
  if (transform === 'mirror-x') mirrorLayoutHorizontally(layout)
  else if (transform === 'mirror-y') mirrorLayoutVertically(layout)
  else if (transform === 'transpose') transposeLayout(layout)
}

function translateEdge(
  edge: MindMapLayoutResult['edges'][number],
  dx: number,
  dy: number,
): MindMapLayoutResult['edges'][number] {
  return {
    ...edge,
    start: { x: edge.start.x + dx, y: edge.start.y + dy },
    end: { x: edge.end.x + dx, y: edge.end.y + dy },
    control1: { x: edge.control1.x + dx, y: edge.control1.y + dy },
    control2: { x: edge.control2.x + dx, y: edge.control2.y + dy },
  }
}

/**
 * 把子骨架算出的子树嫁接进父布局（**原地修改** `base`）。
 *
 * 规则：
 * - 子布局根节点（`rootId`）**不替换**——父布局那个节点的位置与尺寸才是它在该骨架里的正确定位。
 * - 子布局里除根节点以外的所有节点/边，按「子根中心对齐到父布局同 id 节点中心」平移后追加。
 * - 父布局里属于这些后代的旧节点/旧连线先删掉，否则会残留一份旧骨架的几何。
 *
 * 边 id 是 `${parent}-${child}`：旧的后代连线已随之删除，所以不会和追加进来的撞号。
 */
export function graftSubtreeLayout(
  base: MindMapLayoutResult,
  sub: MindMapLayoutResult,
  rootId: string,
): boolean {
  const baseRoot = base.nodes.find((node) => node.id === rootId)
  const subRoot = sub.nodes.find((node) => node.id === rootId)
  if (!baseRoot || !subRoot) return false

  const graftIds = new Set(sub.nodes.map((node) => node.id))
  graftIds.delete(rootId)
  if (graftIds.size === 0) return false

  const dx = baseRoot.x - subRoot.x
  const dy = baseRoot.y - subRoot.y

  const keptNodes = base.nodes.filter((node) => !graftIds.has(node.id))
  const keptEdges = base.edges.filter((edge) => !graftIds.has(edge.childId))

  const graftedNodes: MindMapNodeLayout[] = sub.nodes
    .filter((node) => graftIds.has(node.id))
    .map((node) => ({ ...node, x: node.x + dx, y: node.y + dy }))

  const graftedEdges = sub.edges
    .filter((edge) => graftIds.has(edge.childId))
    .map((edge) => translateEdge(edge, dx, dy))

  base.nodes = [...keptNodes, ...graftedNodes]
  base.edges = [...keptEdges, ...graftedEdges]
  return true
}
