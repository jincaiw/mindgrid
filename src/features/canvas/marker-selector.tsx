/**
 * MarkerSelector：Inspector 中的标记可视化选择器。
 *
 * 替代旧的逗号分隔文本输入（曾生成 `${topicId}-marker-N` 假 ID，导致画布 MarkerIcon
 * 无法识别）。本组件直接使用 MARKER_DEFINITIONS 中的规范 ID（priority-1 / progress-50 /
 * star 等），与画布渲染端 markers.tsx 的 MarkerIcon 完全对齐。
 *
 * 交互：
 * - 当前已选标记以 chip 形式展示（图标 + 名称 + 移除按钮）
 * - "添加标记" 按钮打开 popover，按 优先级 / 进度 / 标记 三组网格列出全部内置 marker
 * - 点击网格项切换选中态，立即通过 onChange 提交（与 task select 一致的即时提交语义）
 * - popover 通过 React Portal 渲染到 body，避免被 Inspector 滚动容器裁剪
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  getMarkerLabel,
  MARKER_DEFINITIONS,
  MarkerIcon,
  type MarkerCategory,
  type MarkerDefinition,
} from './markers'
import type { TopicMarker } from '../../lib/document/types'

interface MarkerSelectorProps {
  markers: TopicMarker[]
  onChange: (markers: TopicMarker[]) => void
  disabled?: boolean
}

const CATEGORY_LABELS: Record<MarkerCategory, string> = {
  priority: '优先级',
  progress: '进度',
  flag: '标记',
}

/** 按 category 分组的内置 marker 目录，避免每次渲染重新归并。 */
const GROUPED_DEFINITIONS: Record<MarkerCategory, MarkerDefinition[]> = {
  priority: MARKER_DEFINITIONS.filter((m) => m.category === 'priority'),
  progress: MARKER_DEFINITIONS.filter((m) => m.category === 'progress'),
  flag: MARKER_DEFINITIONS.filter((m) => m.category === 'flag'),
}

const CATEGORY_ORDER: MarkerCategory[] = ['priority', 'progress', 'flag']

const POPOVER_WIDTH = 264

export function MarkerSelector({ markers, onChange, disabled }: MarkerSelectorProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 })

  const handleOpenPopover = () => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let x = rect.left
    const y = rect.bottom + 4
    // 防止超出右侧视口
    if (x + POPOVER_WIDTH > window.innerWidth - 8) {
      x = Math.max(8, window.innerWidth - POPOVER_WIDTH - 8)
    }
    setPopoverPos({ x, y })
    setOpen(true)
  }

  // 点击外部 / Esc 关闭 popover
  useEffect(() => {
    if (!open) return

    function handlePointerDown(e: MouseEvent) {
      if (popoverRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }

    // 延迟一帧注册 pointerdown，避免触发按钮的同一次点击立即关闭
    const timer = setTimeout(() => {
      window.addEventListener('pointerdown', handlePointerDown)
    }, 0)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // popover 打开后聚焦容器，便于键盘 Esc 体验
  useLayoutEffect(() => {
    if (open) {
      popoverRef.current?.focus()
    }
  }, [open])

  const selectedIds = new Set(markers.map((m) => m.id))

  const toggleMarker = (def: MarkerDefinition) => {
    if (selectedIds.has(def.id)) {
      onChange(markers.filter((m) => m.id !== def.id))
    } else {
      onChange([...markers, { id: def.id, label: def.label }])
    }
  }

  const removeMarker = (id: string) => {
    onChange(markers.filter((m) => m.id !== id))
  }

  return (
    <div className="marker-selector">
      <div className="marker-selector__chips">
        {markers.map((m) => (
          <span key={m.id} className="marker-selector__chip">
            <MarkerIcon marker={m} size={12} />
            <span className="marker-selector__chip-label">{getMarkerLabel(m)}</span>
            {disabled ? null : (
              <button
                type="button"
                className="marker-selector__chip-remove"
                aria-label={`移除标记 ${getMarkerLabel(m)}`}
                onClick={() => removeMarker(m.id)}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {disabled ? null : (
          <button
            ref={triggerRef}
            type="button"
            className="marker-selector__trigger"
            onClick={open ? () => setOpen(false) : handleOpenPopover}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            ＋ 添加标记
          </button>
        )}
      </div>
      {markers.length === 0 && disabled ? (
        <span className="marker-selector__empty">无标记</span>
      ) : null}

      {open && !disabled
        ? createPortal(
            <div
              ref={popoverRef}
              className="marker-popover"
              role="dialog"
              aria-label="选择标记"
              tabIndex={-1}
              style={{ left: popoverPos.x, top: popoverPos.y, width: POPOVER_WIDTH }}
            >
              {CATEGORY_ORDER.map((category) => {
                const defs = GROUPED_DEFINITIONS[category]
                if (defs.length === 0) return null
                return (
                  <div key={category} className="marker-popover__group">
                    <p className="marker-popover__group-title">{CATEGORY_LABELS[category]}</p>
                    <div className="marker-popover__grid">
                      {defs.map((def) => {
                        const selected = selectedIds.has(def.id)
                        return (
                          <button
                            key={def.id}
                            type="button"
                            className={`marker-popover__option${selected ? ' marker-popover__option--selected' : ''}`}
                            title={def.label}
                            aria-pressed={selected}
                            aria-label={def.label}
                            onClick={() => toggleMarker(def)}
                          >
                            <MarkerIcon marker={{ id: def.id }} size={18} />
                            <span className="marker-popover__option-label">{def.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
