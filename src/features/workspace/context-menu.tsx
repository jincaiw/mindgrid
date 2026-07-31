import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/** 单个菜单项；label 为 undefined 时渲染为分隔线。 */
export interface ContextMenuItem {
  label?: string
  shortcut?: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

/**
 * 通用右键上下文菜单组件。
 *
 * - 通过 React Portal 渲染到 body，避免被 canvas overflow 裁剪
 * - 自动定位（超出视口右/下边界时翻转）
 * - Esc 关闭、点击外部关闭
 * - 参考 XMind 右键菜单的视觉风格：圆角卡片 + 分组分隔 + 快捷键提示
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ x, y })

  // Esc 关闭
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 点击外部关闭（下一帧捕获，避免触发菜单的同一次 click）
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // 用 pointerdown 而非 click，以便在拖拽开始前就关闭
    const timer = setTimeout(() => {
      window.addEventListener('pointerdown', handlePointerDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [onClose])

  // 自动定位：如果菜单超出视口右/下边界，向左/上翻转
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    const margin = 4
    let nextX = x
    let nextY = y
    if (x + rect.width + margin > window.innerWidth) {
      nextX = Math.max(margin, window.innerWidth - rect.width - margin)
    }
    if (y + rect.height + margin > window.innerHeight) {
      nextY = Math.max(margin, window.innerHeight - rect.height - margin)
    }
    setPosition({ x: nextX, y: nextY })
  }, [x, y])

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, index) => {
        if (item.label === undefined) {
          return <div key={`sep-${index}`} className="context-menu__separator" />
        }
        return (
          <button
            key={`item-${index}`}
            type="button"
            role="menuitem"
            className={`context-menu__item${item.danger ? ' context-menu__item--danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                item.onClick?.()
                onClose()
              }
            }}
          >
            {item.icon ? <span className="context-menu__icon">{item.icon}</span> : null}
            <span className="context-menu__label">{item.label}</span>
            {item.shortcut ? (
              <span className="context-menu__shortcut">{item.shortcut}</span>
            ) : null}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

/** 便捷工厂：构建一个分隔项。 */
export const menuSeparator: ContextMenuItem = { label: undefined }

/** 便捷工厂：构建一个普通菜单项。 */
export function menuItem(
  label: string,
  onClick: () => void,
  options: { shortcut?: string; disabled?: boolean; danger?: boolean } = {},
): ContextMenuItem {
  return { label, onClick, ...options }
}
