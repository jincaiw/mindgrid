import { useEffect, useMemo, useRef, useState } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import {
  findAncestorTopicIds,
  findTopicById,
  flattenTopicTree,
  normalizeTopicIdsForBatch,
} from '../../lib/document/tree'
import { resolveTopicStyle } from '../canvas/runtime/style-resolver'
import { getActiveSheet, getSheetById } from '../../lib/document/sheets'
import { DEFAULT_THEME_ID, listThemes } from '../../lib/document/themes'
import {
  BRANCH_CHART_TYPES,
  type ChartType,
  type DocumentSnapshot,
  type EdgeEndpoint,
  type EdgeType,
  type NumberingFormat,
  type Relationship,
  type SheetBranchStyle,
  type SheetNumbering,
  type TopicDirection,
  type TopicLink,
  type TopicBorderStyle,
  type TopicShape,
  type TopicStructure,
  type TopicStyleOverrides,
  type TopicTextAlign,
  type TopicTask,
  type TopicTaskStatus,
  type TopicTextTransform,
} from '../../lib/document/types'
import type { DocumentSession } from '../document/use-document-session'
import { pickTopicImageUrl, useTopicImageUrls } from '../canvas/runtime/topic-image-store'
import { nextTextTransform } from '../canvas/runtime/text-transform'
import { MAX_FIXED_WIDTH, MIN_FIXED_WIDTH } from '../canvas/mindmap-layout'
import {
  TOPIC_IMAGE_DIALOG_OPTIONS,
  toSelectedImagePath,
} from '../canvas/runtime/topic-image-picker'
import { hasTauriRuntime } from '../../lib/ipc/transport'
import { MarkerSelector } from '../canvas/marker-selector'
import {
  buildPitchActs,
  PITCH_ASPECT_RATIOS,
  type PitchAspectRatio,
  type PitchThemeStyle,
} from '../presentation/pitch-controller'
import {
  NUMBERING_FORMAT_OPTIONS,
  NUMBERING_SEPARATORS,
} from '../canvas/numbering'
import { StructurePicker } from './structure-picker'
import { CHART_TYPE_LABELS } from './chart-type-labels'
import {
  canvasDirectionOptions,
  nodeDirectionOptions,
  supportsDirection,
} from './structure-directions'
import { SwatchPicker } from './swatch-picker'
import { PaletteEditor } from './palette-editor'
import { ChevronDownIcon } from './icons'
import { createPortal } from 'react-dom'
import { usePopoverAnchor } from './use-popover-anchor'
import {
  BRANCH_THICKNESS_OPTIONS,
  CANVAS_SETTINGS_KEYS,
  CJK_FONT_OPTIONS,
  GLOBAL_FONT_OPTIONS,
  listBranchPaletteOptions,
  resolveBranchPalette,
  resolveCanvasSettings,
  type CustomPalette,
} from '../../lib/document/canvas-settings'

/**
 * 右侧格式面板分区标题。
 *
 * 对齐 XMind：**只有一行中文小灰标题 + 上方一条发丝分隔线**——没有大写英文 eyebrow、
 * 没有折叠 chevron、没有可点击的标题行。此前那套「EYEBROW + 中文标题 + 折叠箭头」
 * 是本项目自创的样式，在实机对照里一眼就能看出和 XMind 不是一家。
 */
/**
 * 颜色字段：色块触发按钮 + ▾，点开后是 **portal 到 body** 的浮层，内含预设色板与自定义取色。
 *
 * 为什么做成浮层：XMind 的形状分组是「填充 [■▾] [色块]」，预设收在浮层里。
 * 我们原来把预设色点**平铺在面板里**，白白多占一整行高度——而侧边栏密度正是这次对标的主线。
 *
 * 必须 portal + fixed：右栏是滚动容器，挂在触发器内部的浮层会被面板裁切
 * （骨架浮层、色板浮层都踩过这个坑）。定位统一走 usePopoverAnchor。
 */
function ColorSwatchField({
  label,
  value,
  fallback,
  presets,
  onChange,
}: {
  label: string
  value: string
  fallback: string
  presets: string[]
  onChange: (color: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const anchor = usePopoverAnchor(open, triggerRef)

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
    <span className="panel__color-field" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="panel__color-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className="panel__color-trigger-swatch"
          style={{ background: toHexColor(value, fallback) }}
        />
        <ChevronDownIcon size={12} />
      </button>

      {open && anchor
        ? createPortal(
            <div
              ref={popoverRef}
              className="panel__color-popover"
              role="dialog"
              aria-label={`${label}色板`}
              style={{ top: anchor.top, right: anchor.right }}
            >
              <div className="panel__chips" role="group" aria-label={`${label}快速预设`}>
                {presets.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="panel__chip panel__chip--color"
                    style={{ background: color }}
                    aria-label={`应用${label} ${color}`}
                    onClick={() => {
                      onChange(color)
                      setOpen(false)
                    }}
                  />
                ))}
              </div>
              <label className="panel__color-custom">
                <input
                  type="color"
                  aria-label={`自定义${label}`}
                  value={toHexColor(value, fallback)}
                  onChange={(event) => onChange(event.target.value)}
                />
                <span>自定义…</span>
              </label>
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}

/**
 * 分组小节。对齐 XMind 的两点：
 * 1. 标题可折叠（展开 ▾ / 收起 ▸），默认展开；
 * 2. `action` 把该分组的**主控件**挂到标题行右侧（XMind 的「⌄ 形状 ……[形状下拉]」）。
 *
 * 折叠状态只存在组件内、不持久化：它是临时的"看一眼别的分组"的操作，
 * 记住它反而会让用户下次打开面板时找不到东西。
 */
function PanelSection({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  /** 该分组的**主控件**，挂在标题行右侧（XMind 的「⌄ 形状 ……[形状下拉]」）。 */
  action?: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="panel__section" data-collapsed={collapsed ? 'true' : undefined}>
      <h3 className="panel__section-label">
        <button
          type="button"
          className="panel__section-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronDownIcon size={12} />
          <span>{title}</span>
        </button>
        {action ? <span className="panel__section-action">{action}</span> : null}
      </h3>
      {collapsed ? null : children}
    </div>
  )
}

interface DocumentTopicEntry {
  topicId: string
  text: string
  path: string[]
}

/// 将文档所有画布的主题展平，用于关系线起点/终点的跨画布选择。
/// 路径以画布标题开头，便于在跨画布场景下区分同名主题。
function flattenDocumentTopics(sheets: DocumentSnapshot['sheets']): DocumentTopicEntry[] {
  const entries: DocumentTopicEntry[] = []
  for (const sheet of sheets) {
    const sheetEntries = flattenTopicTree(sheet.rootTopic).map((entry) => ({
      topicId: entry.topicId,
      text: entry.text,
      path: [sheet.title, ...entry.path],
    }))
    entries.push(...sheetEntries)
  }
  return entries
}

function resolveTopicText(sheets: DocumentSnapshot['sheets'], topicId: string): string {
  for (const sheet of sheets) {
    const topic = findTopicById(sheet.rootTopic, topicId)
    if (topic) {
      return topic.text
    }
  }
  return topicId
}

/** 将任意颜色值规范化为 `<input type="color">` 所需的 #rrggbb 格式。 */
function toHexColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase()
  // 解析 rgb()/rgba() 取前三分量
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (match) {
    const r = Number.parseInt(match[1], 10)
    const g = Number.parseInt(match[2], 10)
    const b = Number.parseInt(match[3], 10)
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  }
  return fallback
}

/** 形状选项标签（对齐 XMind 节点形状）。 */
const SHAPE_OPTIONS: { value: TopicShape; label: string }[] = [
  { value: 'rounded', label: '圆角' },
  { value: 'rect', label: '直角' },
  { value: 'pill', label: '胶囊' },
  { value: 'underline', label: '下划线' },
]

/** 字重选项标签（CSS font-weight 数值）。 */
const FONT_WEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 400, label: '常规' },
  { value: 500, label: '中粗' },
  { value: 600, label: '半粗' },
  { value: 700, label: '粗体' },
]

/** 字号边界（px），对齐 style-constants 深度分级范围。 */
/**
 * 字号下拉的档位（XMind 的「14 ▾」）。
 * 取 8–32 之间的常用值：滑杆的连续拖动在"选个整数"这件事上没有价值，
 * 反而容易停在 15 这种非预期值上。
 */
const FONT_SIZE_OPTIONS: number[] = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32]

/**
 * Tт 按钮当前档位的说明文案（XMind 文本工具条最后一位）。
 * 循环顺序由 `text-transform.nextTextTransform` 决定，这里只负责把状态说清楚。
 */
const TEXT_TRANSFORM_LABELS: Record<TopicTextTransform, string> = {
  none: '原样',
  uppercase: '全大写',
  lowercase: '全小写',
  capitalize: '首字母大写',
}

/** 边框粗细边界（px），0 表示无边框。 */
const BORDER_WIDTH_MIN = 0
const BORDER_WIDTH_MAX = 6

/** 将 draft 中的数值字段规范化为 number | undefined（空串/NaN 视为未设置）。 */
function toOptionalNumber(value: number | ''): number | undefined {
  if (value === '' || Number.isNaN(value)) return undefined
  return value
}

/** 节点级样式覆盖的草稿集合：空串 / false / 'none' 都表示「未设置」。 */
interface StyleOverrideDrafts {
  fill: string
  textColor: string
  borderColor: string
  shape: TopicShape | ''
  fontSize: number | ''
  fontWeight: number | ''
  borderWidth: number | ''
  width: number | ''
  borderStyle: TopicBorderStyle | ''
  textAlign: TopicTextAlign | ''
  fontFamily: string
  italic: boolean
  strikethrough: boolean
  textTransform: TopicTextTransform
  branchColor: string
}

/**
 * 从 draft 字段构造样式覆盖对象；全空返回 null（清除覆盖）。
 * 颜色 / 字体族空串视为未设置；形状空串视为未设置（沿用默认 rounded）；
 * 数值字段空串视为未设置（沿用深度分级默认）；
 * 斜体 / 删除线 / 大小写只在「开」时写入——显式 `false` 与 `none` 都是噪音，
 * 会让「清除全部样式覆盖」判空逻辑失效。
 */
function buildStyleOverrides(d: StyleOverrideDrafts): TopicStyleOverrides | null {
  const f = d.fill.trim() || undefined
  const t = d.textColor.trim() || undefined
  const b = d.borderColor.trim() || undefined
  const sh = d.shape || undefined
  const fs = toOptionalNumber(d.fontSize)
  const fw = toOptionalNumber(d.fontWeight)
  const bw = toOptionalNumber(d.borderWidth)
  // 宽度走同一个规范化入口：空串/NaN 视为未设置（= 按文字自适应）
  const w = toOptionalNumber(d.width)
  const bs = d.borderStyle || undefined
  const ta = d.textAlign || undefined
  const ff = d.fontFamily.trim() || undefined
  const tt = d.textTransform !== 'none' ? d.textTransform : undefined
  const bc = d.branchColor.trim() || undefined
  if (
    !f && !t && !b && !sh && fs == null && fw == null && bw == null &&
    w == null && !bs && !ta && !ff && !d.italic && !d.strikethrough && !tt && !bc
  ) {
    return null
  }
  return {
    ...(f ? { fill: f } : {}),
    ...(t ? { textColor: t } : {}),
    ...(b ? { borderColor: b } : {}),
    ...(sh ? { shape: sh } : {}),
    ...(fs != null ? { fontSize: fs } : {}),
    ...(fw != null ? { fontWeight: fw } : {}),
    ...(bw != null ? { borderWidth: bw } : {}),
    ...(w != null ? { width: w } : {}),
    ...(bs ? { borderStyle: bs } : {}),
    ...(ta ? { textAlign: ta } : {}),
    ...(ff ? { fontFamily: ff } : {}),
    ...(d.italic ? { italic: true } : {}),
    ...(d.strikethrough ? { strikethrough: true } : {}),
    ...(tt ? { textTransform: tt } : {}),
    ...(bc ? { branchColor: bc } : {}),
  }
}

/** 节点填充色快速预设（一键应用 fill 覆盖）。 */
const FILL_PRESETS = [
  '#5b8cff',
  '#ea580c',
  '#0d9488',
  '#dc2626',
  '#7c3aed',
  '#16a34a',
]

/** 连线类型选项（画布级分支样式）。 */
const EDGE_TYPE_OPTIONS: { value: EdgeType; label: string }[] = [
  { value: 'curve', label: '曲线' },
  { value: 'straight', label: '直线' },
  { value: 'elbow', label: '折线' },
]

/**
 * 节点级「结构」下拉的选项：空串 = 跟随画布骨架。
 *
 * 只列 `BRANCH_CHART_TYPES`（气泡图与鱼骨图是整体版式，不做单分支骨架），
 * 与布局层对外承诺的能力保持一致。带方向的变体（逻辑图（向左）等）由紧邻的
 * 「子主题方向」控件表达，不拆成十几个下拉项。
 */
const NODE_STRUCTURE_OPTIONS: readonly { value: ChartType; label: string }[] =
  BRANCH_CHART_TYPES.map((value) => ({ value, label: CHART_TYPE_LABELS[value] }))

/** 画布背景预设：浅色为主（XMind 背景色板同样以浅色打底），末两项是深色。 */
const BACKGROUND_SWATCHES = [
  { id: '#ffffff', label: '纯白', colors: ['#ffffff'] },
  { id: '#fdfbf5', label: '米白', colors: ['#fdfbf5'] },
  { id: '#f4f5f7', label: '浅灰', colors: ['#f4f5f7'] },
  { id: '#eef3fb', label: '淡蓝', colors: ['#eef3fb'] },
  { id: '#f3f7f0', label: '淡绿', colors: ['#f3f7f0'] },
  { id: '#faf1ef', label: '淡粉', colors: ['#faf1ef'] },
  { id: '#23252a', label: '深灰', colors: ['#23252a'] },
  { id: '#12141a', label: '近黑', colors: ['#12141a'] },
]

const NUMBERING_SEPARATOR_OPTIONS = [
  { value: '.', label: '1.1（点）' },
  { value: '-', label: '1-1（连字符）' },
  { value: ')', label: '1)1（右括号）' },
]

/** 标题对齐选项（XMind 样式页「对齐」三段按钮）。 */
const TEXT_ALIGN_OPTIONS: { value: TopicTextAlign; label: string }[] = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中' },
  { value: 'right', label: '右' },
]

const EDGE_ENDPOINT_OPTIONS: { value: EdgeEndpoint; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'circle', label: '圆点' },
  { value: 'arrow', label: '箭头' },
]

/** 连线粗细乘数边界（与 Rust 端 editor 校验范围对齐：0.1–10.0，UI 收窄到常用区间）。 */
const BRANCH_THICKNESS_MIN = 0.5
const BRANCH_THICKNESS_MAX = 3

/** 分支色板预设（XMind 式多色分支编码）。第一个为默认 8 色循环。 */
const BRANCH_PALETTE_PRESETS: { id: string; label: string; colors: string[] }[] = [
  {
    id: 'default',
    label: '默认 8 色',
    colors: ['#5B8DEF', '#FF8B3D', '#4CB050', '#E5484D', '#9B6BFF', '#00A6A6', '#F6BE00', '#EC6CB0'],
  },
  {
    id: 'xmind-classic',
    label: 'XMind 经典 6 色',
    colors: ['#4C92D9', '#6FBF73', '#F6C344', '#E8764F', '#C65D5D', '#8E7CC3'],
  },
  {
    id: 'cool',
    label: '冷色',
    colors: ['#3B82F6', '#06B6D4', '#8B5CF6', '#0EA5E9', '#6366F1', '#14B8A6', '#2563EB', '#0891B2'],
  },
  {
    id: 'warm',
    label: '暖色',
    colors: ['#F97316', '#EF4444', '#EAB308', '#F43F5E', '#FB923C', '#D97706', '#DC2626', '#CA8A04'],
  },
  {
    id: 'mono',
    label: '单色蓝',
    colors: ['#1E40AF', '#2563EB', '#3B82F6', '#60A5FA', '#1D4ED8', '#1E3A8A', '#2196F3', '#42A5F5'],
  },
]

/**
 * Inspector 子页类型：对标 XMind 右侧格式面板的 3 个子页。
 *
 * 与旧版 4 Tab（主题 / 画布 / 关系线 / 分组）的差异不只是改名：
 * 旧版按「数据类型」分 Tab，导致「画布信息」和「分支样式」这类同为画布级配置
 * 的分区被拆到不同页；新版按 XMind 的「样式 / 演说 / 画布」归类，
 * 关系线与边界概要归入画布页（二者都是画布级结构）。
 */
export type InspectorTab = 'style' | 'pitch' | 'canvas'

interface TabConfig {
  id: InspectorTab
  label: string
}

// 页签不带图标：XMind 的选中项是实心蓝胶囊 + 白字，未选中项之间用细竖线分隔
const TABS: TabConfig[] = [
  { id: 'style', label: '样式' },
  { id: 'pitch', label: '演说' },
  { id: 'canvas', label: '画布' },
]

interface InspectorProps {
  session: DocumentSession
  selectedTopicIds: string[]
  onSelectedTopicIdsChange: (topicIds: string[]) => void
  /** 外部 tab 切换请求（如工具栏“插入→备注”聚焦样式子页）；nonce 变化时生效。 */
  tabRequest?: { tab: InspectorTab; nonce: number } | null
  /** 「演说」子页的放映入口，与工具栏演示按钮走同一路径。 */
  onStartPresentation?: () => void
  /**
   * 「提案简报」入口（对标批次 C6）。
   * 与演示并存而非合并：演示按节点逐个渐进揭示，简报按一级分支分幕。
   */
  onStartPitch?: () => void
  pitchAspectRatio?: PitchAspectRatio
  onPitchAspectRatioChange?: (value: PitchAspectRatio) => void
  pitchThemeStyle?: PitchThemeStyle
  onPitchThemeStyleChange?: (value: PitchThemeStyle) => void
}

export function Inspector({
  session,
  selectedTopicIds,
  tabRequest,
  onStartPresentation,
  onStartPitch,
  pitchAspectRatio: controlledPitchAspectRatio,
  onPitchAspectRatioChange,
  pitchThemeStyle: controlledPitchThemeStyle,
  onPitchThemeStyleChange,
}: InspectorProps) {
  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const canvasSettings = resolveCanvasSettings(session.document?.settings)
  const activeTopic =
    session.document && session.activeTopicId
      ? findTopicById(activeSheet?.rootTopic ?? session.document.sheets[0].rootTopic, session.activeTopicId)
      : null
  // 「样式」子页首屏的选中主题预览卡。
  // 刻意用与画布**同一个** resolveTopicStyle：预览若自己算一套配色，
  // 就会变成另一个"说谎的 UI"（比没有预览更糟）。
  const topicPreviewStyle = useMemo(() => {
    const rootTopic = activeSheet?.rootTopic
    if (!rootTopic || !activeTopic) {
      return null
    }
    const ancestors = findAncestorTopicIds(rootTopic, activeTopic.id) ?? []
    const level1Id = ancestors[1]
    const branchIndex =
      level1Id === undefined
        ? null
        : Math.max(
            0,
            rootTopic.children.findIndex((child) => child.id === level1Id),
          )

    return resolveTopicStyle(
      session.document?.theme?.id,
      ancestors.length,
      ancestors.length === 0 ? 'center' : 'right',
      activeTopic.styleOverrides,
      branchIndex,
    )
  }, [activeSheet?.rootTopic, activeTopic, session.document?.theme?.id])

  const movableTargetSheets = useMemo(
    () =>
      session.document?.sheets.filter((sheet) => sheet.id !== activeSheet?.id) ?? [],
    [activeSheet?.id, session.document],
  )
  // 「演说」子页展示预计幻灯片数：放映按大纲顺序逐主题推进，故等于当前画布主题数
  const activeSheetTopicCount = useMemo(
    () => (activeSheet ? flattenTopicTree(activeSheet.rootTopic).length : 0),
    [activeSheet],
  )
  // 「提案简报」幕数 = 一级分支数 + 1（总览幕），与 pitch-controller 同一套算法
  const pitchActCount = useMemo(
    () => (activeSheet ? buildPitchActs(activeSheet.rootTopic).length : 0),
    [activeSheet],
  )
  const [moveTargetSheetId, setMoveTargetSheetId] = useState(movableTargetSheets[0]?.id ?? '')
  const targetSheet = session.document ? getSheetById(session.document, moveTargetSheetId) : null
  const movableTargetParents = useMemo(
    () => (targetSheet ? flattenTopicTree(targetSheet.rootTopic) : []),
    [targetSheet],
  )
  const [moveTargetParentId, setMoveTargetParentId] = useState(targetSheet?.rootTopic.id ?? '')
  const moveTargetParentEntry = useMemo(
    () => movableTargetParents.find((entry) => entry.topicId === moveTargetParentId) ?? null,
    [movableTargetParents, moveTargetParentId],
  )
  const normalizedSelectedTopicIds = useMemo(
    () => (activeSheet ? normalizeTopicIdsForBatch(activeSheet.rootTopic, selectedTopicIds) : []),
    [activeSheet, selectedTopicIds],
  )
  const hasMultipleSelectedTopics = normalizedSelectedTopicIds.length > 1

  // —— 关系线 / 边界 / 概要：文档级与画布级数据 ——
  const documentRelationships: Relationship[] = session.document?.relationships ?? []
  const documentTopicEntries = useMemo(
    () => (session.document ? flattenDocumentTopics(session.document.sheets) : []),
    [session.document],
  )
  const sheetBoundaries = activeSheet?.boundaries ?? []
  const sheetSummaries = activeSheet?.summaries ?? []

  // —— 文档主题：列出内置主题，标记当前主题 ——
  const themes = useMemo(() => listThemes(), [])
  const currentThemeId = session.document?.theme?.id ?? DEFAULT_THEME_ID

  // —— Tab 状态：默认样式子页，选中节点时直接编辑富内容 ——
  const [activeTab, setActiveTab] = useState<InspectorTab>('canvas')
  const [localPitchAspectRatio, setLocalPitchAspectRatio] = useState<PitchAspectRatio>('16:9')
  const [localPitchThemeStyle, setLocalPitchThemeStyle] = useState<PitchThemeStyle>('document')
  const pitchAspectRatio = controlledPitchAspectRatio ?? localPitchAspectRatio
  const pitchThemeStyle = controlledPitchThemeStyle ?? localPitchThemeStyle
  const setPitchAspectRatio = (value: PitchAspectRatio) => {
    setLocalPitchAspectRatio(value)
    onPitchAspectRatioChange?.(value)
  }
  const setPitchThemeStyle = (value: PitchThemeStyle) => {
    setLocalPitchThemeStyle(value)
    onPitchThemeStyleChange?.(value)
  }

  // 外部 tab 切换请求（nonce 变化即切到指定 tab）
  useEffect(() => {
    if (tabRequest) {
      setActiveTab(tabRequest.tab)
    }
  }, [tabRequest])

  useEffect(() => {
    setMoveTargetSheetId(movableTargetSheets[0]?.id ?? '')
  }, [movableTargetSheets])

  useEffect(() => {
    setMoveTargetParentId(targetSheet?.rootTopic.id ?? '')
  }, [targetSheet?.id, targetSheet?.rootTopic.id])

  // —— 富内容编辑本地态：随选中主题切换同步，失焦时提交 ——
  const [notesDraft, setNotesDraft] = useState(activeTopic?.notes ?? '')
  const [linkUrlDraft, setLinkUrlDraft] = useState(activeTopic?.link?.url ?? '')
  const [linkTitleDraft, setLinkTitleDraft] = useState(activeTopic?.link?.title ?? '')
  const [labelsDraft, setLabelsDraft] = useState((activeTopic?.labels ?? []).join(', '))
  const [styleRefDraft, setStyleRefDraft] = useState(activeTopic?.styleRef ?? '')
  // —— 节点级样式覆盖：颜色 / 形状 / 排印 / 边框粗细，失焦或点击时提交 ——
  const [fillDraft, setFillDraft] = useState(activeTopic?.styleOverrides?.fill ?? '')
  const [textColorDraft, setTextColorDraft] = useState(activeTopic?.styleOverrides?.textColor ?? '')
  const [borderColorDraft, setBorderColorDraft] = useState(
    activeTopic?.styleOverrides?.borderColor ?? '',
  )
  const [shapeDraft, setShapeDraft] = useState<TopicShape | ''>(
    activeTopic?.styleOverrides?.shape ?? '',
  )
  const [fontSizeDraft, setFontSizeDraft] = useState<number | ''>(
    activeTopic?.styleOverrides?.fontSize ?? '',
  )
  const [fontWeightDraft, setFontWeightDraft] = useState<number | ''>(
    activeTopic?.styleOverrides?.fontWeight ?? '',
  )
  // 宽度（XMind 样式页「宽度」）：空串 = 按文字自适应
  const [widthDraft, setWidthDraft] = useState<number | ''>(
    activeTopic?.styleOverrides?.width ?? '',
  )
  const [borderStyleDraft, setBorderStyleDraft] = useState<TopicBorderStyle | ''>(
    activeTopic?.styleOverrides?.borderStyle ?? '',
  )
  const [textAlignDraft, setTextAlignDraft] = useState<TopicTextAlign | ''>(
    activeTopic?.styleOverrides?.textAlign ?? '',
  )
  // 文本类覆盖：字体族空串 = 跟随画布全局字体；斜体/删除线只有「开」才写入；
  // 大小写缺省 none（原样）
  const [fontFamilyDraft, setFontFamilyDraft] = useState(
    activeTopic?.styleOverrides?.fontFamily ?? '',
  )
  const [italicDraft, setItalicDraft] = useState(activeTopic?.styleOverrides?.italic === true)
  const [strikethroughDraft, setStrikethroughDraft] = useState(
    activeTopic?.styleOverrides?.strikethrough === true,
  )
  const [textTransformDraft, setTextTransformDraft] = useState<TopicTextTransform>(
    activeTopic?.styleOverrides?.textTransform ?? 'none',
  )
  // 节点级分支线条颜色（空串 = 跟随色板）
  const [branchColorDraft, setBranchColorDraft] = useState(
    activeTopic?.styleOverrides?.branchColor ?? '',
  )
  // 节点级骨架覆盖（空串 = 跟随画布骨架 / 跟随所在分支）
  const [structureChartTypeDraft, setStructureChartTypeDraft] = useState<ChartType | ''>(
    activeTopic?.structure?.chartType ?? '',
  )
  const [structureDirectionDraft, setStructureDirectionDraft] = useState<TopicDirection | ''>(
    activeTopic?.structure?.direction ?? '',
  )
  const [borderWidthDraft, setBorderWidthDraft] = useState<number | ''>(
    activeTopic?.styleOverrides?.borderWidth ?? '',
  )
  const [taskStatusDraft, setTaskStatusDraft] = useState<TopicTaskStatus>(
    activeTopic?.task?.status ?? 'none',
  )
  const [taskPriorityDraft, setTaskPriorityDraft] = useState(
    activeTopic?.task?.priority != null ? String(activeTopic.task.priority) : '',
  )
  const [taskDueDateDraft, setTaskDueDateDraft] = useState(
    activeTopic?.task?.dueDateMs != null
      ? new Date(activeTopic.task.dueDateMs).toISOString().slice(0, 10)
      : '',
  )
  const [taskStartDateDraft, setTaskStartDateDraft] = useState(
    activeTopic?.task?.startDateMs != null
      ? new Date(activeTopic.task.startDateMs).toISOString().slice(0, 10)
      : '',
  )

  const activeNumbering = activeSheet?.numbering

  /** 写入画布级编号配置；enabled=false 或全默认时清除，避免留下无意义的空配置。 */
  const applyNumbering = (patch: {
    enabled?: boolean
    format?: NumberingFormat
    separator?: string
    includeRoot?: boolean
  }) => {
    if (!activeSheet) return

    const merged: SheetNumbering = {
      enabled: activeNumbering?.enabled === true,
    }
    if (activeNumbering?.format) merged.format = activeNumbering.format
    if (activeNumbering?.separator) merged.separator = activeNumbering.separator
    if (activeNumbering?.includeRoot) merged.includeRoot = true

    if (patch.enabled !== undefined) merged.enabled = patch.enabled
    if (patch.format !== undefined) merged.format = patch.format
    if (patch.separator !== undefined) {
      merged.separator = NUMBERING_SEPARATORS.includes(
        patch.separator as (typeof NUMBERING_SEPARATORS)[number],
      )
        ? patch.separator
        : '.'
    }
    if (patch.includeRoot !== undefined) {
      if (patch.includeRoot) merged.includeRoot = true
      else delete merged.includeRoot
    }

    const next: SheetNumbering | null = merged.enabled ? merged : null

    if (JSON.stringify(activeNumbering ?? null) === JSON.stringify(next)) return
    void session.setSheetNumbering(activeSheet.id, next)
  }

  // —— 画布级分支样式：连线类型 / 粗细 / 色板，写入 activeSheet.branchStyle ——
  // edgeType 与 colorPalette 点击即提交（无 draft）；thickness 走 slider draft，失焦提交。
  // —— 自定义配色方案：列表存 document.settings，选中项仍走 canvas.branchPalette ——
  const customPalettes = canvasSettings.customPalettes
  const paletteOptions = listBranchPaletteOptions(customPalettes)
  const [editingPalette, setEditingPalette] = useState<CustomPalette | null | 'new'>(null)

  /**
   * 应用配色方案：写入选中的色板 id，并**同时显式打开彩虹分支**。
   *
   * 否则用户在「彩虹分支」未显式开启时选任何配色方案，画布都会继续用主题自带色板，
   * 看起来像"点了没反应"（端到端冒烟时正是这个组合让人误判）。
   */
  const applyBranchPalette = (paletteId: string) => {
    void session.setDocumentSetting(CANVAS_SETTINGS_KEYS.branchPalette, paletteId)
    void session.setDocumentSetting(CANVAS_SETTINGS_KEYS.rainbowBranch, true)
  }

  const saveCustomPalette = (palette: CustomPalette) => {
    const existing = customPalettes.some((item) => item.id === palette.id)
    const next = existing
      ? customPalettes.map((item) => (item.id === palette.id ? palette : item))
      : [...customPalettes, palette]

    void session
      .setDocumentSetting(CANVAS_SETTINGS_KEYS.customPalettes, next)
      .then(() => applyBranchPalette(palette.id))
    setEditingPalette(null)
  }

  const deleteCustomPalette = (paletteId: string) => {
    const next = customPalettes.filter((item) => item.id !== paletteId)
    void session.setDocumentSetting(CANVAS_SETTINGS_KEYS.customPalettes, next)
    // 删掉的正是当前选中的方案时，回落到内置首套，避免选中一个不存在的 id
    if (canvasSettings.branchPalette === paletteId) {
      void session.setDocumentSetting(CANVAS_SETTINGS_KEYS.branchPalette, 'rainbow')
    }
    setEditingPalette(null)
  }

  /**
   * 导图样式 / 高级布局这几项**只对思维导图骨架生效**（其它骨架的布局引擎不消费这些选项）。
   * XMind 同样会按当前骨架把不适用的选项置灰——比"点了没反应"诚实得多。
   */
  const layoutOptionsApply = (activeSheet?.chartType ?? 'mindmap') === 'mindmap'
  const layoutOptionHint = layoutOptionsApply
    ? undefined
    : '仅对「思维导图」骨架生效，当前骨架不使用这些布局选项'

  /** 画布骨架是否支持结构方向（气泡图/鱼骨图不支持，控件应置灰）。 */
  const canvasSupportsDirection = supportsDirection(activeSheet?.chartType)

  /**
   * 节点级「结构」实际生效的骨架：节点覆盖优先于画布骨架。
   * 「子主题方向」的选项按它来给——否则在脑图画布上选了组织结构图结构，
   * 方向控件却还只给左右两个选项。
   */
  const effectiveStructureType = structureChartTypeDraft || activeSheet?.chartType
  const nodeSupportsDirection = supportsDirection(effectiveStructureType)

  const activeBranchStyle = activeSheet?.branchStyle
  const [branchThicknessDraft, setBranchThicknessDraft] = useState<number | ''>(
    activeBranchStyle?.thickness ?? '',
  )

  // 选中主题变化时同步本地态（用 topic id 作为依赖键）
  const activeTopicKey = activeTopic?.id ?? ''
  useEffect(() => {
    setNotesDraft(activeTopic?.notes ?? '')
    setLinkUrlDraft(activeTopic?.link?.url ?? '')
    setLinkTitleDraft(activeTopic?.link?.title ?? '')
    setLabelsDraft((activeTopic?.labels ?? []).join(', '))
    setStyleRefDraft(activeTopic?.styleRef ?? '')
    setFillDraft(activeTopic?.styleOverrides?.fill ?? '')
    setTextColorDraft(activeTopic?.styleOverrides?.textColor ?? '')
    setBorderColorDraft(activeTopic?.styleOverrides?.borderColor ?? '')
    setShapeDraft(activeTopic?.styleOverrides?.shape ?? '')
    setFontSizeDraft(activeTopic?.styleOverrides?.fontSize ?? '')
    setFontWeightDraft(activeTopic?.styleOverrides?.fontWeight ?? '')
    setBorderWidthDraft(activeTopic?.styleOverrides?.borderWidth ?? '')
    setWidthDraft(activeTopic?.styleOverrides?.width ?? '')
    setBorderStyleDraft(activeTopic?.styleOverrides?.borderStyle ?? '')
    setTextAlignDraft(activeTopic?.styleOverrides?.textAlign ?? '')
    setFontFamilyDraft(activeTopic?.styleOverrides?.fontFamily ?? '')
    setItalicDraft(activeTopic?.styleOverrides?.italic === true)
    setStrikethroughDraft(activeTopic?.styleOverrides?.strikethrough === true)
    setTextTransformDraft(activeTopic?.styleOverrides?.textTransform ?? 'none')
    setBranchColorDraft(activeTopic?.styleOverrides?.branchColor ?? '')
    setStructureChartTypeDraft(activeTopic?.structure?.chartType ?? '')
    setStructureDirectionDraft(activeTopic?.structure?.direction ?? '')
    setTaskStatusDraft(activeTopic?.task?.status ?? 'none')
    setTaskPriorityDraft(
      activeTopic?.task?.priority != null ? String(activeTopic.task.priority) : '',
    )
    setTaskDueDateDraft(
      activeTopic?.task?.dueDateMs != null
        ? new Date(activeTopic.task.dueDateMs).toISOString().slice(0, 10)
        : '',
    )
    setTaskStartDateDraft(
      activeTopic?.task?.startDateMs != null
        ? new Date(activeTopic.task.startDateMs).toISOString().slice(0, 10)
        : '',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopicKey, session.document?.revision])

  // —— 关系线创建表单本地态：起点默认跟随活动主题 ——
  const [relFromId, setRelFromId] = useState(activeTopic?.id ?? '')
  const [relToId, setRelToId] = useState('')
  const [relLabel, setRelLabel] = useState('')

  // —— 边界 / 概要创建表单本地态 ——
  const [boundaryLabel, setBoundaryLabel] = useState('')
  const [summaryLabel, setSummaryLabel] = useState('')

  // —— 主题图片：Tauri 走原生文件对话框，浏览器开发态降级为隐藏 file input ——
  const imageFileInputRef = useRef<HTMLInputElement | null>(null)
  const topicImageUrls = useTopicImageUrls([activeTopic?.image])
  const topicImageUrl = activeTopic
    ? pickTopicImageUrl(activeTopic.image, topicImageUrls)
    : null

  const insertTopicImage = async (sourcePath: string) => {
    if (!activeTopic) {
      return
    }

    await session.setTopicImage(activeTopic.id, sourcePath)
  }

  const handlePickTopicImage = async () => {
    if (!activeTopic) {
      return
    }

    if (hasTauriRuntime()) {
      // 过滤条件与返回值归一化都在 topic-image-picker 里（可测），组件只负责编排
      const selected = await openFileDialog({ ...TOPIC_IMAGE_DIALOG_OPTIONS })
      const selectedPath = toSelectedImagePath(selected)

      if (selectedPath) {
        await insertTopicImage(selectedPath)
      }

      return
    }

    // 非 Tauri 环境（pnpm dev / 测试）：点击隐藏 input，由 onChange 读成 data URL 再提交
    imageFileInputRef.current?.click()
  }

  // 活动主题切换时，若起点未设置或失效则回填为活动主题
  useEffect(() => {
    if (activeTopic && (!relFromId || !documentTopicEntries.some((e) => e.topicId === relFromId))) {
      setRelFromId(activeTopic.id)
    }
  }, [activeTopic, documentTopicEntries, relFromId])

  // 文档切换时重置关系线终点与标签
  useEffect(() => {
    setRelToId('')
    setRelLabel('')
    setBoundaryLabel('')
    setSummaryLabel('')
  }, [session.document?.documentId])

  // 画布切换或 branchStyle 变化时同步 thickness draft
  const activeSheetIdForBranch = activeSheet?.id ?? ''
  useEffect(() => {
    setBranchThicknessDraft(activeBranchStyle?.thickness ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSheetIdForBranch, activeBranchStyle?.thickness])

  const canCreateRelationship =
    !!relFromId && !!relToId && relFromId !== relToId && !!session.document
  const canCreateBoundaryFromSelection = normalizedSelectedTopicIds.length >= 2
  const canCreateSummaryFromSelection =
    normalizedSelectedTopicIds.length >= 2 && summaryLabel.trim().length > 0

  /**
   * 应用画布级分支样式覆盖：以 patch 合并到当前 activeSheet.branchStyle，
   * 默认值字段（edgeType='curve' / thickness=1 / colorPalette=[]）不写入；全空时清除覆盖。
   * 仅当与当前文档值不同时提交，避免 noop 入历史栈。
   */
  const applyBranchStyle = (
    patch: Partial<{
      edgeType: EdgeType
      thickness: number | ''
      colorPalette: string[] | null
      endpoint: EdgeEndpoint
    }>,
  ) => {
    if (!activeSheet) return

    const merged: SheetBranchStyle = {}
    if (activeBranchStyle?.edgeType && activeBranchStyle.edgeType !== 'curve') {
      merged.edgeType = activeBranchStyle.edgeType
    }
    if (
      activeBranchStyle?.thickness != null &&
      activeBranchStyle.thickness !== 1
    ) {
      merged.thickness = activeBranchStyle.thickness
    }
    if (
      activeBranchStyle?.colorPalette &&
      activeBranchStyle.colorPalette.length > 0
    ) {
      merged.colorPalette = activeBranchStyle.colorPalette
    }
    if (activeBranchStyle?.endpoint && activeBranchStyle.endpoint !== 'none') {
      merged.endpoint = activeBranchStyle.endpoint
    }

    if ('edgeType' in patch && patch.edgeType !== undefined) {
      if (patch.edgeType === 'curve') delete merged.edgeType
      else merged.edgeType = patch.edgeType
    }
    if ('thickness' in patch && patch.thickness !== undefined) {
      const t = patch.thickness
      if (t === '' || t === 1) delete merged.thickness
      else merged.thickness = t
      setBranchThicknessDraft(t)
    }
    if ('colorPalette' in patch && patch.colorPalette !== undefined) {
      const palette = patch.colorPalette
      if (palette === null || palette.length === 0) {
        delete merged.colorPalette
      } else {
        merged.colorPalette = palette
      }
    }
    if ('endpoint' in patch && patch.endpoint !== undefined) {
      if (patch.endpoint === 'none') delete merged.endpoint
      else merged.endpoint = patch.endpoint
    }

    const keys = Object.keys(merged) as (keyof SheetBranchStyle)[]
    const next: SheetBranchStyle | null = keys.length === 0 ? null : merged

    if (JSON.stringify(activeBranchStyle ?? null) === JSON.stringify(next)) return
    void session.setSheetBranchStyle(activeSheet.id, next)
  }

  /**
   * 应用节点样式覆盖：以 patch 覆盖当前 draft，同步本地态并提交到会话。
   * patch 中未提供的字段沿用当前 draft；空串/undefined 语义由 buildStyleOverrides 处理。
   * 仅当与当前文档值不同时提交，避免 noop 入历史栈。
   */
  const applyStyleOverride = (patch: Partial<StyleOverrideDrafts>) => {
    const f = patch.fill !== undefined ? patch.fill : fillDraft
    const t = patch.textColor !== undefined ? patch.textColor : textColorDraft
    const b = patch.borderColor !== undefined ? patch.borderColor : borderColorDraft
    const sh = patch.shape !== undefined ? patch.shape : shapeDraft
    const fs = patch.fontSize !== undefined ? patch.fontSize : fontSizeDraft
    const fw = patch.fontWeight !== undefined ? patch.fontWeight : fontWeightDraft
    const bw = patch.borderWidth !== undefined ? patch.borderWidth : borderWidthDraft
    const w = patch.width !== undefined ? patch.width : widthDraft
    const bs = patch.borderStyle !== undefined ? patch.borderStyle : borderStyleDraft
    const ta = patch.textAlign !== undefined ? patch.textAlign : textAlignDraft
    const ff = patch.fontFamily !== undefined ? patch.fontFamily : fontFamilyDraft
    const it = patch.italic !== undefined ? patch.italic : italicDraft
    const st = patch.strikethrough !== undefined ? patch.strikethrough : strikethroughDraft
    const tt = patch.textTransform !== undefined ? patch.textTransform : textTransformDraft
    const bc = patch.branchColor !== undefined ? patch.branchColor : branchColorDraft
    if (patch.fill !== undefined) setFillDraft(patch.fill)
    if (patch.textColor !== undefined) setTextColorDraft(patch.textColor)
    if (patch.borderColor !== undefined) setBorderColorDraft(patch.borderColor)
    if (patch.shape !== undefined) setShapeDraft(patch.shape)
    if (patch.fontSize !== undefined) setFontSizeDraft(patch.fontSize)
    if (patch.fontWeight !== undefined) setFontWeightDraft(patch.fontWeight)
    if (patch.borderWidth !== undefined) setBorderWidthDraft(patch.borderWidth)
    if (patch.width !== undefined) setWidthDraft(patch.width)
    if (patch.borderStyle !== undefined) setBorderStyleDraft(patch.borderStyle)
    if (patch.textAlign !== undefined) setTextAlignDraft(patch.textAlign)
    if (patch.fontFamily !== undefined) setFontFamilyDraft(patch.fontFamily)
    if (patch.italic !== undefined) setItalicDraft(patch.italic)
    if (patch.strikethrough !== undefined) setStrikethroughDraft(patch.strikethrough)
    if (patch.textTransform !== undefined) setTextTransformDraft(patch.textTransform)
    if (patch.branchColor !== undefined) setBranchColorDraft(patch.branchColor)
    if (!activeTopic) return
    const next = buildStyleOverrides({
      fill: f,
      textColor: t,
      borderColor: b,
      shape: sh,
      fontSize: fs,
      fontWeight: fw,
      borderWidth: bw,
      width: w,
      borderStyle: bs,
      textAlign: ta,
      fontFamily: ff,
      italic: it,
      strikethrough: st,
      textTransform: tt,
      branchColor: bc,
    })
    if (JSON.stringify(activeTopic.styleOverrides ?? null) !== JSON.stringify(next)) {
      void session.setTopicStyleOverrides(activeTopic.id, next)
    }
  }

  /**
   * 写入节点级骨架覆盖（对齐 XMind 样式页「结构」）。两项全空则清除，回退画布骨架。
   *
   * 空字段不写进对象：`{ chartType: undefined }` 落盘后是噪音，也会让"清除"的判空失效。
   */
  const applyTopicStructure = (
    patch: Partial<{ chartType: ChartType | ''; direction: TopicDirection | '' }>,
  ) => {
    const chartType = patch.chartType !== undefined ? patch.chartType : structureChartTypeDraft
    const direction =
      patch.direction !== undefined ? patch.direction : structureDirectionDraft
    if (patch.chartType !== undefined) setStructureChartTypeDraft(patch.chartType)
    if (patch.direction !== undefined) setStructureDirectionDraft(patch.direction)
    if (!activeTopic) return

    const next: TopicStructure | null =
      chartType === '' && direction === ''
        ? null
        : {
            ...(chartType ? { chartType } : {}),
            ...(direction ? { direction } : {}),
          }
    if (JSON.stringify(activeTopic.structure ?? null) !== JSON.stringify(next)) {
      void session.setTopicStructure(activeTopic.id, next)
    }
  }

  return (
    <aside className="panel panel--inspector" aria-label="右侧检查器">
      <div className="panel__tabs" role="tablist" aria-label="属性面板分类">
        {TABS.map((tab) => {
          const selected = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`inspector-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`inspector-tabpanel-${tab.id}`}
              className={`panel__tab${selected ? ' panel__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {/* XMind 的页签没有图标：选中项是实心蓝胶囊，未选中项之间用细竖线分隔 */}
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className="panel__tab-body">
        {activeTab === 'style' ? (
          <div
            id="inspector-tabpanel-style"
            role="tabpanel"
            aria-labelledby="inspector-tab-style"
            className="panel__tab-panel"
          >
            {/* 首屏第一元素：选中主题预览（XMind 样式页同样是这条淡色预览条）。
                只展示，不加下拉箭头——XMind 的 ▾ 是「切换主题」的下拉，我们没有等价功能，
                画一个点不动的箭头就是假控件。 */}
            <div className="panel__topic-preview" aria-label="选中主题预览">
              <span
                className="panel__topic-preview-chip"
                style={
                  topicPreviewStyle
                    ? {
                        background: topicPreviewStyle.fill,
                        color: topicPreviewStyle.textColor,
                      }
                    : undefined
                }
              >
                {hasMultipleSelectedTopics
                  ? `已选中 ${normalizedSelectedTopicIds.length} 个主题`
                  : (activeTopic?.text ?? '未选中主题')}
              </span>
            </div>

            {/* 小节顺序对齐 XMind 样式页：形状 → 文本 → 结构 → 分支 → 编号。
                节点级富内容（备注/链接/标签/标记/样式引用）与主题属性是 XMind 放在画布内联
                或别处的编辑入口，排在这些外观分组之后，不再挡在首屏。 */}
            {activeTopic && !hasMultipleSelectedTopics ? (
              <>
            <PanelSection
              title="形状"
              action={
                <select
                  className="panel__section-control"
                  aria-label="节点形状"
                  value={shapeDraft || 'rounded'}
                  onChange={(event) =>
                    applyStyleOverride({ shape: event.target.value as TopicShape })
                  }
                >
                  {SHAPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              }
            >
                {/* XMind 的形状分组是「填充 [■▾][色块]」「边框 [▭▾][色块]」两行，
                    预设收进浮层。原来把预设色点平铺在面板里，白占一整行高度。 */}
                <div className="panel__field">
                  <span>填充</span>
                  <ColorSwatchField
                    label="填充色"
                    value={fillDraft}
                    fallback="#ffffff"
                    presets={FILL_PRESETS}
                    onChange={(color) => applyStyleOverride({ fill: color })}
                  />
                </div>

                <div className="panel__field">
                  <span>边框</span>
                  <ColorSwatchField
                    label="边框色"
                    value={borderColorDraft}
                    fallback="#94a3b8"
                    presets={FILL_PRESETS}
                    onChange={(color) => applyStyleOverride({ borderColor: color })}
                  />
                </div>

                <div className="panel__field">
                  <span>
                    边框粗细
                    <output className="panel__value-out">
                      {borderWidthDraft === '' ? '默认' : `${borderWidthDraft}px`}
                    </output>
                  </span>
                  <input
                    type="range"
                    aria-label="节点边框粗细"
                    min={BORDER_WIDTH_MIN}
                    max={BORDER_WIDTH_MAX}
                    step={0.5}
                    value={borderWidthDraft === '' ? 1 : borderWidthDraft}
                    onChange={(e) => setBorderWidthDraft(Number(e.target.value))}
                    onPointerUp={() => applyStyleOverride({})}
                    onKeyUp={() => applyStyleOverride({})}
                    onBlur={() => applyStyleOverride({})}
                  />
                </div>

                <div className="panel__field">
                  <span>边框线型</span>
                  <select
                    aria-label="节点边框线型"
                    value={borderStyleDraft || 'solid'}
                    onChange={(e) => {
                      const next = e.target.value
                      if (next === 'none') {
                        // 无边框 = 线宽置 0（与渲染端「borderWidth<=0 不描边」一致）
                        setBorderWidthDraft(0)
                        applyStyleOverride({ borderWidth: 0, borderStyle: 'solid' })
                        return
                      }
                      applyStyleOverride({ borderStyle: next as TopicBorderStyle })
                    }}
                  >
                    <option value="none">无</option>
                    <option value="solid">实线</option>
                    <option value="dashed">虚线</option>
                    <option value="dotted">点线</option>
                  </select>
                </div>

                <div className="panel__field">
                  <span>宽度</span>
                  <div className="panel__field-row panel__field-row--width">
                    {/* 「数值 + PX」包成一组：否则 PX 会作为第三个孩子被挤到下一行 */}
                    <span className="panel__width-input">
                      <input
                        type="number"
                        aria-label="节点宽度"
                        min={MIN_FIXED_WIDTH}
                        max={MAX_FIXED_WIDTH}
                        step={2}
                        value={widthDraft === '' ? '' : widthDraft}
                        placeholder="自动"
                        onChange={(e) => {
                          const raw = e.target.value
                          setWidthDraft(raw === '' ? '' : Number(raw))
                        }}
                        onBlur={() => applyStyleOverride({})}
                        onKeyUp={(e) => {
                          if (e.key === 'Enter') applyStyleOverride({})
                        }}
                      />
                      {/* XMind 的宽度行是「66 PX 适合」：数值 + 单位 + 适合 */}
                      <span className="panel__unit">PX</span>
                    </span>
                    <button
                      type="button"
                      className="panel__action panel__action--ghost"
                      title="按文字内容自适应宽度"
                      onClick={() => {
                        setWidthDraft('')
                        applyStyleOverride({ width: '' })
                      }}
                    >
                      适合
                    </button>
                  </div>
                </div>

            </PanelSection>

            <PanelSection title="文本">
                <div className="panel__field">
                  <span>字体</span>
                  <select
                    aria-label="节点字体族"
                    value={fontFamilyDraft}
                    onChange={(e) => {
                      // 存字体栈本身而非选项 id（见 types.ts 的说明），
                      // 所以这里写入的是 option.segment，不是 option.id。
                      setFontFamilyDraft(e.target.value)
                      applyStyleOverride({ fontFamily: e.target.value })
                    }}
                  >
                    <option value="">跟随画布</option>
                    {GLOBAL_FONT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.segment}>
                        {option.label}
                      </option>
                    ))}
                    {/* 手改过的 .mgd 可能带任意字体栈：给个回显项，避免 select 显示成空 */}
                    {fontFamilyDraft !== '' &&
                    !GLOBAL_FONT_OPTIONS.some((option) => option.segment === fontFamilyDraft) ? (
                      <option value={fontFamilyDraft}>自定义</option>
                    ) : null}
                  </select>
                </div>

                {/* 下拉而不是滑杆：XMind 这里就是「14 ▾」。滑杆既占一整行、
                    也拖不准（想选 16 很容易停在 15），改成离散档位反而更快。 */}
                <div className="panel__field">
                  <span>字号</span>
                  <select
                    aria-label="节点标题字号"
                    value={fontSizeDraft === '' ? '' : String(fontSizeDraft)}
                    onChange={(event) => {
                      const next = event.target.value === '' ? '' : Number(event.target.value)
                      setFontSizeDraft(next)
                      applyStyleOverride({ fontSize: next })
                    }}
                  >
                    <option value="">默认</option>
                    {FONT_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 同理改成下拉：XMind 是「Regular ▾」，4 段按钮白占一整行宽度 */}
                <div className="panel__field">
                  <span>字重</span>
                  <select
                    aria-label="节点标题字重"
                    value={fontWeightDraft === '' ? '' : String(fontWeightDraft)}
                    onChange={(event) => {
                      const next = event.target.value === '' ? '' : Number(event.target.value)
                      setFontWeightDraft(next)
                      applyStyleOverride({ fontWeight: next })
                    }}
                  >
                    <option value="">默认</option>
                    {FONT_WEIGHT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="panel__field">
                  <span>文字色</span>
                  <div className="panel__field-row">
                    <label className="panel__color-swatch">
                      <input
                        type="color"
                        aria-label="节点文字色"
                        value={toHexColor(textColorDraft, '#0f172a')}
                        onChange={(e) => setTextColorDraft(e.target.value)}
                        onBlur={() => applyStyleOverride({})}
                      />
                    </label>
                  </div>
                </div>

                {/* XMind 文本工具条的 B / I / S / Tт 四位。
                    加粗复用已有的 font-weight 覆盖（B 在两个常用字重间切换），
                    斜体 / 删除线 / 大小写是本轮新增的节点级覆盖。 */}
                <div className="panel__field">
                  <span>
                    文字样式
                    <output className="panel__value-out">
                      {TEXT_TRANSFORM_LABELS[textTransformDraft]}
                    </output>
                  </span>
                  <div className="panel__segmented" role="group" aria-label="文字样式">
                    <button
                      type="button"
                      className={`panel__seg${fontWeightDraft === 700 ? ' panel__seg--active' : ''}`}
                      aria-pressed={fontWeightDraft === 700}
                      aria-label="加粗"
                      title="加粗"
                      style={{ fontWeight: 700 }}
                      onClick={() =>
                        applyStyleOverride({ fontWeight: fontWeightDraft === 700 ? 400 : 700 })
                      }
                    >
                      B
                    </button>
                    <button
                      type="button"
                      className={`panel__seg${italicDraft ? ' panel__seg--active' : ''}`}
                      aria-pressed={italicDraft}
                      aria-label="斜体"
                      title="斜体"
                      style={{ fontStyle: 'italic' }}
                      onClick={() => applyStyleOverride({ italic: !italicDraft })}
                    >
                      I
                    </button>
                    <button
                      type="button"
                      className={`panel__seg${strikethroughDraft ? ' panel__seg--active' : ''}`}
                      aria-pressed={strikethroughDraft}
                      aria-label="删除线"
                      title="删除线"
                      style={{ textDecoration: 'line-through' }}
                      onClick={() => applyStyleOverride({ strikethrough: !strikethroughDraft })}
                    >
                      S
                    </button>
                    <button
                      type="button"
                      className={`panel__seg${textTransformDraft !== 'none' ? ' panel__seg--active' : ''}`}
                      aria-pressed={textTransformDraft !== 'none'}
                      aria-label="大小写转换"
                      title="大小写转换：原样 → 全大写 → 全小写 → 首字母大写"
                      onClick={() =>
                        applyStyleOverride({ textTransform: nextTextTransform(textTransformDraft) })
                      }
                    >
                      Tт
                    </button>
                  </div>
                </div>

                <div className="panel__field">
                  <span>对齐</span>
                  <div className="panel__segmented" role="group" aria-label="标题对齐">
                    {TEXT_ALIGN_OPTIONS.map((opt) => {
                      const active = (textAlignDraft || 'left') === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`panel__seg${active ? ' panel__seg--active' : ''}`}
                          aria-pressed={active}
                          onClick={() => applyStyleOverride({ textAlign: opt.value })}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="panel__field-row">
                  <button
                    className="panel__action panel__action--ghost"
                    type="button"
                    title="把这个主题的样式覆盖复制给同一父主题下的其他主题"
                    onClick={() => {
                      if (!activeTopic) return
                      void session.applyTopicStyleToSiblings(activeTopic.id)
                    }}
                  >
                    应用到同级主题
                  </button>
                  {activeTopic.styleOverrides ? (
                    <button
                      className="panel__action panel__action--ghost"
                      type="button"
                      onClick={() => void session.setTopicStyleOverrides(activeTopic.id, null)}
                    >
                      清除全部样式覆盖
                    </button>
                  ) : null}
                </div>

                <div className="panel__field">
                  <span>任务</span>
                  <div className="panel__field-row">
                    <select
                      aria-label="任务状态"
                      value={taskStatusDraft}
                      onChange={(e) => {
                        const nextStatus = e.target.value as TopicTaskStatus
                        setTaskStatusDraft(nextStatus)
                        const priority = taskPriorityDraft
                          ? Number.parseInt(taskPriorityDraft, 10)
                          : undefined
                        const dueDateMs = taskDueDateDraft
                          ? new Date(taskDueDateDraft).getTime()
                          : undefined
                        const startDateMs = taskStartDateDraft
                          ? new Date(taskStartDateDraft).getTime()
                          : undefined
                        const nextTask: TopicTask | null =
                          nextStatus === 'none'
                            ? null
                            : { status: nextStatus, ...(priority != null ? { priority } : {}), ...(dueDateMs != null ? { dueDateMs } : {}), ...(startDateMs != null ? { startDateMs } : {}) }
                        void session.setTopicTask(activeTopic.id, nextTask)
                      }}
                    >
                      <option value="none">无任务</option>
                      <option value="pending">待办</option>
                      <option value="started">进行中</option>
                      <option value="completed">已完成</option>
                    </select>
                    <input
                      type="number"
                      aria-label="任务优先级"
                      min={1}
                      max={5}
                      value={taskPriorityDraft}
                      onChange={(e) => setTaskPriorityDraft(e.target.value)}
                      onBlur={() => {
                        if (taskStatusDraft === 'none') return
                        const priority = taskPriorityDraft
                          ? Number.parseInt(taskPriorityDraft, 10)
                          : undefined
                        const dueDateMs = taskDueDateDraft
                          ? new Date(taskDueDateDraft).getTime()
                          : undefined
                        const startDateMs = taskStartDateDraft
                          ? new Date(taskStartDateDraft).getTime()
                          : undefined
                        const currentPriority = activeTopic.task?.priority
                        if (currentPriority !== priority) {
                          const nextTask: TopicTask = {
                            status: taskStatusDraft,
                            ...(priority != null ? { priority } : {}),
                            ...(dueDateMs != null ? { dueDateMs } : {}),
                            ...(startDateMs != null ? { startDateMs } : {}),
                          }
                          void session.setTopicTask(activeTopic.id, nextTask)
                        }
                      }}
                      placeholder="优先级 1-5"
                    />
                  </div>
                  <input
                    type="date"
                    aria-label="任务截止日期"
                    value={taskDueDateDraft}
                    onChange={(e) => setTaskDueDateDraft(e.target.value)}
                    onBlur={() => {
                      if (taskStatusDraft === 'none') return
                      const priority = taskPriorityDraft
                        ? Number.parseInt(taskPriorityDraft, 10)
                        : undefined
                      const dueDateMs = taskDueDateDraft
                        ? new Date(taskDueDateDraft).getTime()
                        : undefined
                      const startDateMs = taskStartDateDraft
                        ? new Date(taskStartDateDraft).getTime()
                        : undefined
                      const currentDue = activeTopic.task?.dueDateMs
                      if (currentDue !== dueDateMs) {
                        const nextTask: TopicTask = {
                          status: taskStatusDraft,
                          ...(priority != null ? { priority } : {}),
                          ...(dueDateMs != null ? { dueDateMs } : {}),
                          ...(startDateMs != null ? { startDateMs } : {}),
                        }
                        void session.setTopicTask(activeTopic.id, nextTask)
                      }
                    }}
                  />
                  <input
                    type="date"
                    aria-label="任务开始日期"
                    value={taskStartDateDraft}
                    onChange={(e) => setTaskStartDateDraft(e.target.value)}
                    onBlur={() => {
                      if (taskStatusDraft === 'none') return
                      const priority = taskPriorityDraft
                        ? Number.parseInt(taskPriorityDraft, 10)
                        : undefined
                      const dueDateMs = taskDueDateDraft
                        ? new Date(taskDueDateDraft).getTime()
                        : undefined
                      const startDateMs = taskStartDateDraft
                        ? new Date(taskStartDateDraft).getTime()
                        : undefined
                      const currentStart = activeTopic.task?.startDateMs
                      if (currentStart !== startDateMs) {
                        const nextTask: TopicTask = {
                          status: taskStatusDraft,
                          ...(priority != null ? { priority } : {}),
                          ...(dueDateMs != null ? { dueDateMs } : {}),
                          ...(startDateMs != null ? { startDateMs } : {}),
                        }
                        void session.setTopicTask(activeTopic.id, nextTask)
                      }
                    }}
                  />
                </div>
                </PanelSection>
              </>
            ) : null}

            {/* 节点级「结构 / 方向」：XMind 允许单个分支用不同于整幅图的骨架 */}
            <PanelSection title="结构">
              <p className="panel__muted">
                给当前主题的子主题单独指定骨架与朝向（对齐 XMind 的节点级「结构 / 方向」）。
                缺省继承画布骨架；挂在左侧的分支会自动镜像，朝外生长。
              </p>

              <div className="panel__field">
                <span>子主题结构</span>
                <select
                  aria-label="子主题结构"
                  value={structureChartTypeDraft}
                  onChange={(event) => {
                    applyTopicStructure({ chartType: event.target.value as ChartType | '' })
                  }}
                >
                  <option value="">跟随画布骨架</option>
                  {NODE_STRUCTURE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="panel__field">
                <span>子主题方向</span>
                <div
                  className="panel__segmented"
                  role="group"
                  aria-label="子主题方向"
                  aria-disabled={!nodeSupportsDirection}
                >
                  {nodeDirectionOptions(effectiveStructureType).map((opt) => {
                    const active = structureDirectionDraft === opt.value
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        className={`panel__seg${active ? ' panel__seg--active' : ''}`}
                        aria-pressed={active}
                        disabled={!nodeSupportsDirection}
                        title={
                          nodeSupportsDirection
                            ? undefined
                            : `${CHART_TYPE_LABELS[effectiveStructureType ?? 'mindmap']}没有可调的方向参数`
                        }
                        onClick={() => applyTopicStructure({ direction: opt.value })}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className="panel__muted">
                {nodeSupportsDirection
                  ? '方向作用在「子主题往哪边长」：左分支声明向右会让它们越过本主题朝中心主题展开；' +
                    '这也正是「逻辑图（向左）」「组织结构图（向上）」「时间轴（垂直）」这些变体的来源。'
                  : `${CHART_TYPE_LABELS[effectiveStructureType ?? 'mindmap']}是整体版式，没有方向参数。`}
              </p>

              {activeTopic?.structure ? (
                <button
                  className="panel__action panel__action--ghost"
                  type="button"
                  onClick={() => {
                    setStructureChartTypeDraft('')
                    setStructureDirectionDraft('')
                    applyTopicStructure({ chartType: '', direction: '' })
                  }}
                >
                  清除结构覆盖
                </button>
              ) : null}
            </PanelSection>

            <PanelSection title="分支样式">
              <p className="panel__muted">
                连线形状、粗细与分支配色作用于整张画布；「线条颜色」作用于当前主题所在的整条分支
                （含其后代连线），节点级颜色优先。
              </p>

              <div className="panel__field">
                <span>
                  线条颜色
                  <output className="panel__value-out">
                    {branchColorDraft === '' ? '跟随色板' : branchColorDraft}
                  </output>
                </span>
                <div className="panel__field-row">
                  <label className="panel__color-swatch">
                    <input
                      type="color"
                      aria-label="分支线条颜色"
                      value={toHexColor(branchColorDraft, '#5b8def')}
                      onChange={(e) => {
                        setBranchColorDraft(e.target.value)
                        applyStyleOverride({ branchColor: e.target.value })
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="panel__action panel__action--ghost"
                    title="清除该分支的线条颜色，回到色板配色"
                    onClick={() => applyStyleOverride({ branchColor: '' })}
                  >
                    跟随色板
                  </button>
                </div>
              </div>

              <div className="panel__field">
                <span>连线类型</span>
                <div className="panel__segmented" role="group" aria-label="连线类型">
                  {EDGE_TYPE_OPTIONS.map((opt) => {
                    const active = (activeBranchStyle?.edgeType ?? 'curve') === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`panel__seg${active ? ' panel__seg--active' : ''}`}
                        aria-pressed={active}
                        onClick={() => applyBranchStyle({ edgeType: opt.value })}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="panel__field">
                <span>分支终点</span>
                <div className="panel__segmented" role="group" aria-label="分支终点样式">
                  {EDGE_ENDPOINT_OPTIONS.map((opt) => {
                    const active = (activeBranchStyle?.endpoint ?? 'none') === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`panel__seg${active ? ' panel__seg--active' : ''}`}
                        aria-pressed={active}
                        onClick={() => applyBranchStyle({ endpoint: opt.value })}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="panel__field">
                <span>
                  连线粗细
                  <output className="panel__value-out">
                    {branchThicknessDraft === '' || branchThicknessDraft === 1
                      ? '默认'
                      : `${branchThicknessDraft}×`}
                  </output>
                </span>
                <input
                  type="range"
                  aria-label="连线粗细乘数"
                  min={BRANCH_THICKNESS_MIN}
                  max={BRANCH_THICKNESS_MAX}
                  step={0.1}
                  value={branchThicknessDraft === '' ? 1 : branchThicknessDraft}
                  onChange={(e) => setBranchThicknessDraft(Number(e.target.value))}
                  onPointerUp={() => applyBranchStyle({ thickness: branchThicknessDraft })}
                  onKeyUp={() => applyBranchStyle({ thickness: branchThicknessDraft })}
                  onBlur={() => applyBranchStyle({ thickness: branchThicknessDraft })}
                />
              </div>

              <div className="panel__field">
                <span>分支色板</span>
                <div
                  className="panel__palette-grid"
                  role="radiogroup"
                  aria-label="分支色板预设"
                >
                  {BRANCH_PALETTE_PRESETS.map((preset) => {
                    const currentPalette = activeBranchStyle?.colorPalette
                    const isDefault = !currentPalette || currentPalette.length === 0
                    const active =
                      preset.id === 'default'
                        ? isDefault
                        : JSON.stringify(preset.colors) ===
                          JSON.stringify(currentPalette ?? [])
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`panel__palette-swatch${active ? ' panel__palette-swatch--active' : ''}`}
                        title={preset.label}
                        onClick={() =>
                          applyBranchStyle({
                            colorPalette:
                              preset.id === 'default' ? null : preset.colors,
                          })
                        }
                      >
                        <span className="panel__palette-strip">
                          {preset.colors.map((c, i) => (
                            <span
                              key={i}
                              className="panel__palette-dot"
                              style={{ background: c }}
                            />
                          ))}
                        </span>
                        <span className="panel__palette-name">{preset.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {activeBranchStyle ? (
                <button
                  className="panel__action panel__action--ghost"
                  type="button"
                  onClick={() => {
                    if (!activeSheet) return
                    setBranchThicknessDraft('')
                    void session.setSheetBranchStyle(activeSheet.id, null)
                  }}
                >
                  清除分支样式覆盖
                </button>
              ) : null}
            </PanelSection>

            <PanelSection title="分支方向">
              <div className="panel__field">
                <span>结构方向</span>
                <div
                  className="panel__segmented"
                  role="group"
                  aria-label="分支方向"
                  aria-disabled={!canvasSupportsDirection}
                >
                  {canvasDirectionOptions(activeSheet?.chartType).map((opt) => {
                    // 存的是空串 = 自动；撤销/清除走同一个入口
                    const stored = activeSheet?.layoutConfig?.direction ?? ''
                    const active = stored === opt.value
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        className={`panel__seg${active ? ' panel__seg--active' : ''}`}
                        aria-pressed={active}
                        disabled={!canvasSupportsDirection}
                        title={
                          canvasSupportsDirection
                            ? undefined
                            : `${CHART_TYPE_LABELS[activeSheet?.chartType ?? 'mindmap']}没有可调的方向参数`
                        }
                        onClick={() => {
                          if (!activeSheet) return
                          void session.setSheetLayoutDirection(
                            activeSheet.id,
                            opt.value === '' ? 'auto' : opt.value,
                          )
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <p className="panel__muted">
                {canvasSupportsDirection
                  ? '不同骨架的轴不同：脑图/逻辑图/括号图/矩阵图看左右，组织结构图/树形图看上下，时间轴是水平或垂直。'
                  : `${CHART_TYPE_LABELS[activeSheet?.chartType ?? 'mindmap']}是整体版式，没有方向参数。`}
              </p>
            </PanelSection>

            <PanelSection title="主题编号">
              <div className="panel__field">
                <span>启用编号</span>
                <label className="panel__switch">
                  <input
                    type="checkbox"
                    aria-label="启用主题编号"
                    checked={activeNumbering?.enabled === true}
                    onChange={(event) => applyNumbering({ enabled: event.target.checked })}
                  />
                  <span>在当前画布显示编号</span>
                </label>
              </div>

              {activeNumbering?.enabled === true ? (
                <>
                  <div className="panel__field">
                    <span>编号格式</span>
                    <select
                      aria-label="编号格式"
                      value={activeNumbering?.format ?? 'decimal'}
                      onChange={(event) =>
                        applyNumbering({
                          format: event.target.value as NumberingFormat,
                        })
                      }
                    >
                      {NUMBERING_FORMAT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="panel__field">
                    <span>层级分隔符</span>
                    <select
                      aria-label="编号层级分隔符"
                      value={activeNumbering?.separator ?? '.'}
                      onChange={(event) => applyNumbering({ separator: event.target.value })}
                    >
                      {NUMBERING_SEPARATOR_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="panel__field">
                    <span>编号中心主题</span>
                    <label className="panel__switch">
                      <input
                        type="checkbox"
                        aria-label="编号中心主题"
                        checked={activeNumbering?.includeRoot === true}
                        onChange={(event) =>
                          applyNumbering({ includeRoot: event.target.checked })
                        }
                      />
                      <span>中心主题也带编号</span>
                    </label>
                  </div>
                </>
              ) : null}
            </PanelSection>

            {activeTopic && !hasMultipleSelectedTopics ? (
              <PanelSection title="主题图片">
                <p className="panel__muted">
                  为选中主题插入一张本地图片，图片显示在节点标题上方并参与节点尺寸计算；插入与移除均可撤销。
                </p>

                <div className="panel__field">
                  <span>图片</span>
                  {topicImageUrl ? (
                    <img
                      className="panel__image-preview"
                      src={topicImageUrl}
                      alt={`${activeTopic.text} 的主题图片`}
                    />
                  ) : (
                    <p className="panel__muted">
                      {activeTopic.image ? '图片加载中…' : '当前主题没有图片。'}
                    </p>
                  )}
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/*"
                    className="panel__hidden-file-input"
                    aria-label="选择主题图片文件"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      // 清空 value，保证连续选择同一文件也能触发 change
                      event.target.value = ''

                      if (!file) {
                        return
                      }

                      const reader = new FileReader()
                      reader.onload = () => {
                        const dataUrl = typeof reader.result === 'string' ? reader.result : ''

                        if (dataUrl) {
                          void insertTopicImage(dataUrl)
                        }
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                  <div className="panel__field-row">
                    <button
                      className="panel__action"
                      type="button"
                      onClick={() => void handlePickTopicImage()}
                    >
                      {activeTopic.image ? '更换图片' : '插入图片'}
                    </button>
                    {activeTopic.image ? (
                      <button
                        className="panel__action panel__action--ghost"
                        type="button"
                        onClick={() => void session.removeTopicImage(activeTopic.id)}
                      >
                        移除图片
                      </button>
                    ) : null}
                  </div>
                </div>
              </PanelSection>
            ) : null}

            <PanelSection title="主题属性">
              <div className="accordion-card">
                <span>{hasMultipleSelectedTopics ? '当前选择' : '当前主题'}</span>
                <span>
                  {hasMultipleSelectedTopics
                    ? `已选中 ${normalizedSelectedTopicIds.length} 个主题`
                    : activeTopic?.text ?? '未选中'}
                </span>
              </div>
              <div className="accordion-card">
                <span>子主题数</span>
                <span>{activeTopic?.children.length ?? 0}</span>
              </div>
            </PanelSection>

            {activeTopic && !hasMultipleSelectedTopics ? (
              <>
                <PanelSection title="富内容编辑">
                <p className="panel__muted">
                  编辑选中主题的备注、链接、标签、标记、任务与样式引用，失焦后自动保存并支持撤销。
                </p>

                <label className="panel__field">
                  <span>备注</span>
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    onBlur={() => {
                      const next = notesDraft.trim() || null
                      if ((activeTopic.notes ?? null) !== next) {
                        void session.setTopicNotes(activeTopic.id, next)
                      }
                    }}
                    placeholder="为该主题添加详细备注…"
                  />
                </label>

                <label className="panel__field">
                  <span>链接地址</span>
                  <input
                    type="url"
                    value={linkUrlDraft}
                    onChange={(e) => setLinkUrlDraft(e.target.value)}
                    onBlur={() => {
                      const url = linkUrlDraft.trim()
                      const title = linkTitleDraft.trim()
                      const nextLink: TopicLink | null = url ? { url, ...(title ? { title } : {}) } : null
                      const currentLink = activeTopic.link ?? null
                      const same =
                        currentLink?.url === nextLink?.url && currentLink?.title === nextLink?.title
                      if (!same) {
                        void session.setTopicLink(activeTopic.id, nextLink)
                      }
                    }}
                    placeholder="https://example.com"
                  />
                </label>
                <label className="panel__field">
                  <span>链接标题</span>
                  <input
                    type="text"
                    value={linkTitleDraft}
                    onChange={(e) => setLinkTitleDraft(e.target.value)}
                    onBlur={() => {
                      const url = linkUrlDraft.trim()
                      const title = linkTitleDraft.trim()
                      const nextLink: TopicLink | null = url ? { url, ...(title ? { title } : {}) } : null
                      const currentLink = activeTopic.link ?? null
                      const same =
                        currentLink?.url === nextLink?.url && currentLink?.title === nextLink?.title
                      if (!same) {
                        void session.setTopicLink(activeTopic.id, nextLink)
                      }
                    }}
                    placeholder="可选的链接显示文字"
                  />
                </label>

                <label className="panel__field">
                  <span>标签（逗号分隔）</span>
                  <input
                    type="text"
                    value={labelsDraft}
                    onChange={(e) => setLabelsDraft(e.target.value)}
                    onBlur={() => {
                      const next = labelsDraft
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                      const current = activeTopic.labels ?? []
                      if (JSON.stringify(current) !== JSON.stringify(next)) {
                        void session.setTopicLabels(activeTopic.id, next)
                      }
                    }}
                    placeholder="重要, 待办, 项目A"
                  />
                </label>

                <div className="panel__field">
                  <span>标记</span>
                  <MarkerSelector
                    markers={activeTopic.markers ?? []}
                    onChange={(next) => {
                      const current = activeTopic.markers ?? []
                      const same =
                        current.length === next.length &&
                        current.every((m, i) => m.id === next[i]?.id)
                      if (!same) {
                        void session.setTopicMarkers(activeTopic.id, next)
                      }
                    }}
                  />
                </div>

                <label className="panel__field">
                  <span>样式引用</span>
                  <input
                    type="text"
                    value={styleRefDraft}
                    onChange={(e) => setStyleRefDraft(e.target.value)}
                    onBlur={() => {
                      const next = styleRefDraft.trim() || null
                      if ((activeTopic.styleRef ?? null) !== next) {
                        void session.setTopicStyleRef(activeTopic.id, next)
                      }
                    }}
                    placeholder="styles.json 中的样式 ID"
                  />
                </label>

            </PanelSection>
              </>
            ) : (
              <p className="panel__muted">
                {hasMultipleSelectedTopics
                  ? '当前为多选状态，富内容编辑不可用。请按 Esc 回到单选后再编辑。'
                  : '在画布或左侧大纲中选中一个主题，即可编辑其备注、链接、标签、任务与样式。'}
              </p>
            )}
          </div>
        ) : null}

        {activeTab === 'pitch' ? (
          <div
            id="inspector-tabpanel-pitch"
            role="tabpanel"
            aria-labelledby="inspector-tab-pitch"
            className="panel__tab-panel"
          >
            <PanelSection title="演说放映">
              <p className="panel__muted">
                按当前画布的大纲顺序逐主题全屏放映。演讲词写在主题的备注里，放映时不会显示。
              </p>
              <div className="accordion-card">
                <span>预计幻灯片</span>
                <span>{activeSheetTopicCount} 页</span>
              </div>
              {onStartPresentation ? (
                <button
                  type="button"
                  className="panel__action"
                  onClick={onStartPresentation}
                >
                  开始放映
                </button>
              ) : null}
              <p className="panel__eyebrow">放映快捷键</p>
              <ul className="panel__list">
                <li>→ / 空格 / 回车：下一页</li>
                <li>← / Backspace：上一页</li>
                <li>Esc：退出放映</li>
              </ul>
            </PanelSection>

            <PanelSection title="提案简报">
              <p className="panel__muted">
                按一级分支分幕放映：一幕 = 中心主题 + 一个分支的完整子树，
                开场另有一张总览幕。可比逐页放映更紧凑地讲完一份提案。
              </p>
              <div className="accordion-card">
                <span>预计幕数</span>
                <span>{pitchActCount} 幕</span>
              </div>
              {onStartPitch ? (
                <button type="button" className="panel__action" onClick={onStartPitch}>
                  开始简报
                </button>
              ) : null}
              <p className="panel__eyebrow">简报设置</p>
              <label className="panel__field">
                <span>长宽比</span>
                <select
                  value={pitchAspectRatio}
                  onChange={(event) =>
                    setPitchAspectRatio(event.target.value as PitchAspectRatio)
                  }
                >
                  {PITCH_ASPECT_RATIOS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="fit">铺满</option>
                </select>
              </label>
              <label className="panel__field">
                <span>主题风格</span>
                <select
                  value={pitchThemeStyle}
                  onChange={(event) =>
                    setPitchThemeStyle(event.target.value as PitchThemeStyle)
                  }
                >
                  <option value="document">跟随文档</option>
                  <option value="dark">深色</option>
                  <option value="light">浅色</option>
                </select>
              </label>
              <p className="panel__muted">→ 下一幕　← 上一幕　Esc 退出</p>
            </PanelSection>
          </div>
        ) : null}

        {activeTab === 'canvas' ? (
          <div
            id="inspector-tabpanel-canvas"
            role="tabpanel"
            aria-labelledby="inspector-tab-canvas"
            className="panel__tab-panel"
          >
            <PanelSection title="骨架">
              <StructurePicker
                value={activeSheet?.chartType ?? 'mindmap'}
                valueDirection={activeSheet?.layoutConfig?.direction}
                onChange={(chartType, direction) => {
                  if (!activeSheet) return
                  void session.setSheetChartType(activeSheet.id, chartType)
                  // 变体卡片的另一半是方向：向下/水平/双向这类"自然方向"会是 undefined，
                  // 这时要显式回到 auto，否则从「向上」切回「向下」不会生效
                  void session.setSheetLayoutDirection(activeSheet.id, direction ?? 'auto')
                }}
                disabled={!activeSheet}
              />
            </PanelSection>

            <PanelSection title="配色方案">
              <div className="panel__field">
                <span>分支色板</span>
                <SwatchPicker
                  label="分支色板"
                  value={canvasSettings.branchPalette}
                  fallbackLabel="默认"
                  options={paletteOptions.map((preset) => ({
                    id: preset.id,
                    label: preset.label,
                    colors: [...preset.colors],
                  }))}
                  onChange={(next) => {
                    if (next === null) return
                    applyBranchPalette(next)
                  }}
                  actions={
                    <>
                      <button
                        type="button"
                        className="panel__action panel__action--ghost"
                        onClick={() => setEditingPalette('new')}
                      >
                        新建配色…
                      </button>
                      {customPalettes.some(
                        (item) => item.id === canvasSettings.branchPalette,
                      ) ? (
                        <button
                          type="button"
                          className="panel__action panel__action--ghost"
                          onClick={() =>
                            setEditingPalette(
                              customPalettes.find(
                                (item) => item.id === canvasSettings.branchPalette,
                              ) ?? null,
                            )
                          }
                        >
                          编辑
                        </button>
                      ) : null}
                    </>
                  }
                />
              </div>

              {editingPalette ? (
                <PaletteEditor
                  palette={editingPalette === 'new' ? null : editingPalette}
                  seedColors={resolveBranchPalette(
                    canvasSettings.branchPalette,
                    customPalettes,
                  )}
                  onCancel={() => setEditingPalette(null)}
                  onSave={saveCustomPalette}
                  onDelete={deleteCustomPalette}
                />
              ) : null}
              {/* 这里曾有一个内联的「调色板」网格，与上方「分支色板」浮层写的是同一个设置
                  （canvas.branchPalette），而且只能选内置预设、选不到自定义配色。
                  XMind 的配色方案只有一个触发器（色带 + 名称 + ▾），故删除重复控件。 */}

            </PanelSection>

            <PanelSection title="背景颜色">
              <div className="panel__field">
                <SwatchPicker
                  label="背景颜色"
                  value={canvasSettings.background}
                  fallbackLabel="跟随主题"
                  options={BACKGROUND_SWATCHES}
                  resetLabel="跟随主题"
                  colorInputLabel="自定义颜色"
                  onChange={(next) =>
                    void session.setDocumentSetting(
                      CANVAS_SETTINGS_KEYS.background,
                      next,
                    )
                  }
                />
              </div>
            </PanelSection>

            <PanelSection title="全局字体">
              <label className="panel__field">
                <select
                  value={canvasSettings.fontFamily}
                  onChange={(event) =>
                    void session.setDocumentSetting(
                      CANVAS_SETTINGS_KEYS.fontFamily,
                      event.target.value,
                    )
                  }
                >
                  {GLOBAL_FONT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </PanelSection>

            <PanelSection title="分支线粗细">
              <label className="panel__field">
                <select
                  value={canvasSettings.branchThickness}
                  onChange={(event) =>
                    void session.setDocumentSetting(
                      CANVAS_SETTINGS_KEYS.branchThickness,
                      event.target.value,
                    )
                  }
                >
                  {BRANCH_THICKNESS_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </PanelSection>

            <PanelSection title="彩虹分支">
              <label className="accordion-card">
                <input
                  type="checkbox"
                  checked={canvasSettings.rainbowBranch !== false}
                  onChange={(event) =>
                    void session.setDocumentSetting(
                      CANVAS_SETTINGS_KEYS.rainbowBranch,
                      event.target.checked,
                    )
                  }
                  aria-label="彩虹分支"
                />
                <span>按分支配色</span>
              </label>
            </PanelSection>

            <PanelSection title="导图样式">
              {[
                [CANVAS_SETTINGS_KEYS.balance, '自动平衡布局'],
                [CANVAS_SETTINGS_KEYS.compact, '紧凑型布局'],
                [CANVAS_SETTINGS_KEYS.alignSiblings, '同级主题对齐'],
              ].map(([key, label]) => (
                <label
                  className={`accordion-card${
                    layoutOptionsApply ? '' : ' accordion-card--disabled'
                  }`}
                  key={key}
                  title={layoutOptionHint}
                >
                  <input
                    type="checkbox"
                    checked={canvasSettings[key as 'balance' | 'compact' | 'alignSiblings']}
                    disabled={!layoutOptionsApply}
                    onChange={(event) =>
                      void session.setDocumentSetting(key, event.target.checked)
                    }
                    aria-label={label}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </PanelSection>

            <PanelSection title="高级布局">
              <label
                className={`accordion-card${
                  layoutOptionsApply ? '' : ' accordion-card--disabled'
                }`}
                title={layoutOptionHint}
              >
                <input
                  type="checkbox"
                  checked={canvasSettings.freeBranchLayout}
                  disabled={!layoutOptionsApply}
                  onChange={(event) =>
                    void session.setDocumentSetting(
                      CANVAS_SETTINGS_KEYS.freeBranchLayout,
                      event.target.checked,
                    )
                  }
                  aria-label="分支自由布局"
                />
                <span>分支自由布局</span>
              </label>
              <p className="panel__muted">
                打开后拖动一级分支会把它摆到指定位置（记进该分支的位置提示），
                其子树跟随移动；关闭后拖动仍然是改结构（吸附为子主题）。
              </p>
              <label
                className={`accordion-card${
                  layoutOptionsApply ? '' : ' accordion-card--disabled'
                }`}
                title={layoutOptionHint}
              >
                <input
                  type="checkbox"
                  checked={canvasSettings.stackTopics}
                  disabled={!layoutOptionsApply}
                  onChange={(event) =>
                    void session.setDocumentSetting(
                      CANVAS_SETTINGS_KEYS.stackTopics,
                      event.target.checked,
                    )
                  }
                  aria-label="主题层叠"
                />
                <span>主题层叠</span>
              </label>
              <p className="panel__muted">
                允许主题互相重叠：打开时摆到哪就是哪；关闭后，被自由摆放的分支会自动避开
                它上方的主题往下让位。
              </p>
              <label className="accordion-card">
                <input
                  type="checkbox"
                  checked={canvasSettings.freeTopic}
                  onChange={(event) =>
                    void session.setDocumentSetting(
                      CANVAS_SETTINGS_KEYS.freeTopic,
                      event.target.checked,
                    )
                  }
                  aria-label="灵活自由主题"
                />
                <span>灵活自由主题</span>
              </label>
            </PanelSection>

            <PanelSection title="中日韩字体">
              <label className="panel__field">
                <select
                  value={canvasSettings.cjkFont}
                  onChange={(event) =>
                    void session.setDocumentSetting(
                      CANVAS_SETTINGS_KEYS.cjkFont,
                      event.target.value,
                    )
                  }
                >
                  {CJK_FONT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </PanelSection>

            <PanelSection title="跨画布移动">
              <p className="panel__muted">
                把当前主题分支移动或复制到另一张画布，并可指定目标父主题；完成后会自动切换过去。
              </p>
              <label className="panel__field">
                <span>目标画布</span>
                <select
                  value={moveTargetSheetId}
                  onChange={(event) => setMoveTargetSheetId(event.target.value)}
                  disabled={movableTargetSheets.length === 0}
                >
                  {movableTargetSheets.length === 0 ? (
                    <option value="">当前没有其他画布</option>
                  ) : null}
                  {movableTargetSheets.map((sheet) => (
                    <option key={sheet.id} value={sheet.id}>
                      {sheet.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="panel__field">
                <span>目标父主题</span>
                <select
                  value={moveTargetParentId}
                  onChange={(event) => setMoveTargetParentId(event.target.value)}
                  disabled={!targetSheet}
                >
                  {!targetSheet ? <option value="">请先选择目标画布</option> : null}
                  {movableTargetParents.map((entry) => (
                    <option key={entry.topicId} value={entry.topicId}>
                      {entry.path.join(' / ')}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="panel__action"
                type="button"
                disabled={
                  hasMultipleSelectedTopics
                    ? normalizedSelectedTopicIds.length === 0
                    : !activeTopic ||
                      !activeSheet ||
                      activeTopic.id === activeSheet.rootTopic.id ||
                      !moveTargetSheetId ||
                      !moveTargetParentId
                }
                onClick={() => {
                  const actionLabel =
                    targetSheet && moveTargetParentEntry
                      ? moveTargetParentEntry.topicId === targetSheet.rootTopic.id
                        ? `${hasMultipleSelectedTopics ? `批量移动 ${normalizedSelectedTopicIds.length} 个主题` : '移动主题'}到画布“${targetSheet.title}”根主题`
                        : `${hasMultipleSelectedTopics ? `批量移动 ${normalizedSelectedTopicIds.length} 个主题` : '移动主题'}到画布“${targetSheet.title}”的“${moveTargetParentEntry.path.join(' / ')}”下面`
                      : hasMultipleSelectedTopics
                        ? '批量移动主题到其他画布'
                        : '移动主题到其他画布'

                  if (hasMultipleSelectedTopics) {
                    void session.moveTopicsToSheet(
                      normalizedSelectedTopicIds,
                      moveTargetSheetId,
                      moveTargetParentId,
                      actionLabel,
                    )
                    return
                  }

                  if (!activeTopic) {
                    return
                  }

                  void session.moveTopicToSheet(
                    activeTopic.id,
                    moveTargetSheetId,
                    moveTargetParentId,
                    actionLabel,
                  )
                }}
              >
                {hasMultipleSelectedTopics ? '批量移动到目标画布' : '移动到目标画布'}
              </button>
              <button
                className="panel__action"
                type="button"
                disabled={
                  hasMultipleSelectedTopics
                    ? normalizedSelectedTopicIds.length === 0
                    : !activeTopic ||
                      !activeSheet ||
                      activeTopic.id === activeSheet.rootTopic.id ||
                      !moveTargetSheetId ||
                      !moveTargetParentId
                }
                onClick={() => {
                  const actionLabel =
                    targetSheet && moveTargetParentEntry
                      ? moveTargetParentEntry.topicId === targetSheet.rootTopic.id
                        ? `${hasMultipleSelectedTopics ? `批量复制 ${normalizedSelectedTopicIds.length} 个主题` : '复制主题'}到画布“${targetSheet.title}”根主题`
                        : `${hasMultipleSelectedTopics ? `批量复制 ${normalizedSelectedTopicIds.length} 个主题` : '复制主题'}到画布“${targetSheet.title}”的“${moveTargetParentEntry.path.join(' / ')}”下面`
                      : hasMultipleSelectedTopics
                        ? '批量复制主题到其他画布'
                        : '复制主题到其他画布'

                  if (hasMultipleSelectedTopics) {
                    void session.copyTopicsToSheet(
                      normalizedSelectedTopicIds,
                      moveTargetSheetId,
                      moveTargetParentId,
                      actionLabel,
                    )
                    return
                  }

                  if (!activeTopic) {
                    return
                  }

                  void session.copyTopicToSheet(
                    activeTopic.id,
                    moveTargetSheetId,
                    moveTargetParentId,
                    actionLabel,
                  )
                }}
              >
                {hasMultipleSelectedTopics ? '批量复制到目标画布' : '复制到目标画布'}
              </button>
            </PanelSection>

            <PanelSection title="画布信息">
              <div className="accordion-card">
                <span>当前画布</span>
                <span>{activeSheet?.title ?? '未命名画布'}</span>
              </div>
              <div className="accordion-card">
                <span>历史能力</span>
                <span>
                  {session.canUndo ? '可撤销' : '无撤销'}
                  {' / '}
                  {session.canRedo ? '可重做' : '无重做'}
                </span>
              </div>
            </PanelSection>

            <PanelSection title="画布设置">
              <p className="panel__muted">视图偏好随文档保存，不影响画布内容。</p>
              <label className="accordion-card">
                <input
                  type="checkbox"
                  checked={session.document?.settings?.['canvas.showGrid'] === true}
                  onChange={(event) => {
                    const checked = event.target.checked
                    void session.setDocumentSetting('canvas.showGrid', checked ? true : null)
                  }}
                  aria-label="显示画布网格"
                />
                <span>显示网格</span>
              </label>
            </PanelSection>

            <PanelSection title="文档主题">
              <p className="panel__muted">
                一键切换整篇文档的配色方案。节点级颜色覆盖会优先生效。
              </p>
              <div className="panel__theme-grid" role="radiogroup" aria-label="文档主题">
                {themes.map((theme) => {
                  const selected = theme.id === currentThemeId
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`panel__theme-swatch${selected ? ' panel__theme-swatch--active' : ''}`}
                      title={theme.name}
                      onClick={() => void session.setDocumentTheme(theme.id)}
                    >
                      <span
                        className="panel__theme-swatch-color"
                        style={{ background: theme.root.fill }}
                      />
                      <span
                        className="panel__theme-swatch-color panel__theme-swatch-color--branch"
                        style={{ background: theme.branch.fill }}
                      />
                      <span className="panel__theme-swatch-name">{theme.name}</span>
                    </button>
                  )
                })}
              </div>
              {currentThemeId !== DEFAULT_THEME_ID ? (
                <button
                  className="panel__action panel__action--ghost"
                  type="button"
                  onClick={() => void session.setDocumentTheme(null)}
                >
                  恢复默认主题
                </button>
              ) : null}
            </PanelSection>

            <PanelSection title="关系线">
              <p className="panel__muted">
                在任意两个主题之间建立非父子连接，用于表达跨分支或跨画布的关联。关系线保存在文档级别。
              </p>

              {documentRelationships.length > 0 ? (
                <ul className="panel__entries">
                  {documentRelationships.map((rel) => {
                    const fromText = session.document
                      ? resolveTopicText(session.document.sheets, rel.fromTopicId)
                      : rel.fromTopicId
                    const toText = session.document
                      ? resolveTopicText(session.document.sheets, rel.toTopicId)
                      : rel.toTopicId
                    return (
                      <li key={rel.id} className="panel__entry">
                        <span className="panel__entry-text">
                          {fromText} → {toText}
                          {rel.label ? `（${rel.label}）` : ''}
                        </span>
                        <button
                          className="panel__action panel__action--ghost"
                          type="button"
                          onClick={() => void session.deleteRelationship(rel.id)}
                        >
                          删除
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="panel__muted">暂无关系线</p>
              )}

              <label className="panel__field">
                <span>起点主题</span>
                <select value={relFromId} onChange={(e) => setRelFromId(e.target.value)}>
                  {documentTopicEntries.length === 0 ? <option value="">暂无主题</option> : null}
                  {documentTopicEntries.map((entry) => (
                    <option key={entry.topicId} value={entry.topicId}>
                      {entry.path.join(' / ')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="panel__field">
                <span>终点主题</span>
                <select value={relToId} onChange={(e) => setRelToId(e.target.value)}>
                  <option value="">请选择终点主题</option>
                  {documentTopicEntries
                    .filter((entry) => entry.topicId !== relFromId)
                    .map((entry) => (
                      <option key={entry.topicId} value={entry.topicId}>
                        {entry.path.join(' / ')}
                      </option>
                    ))}
                </select>
              </label>
              <label className="panel__field">
                <span>标签（可选）</span>
                <input
                  type="text"
                  value={relLabel}
                  onChange={(e) => setRelLabel(e.target.value)}
                  placeholder="例如：依赖、关联、引用"
                />
              </label>
              <button
                className="panel__action"
                type="button"
                disabled={!canCreateRelationship}
                onClick={() => {
                  const label = relLabel.trim() || null
                  void session.createRelationship(relFromId, relToId, label)
                  setRelToId('')
                  setRelLabel('')
                }}
              >
                创建关系线
              </button>
            </PanelSection>

            <PanelSection title="边界与概要">
              <p className="panel__muted">
                为当前画布中的若干主题添加视觉分组（边界）或归纳说明（概要）。先在画布上选中至少 2 个主题，再创建。
              </p>

              {sheetBoundaries.length > 0 ? (
                <>
                  <p className="panel__eyebrow">边界</p>
                  <ul className="panel__entries">
                    {sheetBoundaries.map((boundary) => (
                      <li key={boundary.id} className="panel__entry">
                        <span className="panel__entry-text">
                          {boundary.label || '未命名边界'}（{boundary.topicIds.length} 个主题）
                        </span>
                        <button
                          className="panel__action panel__action--ghost"
                          type="button"
                          onClick={() =>
                            activeSheet && void session.deleteBoundary(activeSheet.id, boundary.id)
                          }
                        >
                          删除
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {sheetSummaries.length > 0 ? (
                <>
                  <p className="panel__eyebrow">概要</p>
                  <ul className="panel__entries">
                    {sheetSummaries.map((summary) => (
                      <li key={summary.id} className="panel__entry">
                        <span className="panel__entry-text">
                          {summary.label}（{summary.topicIds.length} 个主题）
                        </span>
                        <button
                          className="panel__action panel__action--ghost"
                          type="button"
                          onClick={() =>
                            activeSheet && void session.deleteSummary(activeSheet.id, summary.id)
                          }
                        >
                          删除
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              <label className="panel__field">
                <span>边界标签（可选）</span>
                <input
                  type="text"
                  value={boundaryLabel}
                  onChange={(e) => setBoundaryLabel(e.target.value)}
                  placeholder="例如：核心模块、风险项"
                />
              </label>
              <button
                className="panel__action"
                type="button"
                disabled={!canCreateBoundaryFromSelection || !activeSheet}
                onClick={() => {
                  if (!activeSheet) return
                  const label = boundaryLabel.trim() || null
                  void session.createBoundary(activeSheet.id, normalizedSelectedTopicIds, label)
                  setBoundaryLabel('')
                }}
              >
                {normalizedSelectedTopicIds.length >= 2
                  ? `为选中的 ${normalizedSelectedTopicIds.length} 个主题创建边界`
                  : '请先选中至少 2 个主题'}
              </button>

              <label className="panel__field">
                <span>概要标签</span>
                <input
                  type="text"
                  value={summaryLabel}
                  onChange={(e) => setSummaryLabel(e.target.value)}
                  placeholder="对这组主题的归纳说明"
                />
              </label>
              <button
                className="panel__action"
                type="button"
                disabled={!canCreateSummaryFromSelection || !activeSheet}
                onClick={() => {
                  if (!activeSheet) return
                  const label = summaryLabel.trim()
                  if (!label) return
                  void session.createSummary(activeSheet.id, normalizedSelectedTopicIds, label)
                  setSummaryLabel('')
                }}
              >
                {normalizedSelectedTopicIds.length >= 2
                  ? `为选中的 ${normalizedSelectedTopicIds.length} 个主题创建概要`
                  : '请先选中至少 2 个主题'}
              </button>
            </PanelSection>
          </div>
        ) : null}
      </div>

      {session.repairReport ? (
        <div className="panel__section panel__section--repair">
          <p className="panel__eyebrow">Repair</p>
          <h3 className="panel__title">最近修复</h3>
          <p className="panel__muted">
            已从修复副本打开当前文档，下面是本次自动修复的摘要。
          </p>
          <div className="accordion-card">
            <span>来源文件</span>
            <span>{session.repairReport.sourcePath.split(/[\\/]/).pop()}</span>
          </div>
          <div className="accordion-card">
            <span>修复副本</span>
            <span>{session.repairReport.destinationPath.split(/[\\/]/).pop()}</span>
          </div>
          <ul className="panel__list">
            {session.repairReport.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <button
            className="panel__action"
            type="button"
            onClick={() => void session.clearRepairReport()}
          >
            已了解，收起摘要
          </button>
        </div>
      ) : null}
    </aside>
  )
}
