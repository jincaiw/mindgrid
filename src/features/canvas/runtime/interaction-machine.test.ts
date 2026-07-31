import { describe, expect, it } from 'vitest'
import {
  canAcceptKeyboard,
  createIdleState,
  isDragging,
  isEditing,
  reduceInteraction,
  type InteractionEvent,
  type InteractionState,
} from './interaction-machine'

type PointerDownEvent = Extract<InteractionEvent, { type: 'pointer_down' }>

function pointerDown(
  target: 'background' | 'topic',
  opts: Partial<Omit<PointerDownEvent, 'type' | 'target'>> = {},
): InteractionEvent {
  return {
    type: 'pointer_down',
    pointerId: opts.pointerId ?? 1,
    x: opts.x ?? 100,
    y: opts.y ?? 100,
    target,
    topicId: opts.topicId,
    shiftKey: opts.shiftKey ?? false,
    metaKey: opts.metaKey ?? false,
  }
}

function pointerMove(
  x: number,
  y: number,
  opts: { pointerId?: number; dropTargetId?: string | null } = {},
): InteractionEvent {
  return {
    type: 'pointer_move',
    pointerId: opts.pointerId ?? 1,
    x,
    y,
    dropTargetId: opts.dropTargetId,
  }
}

function pointerUp(pointerId = 1): InteractionEvent {
  return { type: 'pointer_up', pointerId }
}

describe('reduceInteraction', () => {
  describe('pointer_down on background', () => {
    it('starts panning when clicking background without shift', () => {
      const result = reduceInteraction(createIdleState(), pointerDown('background'))
      expect(result.state.kind).toBe('panning')
      expect(result.effects).toEqual([{ type: 'clear_selection' }])
    })

    it('starts box_selecting when shift-clicking background', () => {
      const result = reduceInteraction(
        createIdleState(),
        pointerDown('background', { shiftKey: true }),
      )
      expect(result.state.kind).toBe('box_selecting')
      expect(result.effects).toEqual([])
    })
  })

  describe('pointer_down on topic', () => {
    it('selects topic and enters dragging_topic state', () => {
      const result = reduceInteraction(
        createIdleState(),
        pointerDown('topic', { topicId: 'a' }),
      )
      expect(result.state.kind).toBe('dragging_topic')
      if (result.state.kind === 'dragging_topic') {
        expect(result.state.topicId).toBe('a')
        expect(result.state.dropTargetId).toBeNull()
      }
      expect(result.effects).toEqual([{ type: 'select', topicId: 'a' }])
    })

    it('toggles selection when shift-clicking topic', () => {
      const result = reduceInteraction(
        createIdleState(),
        pointerDown('topic', { topicId: 'a', shiftKey: true }),
      )
      expect(result.state.kind).toBe('dragging_topic')
      expect(result.effects).toEqual([{ type: 'toggle_selection', topicId: 'a' }])
    })

    it('toggles selection when cmd-clicking topic', () => {
      const result = reduceInteraction(
        createIdleState(),
        pointerDown('topic', { topicId: 'a', metaKey: true }),
      )
      expect(result.effects).toEqual([{ type: 'toggle_selection', topicId: 'a' }])
    })
  })

  describe('panning', () => {
    it('emits pan_camera effect on move', () => {
      const downResult = reduceInteraction(createIdleState(), pointerDown('background'))
      const moveResult = reduceInteraction(downResult.state, pointerMove(150, 120))
      expect(moveResult.state.kind).toBe('panning')
      expect(moveResult.effects).toEqual([{ type: 'pan_camera', deltaX: 50, deltaY: 20 }])
    })

    it('returns to idle on pointer up', () => {
      const downResult = reduceInteraction(createIdleState(), pointerDown('background'))
      const upResult = reduceInteraction(downResult.state, pointerUp())
      expect(upResult.state.kind).toBe('idle')
    })
  })

  describe('box_selecting', () => {
    it('updates current position on move', () => {
      const downResult = reduceInteraction(
        createIdleState(),
        pointerDown('background', { x: 50, y: 50, shiftKey: true }),
      )
      const moveResult = reduceInteraction(downResult.state, pointerMove(200, 150))
      expect(moveResult.state.kind).toBe('box_selecting')
      if (moveResult.state.kind === 'box_selecting') {
        expect(moveResult.state.currentX).toBe(200)
        expect(moveResult.state.currentY).toBe(150)
        expect(moveResult.state.startX).toBe(50)
        expect(moveResult.state.startY).toBe(50)
      }
    })

    it('returns to idle on pointer up', () => {
      const downResult = reduceInteraction(
        createIdleState(),
        pointerDown('background', { shiftKey: true }),
      )
      const upResult = reduceInteraction(downResult.state, pointerUp())
      expect(upResult.state.kind).toBe('idle')
    })
  })

  describe('dragging_topic', () => {
    it('does not set drop target until moved past threshold', () => {
      const downResult = reduceInteraction(
        createIdleState(),
        pointerDown('topic', { topicId: 'a', x: 100, y: 100 }),
      )
      // Small move (below threshold)
      const moveResult = reduceInteraction(
        downResult.state,
        pointerMove(103, 103, { dropTargetId: 'b' }),
      )
      expect(moveResult.state.kind).toBe('dragging_topic')
      if (moveResult.state.kind === 'dragging_topic') {
        expect(moveResult.state.dropTargetId).toBeNull()
      }
    })

    it('sets drop target after moving past threshold', () => {
      const downResult = reduceInteraction(
        createIdleState(),
        pointerDown('topic', { topicId: 'a', x: 100, y: 100 }),
      )
      const moveResult = reduceInteraction(
        downResult.state,
        pointerMove(120, 120, { dropTargetId: 'b' }),
      )
      expect(moveResult.state.kind).toBe('dragging_topic')
      if (moveResult.state.kind === 'dragging_topic') {
        expect(moveResult.state.dropTargetId).toBe('b')
      }
    })

    it('emits move_topic effect on pointer up with drop target', () => {
      const downResult = reduceInteraction(
        createIdleState(),
        pointerDown('topic', { topicId: 'a', x: 100, y: 100 }),
      )
      const moveResult = reduceInteraction(
        downResult.state,
        pointerMove(120, 120, { dropTargetId: 'b' }),
      )
      const upResult = reduceInteraction(moveResult.state, pointerUp())
      expect(upResult.state.kind).toBe('idle')
      expect(upResult.effects).toEqual([
        { type: 'move_topic', topicId: 'a', targetParentId: 'b' },
      ])
    })

    it('does not emit move_topic when no drop target', () => {
      const downResult = reduceInteraction(
        createIdleState(),
        pointerDown('topic', { topicId: 'a', x: 100, y: 100 }),
      )
      const moveResult = reduceInteraction(
        downResult.state,
        pointerMove(120, 120, { dropTargetId: null }),
      )
      const upResult = reduceInteraction(moveResult.state, pointerUp())
      expect(upResult.state.kind).toBe('idle')
      expect(upResult.effects).toEqual([])
    })

    it('does not emit move_topic when not moved (simple click)', () => {
      const downResult = reduceInteraction(
        createIdleState(),
        pointerDown('topic', { topicId: 'a', x: 100, y: 100 }),
      )
      const upResult = reduceInteraction(downResult.state, pointerUp())
      expect(upResult.state.kind).toBe('idle')
      expect(upResult.effects).toEqual([])
    })
  })

  describe('editing_text', () => {
    it('enters editing on double_click', () => {
      const result = reduceInteraction(createIdleState(), {
        type: 'double_click',
        topicId: 'a',
      })
      expect(result.state.kind).toBe('editing_text')
      expect(result.effects).toContainEqual({ type: 'start_edit', topicId: 'a' })
    })

    it('enters editing on start_editing event', () => {
      const result = reduceInteraction(createIdleState(), {
        type: 'start_editing',
        topicId: 'a',
      })
      expect(result.state.kind).toBe('editing_text')
    })

    it('returns to idle on commit', () => {
      const editingState: InteractionState = { kind: 'editing_text', topicId: 'a' }
      const result = reduceInteraction(editingState, { type: 'commit_editing' })
      expect(result.state.kind).toBe('idle')
      expect(result.effects).toEqual([{ type: 'commit_edit' }])
    })

    it('returns to idle on cancel', () => {
      const editingState: InteractionState = { kind: 'editing_text', topicId: 'a' }
      const result = reduceInteraction(editingState, { type: 'cancel_editing' })
      expect(result.state.kind).toBe('idle')
      expect(result.effects).toEqual([{ type: 'cancel_edit' }])
    })

    it('does not respond to pointer_down while editing', () => {
      const editingState: InteractionState = { kind: 'editing_text', topicId: 'a' }
      const result = reduceInteraction(editingState, pointerDown('topic', { topicId: 'b' }))
      expect(result.state.kind).toBe('editing_text')
      expect(result.effects).toEqual([])
    })
  })

  describe('presenting', () => {
    it('enters presenting on enter_presenting', () => {
      const result = reduceInteraction(createIdleState(), { type: 'enter_presenting' })
      expect(result.state.kind).toBe('presenting')
      expect(result.effects).toEqual([{ type: 'enter_present' }])
    })

    it('exits presenting on exit_presenting', () => {
      const presentingState: InteractionState = { kind: 'presenting' }
      const result = reduceInteraction(presentingState, { type: 'exit_presenting' })
      expect(result.state.kind).toBe('idle')
      expect(result.effects).toEqual([{ type: 'exit_present' }])
    })

    it('does not respond to pointer_down while presenting', () => {
      const presentingState: InteractionState = { kind: 'presenting' }
      const result = reduceInteraction(presentingState, pointerDown('background'))
      expect(result.state.kind).toBe('presenting')
    })
  })

  describe('reset', () => {
    it('cancels editing and returns to idle', () => {
      const editingState: InteractionState = { kind: 'editing_text', topicId: 'a' }
      const result = reduceInteraction(editingState, { type: 'reset' })
      expect(result.state.kind).toBe('idle')
      expect(result.effects).toEqual([{ type: 'cancel_edit' }])
    })

    it('clears selection when resetting from panning', () => {
      const panningState: InteractionState = {
        kind: 'panning',
        pointerId: 1,
        lastX: 100,
        lastY: 100,
      }
      const result = reduceInteraction(panningState, { type: 'reset' })
      expect(result.state.kind).toBe('idle')
      expect(result.effects).toEqual([{ type: 'clear_selection' }])
    })

    it('does not reset from presenting', () => {
      const presentingState: InteractionState = { kind: 'presenting' }
      const result = reduceInteraction(presentingState, { type: 'reset' })
      expect(result.state.kind).toBe('presenting')
    })
  })

  describe('animating_camera', () => {
    it('returns to idle on animation_complete', () => {
      const animatingState: InteractionState = {
        kind: 'animating_camera',
        targetTopicId: 'a',
      }
      const result = reduceInteraction(animatingState, { type: 'animation_complete' })
      expect(result.state.kind).toBe('idle')
    })
  })

  describe('query helpers', () => {
    it('isDragging returns true only after threshold', () => {
      const state: InteractionState = {
        kind: 'dragging_topic',
        pointerId: 1,
        topicId: 'a',
        originX: 100,
        originY: 100,
        currentX: 103,
        currentY: 103,
        dropTargetId: null,
      }
      expect(isDragging(state)).toBe(false)

      const movedState: InteractionState = {
        ...state,
        currentX: 120,
        currentY: 120,
      }
      expect(isDragging(movedState)).toBe(true)
    })

    it('canAcceptKeyboard returns true for idle and hovering', () => {
      expect(canAcceptKeyboard({ kind: 'idle' })).toBe(true)
      expect(canAcceptKeyboard({ kind: 'hovering', topicId: 'a' })).toBe(true)
      expect(canAcceptKeyboard({ kind: 'editing_text', topicId: 'a' })).toBe(false)
      expect(canAcceptKeyboard({ kind: 'presenting' })).toBe(false)
    })

    it('isEditing returns true only for editing_text', () => {
      expect(isEditing({ kind: 'editing_text', topicId: 'a' })).toBe(true)
      expect(isEditing({ kind: 'idle' })).toBe(false)
    })
  })

  describe('pointerId isolation', () => {
    it('ignores events from different pointerId', () => {
      const downResult = reduceInteraction(
        createIdleState(),
        pointerDown('background', { pointerId: 1 }),
      )
      // Move from a different pointer
      const moveResult = reduceInteraction(downResult.state, pointerMove(200, 200, { pointerId: 2 }))
      expect(moveResult.state.kind).toBe('panning')
      // State should be unchanged (no pan effect)
      expect(moveResult.effects).toEqual([])
    })
  })
})
