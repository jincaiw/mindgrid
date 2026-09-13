/**
 * 「哪些主题能被自由摆放」的**唯一**判定。
 *
 * 画布（拖动写位置）与菜单（自由主题对齐）都必须走这里。
 * 上一版把这条规则只写在画布的一处条件里，结果是：浮动主题被拖时判定不通过、
 * 直接掉进"改结构"分支而静默失效——菜单里「创建后拖到想放的位置即可」这句说明因此是假的。
 * 规则一旦分叉，就必然有一处先腐坏，而它**不会报错**。
 */

export interface FreelyPositionableContext {
  /** 是否是浮动主题（在画布的 floatingTopics 里，不在主题树里）。 */
  isFloatingTopic: boolean
  /** 是否是中心主题的直接子节点（一级分支）。 */
  isFirstLevelBranch: boolean
  /** 画布设置「分支自由布局」是否开启。 */
  freeBranchLayout: boolean
}

/**
 * 能被自由摆放吗？
 *
 * - **浮动主题：恒可。** 它本来就不在树里，没有结构位置，"拖动就是摆放"。
 * - **树内主题：只有一级分支、且开启「分支自由布局」时可。** 更深层的主题位置由布局推导，
 *   写 `layoutHints` 也不会被消费（那是"点了没反应"的死操作）。
 */
export function isFreelyPositionableTopic(context: FreelyPositionableContext): boolean {
  return context.isFloatingTopic || (context.freeBranchLayout && context.isFirstLevelBranch)
}
