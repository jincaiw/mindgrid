/**
 * 「自由主题对齐 / 分布」的几何计算（纯函数）。
 *
 * 对齐 = 用选中集合的**包围盒**当基准：左对齐取最小左边界、右对齐取最大右边界、
 * 居中取包围盒中心。分布 = 保持两端不动，把中间的主题摆成**间距相等**。
 *
 * 坐标系约定：位置是**节点中心**、相对中心主题的世界坐标——与 `layoutHints.offsetX/offsetY`
 * 完全一致（浮动主题与分支自由布局都用这一套）。所以这里的输入输出可以直接落库，
 * 中间不需要任何坐标变换，也就不存在"两边算的框架不是同一个"的空间。
 *
 * 只改被对齐的那一根轴，另一轴原样保留：横向对齐不该顺手把纵向也挪了。
 */

/** 八种对齐方式，与编辑菜单「自由主题对齐」子项一一对应。 */
export type TopicAlignMode =
  | 'left'
  | 'center-h'
  | 'right'
  | 'top'
  | 'middle-v'
  | 'bottom'
  | 'distribute-h'
  | 'distribute-v'

// 刻意**不**提供「所有模式的数组」：模式的唯一权威清单是菜单侧的
// ALIGN_MODE_BY_MENU_ID（它同时决定每个菜单项用哪种模式），再导出一份没人读的清单
// 只会成为第二处需要同步的地方。类型本身已经约束了取值范围。

/** 菜单文字与算法同源：标签写在这里，菜单与提示都从这里取。 */
export const TOPIC_ALIGN_LABELS: Readonly<Record<TopicAlignMode, string>> = {
  left: '左对齐',
  'center-h': '水平居中',
  right: '右对齐',
  top: '顶端对齐',
  'middle-v': '垂直居中',
  bottom: '底端对齐',
  'distribute-h': '水平分布',
  'distribute-v': '垂直分布',
}

/** 输入：要被摆放的主题盒子（中心 + 尺寸）。 */
export interface TopicAlignBox {
  topicId: string
  centerX: number
  centerY: number
  width: number
  height: number
}

/** 输出：新的中心坐标（与输入同一坐标系，可直接写 layoutHints）。 */
export interface TopicAlignPosition {
  topicId: string
  offsetX: number
  offsetY: number
}

export type TopicAlignResult =
  | { ok: true; positions: TopicAlignPosition[] }
  | { ok: false; reason: 'too-few-topics'; required: number }

/**
 * 对齐至少要有两个对象；分布要有三个（两端固定、中间才有东西可分）。
 *
 * 不导出：门槛只有 `computeTopicAlignment` 一个消费点，需要它的调用方
 * 从返回的 `required` 里拿即可——多一个导出就多一处"两边取值可能不一致"。
 */
function minimumTopicCountFor(mode: TopicAlignMode): number {
  return mode === 'distribute-h' || mode === 'distribute-v' ? 3 : 2
}

function isHorizontalMode(mode: TopicAlignMode): boolean {
  return mode === 'left' || mode === 'center-h' || mode === 'right' || mode === 'distribute-h'
}

/**
 * 把「间距相等」的分布结果算出来。
 *
 * 排序用**该轴的起始边**（左/上）而不是中心：视觉上的"从左到右"按起始边排，
 * 大小不一时中心顺序会与视觉顺序不一致。两端固定，间距 = (总跨度 − 各盒尺寸之和) / (n − 1)；
 * 盒子互相重叠时间距为负，仍然按等间距摊开（设计工具的通行做法）。
 */
function distribute(
  boxes: readonly TopicAlignBox[],
  axis: 'x' | 'y',
): Map<string, number> {
  const sizeOf = (box: TopicAlignBox) => (axis === 'x' ? box.width : box.height)
  const centerOf = (box: TopicAlignBox) => (axis === 'x' ? box.centerX : box.centerY)

  const ordered = [...boxes].sort(
    (a, b) => centerOf(a) - sizeOf(a) / 2 - (centerOf(b) - sizeOf(b) / 2),
  )

  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const spanStart = centerOf(first) - sizeOf(first) / 2
  const spanEnd = centerOf(last) + sizeOf(last) / 2
  const totalSize = ordered.reduce((sum, box) => sum + sizeOf(box), 0)
  const gap = (spanEnd - spanStart - totalSize) / (ordered.length - 1)

  const result = new Map<string, number>()
  let cursor = spanStart
  for (const box of ordered) {
    result.set(box.topicId, cursor + sizeOf(box) / 2)
    cursor += sizeOf(box) + gap
  }
  return result
}

/**
 * 计算对齐后的中心坐标。
 *
 * 数量不足时**显式失败**而不是静默返回空数组：调用方能据此给出具体提示
 * （"请先选中至少 N 个自由主题"），而不是让用户点了一下什么都没发生。
 */
export function computeTopicAlignment(
  boxes: readonly TopicAlignBox[],
  mode: TopicAlignMode,
): TopicAlignResult {
  const required = minimumTopicCountFor(mode)
  if (boxes.length < required) {
    return { ok: false, reason: 'too-few-topics', required }
  }

  const horizontal = isHorizontalMode(mode)
  const centers = (box: TopicAlignBox) => (horizontal ? box.centerX : box.centerY)
  const sizes = (box: TopicAlignBox) => (horizontal ? box.width : box.height)

  let alignedAxis: Map<string, number> | null = null

  if (mode === 'distribute-h' || mode === 'distribute-v') {
    alignedAxis = distribute(boxes, horizontal ? 'x' : 'y')
  } else {
    // 基准一律取包围盒：左/上取最小边，右/下取最大边，居中取包围盒中心
    const minEdge = Math.min(...boxes.map((box) => centers(box) - sizes(box) / 2))
    const maxEdge = Math.max(...boxes.map((box) => centers(box) + sizes(box) / 2))
    const target =
      mode === 'left' || mode === 'top'
        ? { kind: 'start' as const, value: minEdge }
        : mode === 'right' || mode === 'bottom'
          ? { kind: 'end' as const, value: maxEdge }
          : { kind: 'center' as const, value: (minEdge + maxEdge) / 2 }

    alignedAxis = new Map(
      boxes.map((box) => {
        const center =
          target.kind === 'start'
            ? target.value + sizes(box) / 2
            : target.kind === 'end'
              ? target.value - sizes(box) / 2
              : target.value
        return [box.topicId, center]
      }),
    )
  }

  const positions = boxes.map((box) => ({
    topicId: box.topicId,
    offsetX: horizontal ? (alignedAxis as Map<string, number>).get(box.topicId)! : box.centerX,
    offsetY: horizontal ? box.centerY : (alignedAxis as Map<string, number>).get(box.topicId)!,
  }))

  return { ok: true, positions }
}
