/**
 * 骨架（结构）选择器 —— 对标 XMind 右栏「画布」子页顶部的骨架卡片。
 *
 * XMind 的做法（基准图 02–06）：面板里是一张当前骨架的缩略卡片，点开的浮层按
 * 「思维导图 / 逻辑图 / 括号图 / 组织结构图 / 树形图 / 时间轴 / 鱼骨图 /
 *   树型表格 / 矩阵图」分组，**每组里列的是同一骨架的方向变体**，
 * 卡片**三列排布且只画缩略图**（不带文字，靠缩略图区分变体）。
 *
 * 与 XMind 的差异（有意）：
 * - 气泡图：XMind 基准图里没出现，MindGrid 有实现，收在「思维导图」组下，不为对齐而砍功能
 * - 树型表格：已实现
 * - 锁定角标：XMind 用锁标出 Pro 专属变体，MindGrid 没有付费墙，不画锁
 * - 变体数量：我们每种骨架给能真实生效的方向变体（思维导图 3 种等），
 *   不做 XMind 那 12 张里的"换主题"卡片（那是主题不是结构）
 *
 * 缩略图是静态 SVG（84×52 视口），不跑布局引擎——浮层要能瞬间打开。
 * 反向变体直接对整组图形做镜像（`mirrorThumb`），因为布局本身就是镜像出来的。
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChartType, TopicDirection } from '../../lib/document/types'
import { CHART_TYPE_LABELS } from './chart-type-labels'
import { ChevronDownIcon } from './icons'
import { usePopoverAnchor } from './use-popover-anchor'

interface StructureOption {
  value: ChartType
  /**
   * 该变体的方向；缺省表示"该骨架的自然方向"（组织结构图向下、时间轴水平……），
   * 选中时会**清掉**方向字段，避免文档里留下冗余配置。
   */
  direction?: TopicDirection
  label: string
  /** 84×52 视口内的缩略图内容 */
  thumbnail: React.ReactNode
}

interface StructureGroup {
  title: string
  options: StructureOption[]
}

/** 缩略图的三种镜像方式：与布局层的变体变换一一对应。 */
type ThumbFlip = 'x' | 'y' | 'none'

/**
 * 缩略图里骨架图形的统一样式：**中性灰**。
 *
 * 对齐 XMind 基准图（02）：卡片缩略图是无彩色骨架，强调色只用在选中卡片的边框上。
 * 早期用强调蓝画缩略图，会让整片浮层看起来"全是选中态"。
 */
const NODE = { fill: 'var(--color-border-default)', stroke: 'var(--color-border-strong)' }
const LINE = { stroke: 'var(--color-border-strong)', strokeWidth: 1.2, fill: 'none' }

/** 把缩略图包进一个镜像用的 `<g>`；'none' 时原样返回。 */
function mirrorThumb(flip: ThumbFlip, content: React.ReactNode) {
  if (flip === 'none') return content
  const transform = flip === 'x' ? 'translate(84 0) scale(-1 1)' : 'translate(0 52) scale(1 -1)'
  return <g transform={transform}>{content}</g>
}

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

/** 单侧思维导图：所有分支在同一侧（对应「向右 / 向左」两个变体）。 */
function MindMapSideThumb() {
  return (
    <>
      <path d="M30 26 L44 14 L54 14" {...LINE} />
      <path d="M30 26 L44 30 L54 30" {...LINE} />
      <path d="M30 26 L44 42 L54 42" {...LINE} />
      {nodes([
        [4, 21, 26, 10],
        [54, 9, 26, 10],
        [54, 25, 26, 10],
        [54, 37, 26, 10],
      ])}
    </>
  )
}

/** 时间轴（垂直）：主轴竖排、事件挂在右侧。 */
function TimelineVerticalThumb() {
  return (
    <>
      <path d="M26 4 L26 48" {...LINE} />
      <path d="M26 12 L38 12" {...LINE} />
      <path d="M26 26 L38 26" {...LINE} />
      <path d="M26 40 L38 40" {...LINE} />
      {nodes([
        [38, 7, 24, 10],
        [38, 21, 24, 10],
        [38, 35, 24, 10],
      ])}
      <circle cx="26" cy="12" r="2" fill={NODE.stroke} />
      <circle cx="26" cy="26" r="2" fill={NODE.stroke} />
      <circle cx="26" cy="40" r="2" fill={NODE.stroke} />
    </>
  )
}

/**
 * 分组顺序按 XMind 基准图的骨架浮层排列。
 *
 * **组内列的是同一骨架的方向变体**（XMind 也是这么组织的：「逻辑图（向左）」不新开一组）。
 * 变体的方向存进 `layoutConfig.direction`，由布局层的 `applyDirectionVariant` 落地。
 */
const STRUCTURE_GROUPS: readonly StructureGroup[] = [
  {
    title: '思维导图',
    options: [
      { value: 'mindmap', label: CHART_TYPE_LABELS.mindmap, thumbnail: <MindMapThumb /> },
      {
        value: 'mindmap',
        direction: 'right',
        label: `${CHART_TYPE_LABELS.mindmap}（向右）`,
        thumbnail: <MindMapSideThumb />,
      },
      {
        value: 'mindmap',
        direction: 'left',
        label: `${CHART_TYPE_LABELS.mindmap}（向左）`,
        thumbnail: mirrorThumb('x', <MindMapSideThumb />),
      },
      { value: 'bubble', label: CHART_TYPE_LABELS.bubble, thumbnail: <BubbleThumb /> },
    ],
  },
  {
    title: '逻辑图',
    options: [
      { value: 'logic', label: CHART_TYPE_LABELS.logic, thumbnail: <LogicThumb /> },
      {
        value: 'logic',
        direction: 'left',
        label: `${CHART_TYPE_LABELS.logic}（向左）`,
        thumbnail: mirrorThumb('x', <LogicThumb />),
      },
    ],
  },
  {
    title: '括号图',
    options: [
      { value: 'brace', label: CHART_TYPE_LABELS.brace, thumbnail: <BraceThumb /> },
      {
        value: 'brace',
        direction: 'left',
        label: `${CHART_TYPE_LABELS.brace}（向左）`,
        thumbnail: mirrorThumb('x', <BraceThumb />),
      },
    ],
  },
  {
    title: '组织结构图',
    options: [
      { value: 'org', label: `${CHART_TYPE_LABELS.org}（向下）`, thumbnail: <OrgThumb /> },
      {
        value: 'org',
        direction: 'up',
        label: `${CHART_TYPE_LABELS.org}（向上）`,
        thumbnail: mirrorThumb('y', <OrgThumb />),
      },
    ],
  },
  {
    title: '树形图',
    options: [
      { value: 'tree', label: `${CHART_TYPE_LABELS.tree}（向下）`, thumbnail: <TreeThumb /> },
      {
        value: 'tree',
        direction: 'up',
        label: `${CHART_TYPE_LABELS.tree}（向上）`,
        thumbnail: mirrorThumb('y', <TreeThumb />),
      },
    ],
  },
  {
    title: '时间轴',
    options: [
      {
        value: 'timeline',
        label: `${CHART_TYPE_LABELS.timeline}（水平）`,
        thumbnail: <TimelineThumb />,
      },
      {
        value: 'timeline',
        direction: 'down',
        label: `${CHART_TYPE_LABELS.timeline}（垂直）`,
        thumbnail: <TimelineVerticalThumb />,
      },
    ],
  },
  { title: '鱼骨图', options: [{ value: 'fishbone', label: CHART_TYPE_LABELS.fishbone, thumbnail: <FishboneThumb /> }] },
  {
    title: '树型表格',
    options: [{ value: 'treetable', label: CHART_TYPE_LABELS.treetable, thumbnail: <TreeTableThumb /> }],
  },
  { title: '矩阵图', options: [{ value: 'matrix', label: CHART_TYPE_LABELS.matrix, thumbnail: <MatrixThumb /> }] },
]

/**
 * 把方向归一化成"卡片能匹配的形式"。
 *
 * 各组里「自然方向」的那张卡（组织结构图向下、时间轴水平、思维导图双向……）不带 `direction`，
 * 所以文档里若显式存了 `down` / `right` 也要映射回 `undefined`，否则打开文档时没有卡片是高亮的。
 */
function normalizeDirection(
  chartType: ChartType,
  direction: TopicDirection | undefined,
): TopicDirection | undefined {
  switch (chartType) {
    case 'org':
    case 'tree':
      return direction === 'up' ? 'up' : undefined
    case 'timeline':
      return direction === 'down' ? 'down' : undefined
    case 'mindmap':
      return direction === 'left' || direction === 'right' ? direction : undefined
    case 'logic':
    case 'brace':
      return direction === 'left' ? 'left' : undefined
    default:
      return undefined
  }
}

/** 按（骨架 + 归一化方向）回查选项；找不到返回 null。 */
function findOption(
  chartType: ChartType,
  direction: TopicDirection | undefined,
): StructureOption | null {
  const target = normalizeDirection(chartType, direction)
  for (const group of STRUCTURE_GROUPS) {
    for (const option of group.options) {
      if (option.value !== chartType) continue
      if (normalizeDirection(option.value, option.direction) === target) {
        return option
      }
    }
  }
  return null
}

/** 卡片的稳定 key：同骨架的不同方向变体必须区分开。 */
function optionKey(option: StructureOption): string {
  return `${option.value}-${option.direction ?? 'natural'}`
}

interface StructurePickerProps {
  value: ChartType
  /** 当前画布的结构方向（`layoutConfig.direction`）。 */
  valueDirection?: TopicDirection
  onChange: (chartType: ChartType, direction?: TopicDirection) => void
  disabled?: boolean
}

export function StructurePicker({
  value,
  valueDirection,
  onChange,
  disabled = false,
}: StructurePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  // 浮层坐标（视口坐标，fixed 定位）：portal 到 body，否则被右栏滚动容器裁切
  const anchor = usePopoverAnchor(open, triggerRef)
  const current = findOption(value, valueDirection)
  const currentDirection = normalizeDirection(value, valueDirection)

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
                      const selected =
                        option.value === value &&
                        normalizeDirection(option.value, option.direction) === currentDirection
                      return (
                        <button
                          key={optionKey(option)}
                          className={`structure-picker__card${
                            selected ? ' structure-picker__card--selected' : ''
                          }`}
                          type="button"
                          // XMind 的卡片只画缩略图，不带文字；名字走 tooltip 与无障碍名
                          title={option.label}
                          aria-label={option.label}
                          aria-pressed={selected}
                          onClick={() => {
                            onChange(option.value, option.direction)
                            setOpen(false)
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
