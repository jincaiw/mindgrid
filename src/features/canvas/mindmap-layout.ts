import type { TopicSnapshot } from '../../lib/document/types'
import {
  footprintBlocks,
  footprintHalfHeight,
  type SubtreeFootprintResolver,
} from './layouts/mixed-structure'
import { getFontScale } from './runtime/style-constants'
import { TOPIC_IMAGE_BLOCK, TOPIC_IMAGE_MIN_WIDTH } from './runtime/topic-image-constants'

type LayoutSide = 'left' | 'right' | 'center'

interface SubtreeMetrics {
  leafCount: number
}

/** 纵向留白度量所需的上下文：叶子块高度 + 子树足迹查询。 */
interface BlockContext {
  /**
   * 子树足迹查询：命中表示该子树已换骨架（见 layouts/mixed-structure），
   * 此时按它的**真实占地**折算块数，并且不再往下钻（最近的覆盖说了算）。
   */
  footprint?: SubtreeFootprintResolver
  leafBlock: number
}

export interface MindMapNodeLayout {
  id: string
  topic: TopicSnapshot
  depth: number
  side: LayoutSide
  x: number
  y: number
  width: number
  height: number
}

export interface MindMapEdgeLayout {
  id: string
  parentId: string
  childId: string
  side: Exclude<LayoutSide, 'center'>
  path: string
  /** 贝塞尔曲线几何，供 Canvas 2D 渲染器直接使用（无需解析 SVG path）。 */
  start: { x: number; y: number }
  end: { x: number; y: number }
  control1: { x: number; y: number }
  control2: { x: number; y: number }
}

export interface MindMapLayoutOptions {
  compact?: boolean
  balance?: boolean
  alignSiblings?: boolean
  /**
   * 主题层叠：允许主题互相重叠。
   *
   * 默认 true（与 XMind 默认勾选一致）＝不干预，用户放哪就哪；
   * 显式 false 时，分支自由布局下**被摆放过的**分支会避开上方主题自动下移。
   */
  stackTopics?: boolean
  /** 层叠关闭时主题之间的最小纵向间隙（px），缺省 VERTICAL_GAP。内部/测试用。 */
  stackGap?: number
  /**
   * 分支自由布局：一级分支若带 layoutHints.offsetX/offsetY，就按存的坐标摆放
   * （不再走自动纵向分配），其子树整体跟随。对应画布设置 `canvas.freeBranchLayout`。
   */
  freeBranch?: boolean
  /**
   * 分支方向（来自画布 layoutConfig.direction）：
   * - left：根的所有直接子分支放左侧
   * - right：根的所有直接子分支放右侧
   * - balanced/undefined：按 balance 选项或默认交替分配
   */
  direction?: 'left' | 'right' | 'balanced'
  /**
   * 深度基准：本次布局的根主题在**整幅图**里的真实层级。
   *
   * 子树换骨架时要单独把该子树算一遍，此时它的根是这次调用的根，但它在整幅图里
   * 并不是 depth 0（不该套用中心主题的字号/内边距）。所有引擎都只在
   * 「取节点尺寸」和「写 node.depth」两处加上这个基准，内部几何仍用相对层级。
   */
  depthBase?: number
  /**
   * 子树足迹查询：返回该子树换骨架后的真实占地（见 layouts/mixed-structure）。
   * 由 `computeLayout` 在存在节点级骨架覆盖时注入；缺省 null 表示不预留。
   */
  subtreeFootprint?: SubtreeFootprintResolver
}

export interface MindMapLayoutResult {
  nodes: MindMapNodeLayout[]
  edges: MindMapEdgeLayout[]
  width: number
  height: number
  offsetX: number
  offsetY: number
}

// 中心→一级、以及层间的水平间距（节点中心距）。
// 节点尺寸按 XMind 实机量出来的值调大后，原来 160/120 会让分支贴到中心主题上，
// 这里一并放宽，保持 XMind 那种疏朗的分支间距。
/** 节点固定宽度（样式页「宽度」）的可设范围，防止极端值把布局撑坏。 */
export const MIN_FIXED_WIDTH = 60
export const MAX_FIXED_WIDTH = 800

const ROOT_HORIZONTAL_GAP = 210
const DEPTH_HORIZONTAL_GAP = 150
const VERTICAL_GAP = 18
const LEAF_BLOCK = 80
const SCENE_PADDING_X = 220
const SCENE_PADDING_Y = 140
// 主题图片尺寸常量统一来自 runtime/topic-image-constants.ts：
// 布局估算、DOM 样式、三端导出必须引用同一组值，否则图片位置会漂移。

/**
 * 估算节点尺寸。
 *
 * 尺寸口径与 `style-constants` 的字号/内边距一致，且与 DOM 的 CSS padding 对齐：
 *   height = 上下内边距 × 2 + 行数 × 行高
 *   width  = clamp(文本宽 + 左右内边距 × 2, 最小宽, 最大宽)
 *
 * 这套数值是按 XMind 实机截图量出来的（中心主题约 168×72、一级分支约 112×41），
 * 早期版本只有"上方偏移"没有下方内边距，节点显得又扁又宽。
 */
function nodeMetrics(depth: number) {
  if (depth === 0) {
    return { fontSize: 20, lineHeight: 27, padX: 22, padY: 20, minW: 160, maxW: 320, charW: 19 }
  }
  if (depth === 1) {
    return { fontSize: 14, lineHeight: 19, padX: 14, padY: 11, minW: 100, maxW: 250, charW: 13 }
  }
  return { fontSize: 13, lineHeight: 18, padX: 12, padY: 9, minW: 90, maxW: 220, charW: 12 }
}

export function estimateNodeSize(topic: TopicSnapshot, depth: number) {
  const textLength = topic.text.trim().length || 1
  const m = nodeMetrics(depth)
  // 字号覆盖 → 字宽与行高按同一比例缩放，否则大字号会溢出节点框。
  // 未覆盖时比例为 1，几何与历史完全一致（见 style-constants.getFontScale）。
  const fontScale = getFontScale(topic.styleOverrides?.fontSize, m.fontSize)
  const charW = m.charW * fontScale
  const lineHeight = Math.round(m.lineHeight * fontScale)
  // 节点级固定宽度（XMind 样式页的「宽度」）：设了就照用，不再按文字自适应；
  // 未设时维持自适应，行为与历史一致。
  const fixedWidth = topic.styleOverrides?.width
  const width =
    typeof fixedWidth === 'number' && fixedWidth > 0
      ? Math.min(MAX_FIXED_WIDTH, Math.max(MIN_FIXED_WIDTH, Math.round(fixedWidth)))
      : Math.min(m.maxW, Math.max(m.minW, Math.round(textLength * charW + m.padX * 2)))
  const usable = Math.max(1, width - m.padX * 2)
  const lineCount = Math.max(1, Math.ceil((textLength * charW) / usable))
  const height = m.padY * 2 + lineCount * lineHeight

  if (topic.image) {
    return {
      width: Math.max(width, TOPIC_IMAGE_MIN_WIDTH),
      height: height + TOPIC_IMAGE_BLOCK,
    }
  }

  return { width, height }
}

function measureSubtree(topic: TopicSnapshot, ctx: BlockContext): SubtreeMetrics {
  // 换过骨架的子树：按真实占地折算等价块数，**不再往下钻**——
  // 更深的覆盖已经被这次子树布局自己消化，父骨架看到的就是一个黑盒。
  const footprint = ctx.footprint?.(topic.id)
  if (footprint) {
    return { leafCount: footprintBlocks(footprintHalfHeight(footprint), ctx.leafBlock) }
  }

  if (topic.collapsed || topic.children.length === 0) {
    return { leafCount: 1 }
  }

  return {
    leafCount: topic.children.reduce(
      (sum, child) => sum + measureSubtree(child, ctx).leafCount,
      0,
    ),
  }
}

function assignRootSides(children: TopicSnapshot[], ctx: BlockContext) {
  const weights = new Map<string, Exclude<LayoutSide, 'center'>>()
  let leftWeight = 0
  let rightWeight = 0

  for (const child of children) {
    const nextWeight = measureSubtree(child, ctx).leafCount
    const nextSide = leftWeight <= rightWeight ? 'left' : 'right'

    weights.set(child.id, nextSide)

    if (nextSide === 'left') {
      leftWeight += nextWeight
    } else {
      rightWeight += nextWeight
    }
  }

  return weights
}

function createCurveGeometry(
  parent: MindMapNodeLayout,
  child: MindMapNodeLayout,
  side: Exclude<LayoutSide, 'center'>,
) {
  const startX = side === 'right' ? parent.x + parent.width / 2 : parent.x - parent.width / 2
  const endX = side === 'right' ? child.x - child.width / 2 : child.x + child.width / 2
  const controlOffset = Math.max(48, Math.abs(endX - startX) * 0.42)
  const control1X = side === 'right' ? startX + controlOffset : startX - controlOffset
  const control2X = side === 'right' ? endX - controlOffset : endX + controlOffset

  return {
    path: `M ${startX} ${parent.y} C ${control1X} ${parent.y}, ${control2X} ${child.y}, ${endX} ${child.y}`,
    start: { x: startX, y: parent.y },
    end: { x: endX, y: child.y },
    control1: { x: control1X, y: parent.y },
    control2: { x: control2X, y: child.y },
  }
}

function distributeCenters(
  topics: TopicSnapshot[],
  centerY: number,
  side: Exclude<LayoutSide, 'center'>,
  sideMap: Map<string, Exclude<LayoutSide, 'center'>>,
  ctx: BlockContext,
  verticalGap = VERTICAL_GAP,
  alignSiblings = false,
) {
  const relevantTopics =
    side === 'left'
      ? topics.filter((topic) => sideMap.get(topic.id) === 'left')
      : topics.filter((topic) => sideMap.get(topic.id) !== 'left')
  const metrics = relevantTopics.map((topic) => measureSubtree(topic, ctx))
  const totalLeafCount = Math.max(
    1,
    metrics.reduce((sum, metric) => sum + metric.leafCount, 0),
  )
  const totalHeight = totalLeafCount * ctx.leafBlock + (relevantTopics.length - 1) * verticalGap
  let cursor = centerY - totalHeight / 2

  return relevantTopics.map((topic, index) => {
    const blockHeight = metrics[index].leafCount * ctx.leafBlock
    const nodeCenterY = alignSiblings
      ? centerY + (index - (relevantTopics.length - 1) / 2) * (ctx.leafBlock + verticalGap)
      : cursor + blockHeight / 2

    cursor += blockHeight + verticalGap

    return { topic, centerY: nodeCenterY }
  })
}

/**
 * 计算一级分支的朝向分配。
 *
 * 优先级：画布级 `direction` > `balance` 自动平衡 > 默认左右交替；
 * 之后再由**节点级** `structure.direction` 覆盖（更具体者胜）。
 *
 * 独立导出：混合骨架在给「子树换骨架」的子布局定朝向时，必须复用同一套规则，
 * 否则同一份文档在屏幕与导出、或改动前后会落到不同的一侧。
 */
export function resolveRootSideMap(
  rootTopic: TopicSnapshot,
  options: MindMapLayoutOptions = {},
  ctx: { footprint?: SubtreeFootprintResolver } = {},
): Map<string, 'left' | 'right'> {
  const blockCtx: BlockContext = {
    footprint: ctx.footprint,
    leafBlock: options.compact ? 64 : LEAF_BLOCK,
  }

  const sideMap: Map<string, 'left' | 'right'> =
    options.direction === 'left'
      ? new Map(rootTopic.children.map((topic) => [topic.id, 'left'] as const))
      : options.direction === 'right'
        ? new Map(rootTopic.children.map((topic) => [topic.id, 'right'] as const))
        : options.balance
          ? assignRootSides(rootTopic.children, blockCtx)
          : new Map(
              rootTopic.children.map(
                (topic, index) => [topic.id, index % 2 === 0 ? 'right' : 'left'] as const,
              ),
            )

  // 节点级「分支方向」：一级分支自己声明了左右就固定在该侧
  // （'balanced' 与缺省一样表示"不指定"，交给上面的自动分配）
  for (const child of rootTopic.children) {
    const declared = child.structure?.direction
    if (declared === 'left' || declared === 'right') {
      sideMap.set(child.id, declared)
    }
  }

  return sideMap
}

export function computeMindMapLayout(
  rootTopic: TopicSnapshot,
  options: MindMapLayoutOptions = {},
): MindMapLayoutResult {
  const verticalGap = options.compact ? 8 : VERTICAL_GAP
  const leafBlock = options.compact ? 64 : LEAF_BLOCK
  const ctx: BlockContext = { footprint: options.subtreeFootprint, leafBlock }
  // 该子树在整幅图里的真实层级（子树单独布局时由调用方给出）
  const depthBase = options.depthBase ?? 0
  const rootSize = estimateNodeSize(rootTopic, depthBase)
  const rootNode: MindMapNodeLayout = {
    id: rootTopic.id,
    topic: rootTopic,
    depth: depthBase,
    side: 'center',
    x: 0,
    y: 0,
    width: rootSize.width,
    height: rootSize.height,
  }
  const nodes: MindMapNodeLayout[] = [rootNode]
  const edges: MindMapEdgeLayout[] = []

  if (rootTopic.collapsed) {
    return {
      nodes,
      edges,
      width: rootNode.width + SCENE_PADDING_X * 2,
      height: rootNode.height + SCENE_PADDING_Y * 2,
      offsetX: SCENE_PADDING_X,
      offsetY: SCENE_PADDING_Y,
    }
  }

  // 分支方向优先级：画布级 direction > balance 自动平衡 > 默认左右交替；
  // 之后再由**节点级** direction 覆盖（更具体者胜）——与混合骨架的子布局共用同一函数
  const sideMap = resolveRootSideMap(rootTopic, options, { footprint: options.subtreeFootprint })

  const placeSubtree = (
    topic: TopicSnapshot,
    parent: MindMapNodeLayout,
    side: Exclude<LayoutSide, 'center'>,
    centerY: number,
    depth: number,
  ) => {
    const size = estimateNodeSize(topic, depth + depthBase)
    const x =
      side === 'right'
        ? ROOT_HORIZONTAL_GAP + (depth - 1) * DEPTH_HORIZONTAL_GAP
        : -(ROOT_HORIZONTAL_GAP + (depth - 1) * DEPTH_HORIZONTAL_GAP)
    const node: MindMapNodeLayout = {
      id: topic.id,
      topic,
      depth: depth + depthBase,
      side,
      x,
      y: centerY,
      width: size.width,
      height: size.height,
    }

    nodes.push(node)
    const curve = createCurveGeometry(parent, node, side)
    edges.push({
      id: `${parent.id}-${node.id}`,
      parentId: parent.id,
      childId: node.id,
      side,
      path: curve.path,
      start: curve.start,
      end: curve.end,
      control1: curve.control1,
      control2: curve.control2,
    })

    if (topic.collapsed || topic.children.length === 0) {
      return
    }

    // 子主题朝哪边展开：该主题自己声明了左右就照它，否则沿用所在分支。
    // 这让深处节点也能单独改方向（XMind 的「分支方向」对任意层级生效）。
    const declared = topic.structure?.direction
    const childSide: Exclude<LayoutSide, 'center'> =
      declared === 'left' || declared === 'right' ? declared : side

    const childMetrics = topic.children.map((child) => measureSubtree(child, ctx))
    const totalChildLeafCount = childMetrics.reduce(
      (sum, metric) => sum + metric.leafCount,
      0,
    )
    const totalChildHeight =
      totalChildLeafCount * leafBlock + (topic.children.length - 1) * verticalGap
    let cursor = centerY - totalChildHeight / 2

    topic.children.forEach((child, index) => {
      const blockHeight = childMetrics[index].leafCount * leafBlock
      const childCenterY = cursor + blockHeight / 2

      cursor += blockHeight + verticalGap
      placeSubtree(child, node, childSide, childCenterY, depth + 1)
    })
  }

  const leftGroups = distributeCenters(
    rootTopic.children,
    0,
    'left',
    sideMap,
    ctx,
    verticalGap,
    options.alignSiblings,
  )
  const rightGroups = distributeCenters(
    rootTopic.children,
    0,
    'right',
    sideMap,
    ctx,
    verticalGap,
    options.alignSiblings,
  )

  leftGroups.forEach(({ topic, centerY }) => {
    placeSubtree(topic, rootNode, 'left', centerY, 1)
  })

  rightGroups.forEach(({ topic, centerY }) => {
    placeSubtree(topic, rootNode, 'right', centerY, 1)
  })

  /** 把某个分支的子树（节点 + 相关连线）整体平移。 */
  const translateBranchSubtree = (branch: TopicSnapshot, deltaX: number, deltaY: number) => {
    const subtreeIds = new Set<string>()
    const collect = (topic: TopicSnapshot) => {
      subtreeIds.add(topic.id)
      for (const child of topic.children) collect(child)
    }
    collect(branch)

    for (const node of nodes) {
      if (subtreeIds.has(node.id)) {
        node.x += deltaX
        node.y += deltaY
      }
    }
    for (const edge of edges) {
      if (!subtreeIds.has(edge.childId)) continue
      edge.start = { x: edge.start.x + deltaX, y: edge.start.y + deltaY }
      edge.end = { x: edge.end.x + deltaX, y: edge.end.y + deltaY }
      edge.control1 = { x: edge.control1.x + deltaX, y: edge.control1.y + deltaY }
      edge.control2 = { x: edge.control2.x + deltaX, y: edge.control2.y + deltaY }
    }
  }

  // 分支自由布局：把带位置提示的一级分支（及其子树）整体平移到存的坐标。
  // 位置提示以**中心主题为原点**（与浮动主题同一坐标系），rootNode 就在 (0,0)，
  // 所以目标点直接就是 offsets 本身。
  if (options.freeBranch && !rootTopic.collapsed) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]))

    for (const branch of rootTopic.children) {
      const hints = branch.layoutHints
      if (hints?.offsetX == null || hints.offsetY == null) {
        continue
      }

      const pivot = nodeById.get(branch.id)
      if (!pivot) continue

      const deltaX = hints.offsetX - pivot.x
      const deltaY = hints.offsetY - pivot.y
      if (deltaX === 0 && deltaY === 0) continue

      translateBranchSubtree(branch, deltaX, deltaY)
    }

    // 主题层叠关闭：被摆放过的分支要避开**所有**同级分支（含自动定位的），
    // 否则把它拖到某个自动分支身上就仍然叠着。推动的永远是被摆放的那个，
    // 自动定位的分支不动，避免整幅图跟着抖。
    if (options.stackTopics === false) {
      const stackGap = options.stackGap ?? verticalGap
      const nodeById = new Map(nodes.map((node) => [node.id, node]))
      const movedBranches = rootTopic.children
        .filter(
          (branch) =>
            branch.layoutHints?.offsetX != null && branch.layoutHints?.offsetY != null,
        )
        .sort((a, b) => (nodeById.get(a.id)?.y ?? 0) - (nodeById.get(b.id)?.y ?? 0))

      for (const branch of movedBranches) {
        // 逐个障碍排除：每次找出最大的需要下移量，直到不再和任何同级分支重叠。
        // 上限只是防御性写法（病态输入下不进入死循环）。
        for (let guard = 0; guard < 50; guard += 1) {
          const node = nodeById.get(branch.id)
          if (!node) break

          const top = node.y - node.height / 2
          const bottom = node.y + node.height / 2
          let shift = 0

          for (const other of rootTopic.children) {
            if (other.id === branch.id) continue
            const otherNode = nodeById.get(other.id)
            if (!otherNode) continue
            // 只和同一侧的分支比较：左右两侧各自成列，互不影响
            if ((otherNode.x >= 0) !== (node.x >= 0)) continue

            const otherTop = otherNode.y - otherNode.height / 2
            const otherBottom = otherNode.y + otherNode.height / 2
            const overlaps = top < otherBottom + stackGap && bottom > otherTop - stackGap
            if (!overlaps) continue

            shift = Math.max(shift, otherBottom + stackGap - top)
          }

          if (shift <= 0.001) break
          translateBranchSubtree(branch, 0, shift)
        }
      }
    }
  }

  const minX = Math.min(...nodes.map((node) => node.x - node.width / 2))
  const maxX = Math.max(...nodes.map((node) => node.x + node.width / 2))
  const minY = Math.min(...nodes.map((node) => node.y - node.height / 2))
  const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2))

  return {
    nodes,
    edges,
    width: maxX - minX + SCENE_PADDING_X * 2,
    height: maxY - minY + SCENE_PADDING_Y * 2,
    offsetX: SCENE_PADDING_X - minX,
    offsetY: SCENE_PADDING_Y - minY,
  }
}
