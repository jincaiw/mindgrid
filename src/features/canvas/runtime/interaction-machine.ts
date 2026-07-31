/**
 * 正式交互状态机：管理画布所有交互模式的状态与转换。
 *
 * 设计原则：
 * 1. 纯函数 reducer：(state, event) → { state, effects }，无副作用。
 * 2. 状态互斥：同一时刻只能处于一个交互状态，避免冲突。
 * 3. 效果分离：状态机只决定"做什么"(effects)，不执行副作用（由组件层执行）。
 * 4. 可测试：所有转换逻辑可单元测试，无需 DOM 或 Canvas。
 *
 * 12 个状态（V1 实现其中 8 个，其余预留）：
 * Idle / Hovering / Selecting / BoxSelecting / Panning / DraggingTopic /
 * DraggingRelationship / EditingText / ResizingImage / CreatingRelationship /
 * AnimatingCamera / Presenting
 */

// ---- 状态定义 ----

export type InteractionState =
  | { kind: 'idle' }
  | { kind: 'hovering'; topicId: string }
  | { kind: 'panning'; pointerId: number; lastX: number; lastY: number }
  | {
      kind: 'box_selecting'
      pointerId: number
      startX: number
      startY: number
      currentX: number
      currentY: number
    }
  | {
      kind: 'dragging_topic'
      pointerId: number
      topicId: string
      originX: number
      originY: number
      currentX: number
      currentY: number
      dropTargetId: string | null
    }
  | { kind: 'editing_text'; topicId: string }
  | { kind: 'animating_camera'; targetTopicId: string | null }
  | { kind: 'presenting' }

// ---- 事件定义 ----

export type InteractionEvent =
  | {
      type: 'pointer_down'
      pointerId: number
      x: number
      y: number
      target: 'background' | 'topic'
      topicId?: string
      shiftKey: boolean
      metaKey: boolean
    }
  | {
      type: 'pointer_move'
      pointerId: number
      x: number
      y: number
      dropTargetId?: string | null
    }
  | { type: 'pointer_up'; pointerId: number }
  | { type: 'double_click'; topicId: string }
  | { type: 'start_editing'; topicId: string }
  | { type: 'commit_editing' }
  | { type: 'cancel_editing' }
  | { type: 'enter_presenting' }
  | { type: 'exit_presenting' }
  | { type: 'animation_complete' }
  | { type: 'reset' }

// ---- 效果定义 ----

export type InteractionEffect =
  | { type: 'select'; topicId: string }
  | { type: 'select_many'; topicIds: string[] }
  | { type: 'toggle_selection'; topicId: string }
  | { type: 'clear_selection' }
  | { type: 'pan_camera'; deltaX: number; deltaY: number }
  | { type: 'move_topic'; topicId: string; targetParentId: string }
  | { type: 'start_edit'; topicId: string }
  | { type: 'commit_edit' }
  | { type: 'cancel_edit' }
  | { type: 'focus_topic'; topicId: string }
  | { type: 'enter_present' }
  | { type: 'exit_present' }

export interface ReduceResult {
  state: InteractionState
  effects: InteractionEffect[]
}

// ---- 拖拽阈值（超过此距离才从 drag_candidate 转为 dragging）----

const DRAG_THRESHOLD = 6

/** 携带 pointerId 的状态类型（用于指针事件隔离判断）。 */
type PointerTrackingState = Extract<
  InteractionState,
  { pointerId: number }
>

/** 类型守卫：状态是否携带 pointerId（即处于指针驱动的交互中）。 */
function isPointerTracking(
  state: InteractionState,
): state is PointerTrackingState {
  return (
    state.kind === 'panning' ||
    state.kind === 'box_selecting' ||
    state.kind === 'dragging_topic'
  )
}

// ---- 初始状态 ----

export function createIdleState(): InteractionState {
  return { kind: 'idle' }
}

// ---- Reducer ----

/**
 * 纯函数状态转换。接收当前状态与事件，返回下一状态与需执行的效果。
 */
export function reduceInteraction(
  state: InteractionState,
  event: InteractionEvent,
): ReduceResult {
  switch (event.type) {
    case 'pointer_down':
      return handlePointerDown(state, event)

    case 'pointer_move':
      return handlePointerMove(state, event)

    case 'pointer_up':
      return handlePointerUp(state, event)

    case 'double_click':
      return handleDoubleClick(state, event)

    case 'start_editing':
      return handleStartEditing(state, event)

    case 'commit_editing':
      return handleCommitEditing(state, event)

    case 'cancel_editing':
      return handleCancelEditing(state, event)

    case 'enter_presenting':
      if (state.kind === 'presenting') {
        return { state, effects: [] }
      }
      return {
        state: { kind: 'presenting' },
        effects: [{ type: 'enter_present' }],
      }

    case 'exit_presenting':
      if (state.kind !== 'presenting') {
        return { state, effects: [] }
      }
      return {
        state: { kind: 'idle' },
        effects: [{ type: 'exit_present' }],
      }

    case 'animation_complete':
      if (state.kind === 'animating_camera') {
        return { state: { kind: 'idle' }, effects: [] }
      }
      return { state, effects: [] }

    case 'reset':
      return handleReset(state)

    default:
      return { state, effects: [] }
  }
}

// ---- 事件处理器 ----

function handlePointerDown(
  state: InteractionState,
  event: Extract<InteractionEvent, { type: 'pointer_down' }>,
): ReduceResult {
  // 编辑中不响应指针按下（除非是 reset）
  if (state.kind === 'editing_text') {
    return { state, effects: [] }
  }

  // 演示模式不响应画布交互
  if (state.kind === 'presenting') {
    return { state, effects: [] }
  }

  if (event.target === 'background') {
    if (event.shiftKey) {
      // Shift + 拖拽背景 = 框选
      return {
        state: {
          kind: 'box_selecting',
          pointerId: event.pointerId,
          startX: event.x,
          startY: event.y,
          currentX: event.x,
          currentY: event.y,
        },
        effects: [],
      }
    }
    // 拖拽背景 = 平移
    return {
      state: {
        kind: 'panning',
        pointerId: event.pointerId,
        lastX: event.x,
        lastY: event.y,
      },
      effects: [{ type: 'clear_selection' }],
    }
  }

  // 点击主题
  if (event.target === 'topic' && event.topicId) {
    const topicId = event.topicId

    if (event.shiftKey || event.metaKey) {
      // Shift/Cmd + 点击 = 切换选择
      return {
        state: {
          kind: 'dragging_topic',
          pointerId: event.pointerId,
          topicId,
          originX: event.x,
          originY: event.y,
          currentX: event.x,
          currentY: event.y,
          dropTargetId: null,
        },
        effects: [{ type: 'toggle_selection', topicId }],
      }
    }

    // 普通点击 = 选中 + 准备拖拽
    return {
      state: {
        kind: 'dragging_topic',
        pointerId: event.pointerId,
        topicId,
        originX: event.x,
        originY: event.y,
        currentX: event.x,
        currentY: event.y,
        dropTargetId: null,
      },
      effects: [{ type: 'select', topicId }],
    }
  }

  return { state, effects: [] }
}

function handlePointerMove(
  state: InteractionState,
  event: Extract<InteractionEvent, { type: 'pointer_move' }>,
): ReduceResult {
  if (!isPointerTracking(state) || state.pointerId !== event.pointerId) {
    return { state, effects: [] }
  }

  switch (state.kind) {
    case 'panning': {
      const deltaX = event.x - state.lastX
      const deltaY = event.y - state.lastY
      return {
        state: {
          ...state,
          lastX: event.x,
          lastY: event.y,
        },
        effects: [{ type: 'pan_camera', deltaX, deltaY }],
      }
    }

    case 'box_selecting': {
      return {
        state: {
          ...state,
          currentX: event.x,
          currentY: event.y,
        },
        effects: [],
      }
    }

    case 'dragging_topic': {
      const deltaX = event.x - state.originX
      const deltaY = event.y - state.originY
      const hasMoved = Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD
      return {
        state: {
          ...state,
          currentX: event.x,
          currentY: event.y,
          dropTargetId: hasMoved ? (event.dropTargetId ?? null) : null,
        },
        effects: [],
      }
    }

    default:
      return { state, effects: [] }
  }
}

function handlePointerUp(
  state: InteractionState,
  event: Extract<InteractionEvent, { type: 'pointer_up' }>,
): ReduceResult {
  if (!isPointerTracking(state) || state.pointerId !== event.pointerId) {
    return { state, effects: [] }
  }

  switch (state.kind) {
    case 'box_selecting': {
      // 框选完成，选中框内主题
      // 实际的框选结果由组件层通过 spatial index 查询计算
      return {
        state: { kind: 'idle' },
        effects: [],
      }
    }

    case 'dragging_topic': {
      const deltaX = state.currentX - state.originX
      const deltaY = state.currentY - state.originY
      const hasMoved = Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD

      if (hasMoved && state.dropTargetId) {
        return {
          state: { kind: 'idle' },
          effects: [
            { type: 'move_topic', topicId: state.topicId, targetParentId: state.dropTargetId },
          ],
        }
      }

      return { state: { kind: 'idle' }, effects: [] }
    }

    case 'panning':
      return { state: { kind: 'idle' }, effects: [] }

    default:
      return { state: { kind: 'idle' }, effects: [] }
  }
}

function handleDoubleClick(
  state: InteractionState,
  event: Extract<InteractionEvent, { type: 'double_click' }>,
): ReduceResult {
  if (state.kind === 'editing_text' || state.kind === 'presenting') {
    return { state, effects: [] }
  }

  return {
    state: { kind: 'editing_text', topicId: event.topicId },
    effects: [
      { type: 'select', topicId: event.topicId },
      { type: 'start_edit', topicId: event.topicId },
    ],
  }
}

function handleStartEditing(
  state: InteractionState,
  event: Extract<InteractionEvent, { type: 'start_editing' }>,
): ReduceResult {
  if (state.kind === 'presenting') {
    return { state, effects: [] }
  }

  return {
    state: { kind: 'editing_text', topicId: event.topicId },
    effects: [{ type: 'start_edit', topicId: event.topicId }],
  }
}

function handleCommitEditing(
  state: InteractionState,
  _event: Extract<InteractionEvent, { type: 'commit_editing' }>,
): ReduceResult {
  if (state.kind !== 'editing_text') {
    return { state, effects: [] }
  }

  return {
    state: { kind: 'idle' },
    effects: [{ type: 'commit_edit' }],
  }
}

function handleCancelEditing(
  state: InteractionState,
  _event: Extract<InteractionEvent, { type: 'cancel_editing' }>,
): ReduceResult {
  if (state.kind !== 'editing_text') {
    return { state, effects: [] }
  }

  return {
    state: { kind: 'idle' },
    effects: [{ type: 'cancel_edit' }],
  }
}

function handleReset(state: InteractionState): ReduceResult {
  switch (state.kind) {
    case 'editing_text':
      return {
        state: { kind: 'idle' },
        effects: [{ type: 'cancel_edit' }],
      }
    case 'presenting':
      return { state, effects: [] }
    default:
      return {
        state: { kind: 'idle' },
        effects: [{ type: 'clear_selection' }],
      }
  }
}

// ---- 查询辅助 ----

/** 当前是否处于拖拽主题状态（已超过阈值）。 */
export function isDragging(state: InteractionState): boolean {
  if (state.kind !== 'dragging_topic') {
    return false
  }
  const deltaX = state.currentX - state.originX
  const deltaY = state.currentY - state.originY
  return Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD
}

/** 当前是否可响应键盘快捷键（非编辑/非拖拽/非演示）。 */
export function canAcceptKeyboard(state: InteractionState): boolean {
  return state.kind === 'idle' || state.kind === 'hovering'
}

/** 当前是否处于文本编辑状态。 */
export function isEditing(state: InteractionState): boolean {
  return state.kind === 'editing_text'
}
