/**
 * 色板选择器（XMind 风格浮层）。
 *
 * 用途：画布背景色、分支色板等「从一组预设里挑一个」的控件。
 * 触发器只显示当前选中项的色带 + 名称；点开后是浮层色板网格。
 *
 * 浮层挂到 body（portal）+ fixed 定位：右栏是滚动容器，挂在面板内会被裁切。
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon } from './icons'
import { usePopoverAnchor } from './use-popover-anchor'

export interface SwatchOption {
  id: string
  label: string
  /** 一个或多个色块；单色项只给一个。 */
  colors: string[]
}

interface SwatchPickerProps {
  /** 控件名（同时作为浮层的可访问名）。 */
  label: string
  /** 当前值；null 表示「跟随主题 / 默认」。 */
  value: string | null
  options: SwatchOption[]
  /** value 为 null 时触发器上显示的文字。 */
  fallbackLabel: string
  /** 提供后浮层底部出现「重置」按钮（写入 null）。 */
  resetLabel?: string
  /** 提供后浮层底部出现原生取色器，用于任意自定义颜色。 */
  colorInputLabel?: string
  /** 浮层底部的额外动作（如「新建配色…」「编辑当前配色」）。 */
  actions?: React.ReactNode
  onChange: (value: string | null) => void
  disabled?: boolean
}

export function SwatchPicker({
  label,
  value,
  options,
  fallbackLabel,
  resetLabel,
  colorInputLabel,
  actions,
  onChange,
  disabled = false,
}: SwatchPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const anchor = usePopoverAnchor(open, triggerRef)

  const current = options.find((option) => option.id === value) ?? null
  // 自定义颜色（不在预设里）也要在触发器上体现出来
  const customColor = value && !current ? value : null

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target)) return
      if (!rootRef.current?.contains(target)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="swatch-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="swatch-picker__trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="swatch-picker__preview">
          {current ? (
            current.colors.map((color) => (
              <span key={color} className="swatch-picker__preview-dot" style={{ background: color }} />
            ))
          ) : (
            <span
              className="swatch-picker__preview-dot"
              style={{ background: customColor ?? 'transparent' }}
              data-empty={customColor ? undefined : 'true'}
            />
          )}
        </span>
        <span className="swatch-picker__name">
          {current?.label ?? customColor ?? fallbackLabel}
        </span>
        <ChevronDownIcon size={12} />
      </button>

      {open && anchor
        ? createPortal(
            <div
              ref={popoverRef}
              className="swatch-picker__popover"
              role="dialog"
              aria-label={label}
              style={{ top: anchor.top, right: anchor.right }}
            >
              <div className="swatch-picker__grid">
                {options.map((option) => {
                  const selected = option.id === value
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`swatch-picker__option${
                        selected ? ' swatch-picker__option--selected' : ''
                      }`}
                      aria-pressed={selected}
                      aria-label={option.label}
                      onClick={() => {
                        onChange(option.id)
                        setOpen(false)
                      }}
                    >
                      <span className="swatch-picker__strip">
                        {option.colors.map((color) => (
                          <span key={color} style={{ background: color }} />
                        ))}
                      </span>
                      <span className="swatch-picker__option-name">{option.label}</span>
                    </button>
                  )
                })}
              </div>

              {(resetLabel || colorInputLabel || actions) && (
                <div className="swatch-picker__footer">
                  {colorInputLabel ? (
                    <label className="swatch-picker__custom">
                      <input
                        type="color"
                        aria-label={colorInputLabel}
                        value={customColor ?? (current?.colors[0] ?? '#ffffff')}
                        onChange={(event) => onChange(event.target.value)}
                      />
                      <span>{colorInputLabel}</span>
                    </label>
                  ) : null}
                  {resetLabel ? (
                    <button
                      type="button"
                      className="panel__action panel__action--ghost"
                      onClick={() => {
                        onChange(null)
                        setOpen(false)
                      }}
                    >
                      {resetLabel}
                    </button>
                  ) : null}
                  {actions}
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
