import { useEffect, useMemo, useRef, useState } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { findTopicById, flattenTopicTree, normalizeTopicIdsForBatch } from '../../lib/document/tree'
import { getActiveSheet, getSheetById } from '../../lib/document/sheets'
import { DEFAULT_THEME_ID, listThemes } from '../../lib/document/themes'
import type {
  DocumentSnapshot,
  EdgeType,
  Relationship,
  SheetBranchStyle,
  TopicLink,
  TopicShape,
  TopicStyleOverrides,
  TopicTask,
  TopicTaskStatus,
} from '../../lib/document/types'
import type { DocumentSession } from '../document/use-document-session'
import { pickTopicImageUrl, useTopicImageUrls } from '../canvas/runtime/topic-image-store'
import { hasTauriRuntime } from '../../lib/ipc/transport'
import { MarkerSelector } from '../canvas/marker-selector'
import { GridIcon, PlayIcon, TypeIcon } from './icons'

/**
 * XMind 格式面板式分区：可折叠（默认展开），标题行点击切换。
 * 与 panel__section 视觉一致，增加 chevron 与折叠行为。
 */
function PanelSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className={`panel__section${open ? ' panel__section--open' : ' panel__section--collapsed'}`}>
      <button
        type="button"
        className="panel__section-header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="panel__section-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="panel__eyebrow">{eyebrow}</span>
        <span className="panel__title">{title}</span>
      </button>
      {open ? children : null}
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
const FONT_SIZE_MIN = 8
const FONT_SIZE_MAX = 32

/** 边框粗细边界（px），0 表示无边框。 */
const BORDER_WIDTH_MIN = 0
const BORDER_WIDTH_MAX = 6

/** 将 draft 中的数值字段规范化为 number | undefined（空串/NaN 视为未设置）。 */
function toOptionalNumber(value: number | ''): number | undefined {
  if (value === '' || Number.isNaN(value)) return undefined
  return value
}

/**
 * 从 draft 字段构造样式覆盖对象；全空返回 null（清除覆盖）。
 * 颜色字段空串视为未设置；形状空串视为未设置（沿用默认 rounded）；
 * 数值字段空串视为未设置（沿用深度分级默认）。
 */
function buildStyleOverrides(
  fill: string,
  textColor: string,
  borderColor: string,
  shape: TopicShape | '',
  fontSize: number | '',
  fontWeight: number | '',
  borderWidth: number | '',
): TopicStyleOverrides | null {
  const f = fill.trim() || undefined
  const t = textColor.trim() || undefined
  const b = borderColor.trim() || undefined
  const sh = shape || undefined
  const fs = toOptionalNumber(fontSize)
  const fw = toOptionalNumber(fontWeight)
  const bw = toOptionalNumber(borderWidth)
  if (!f && !t && !b && !sh && fs == null && fw == null && bw == null) return null
  return {
    ...(f ? { fill: f } : {}),
    ...(t ? { textColor: t } : {}),
    ...(b ? { borderColor: b } : {}),
    ...(sh ? { shape: sh } : {}),
    ...(fs != null ? { fontSize: fs } : {}),
    ...(fw != null ? { fontWeight: fw } : {}),
    ...(bw != null ? { borderWidth: bw } : {}),
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
  icon: typeof TypeIcon
}

const TABS: TabConfig[] = [
  { id: 'style', label: '样式', icon: TypeIcon },
  { id: 'pitch', label: '演说', icon: PlayIcon },
  { id: 'canvas', label: '画布', icon: GridIcon },
]

interface InspectorProps {
  session: DocumentSession
  selectedTopicIds: string[]
  onSelectedTopicIdsChange: (topicIds: string[]) => void
  /** 外部 tab 切换请求（如工具栏“插入→备注”聚焦样式子页）；nonce 变化时生效。 */
  tabRequest?: { tab: InspectorTab; nonce: number } | null
  /** 「演说」子页的放映入口，与工具栏演示按钮走同一路径。 */
  onStartPresentation?: () => void
}

export function Inspector({
  session,
  selectedTopicIds,
  tabRequest,
  onStartPresentation,
}: InspectorProps) {
  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const activeTopic =
    session.document && session.activeTopicId
      ? findTopicById(activeSheet?.rootTopic ?? session.document.sheets[0].rootTopic, session.activeTopicId)
      : null
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
  const [activeTab, setActiveTab] = useState<InspectorTab>('style')

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

  // —— 画布级分支样式：连线类型 / 粗细 / 色板，写入 activeSheet.branchStyle ——
  // edgeType 与 colorPalette 点击即提交（无 draft）；thickness 走 slider draft，失焦提交。
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
      const selected = await openFileDialog({
        multiple: false,
        directory: false,
        filters: [
          { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
        ],
      })
      const selectedPath = typeof selected === 'string' ? selected : null

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
  const applyStyleOverride = (
    patch: Partial<{
      fill: string
      textColor: string
      borderColor: string
      shape: TopicShape | ''
      fontSize: number | ''
      fontWeight: number | ''
      borderWidth: number | ''
    }>,
  ) => {
    const f = patch.fill !== undefined ? patch.fill : fillDraft
    const t = patch.textColor !== undefined ? patch.textColor : textColorDraft
    const b = patch.borderColor !== undefined ? patch.borderColor : borderColorDraft
    const sh = patch.shape !== undefined ? patch.shape : shapeDraft
    const fs = patch.fontSize !== undefined ? patch.fontSize : fontSizeDraft
    const fw = patch.fontWeight !== undefined ? patch.fontWeight : fontWeightDraft
    const bw = patch.borderWidth !== undefined ? patch.borderWidth : borderWidthDraft
    if (patch.fill !== undefined) setFillDraft(patch.fill)
    if (patch.textColor !== undefined) setTextColorDraft(patch.textColor)
    if (patch.borderColor !== undefined) setBorderColorDraft(patch.borderColor)
    if (patch.shape !== undefined) setShapeDraft(patch.shape)
    if (patch.fontSize !== undefined) setFontSizeDraft(patch.fontSize)
    if (patch.fontWeight !== undefined) setFontWeightDraft(patch.fontWeight)
    if (patch.borderWidth !== undefined) setBorderWidthDraft(patch.borderWidth)
    if (!activeTopic) return
    const next = buildStyleOverrides(f, t, b, sh, fs, fw, bw)
    if (JSON.stringify(activeTopic.styleOverrides ?? null) !== JSON.stringify(next)) {
      void session.setTopicStyleOverrides(activeTopic.id, next)
    }
  }

  return (
    <aside className="panel panel--inspector" aria-label="右侧检查器">
      <div className="panel__tabs" role="tablist" aria-label="属性面板分类">
        {TABS.map((tab) => {
          const Icon = tab.icon
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
              <Icon size={14} />
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
            <PanelSection eyebrow="Topic" title="主题属性">
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
              <PanelSection eyebrow="Rich Content" title="富内容编辑">
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

                <div className="panel__field">
                  <span>节点颜色覆盖</span>
                  <div className="panel__field-row">
                    <label className="panel__color-input">
                      <span>填充</span>
                      <input
                        type="color"
                        aria-label="节点填充色"
                        value={toHexColor(fillDraft, '#ffffff')}
                        onChange={(e) => setFillDraft(e.target.value)}
                        onBlur={() => applyStyleOverride({})}
                      />
                    </label>
                    <label className="panel__color-input">
                      <span>文字</span>
                      <input
                        type="color"
                        aria-label="节点文字色"
                        value={toHexColor(textColorDraft, '#0f172a')}
                        onChange={(e) => setTextColorDraft(e.target.value)}
                        onBlur={() => applyStyleOverride({})}
                      />
                    </label>
                    <label className="panel__color-input">
                      <span>边框</span>
                      <input
                        type="color"
                        aria-label="节点边框色"
                        value={toHexColor(borderColorDraft, '#94a3b8')}
                        onChange={(e) => setBorderColorDraft(e.target.value)}
                        onBlur={() => applyStyleOverride({})}
                      />
                    </label>
                  </div>
                  <div className="panel__chips" role="group" aria-label="填充色快速预设">
                    {FILL_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="panel__chip panel__chip--color"
                        style={{ background: color }}
                        aria-label={`应用填充色 ${color}`}
                        onClick={() => applyStyleOverride({ fill: color })}
                      />
                    ))}
                  </div>
                </div>

                <div className="panel__field">
                  <span>形状</span>
                  <div className="panel__segmented" role="group" aria-label="节点形状">
                    {SHAPE_OPTIONS.map((opt) => {
                      const active = (shapeDraft || 'rounded') === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`panel__seg${active ? ' panel__seg--active' : ''}`}
                          aria-pressed={active}
                          onClick={() => applyStyleOverride({ shape: opt.value })}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="panel__field">
                  <span>
                    字号
                    <output className="panel__value-out">
                      {fontSizeDraft === '' ? '默认' : `${fontSizeDraft}px`}
                    </output>
                  </span>
                  <input
                    type="range"
                    aria-label="节点标题字号"
                    min={FONT_SIZE_MIN}
                    max={FONT_SIZE_MAX}
                    step={1}
                    value={fontSizeDraft === '' ? 14 : fontSizeDraft}
                    onChange={(e) => setFontSizeDraft(Number(e.target.value))}
                    onPointerUp={() => applyStyleOverride({})}
                    onKeyUp={() => applyStyleOverride({})}
                    onBlur={() => applyStyleOverride({})}
                  />
                </div>

                <div className="panel__field">
                  <span>字重</span>
                  <div className="panel__segmented" role="group" aria-label="节点标题字重">
                    {FONT_WEIGHT_OPTIONS.map((opt) => {
                      const active = fontWeightDraft === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`panel__seg${active ? ' panel__seg--active' : ''}`}
                          aria-pressed={active}
                          onClick={() => applyStyleOverride({ fontWeight: opt.value })}
                          style={{ fontWeight: opt.value }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
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

                {activeTopic.styleOverrides ? (
                  <button
                    className="panel__action panel__action--ghost"
                    type="button"
                    onClick={() => void session.setTopicStyleOverrides(activeTopic.id, null)}
                  >
                    清除全部样式覆盖
                  </button>
                ) : null}

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
            ) : (
              <p className="panel__muted">
                {hasMultipleSelectedTopics
                  ? '当前为多选状态，富内容编辑不可用。请按 Esc 回到单选后再编辑。'
                  : '在画布或左侧大纲中选中一个主题，即可编辑其备注、链接、标签、任务与样式。'}
              </p>
            )}

            {activeTopic && !hasMultipleSelectedTopics ? (
              <PanelSection eyebrow="Image" title="主题图片">
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

            <PanelSection eyebrow="Branch Style" title="分支样式">
              <p className="panel__muted">
                调整当前画布所有连线的形状、粗细与分支配色（写入画布级覆盖，节点级颜色优先）。
              </p>

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
          </div>
        ) : null}

        {activeTab === 'pitch' ? (
          <div
            id="inspector-tabpanel-pitch"
            role="tabpanel"
            aria-labelledby="inspector-tab-pitch"
            className="panel__tab-panel"
          >
            <PanelSection eyebrow="Pitch" title="演说放映">
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
          </div>
        ) : null}

        {activeTab === 'canvas' ? (
          <div
            id="inspector-tabpanel-canvas"
            role="tabpanel"
            aria-labelledby="inspector-tab-canvas"
            className="panel__tab-panel"
          >
            <PanelSection eyebrow="Move" title="跨画布移动">
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

            <PanelSection eyebrow="Canvas" title="画布信息">
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

            <PanelSection eyebrow="Canvas Settings" title="画布设置">
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

            <PanelSection eyebrow="Theme" title="文档主题">
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

            <PanelSection eyebrow="Relationships" title="关系线">
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

            <PanelSection eyebrow="Grouping" title="边界与概要">
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
