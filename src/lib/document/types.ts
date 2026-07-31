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

export type ChartType = 'mindmap' | 'logic' | 'tree' | 'org' | 'fishbone' | 'timeline'

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
  dueDateMs?: number
  priority?: number
}

/** 手动布局提示，覆盖自动布局结果。 */
export interface TopicLayoutHints {
  direction?: 'left' | 'right' | 'up' | 'down'
  offsetX?: number
  offsetY?: number
}

/** 主题节点级样式覆盖，优先于文档主题的层级默认色。 */
export interface TopicStyleOverrides {
  fill?: string
  textColor?: string
  borderColor?: string
}

export interface TopicSnapshot {
  id: string
  text: string
  collapsed: boolean
  children: TopicSnapshot[]
  /** 样式表引用，见 styles.json。 */
  styleRef?: string
  /** 节点级样式覆盖（fill / textColor / borderColor），优先于文档主题。 */
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

export interface SheetSnapshot {
  id: string
  title: string
  rootTopic: TopicSnapshot
  /** 图表类型，缺省为 mindmap。 */
  chartType?: ChartType
  layoutConfig?: LayoutConfig
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
