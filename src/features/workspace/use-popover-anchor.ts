import { useCallback, useLayoutEffect, useState } from 'react'

export interface PopoverAnchor {
  top: number
  right: number
}

/**
 * 浮层定位：锚在触发器下方、右对齐并向左展开，返回视口坐标（配合 `position: fixed`）。
 *
 * 为什么必须 portal + fixed：右栏是滚动容器，挂在触发器内部的浮层会被面板裁切，
 * 宽度被压到 280px 以内（骨架浮层、色板浮层都踩过这个坑）。
 *
 * @param open 浮层是否展开
 * @param triggerRef 触发器元素
 * @param options.width 期望宽度（用于贴边回退），缺省不参与计算
 */
export function usePopoverAnchor(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
): PopoverAnchor | null {
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null)

  const update = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    setAnchor({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    })
  }, [triggerRef])

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null)
      return
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, update])

  return anchor
}
