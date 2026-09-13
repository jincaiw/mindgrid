/**
 * 骨架（结构）选择器 —— 对标 XMind 右栏「画布」子页顶部的骨架卡片。
 *
 * XMind 的做法：面板里是一张当前骨架的缩略卡片，点开浮层按
 * 「思维导图 / 逻辑图 / 括号图 / 组织结构图 / 树形图 / 时间轴 / 鱼骨图 /
 *   树型表格 / 矩阵图」分组展示缩略图，点选即换。
 *
 * 两个与 XMind 的差异（有意）：
 * - **气泡图** XMind 截图里没出现，但 MindGrid 有实现，收在「思维导图」组下
 *   作为第二张卡片，不为对齐而砍功能
 * - **树型表格** 已实现：列 = 层级、行 = 叶子，父单元格跨行合并（见 tree-table-layout.ts）
 *
 * 缩略图是静态 SVG（84×52 视口），不跑布局引擎——浮层要能瞬间打开。
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChartType } from '../../lib/document/types'
import { CHART_TYPE_LABELS } from './chart-type-labels'
import { ChevronDownIcon } from './icons'
import { usePopoverAnchor } from './use-popover-anchor'

interface StructureOption {
  value: ChartType | null
  label: string
  /** 84×52 视口内的缩略图内容 */
  thumbnail: React.ReactNode
  /** 预留：后续新增骨架时可在卡片上标注不可用原因。 */
  disabled?: boolean
  disabledHint?: string
}

interface StructureGroup {
  title: string
  options: StructureOption[]
}

/** 缩略图里节点方块的统一样式：淡填充 + 描边。 */
const NODE = { fill: 'var(--color-accent-10)', stroke: 'var(--color-accent)' }
const LINE = { stroke: 'var(--color-accent)', strokeWidth: 1.2, fill: 'none' }

/** 一组小方块节点：[x, y, w, h]，用于快速拼缩略图。 */
function nodes(rects: ReadonlyArray<readonly [number, number, number, number]>) {
  return rects.map(([x, y, w, h], index) => (
    <rect
      key={index}
      x={x}
      y={y}
      width={w}
      height={h}
      rx={2}
      fill={NODE.fill}
      stroke={NODE.stroke}
      strokeWidth={1.1}
    />
  ))
}

function MindMapThumb() {
  return (
    <>
      <path d="M32 26 L22 16 L12 16" {...LINE} />
      <path d="M32 26 L22 36 L12 36" {...LINE} />
      <path d="M52 26 L62 16 L72 16" {...LINE} />
      <path d="M52 26 L62 36 L72 36" {...LINE} />
      {nodes([
        [32, 21, 20, 10],
        [2, 11, 12, 8],
        [2, 31, 12, 8],
        [70, 11, 12, 8],
        [70, 31, 12, 8],
      ])}
    </>
  )
}

function BubbleThumb() {
  return (
    <>
      <path d="M42 26 L28 14" {...LINE} />
      <path d="M42 26 L28 40" {...LINE} />
      <path d="M42 26 L58 14" {...LINE} />
      <circle cx="42" cy="26" r="10" fill={NODE.fill} stroke={NODE.stroke} strokeWidth={1.1} />
      <circle cx="22" cy="12" r="7" fill={NODE.fill} stroke={NODE.stroke} strokeWidth={1.1} />
      <circle cx="22" cy="42" r="7" fill={NODE.fill} stroke={NODE.stroke} strokeWidth={1.1} />
      <circle cx="62" cy="12" r="7" fill={NODE.fill} stroke={NODE.stroke} strokeWidth={1.1} />
    </>
  )
}

function LogicThumb() {
  return (
    <>
      <path d="M14 26 L26 26 L26 12 L36 12" {...LINE} />
      <path d="M26 26 L26 40 L36 40" {...LINE} />
      <path d="M36 12 L46 12" {...LINE} />
      <path d="M36 40 L46 40" {...LINE} />
      {nodes([
        [2, 21, 12, 10],
        [46, 7, 18, 9],
        [46, 35, 18, 9],
        [68, 7, 14, 9],
        [68, 35, 14, 9],
      ])}
    </>
  )
}

function BraceThumb() {
  return (
    <>
      <path d="M64 8 C56 8 56 26 56 26 C56 26 56 44 64 44" {...LINE} />
      {nodes([
        [4, 8, 44, 8],
        [4, 22, 44, 8],
        [4, 36, 44, 8],
      ])}
      {nodes([[68, 20, 12, 10]])}
    </>
  )
}

function OrgThumb() {
  return (
    <>
      <path d="M42 12 L42 18" {...LINE} />
      <path d="M22 30 L22 24 L62 24 L62 30" {...LINE} />
      <path d="M22 34 L22 42 L62 42 L62 34" {...LINE} />
      {nodes([
        [32, 2, 20, 10],
        [10, 30, 24, 9],
        [50, 30, 24, 9],
        [10, 42, 24, 8],
        [50, 42, 24, 8],
      ])}
    </>
  )
}

function TreeThumb() {
  return (
    <>
      <path d="M42 10 L42 18" {...LINE} />
      <path d="M20 32 L20 22 L64 22 L64 32" {...LINE} />
      {nodes([
        [32, 0, 20, 10],
        [8, 32, 24, 9],
        [30, 32, 24, 9],
        [52, 32, 24, 9],
        [8, 43, 24, 8],
        [52, 43, 24, 8],
      ])}
    </>
  )
}

function TimelineThumb() {
  return (
    <>
      <path d="M6 26 L78 26" {...LINE} />
      <path d="M20 26 L20 14" {...LINE} />
      <path d="M42 26 L42 38" {...LINE} />
      <path d="M64 26 L64 14" {...LINE} />
      {nodes([
        [10, 4, 20, 10],
        [32, 38, 20, 10],
        [54, 4, 20, 10],
      ])}
      <circle cx="20" cy="26" r="2" fill={NODE.stroke} />
      <circle cx="42" cy="26" r="2" fill={NODE.stroke} />
      <circle cx="64" cy="26" r="2" fill={NODE.stroke} />
    </>
  )
}

function FishboneThumb() {
  return (
    <>
      <path d="M6 26 L74 26" {...LINE} />
      <path d="M18 26 L28 8" {...LINE} />
      <path d="M18 26 L28 44" {...LINE} />
      <path d="M44 26 L54 8" {...LINE} />
      <path d="M44 26 L54 44" {...LINE} />
      {nodes([
        [22, 2, 20, 8],
        [22, 42, 20, 8],
        [48, 2, 20, 8],
        [48, 42, 20, 8],
        [62, 21, 20, 10],
      ])}
    </>
  )
}

function MatrixThumb() {
  return (
    <>
      {nodes([
        [4, 4, 20, 12],
        [4, 20, 20, 12],
        [4, 36, 20, 12],
        [32, 4, 20, 12],
        [32, 20, 20, 12],
        [32, 36, 20, 12],
        [60, 4, 20, 12],
        [60, 20, 20, 12],
        [60, 36, 20, 12],
      ])}
    </>
  )
}

function TreeTableThumb() {
  return (
    <>
      <path d="M4 12 L80 12" {...LINE} />
      <path d="M4 26 L80 26" {...LINE} />
      <path d="M4 40 L80 40" {...LINE} />
      <path d="M28 4 L28 48" {...LINE} />
      <path d="M56 4 L56 48" {...LINE} />
      {nodes([[6, 15, 18, 8]])}
      {nodes([[6, 29, 18, 8]])}
      {nodes([[6, 43, 18, 8]])}
    </>
  )
}

/**
 * 分组顺序按 XMind 截图的骨架浮层排列。
 * 每组未来可扩展多个「变体」卡片（XMind 同组内有多张），当前每种 1 张。
 */
const STRUCTURE_GROUPS: readonly StructureGroup[] = [
  {
    title: '思维导图',
    options: [
      { value: 'mindmap', label: CHART_TYPE_LABELS.mindmap, thumbnail: <MindMapThumb /> },
      { value: 'bubble', label: CHART_TYPE_LABELS.bubble, thumbnail: <BubbleThumb /> },
    ],
  },
  { title: '逻辑图', options: [{ value: 'logic', label: CHART_TYPE_LABELS.logic, thumbnail: <LogicThumb /> }] },
  { title: '括号图', options: [{ value: 'brace', label: CHART_TYPE_LABELS.brace, thumbnail: <BraceThumb /> }] },
  {
    title: '组织结构图',
    options: [{ value: 'org', label: CHART_TYPE_LABELS.org, thumbnail: <OrgThumb /> }],
  },
  { title: '树形图', options: [{ value: 'tree', label: CHART_TYPE_LABELS.tree, thumbnail: <TreeThumb /> }] },
  {
    title: '时间轴',
    options: [{ value: 'timeline', label: CHART_TYPE_LABELS.timeline, thumbnail: <TimelineThumb /> }],
  },
  { title: '鱼骨图', options: [{ value: 'fishbone', label: CHART_TYPE_LABELS.fishbone, thumbnail: <FishboneThumb /> }] },
  {
    title: '树型表格',
    options: [{ value: 'treetable', label: CHART_TYPE_LABELS.treetable, thumbnail: <TreeTableThumb /> }],
  },
  { title: '矩阵图', options: [{ value: 'matrix', label: CHART_TYPE_LABELS.matrix, thumbnail: <MatrixThumb /> }] },
]

/** 扁平索引，供「当前骨架」卡片回查缩略图与名称。 */
function findOption(value: ChartType): StructureOption | null {
  for (const group of STRUCTURE_GROUPS) {
    for (const option of group.options) {
      if (option.value === value) {
        return option
      }
    }
  }
  return null
}

interface StructurePickerProps {
  value: ChartType
  onChange: (chartType: ChartType) => void
  disabled?: boolean
}

export function StructurePicker({ value, onChange, disabled = false }: StructurePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  // 浮层坐标（视口坐标，fixed 定位）：portal 到 body，否则被右栏滚动容器裁切
  const anchor = usePopoverAnchor(open, triggerRef)
  const current = findOption(value)

  // 点击外部 / Esc 关闭浮层（与工具栏下拉、画布标签右键菜单同一套交互）
  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target)) {
        return
      }
      if (!rootRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="structure-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        className="structure-picker__trigger"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`骨架：${current?.label ?? value}`}
      >
        <svg
          className="structure-picker__thumb"
          viewBox="0 0 84 52"
          aria-hidden="true"
          focusable="false"
        >
          {current?.thumbnail}
        </svg>
        <span className="structure-picker__name">{current?.label ?? value}</span>
        <ChevronDownIcon size={12} />
      </button>

      {open && anchor
        ? createPortal(
              <div
                ref={popoverRef}
                className="structure-picker__popover"
                role="dialog"
                aria-label="选择骨架"
                style={{ top: anchor.top, right: anchor.right }}
              >
            <div className="structure-picker__scroll">
              {STRUCTURE_GROUPS.map((group) => (
                <section className="structure-picker__group" key={group.title}>
                  <h3 className="structure-picker__group-title">{group.title}</h3>
                  <div className="structure-picker__grid">
                    {group.options.map((option) => {
                      const selected = option.value !== null && option.value === value
                      return (
                        <button
                          key={option.label}
                          className={`structure-picker__card${
                            selected ? ' structure-picker__card--selected' : ''
                          }`}
                          type="button"
                          disabled={option.disabled}
                          title={option.disabled ? option.disabledHint : option.label}
                          aria-label={option.label}
                          aria-pressed={selected}
                          onClick={() => {
                            if (option.value) {
                              onChange(option.value)
                              setOpen(false)
                            }
                          }}
                        >
                          <svg
                            className="structure-picker__card-thumb"
                            viewBox="0 0 84 52"
                            aria-hidden="true"
                            focusable="false"
                          >
                            {option.thumbnail}
                          </svg>
                          <span className="structure-picker__card-name">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
              </div>,
            document.body,
          )
        : null}
    </div>
  )
}
