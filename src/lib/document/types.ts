/**
 * MindGrid 文档数据模型类型（Domain Layer 投影）。
 *
 * 与 Rust 侧 `domain::document` 保持结构一致，通过 Tauri IPC 以 camelCase JSON 传输。
 * 所有 V1 富字段（styleRef / markers / labels / notes / link / image / task / layoutHints /
 * relationships / boundaries / summaries / chartType / theme / extensions）均为可选，
 * 缺省时回退到默认行为，保证 1.0.0 旧文档可直接加载。
 *
 * 未知字段保留（spec 16：不静默删除未知字段）：Rust 侧通过 `#[serde(flatten)] extra` 捕获
 * schema 未识别字段并在序列化时展开为顶层键；TS 侧 `JSON.parse` 天然保留所有键，IPC 往返
 * 不丢失。此处不为未知字段声明 index signature，以保持编译期类型安全。
 */

export type ChartType =
  | 'mindmap'
  | 'logic'
  | 'tree'
  | 'org'
  | 'fishbone'
  | 'timeline'
  | 'brace'
  | 'matrix'
  | 'bubble'

/** 主题标记（图标库引用），例如优先级、进度、旗帜等。 */
export interface TopicMarker {
  id: string
  label?: string
}

/** 主题超链接。 */
export interface TopicLink {
  url: string
  title?: string
}

/** 主题图片，通过 Asset ID 引用 assets/ 资源，避免 Base64 内嵌。 */
export interface TopicImage {
  assetId: string
  width?: number
  height?: number
}

export type TopicTaskStatus = 'none' | 'started' | 'completed' | 'pending'

/** 轻量任务属性，用于在思维导图中跟踪行动项。 */
export interface TopicTask {
  status: TopicTaskStatus
  /** 开始日期（毫秒时间戳，当日 00:00 本地时间），甘特图条形起点。 */
  startDateMs?: number
  dueDateMs?: number
  priority?: number
}

/** 手动布局提示，覆盖自动布局结果。 */
export interface TopicLayoutHints {
  direction?: 'left' | 'right' | 'up' | 'down'
  offsetX?: number
  offsetY?: number
}

/**
 * 主题节点形状。对齐 XMind 节点形状选项：
 * - rounded：圆角矩形（默认，按深度递减圆角）
 * - rect：直角矩形
 * - pill：全圆角胶囊（半径 = 高度/2）
 * - underline：下划线式（无填充、仅底部描边，文字直绘于画布）
 */
export type TopicShape = 'rounded' | 'rect' | 'pill' | 'underline'

/**
 * 主题节点级样式覆盖，优先于文档主题的层级默认值。
 *
 * 颜色字段（fill / textColor / borderColor）覆盖主题层级配色；
 * 形状与排印字段（shape / fontSize / fontWeight / borderWidth）覆盖
 * 深度分级默认值（见 style-constants 的 getTitleFontSize 等）。
 * 所有字段可选，缺省时回退到对应默认，保证 1.1.0 旧文档可直接加载。
 */
export interface TopicStyleOverrides {
  fill?: string
  textColor?: string
  borderColor?: string
  shape?: TopicShape
  /** 标题字号（px），建议范围 8–32。 */
  fontSize?: number
  /** 标题字重（CSS font-weight 数值，如 400/500/600/700）。 */
  fontWeight?: number
  /** 节点边框粗细（px），建议范围 0–6，0 表示无边框。 */
  borderWidth?: number
}

export interface TopicSnapshot {
  id: string
  text: string
  collapsed: boolean
  children: TopicSnapshot[]
  /** 样式表引用，见 styles.json。 */
  styleRef?: string
  /** 节点级样式覆盖（颜色 / 形状 / 排印 / 边框粗细），优先于文档主题。 */
  styleOverrides?: TopicStyleOverrides
  markers?: TopicMarker[]
  labels?: string[]
  notes?: string
  link?: TopicLink
  image?: TopicImage
  task?: TopicTask
  layoutHints?: TopicLayoutHints
  /** 应用层扩展命名空间，不覆盖核心字段。 */
  extensions?: Record<string, unknown>
}

/** 关系线端点控制提示。 */
export interface RelationshipControlPoint {
  x: number
  y: number
}

/** 关系线：两个主题之间的非父子连接，不改变树结构。 */
export interface Relationship {
  id: string
  fromTopicId: string
  toTopicId: string
  label?: string
  styleRef?: string
  controlPoints?: RelationshipControlPoint[]
}

/** 概要节点：对一组兄弟主题的归纳。 */
export interface SummaryNode {
  id: string
  topicIds: string[]
  label: string
  styleRef?: string
}

/** 边界：框选一组主题以做视觉分组。 */
export interface Boundary {
  id: string
  topicIds: string[]
  label?: string
  styleRef?: string
}

/** 布局参数，随图表类型解释。 */
export interface LayoutConfig {
  direction?: 'left' | 'right' | 'balanced'
  horizontalSpacing?: number
  verticalSpacing?: number
}

/**
 * 连线类型，决定父子主题之间的边线绘制方式。
 * - curve：贝塞尔曲线（默认，XMind 经典 S 型）
 * - straight：直线（控制点退化为起止点）
 * - elbow：正交折线（L 型，组织结构图风格）
 */
export type EdgeType = 'curve' | 'straight' | 'elbow'

/**
 * 画布级分支样式覆盖，影响整张画布的连线视觉。
 *
 * 与节点级 `TopicStyleOverrides` 互补：前者作用于"边"，后者作用于"节点"。
 * 所有字段可选，缺省时回退到默认（curve + 默认线宽 + 8 色循环色板），
 * 保证 1.0.0 旧文档可直接加载。
 */
export interface SheetBranchStyle {
  /** 连线类型，缺省为 curve。 */
  edgeType?: EdgeType
  /** 连线粗细乘数（1.0 为默认，建议范围 0.5–3.0）。 */
  thickness?: number
  /** 分支色板，覆盖默认 8 色循环。每个根直接子节点取一个色，其后代继承。 */
  colorPalette?: string[]
}

export interface SheetSnapshot {
  id: string
  title: string
  rootTopic: TopicSnapshot
  /** 图表类型，缺省为 mindmap。 */
  chartType?: ChartType
  layoutConfig?: LayoutConfig
  /** 画布级分支样式（连线类型/粗细/分支色板），缺省回退到默认。 */
  branchStyle?: SheetBranchStyle
  /**
   * 浮动主题列表：独立于 rootTopic 树结构的自由节点。
   * 每个浮动主题通过 layoutHints.offsetX/offsetY 存储世界坐标绝对位置，
   * 布局引擎跳过其自动布局；拖拽浮动主题到普通主题上可吸附为子主题。
   * 缺省为空数组，保证 1.0.0 旧文档可直接加载。
   */
  floatingTopics?: TopicSnapshot[]
  boundaries?: Boundary[]
  summaries?: SummaryNode[]
  extensions?: Record<string, unknown>
}

/** 文档级设置（自由键值，未来按需结构化）。 */
export interface DocumentSettings {
  [key: string]: unknown
}

/** 主题引用，指向 styles.json 中的主题定义。 */
export interface ThemeRef {
  id: string
}

export interface DocumentSnapshot {
  schemaVersion: string
  documentId: string
  revision: number
  activeSheetId: string
  sheets: SheetSnapshot[]
  relationships?: Relationship[]
  settings?: DocumentSettings
  theme?: ThemeRef
  extensions?: Record<string, unknown>
}

export interface DocumentSummary {
  documentId: string
  revision: number
  activeSheetId: string
  sheetCount: number
  topicCount: number
  rootTopicText: string
}

export interface DocumentRepairReport {
  sourcePath: string
  destinationPath: string
  repairedAtMs: number
  changes: string[]
}

export interface DocumentSessionSnapshot {
  document: DocumentSnapshot
  summary: DocumentSummary
  canUndo: boolean
  canRedo: boolean
  nextUndoAction: string | null
  nextRedoAction: string | null
  activeTopicId: string
  filePath: string | null
  lastSavedAtMs: number | null
  lastAutosavedAtMs: number | null
  hasUnsavedChanges: boolean
  recoveredFromAutosave: boolean
  repairReport: DocumentRepairReport | null
}

export type SessionStatus = 'idle' | 'loading' | 'ready' | 'error'
